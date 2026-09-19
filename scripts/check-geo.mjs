/**
 * geo.js の fetchWikiNearby の検証。fetch をモックして仕様どおりか確認する。
 * 実行: node scripts/check-geo.mjs
 *
 * 見たいのは R154 の「ggslimit=500 + colimit=max の1周で遠い記事まで取る」挙動:
 *   - 10km を1回引くだけで遠い記事(50件で頭打ちにならない)がそろうか
 *   - coordinates を取りこぼさないよう colimit/pilimit を max で投げているか
 *   - 外部リクエストが WIKI_NEARBY_MAX_CALLS(=4)を超えないか
 *   - continue が失敗しても1周目の結果を返せるか / 1周目から落ちたら throw するか
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
  // --- ケース1: ggslimit=500 + colimit=max の1周で遠い記事まで届く ------------
  // geosearch は「半径内の全件」ではなく「近い順に ggslimit 件」を返す。さらに
  // colimit を max にしないと coordinates が1回10件しか返らず、座標の無い記事は
  // 候補にできないため「使える記事」が頭打ちになる(R154の実測)。
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      if (r === 10000) return { json: pagesResponse(1, 100) };
      return { json: pagesResponse(1, 0) };
    });
    console.log('[1] ggslimit=500 + colimit=max の1周で100件そろう');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 100, '1周で 100件(50件で頭打ちにならない)');
    eq(calls.length, 1, '外部呼び出しは1回(10kmを1周・continue なし)');
    eq(calls.map(radiusOf), [10000], '半径は 10000 の1周だけ');
    ok(/[?&]ggslimit=500(&|$)/.test(calls[0]), 'ggslimit は 500 を指定する', calls[0]);
    ok(/[?&]colimit=max(&|$)/.test(calls[0]), 'colimit=max で座標を取りこぼさない', calls[0]);
    ok(/[?&]pilimit=max(&|$)/.test(calls[0]), 'pilimit=max で画像を取りこぼさない', calls[0]);
    const ids = articles.map((a) => a.id);
    eq(new Set(ids).size, 100, 'id が一意');
    ok(articles[0].id === 'wp/1', '距離の近い順に並ぶ(先頭は wp/1)', articles[0].id);
    ok(articles[articles.length - 1].id === 'wp/100', '末尾は最遠の wp/100', articles[articles.length - 1].id);
  }

  // --- ケース2: 呼び出し上限(continue を返し続けても4回を超えない) -----------
  {
    const { geo, calls } = loadGeo((url) => {
      const r = radiusOf(url);
      // 常に continue を返す(放っておくと無限に続く)
      return { json: pagesResponse(r / 100, r / 100 + 9, { continue: { excontinue: '1', continue: '||' } }) };
    });
    console.log('[2] 呼び出し上限 WIKI_NEARBY_MAX_CALLS=4 の遵守');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.length, 4, '外部呼び出しは4回ちょうど(上限を超えない)');
    ok(articles.length > 0, '取れた分は返る', articles.length);
    // 1周目に10kmを1回引き、余りは extracts(1回20件制限)の穴埋めに使う
    eq(calls.slice(0, 1).map(radiusOf), [10000], '1周目は10kmを1回だけ引く');
    ok(calls.slice(1).every((u) => /excontinue/.test(u)), '余った3回はすべて continue', calls.slice(1));
  }

  // --- ケース2b: 実APIの形(1周目から continue が付く)でも遠い記事が残ること ---
  // 1周になったので「近いリングの continue に上限を食われて10kmが引けない」退行は
  // 構造的に起きない。代わりに、continue を追っても1周目で取れた遠い記事が
  // 欠落しない(マージで消えない)ことを守る。
  {
    const { geo, calls } = loadGeo((url) => {
      const isCont = /excontinue/.test(url);
      // 1回目に132件ぶんの座標が届き、continue では先頭20件ぶんしか返らない実APIの形
      const body = isCont ? pagesResponse(1, 20) : pagesResponse(1, 132);
      if (!isCont) body.continue = { excontinue: '1', continue: '||' };
      return { json: body };
    });
    console.log('[2b] continue を追っても遠い記事が欠落しないこと');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(calls.slice(0, 1).map(radiusOf), [10000], '1周目は10kmを1回');
    eq(articles.length, 132, '1周ぶん 132件がそろう(continue で減らない)');
    ok(articles[articles.length - 1].id === 'wp/132', '最遠の記事が残る', articles[articles.length - 1].id);
    ok(calls.length <= 4, '外部呼び出しは4回以内', calls.length);
  }

  // --- ケース2c: 要約(extract)は近い記事から優先的に埋まること -----------------
  // 実APIでは extracts だけは1回20件の制限を外せない。上限4回でも全部は埋まらない前提で、
  // カード上位に出る「近い記事」に要約が付くことを保証する。
  {
    const { geo } = loadGeo((url) => {
      const isCont = /excontinue/.test(url);
      // 1回目は座標だけ(extract 無し)、continue で近い順に40件ずつ要約が届く実APIの形
      const pages = {};
      for (let id = 1; id <= 120; id++) {
        const p = { pageid: id, title: '記事' + id, coordinates: [{ lat: LAT + id / 111000, lon: LON }] };
        if (isCont && id <= 40) p.extract = '要約' + id; // continue で近い側から埋まる
        pages[String(id)] = p;
      }
      const body = { query: { pages } };
      if (!isCont) body.continue = { excontinue: '1', continue: '||' };
      return { json: body };
    });
    console.log('[2c] 要約は近い記事から埋まる');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 120, '1周ぶん 120件');
    ok(articles[0].extract !== null, '最も近い記事には要約が付く', articles[0].extract);
    const withExtract = articles.filter((a) => a.extract !== null).length;
    ok(withExtract >= 40, '少なくとも近い40件ぶんの要約が埋まる', withExtract);
    // 要約ありの記事が距離の近い側に固まっていること(上位40件は全部要約あり)
    ok(articles.slice(0, 40).every((a) => a.extract !== null), '上位40件はすべて要約あり');
  }

  // --- ケース3: 重複排除(同じ50件が重ねて届く) -----------------------------
  {
    const { geo, calls } = loadGeo(() => ({ json: pagesResponse(1, 50) }));
    console.log('[3] 重複排除');
    const articles = await geo.fetchWikiNearby(LAT, LON, 10000);
    eq(articles.length, 50, '同じ pageid が重ねて届いても 50件');
    eq(new Set(articles.map((a) => a.id)).size, 50, 'id が一意');
    eq(calls.length, 1, '外部呼び出しは1回(continue なし)');
  }

  // --- ケース4: 一部失敗の許容 / 全滅時は throw -------------------------------
  {
    const { geo, calls } = loadGeo((url) => {
      // 1周目は成功して continue が付くが、その continue(要約の穴埋め)が 500 で落ちる
      if (/excontinue/.test(url)) return { status: 500 };
      const body = pagesResponse(1, 20);
      body.continue = { excontinue: '1', continue: '||' };
      return { json: body };
    });
    console.log('[4] 一部失敗の許容(continue が落ちても1周目は活きる)');
    let thrown = null;
    let articles = [];
    try { articles = await geo.fetchWikiNearby(LAT, LON, 10000); } catch (e) { thrown = e; }
    ok(thrown === null, 'continue が 500 でも throw しない', thrown && thrown.message);
    eq(articles.length, 20, '1周目で取れた20件はそのまま返る');
    ok(calls.length >= 2, '1周目 + continue が発行されている', calls.length);
  }
  {
    const { geo } = loadGeo(() => ({ status: 500 }));
    console.log('[4b] 1周目から失敗したら throw');
    let thrown = null;
    try { await geo.fetchWikiNearby(LAT, LON, 10000); } catch (e) { thrown = e; }
    ok(!!thrown && typeof thrown.message === 'string', '取得が全滅したときは例外を投げる', thrown && thrown.message);
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
    eq(calls.map(radiusOf), [5000], '10000 のリングは 5000 を超えるので 5000 自身だけを引く');
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

  // --- ケース8: R35 社寺のカテゴリ判定は名前を優先する -----------------------
  // 社寺は境内の石碑が historic=memorial として本体と同じ名前で登録されることがあり、
  // タグの評価順だけだと神社が「記念碑」になっていた(道後の伊佐爾波神社・湯神社)。
  {
    const { geo, calls } = loadGeo(() => { throw new Error('fixture 中に fetch が呼ばれた'); });
    console.log('[8] 社寺のカテゴリは名前優先(R35)');
    geo.setFixture({
      overpass: {
        elements: [
          // 境内の石碑ノード。タグは memorial だが名前は神社
          { type: 'node', id: 1, lat: LAT + 0.001, lon: LON, tags: { name: '伊佐爾波神社', historic: 'memorial' } },
          // 本体。place_of_worship
          { type: 'relation', id: 2, center: { lat: LAT + 0.002, lon: LON },
            tags: { name: '湯神社', amenity: 'place_of_worship', religion: 'shinto' } },
          // 名前が社寺でない monument は従来どおり記念碑のまま
          { type: 'node', id: 3, lat: LAT + 0.003, lon: LON, tags: { name: '筆塚', historic: 'monument' } },
          // 城は社寺語に当たらない(末尾が「城」)
          { type: 'node', id: 4, lat: LAT + 0.004, lon: LON, tags: { name: '湯築城', historic: 'castle' } }
        ]
      }
    });
    const spots = await geo.fetchSpots(LAT, LON, 3000);
    eq(calls.length, 0, '外部 fetch は0回');
    const byName = {};
    spots.forEach((s) => { byName[s.name] = s; });
    eq(byName['伊佐爾波神社'].category, 'place_of_worship', 'memorial タグでも名前が神社なら社寺');
    eq(byName['伊佐爾波神社'].categoryLabel, '神社・寺院', 'ラベルも「神社・寺院」');
    eq(byName['湯神社'].category, 'place_of_worship', 'place_of_worship はそのまま社寺');
    eq(byName['筆塚'].category, 'monument', '社寺でない monument は記念碑のまま');
    eq(byName['湯築城'].category, 'castle', '城は城のまま');
  }

  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
