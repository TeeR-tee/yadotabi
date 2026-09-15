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
    console.log('[2] 呼び出し上限 WIKI_NEARBY_MAX_CALLS=4 の遵守');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.length, 4, '外部呼び出しは4回ちょうど(上限を超えない)');
    ok(articles.length > 0, '取れた分は返る', articles.length);
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

  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
