/**
 * geo.js の fetchWikiNearby の検証。fetch をモックして仕様どおりか確認する。
 * 実行: node scripts/check-geo.mjs
 *
 * 見たいのは R20 の「geosearch の50件上限を同心円3段で回避する」挙動:
 *   - 半径ごとに違うページが返ってきたとき、pageid で重複排除して全部そろうか
 *   - 外部リクエストが WIKI_NEARBY_MAX_CALLS(=4)を超えないか
 *   - 一部の半径が失敗しても残りで返せるか / 全滅したときだけ throw するか
 *   - fixture モードでは外部 fetch を1回も出さないか
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEO_PATH = path.join(ROOT, 'assets', 'geo.js');
const src = fs.readFileSync(GEO_PATH, 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label, { actual, expected });
}

const LAT = 35.2323;
const LON = 139.1069;

/**
 * geo.js を新しいサンドボックスに読み込み、fetch を差し替える。
 * localStorage は敢えて置かない(cacheGet/cacheSet が no-op になり、テスト間で結果が混ざらない)。
 * @param {(url:string)=>({status?:number, json?:any})} handler モックの応答を返す関数
 */
function loadGeo(handler) {
  const calls = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON,
    URLSearchParams, AbortController, Object, Array, String, Number, isFinite
  };
  sandbox.window = sandbox;
  sandbox.fetch = async function (url) {
    calls.push(String(url));
    const r = handler(String(url)) || {};
    const status = r.status === undefined ? 200 : r.status;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => r.json
    };
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'geo.js' });
  return { geo: sandbox.YadoGeo, calls };
}

/** URL の ggsradius を取り出す(continue 付きでも同じ)。 */
function radiusOf(url) {
  const m = /[?&]ggsradius=(\d+)/.exec(url);
  return m ? Number(m[1]) : null;
}

/** pageid の範囲から geosearch の応答(query.pages)を作る。座標は中心からおよそ距離順に散らす。 */
function pagesResponse(fromId, toId, extra) {
  const pages = {};
  for (let id = fromId; id <= toId; id++) {
    pages[String(id)] = {
      pageid: id,
      title: '記事' + id,
      coordinates: [{ lat: LAT + id / 111000, lon: LON }],
      extract: '要約' + id,
      thumbnail: { source: 'https://upload.example/' + id + '.jpg' }
    };
  }
  return Object.assign({ query: { pages } }, extra || {});
}

async function main() {
  // --- ケース1: 50件で頭打ち → 同心円3段で100件になる ------------------------
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      if (r === 3000) return { json: pagesResponse(1, 50) };
      if (r === 6000) return { json: pagesResponse(26, 75) };
      if (r === 10000) return { json: pagesResponse(51, 100) };
      return { json: pagesResponse(1, 0) };
    });
    console.log('[1] 50件上限を同心円3段で回避');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 100, '重複排除後 100件(50件で頭打ちにならない)');
    eq(calls.length, 3, '外部呼び出しは3回(各半径1回・continue なし)');
    eq(calls.map(radiusOf), [3000, 6000, 10000], '半径は昇順 3000/6000/10000');
    const ids = articles.map((a) => a.id);
    eq(new Set(ids).size, 100, 'id が一意');
    ok(articles[0].id === 'wp/1', '距離の近い順に並ぶ(先頭は wp/1)', articles[0].id);
    ok(articles[articles.length - 1].id === 'wp/100', '末尾は最遠の wp/100', articles[articles.length - 1].id);
  }

  // --- ケース2: 呼び出し上限(continue を返し続けても4回を超えない) -----------
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      // どの半径も常に continue を返す(放っておくと 3半径 x 4回 = 12回になる)
      return { json: pagesResponse(r / 100, r / 100 + 9, { continue: { excontinue: '1', continue: '||' } }) };
    });
    console.log('[2] 呼び出し上限 WIKI_NEARBY_MAX_CALLS=6 の遵守');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.length, 6, '外部呼び出しは6回ちょうど(上限を超えない)');
    ok(articles.length > 0, '取れた分は返る', articles.length);
    // ここが R20 の肝: 近い半径の continue に上限を食われて遠いリングが引けない、を防ぐ
    eq(calls.slice(0, 3).map(radiusOf), [3000, 6000, 10000], '1周目で全リングを1回ずつ引く(continue より優先)');
    ok(calls.slice(3).every((u) => /excontinue/.test(u)), '余った3回はすべて continue', calls.slice(3));
    // 近い記事ほどカード上位に出るので、要約の穴埋めは近いリングから消化する
    eq(calls.slice(3).map(radiusOf), [3000, 3000, 3000], 'continue は近いリング(3km)から順に追う');
  }

  // --- ケース2b: 実APIの形(1周目から continue が付く)でも遠いリングが引けること ---
  // 実測で見つかった退行: continue を半径ごとに追い切ってしまうと、3km と 6km の
  // continue だけで4回を使い切り、10km のページ集合が一度も取れなかった(最遠2971m)。
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      const isCont = /excontinue/.test(url);
      const body = r === 3000 ? pagesResponse(1, 32) : r === 6000 ? pagesResponse(33, 82) : pagesResponse(83, 132);
      // extracts は1回20件までなので、20件を超える応答には continue が付く
      if (!isCont) body.continue = { excontinue: '1', continue: '||' };
      return { json: body };
    });
    console.log('[2b] continue に上限を食われても10kmリングが引けること');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.slice(0, 3).map(radiusOf), [3000, 6000, 10000], '3リングとも1回目が発行される');
    eq(calls.length, 6, '外部呼び出しは6回');
    eq(articles.length, 132, '3リングぶん 132件がそろう(32件で止まらない)');
    ok(articles[articles.length - 1].id === 'wp/132', '最遠は10kmリングの記事', articles[articles.length - 1].id);
    // 2周目は近いリングから: 3km の continue は1回で終わる(モックが continue を返さない)ので
    // 残りは 6km → 10km の順に回る
    eq(calls.slice(3).map(radiusOf), [3000, 6000, 10000], 'continue も近いリングから順に消化する');
  }

  // --- ケース2c: 要約(extract)は近い記事から優先的に埋まること -----------------
  // 実APIでは extracts が1回20件までしか返らない。上限6回でも全部は埋まらない前提で、
  // カード上位に出る「近い記事」に要約が付くことを保証する。
  {
    const { geo } = loadGeo((url) => {
      const r = radiusOf(url);
      const isCont = /excontinue/.test(url);
      // 1回目は座標だけ(extract 無し)、continue で20件ずつ要約が届く、という実APIの形
      const base = r === 3000 ? [1, 40] : r === 6000 ? [41, 80] : [81, 120];
      const pages = {};
      for (let id = base[0]; id <= base[1]; id++) {
        const p = { pageid: id, title: '記事' + id, coordinates: [{ lat: LAT + id / 111000, lon: LON }] };
        if (isCont) p.extract = '要約' + id; // continue のときだけ要約が届く
        pages[String(id)] = p;
      }
      const body = { query: { pages } };
      if (!isCont) body.continue = { excontinue: '1', continue: '||' };
      return { json: body };
    });
    console.log('[2c] 要約は近い記事から埋まる');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 120, '3リングぶん 120件');
    ok(articles[0].extract !== null, '最も近い記事には要約が付く', articles[0].extract);
    const withExtract = articles.filter((a) => a.extract !== null).length;
    ok(withExtract >= 40, '少なくとも近い1リングぶんの要約が埋まる', withExtract);
    // 要約ありの記事が距離の近い側に固まっていること(上位40件は全部要約あり)
    ok(articles.slice(0, 40).every((a) => a.extract !== null), '上位40件はすべて要約あり');
  }

  // --- ケース3: 重複排除(全半径が同じ50件) ---------------------------------
  {
    const { geo, calls } = loadGeo(() => ({ json: pagesResponse(1, 50) }));
    console.log('[3] 重複排除');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 50, '全半径が同じ pageid を返しても 50件');
    eq(new Set(articles.map((a) => a.id)).size, 50, 'id が一意');
    eq(calls.length, 3, '外部呼び出しは3回');
  }

  // --- ケース4: 一部失敗の許容 / 全滅時は throw -------------------------------
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      if (r === 6000) return { status: 500 };
      if (r === 3000) return { json: pagesResponse(1, 10) };
      return { json: pagesResponse(11, 20) };
    });
    console.log('[4] 一部失敗の許容');
    let thrown = null;
    let articles = [];
    try { articles = await geo.fetchWikiNearby(LAT, LON, 10000); } catch (e) { thrown = e; }
    ok(thrown === null, '6km だけ 500 でも throw しない', thrown && thrown.message);
    eq(articles.length, 20, '3km と 10km の分(20件)が返る');
    eq(calls.length, 3, '外部呼び出しは3回');
  }
  {
    const { geo } = loadGeo(() => ({ status: 500 }));
    console.log('[4b] 全半径が失敗したら throw');
    let thrown = null;
    try { await geo.fetchWikiNearby(LAT, LON, 10000); } catch (e) { thrown = e; }
    ok(!!thrown && typeof thrown.message === 'string', '全滅したときは例外を投げる', thrown && thrown.message);
  }

  // --- ケース5: fixture モード不変(外部 fetch 0回) --------------------------
  {
    const { geo, calls } = loadGeo(() => { throw new Error('fixture 中に fetch が呼ばれた'); });
    console.log('[5] fixture モード不変');
    geo.setFixture({ wiki: pagesResponse(1, 7) });
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.length, 0, '外部 fetch は0回');
    eq(articles.length, 7, '保存済みレスポンスの件数(7件)がそのまま出る');
    eq(articles[0].id, 'wp/1', '先頭要素は従来どおり最も近い wp/1');
    eq(articles[0].title, '記事1', '先頭要素のタイトルも従来どおり');
    eq(articles[0].extract, '要約1', '先頭要素の要約も従来どおり');
    eq(articles[0].url, 'https://ja.wikipedia.org/?curid=1', '先頭要素の URL は curid 形式');
  }

  // --- 既定経路(radius=5000)を壊していないこと -------------------------------
  {
    const { geo, calls } = loadGeo((url) => ({ json: pagesResponse(1, 5) }));
    console.log('[6] radius=5000 の既定経路');
    await geo.fetchWikiNearby(LAT, LON, 5000);
    eq(calls.map(radiusOf), [3000, 5000], '5000 以下のリング + 5000 自身だけを回る');
  }

  // --- ケース7: ?slow= の遅延注入(R15) ---------------------------------------
  {
    const { geo, calls } = loadGeo(() => ({ json: pagesResponse(1, 7) }));
    console.log('[7a] setSlowDelays 指定時は遅延がかかり、fixture 経路でも外部 fetch 0回');
    geo.setFixture({ wiki: pagesResponse(1, 7) });
    geo.setSlowDelays({ wiki: 120 });
    const t0 = Date.now();
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    const elapsed = Date.now() - t0;
    ok(elapsed >= 100, 'wiki:120 指定で100ms以上かかる', elapsed);
    eq(calls.length, 0, '遅延中も外部 fetch は0回(fixture 優先)');
    eq(articles.length, 7, '件数は従来どおり(7件)');
  }
  {
    const { geo, calls } = loadGeo(() => { throw new Error('fixture 中に fetch が呼ばれた'); });
    console.log('[7b] setSlowDelays を呼ばなければ完全に不変(パラメータ無し)');
    geo.setFixture({ wiki: pagesResponse(1, 7) });
    const t0 = Date.now();
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    const elapsed = Date.now() - t0;
    ok(elapsed < 50, '遅延を指定しなければ50ms未満で返る', elapsed);
    eq(calls.length, 0, '外部 fetch は0回');
    eq(articles.length, 7, '件数はケース5と同じ(7件)');
    eq(articles[0].id, 'wp/1', '先頭要素もケース5と同じ');
  }
  {
    const { geo, calls } = loadGeo(() => { throw new Error('fixture 中に fetch が呼ばれた'); });
    console.log('[7c] setSlowDelays({osm:0,wiki:0}) も不変(0は待たない)');
    geo.setFixture({ wiki: pagesResponse(1, 7) });
    geo.setSlowDelays({ osm: 0, wiki: 0 });
    const t0 = Date.now();
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    const elapsed = Date.now() - t0;
    ok(elapsed < 50, '0指定でも50ms未満で返る', elapsed);
    eq(calls.length, 0, '外部 fetch は0回');
    eq(articles.length, 7, '件数はケース5と同じ(7件)');
  }

  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
