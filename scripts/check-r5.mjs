// R5: 段階描画(osm → wiki → done)の検証。実行: node scripts/check-r5.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8');
function load(geo) { const s = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON }; s.window = s; s.YadoGeo = geo; vm.createContext(s); vm.runInContext(src, s, { filename: 'engine.js' }); return s.YadoEngine; }
const H = { name: 'H', lat: 35.23, lon: 139.10 };
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? (pass++, console.log('  PASS ' + l)) : (fail++, console.log('  FAIL ' + l + (x !== undefined ? ' -> ' + JSON.stringify(x) : ''))); };
const delay = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

// 1) OSM が先に解決したら wiki を待たずに osm 段が出るか
{
  const E = load({
    fetchSpots: () => delay(10, [{ id: 'n/1', name: '早雲寺', lat: 35.234, lon: 139.10, category: 'place_of_worship', categoryLabel: '神社・寺院', distanceM: 400 }]),
    fetchWikiNearby: () => delay(400, [])
  });
  const t0 = Date.now(); const times = {};
  await E.suggest(H, {}, (stage) => { times[stage] = Date.now() - t0; });
  ok(times.osm < 200, 'osm 段が Wikipedia(400ms)を待たずに出る', times);
  ok(times.wiki - times.osm >= 300, 'osm と wiki の差が300ms以上', { diff: times.wiki - times.osm });
  ok(times.done >= times.wiki, 'done は wiki 以降', times);
}
// 2) OSM が遅い場合でも順序は osm→wiki→done
{
  const E = load({
    fetchSpots: () => delay(300, [{ id: 'n/1', name: 'A', lat: 35.234, lon: 139.10, category: 'park', categoryLabel: '公園', distanceM: 400 }]),
    fetchWikiNearby: () => delay(10, [])
  });
  const st = []; await E.suggest(H, {}, (s) => st.push(s));
  ok(JSON.stringify(st) === '["osm","wiki","done"]', 'OSMが遅くても順序は維持', st);
}
// 3) OSM 失敗時も osm 段は1回だけ、meta.osmFailed が立つ
{
  const E = load({
    fetchSpots: () => Promise.reject(new Error('だめ')),
    fetchWikiNearby: () => delay(20, [{ id: 'wp/1', title: '湯畑', lat: 35.234, lon: 139.10, distanceM: 400, extract: '温泉である。', thumbnailUrl: null, url: '' }])
  });
  const st = [], metas = []; const r = await E.suggest(H, {}, (s, p, m) => { st.push(s); metas.push(m && m.osmFailed); });
  ok(JSON.stringify(st) === '["osm","wiki","done"]', 'OSM失敗でも osm→wiki→done', st);
  ok(metas[0] === true && metas[1] === true, 'OSM失敗時 meta.osmFailed=true', metas);
  ok(r.osmFailed === true, '結果に osmFailed', r.osmFailed);
  ok(r.cards.length === 1, 'Wikiだけで返る');
}
// 4) 座標プレフィクス除去
{
  const cases = [
    ['北緯35度13分48.3秒 東経139度6分13.2秒 早雲寺（そううんじ）は、神奈川県の寺院。', '早雲寺（そううんじ）は、神奈川県の寺院。'],
    ['北緯35度13分48秒 東経139度6分13秒　箱根神社は、', '箱根神社は、'],
    ['座標: 北緯35度13分 東経139度6分 芦ノ湖は湖である。', '芦ノ湖は湖である。'],
    ['北緯35.2度 東経139.1度 大涌谷は、', '大涌谷は、'],
    ['北緯35度13分48.3秒 東経139度6分13.2秒', '北緯35度13分48.3秒 東経139度6分13.2秒'],
    ['普通の要約です。', '普通の要約です。'],
    ['北海道の北緯は高い。', '北海道の北緯は高い。']
  ];
  const E = load({
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(cases.map((c, i) => ({ id: 'wp/' + i, title: 'ほにゃらら' + i, lat: 35.23 + (i + 1) * 0.01, lon: 139.10, distanceM: 500 * (i + 1), extract: c[0], thumbnailUrl: null, url: '' })))
  });
  const r = await E.suggest(H, {});
  const all = r.cards.concat(r.far);
  cases.forEach((c, i) => {
    const got = all.find(x => x.name === 'ほにゃらら' + i);
    ok(got && got.summary === c[1], '座標除去: ' + c[0].slice(0, 24), got && got.summary);
  });
}
console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
