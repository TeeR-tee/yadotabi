/**
 * 固定データ(fixture)生成スクリプト — 実行方法: `node scripts/make-fixture.mjs <area>`(未指定は草津固定)
 *
 * 撮影・検証のたびに Overpass / Wikipedia を叩かないよう、対象エリアの生レスポンスを
 * 1度だけ取って `fixtures/<area>.json` に保存する。保存するのは「加工前の生JSON」で、
 * ブラウザ側(geo.js)の既存の整形コードをそのまま通す前提。
 *
 * Node 18+ の素の fetch のみを使う(npm install 禁止)。
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slimOverpassElements } from './slim-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// エリアごとの座標テーブル。assets/app.js の fixtureNameFromUrl と同じ正規表現で名前を検証する。
const AREAS = {
  kusatsu: { lat: 36.6226, lon: 138.5960, label: '草津温泉' },
  hakone: { lat: 35.2324, lon: 139.1069, label: '箱根湯本', osmRadiusM: 30000 },
  dogo: { lat: 33.8520, lon: 132.7860, label: '道後温泉' },
  beppu: { lat: 33.2846, lon: 131.4914, label: '別府温泉' },
  kinosaki: { lat: 35.6262, lon: 134.8055, label: '城崎温泉' }
};

const AREA = (process.argv[2] || 'kusatsu').trim();
if (!/^[a-z0-9_-]+$/.test(AREA) || !AREAS[AREA]) {
  console.error('不正なエリア名です: ' + AREA);
  console.error('使えるエリア名: ' + Object.keys(AREAS).join(', '));
  process.exit(1);
}

const LAT = AREAS[AREA].lat;
const LON = AREAS[AREA].lon;
const AREA_LABEL = AREAS[AREA].label;

// assets/engine.js の OSM_RADIUS_M / WIKI_RADIUS_M と揃えること(未指定は 15000)。
const OSM_RADIUS_M = AREAS[AREA].osmRadiusM || 15000;
const WIKI_RADIUS_M = 10000;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const WIKIPEDIA_API_URL = 'https://ja.wikipedia.org/w/api.php';

// geo.js の fetchWikiNearby と同じく continue は最大3回追う。
const WIKI_NEARBY_MAX_CONTINUE = 3;

// Overpass が混んでいるときの再試行設定。
const RETRY_WAIT_MS = 60000;
const MAX_RETRY = 2;
const FALLBACK_RADIUS_M = 4000;

/**
 * Overpass QL を組み立てる。
 * ★ assets/geo.js の buildOverpassQuery と同期させること(手で書き換えず丸ごとコピーする)。
 */
function buildOverpassQuery(lat, lon, radiusM) {
  var around = '(around:' + Math.round(radiusM) + ',' + lat + ',' + lon + ')';
  var clauses = [
    '["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park|gallery|picnic_site)$"]',
    '["historic"~"^(castle|monument|memorial|ruins)$"]',
    '["leisure"~"^(park|garden)$"]',
    // 名前のない礼拝所・浴場は提案にならないので name 必須で絞る
    '["amenity"~"^(place_of_worship|public_bath)$"]["name"]',
    // 自然物は無名のものが大量にあるため name 必須で絞る
    '["natural"~"^(waterfall|spring|hot_spring|cave_entrance|peak)$"]["name"]',
    '["man_made"="lighthouse"]'
  ];

  var body = '';
  clauses.forEach(function (clause) {
    body += '  nwr' + clause + around + ';\n';
  });

  return '[out:json][timeout:90];\n(\n' + body + ');\nout center tags;\n';
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/** Overpass を1回叩く。429/504 は再試行対象として区別できるエラーにする。 */
async function callOverpass(radiusM) {
  const query = buildOverpassQuery(LAT, LON, radiusM);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    // Node の fetch は既定の Accept/User-Agent が Overpass に 406 で弾かれるため明示する
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'yadotabi-fixture/1.0 (https://github.com/TeeR-tee/yadotabi)'
    },
    body: 'data=' + encodeURIComponent(query)
  });

  if (res.status === 429 || res.status === 504) {
    const busy = new Error('overpass busy ' + res.status);
    busy.busy = true;
    throw busy;
  }
  if (!res.ok) throw new Error('overpass ' + res.status);
  return res.json();
}

/** 混雑時は60秒待って最大2回再試行し、それでも駄目なら半径を下げて試す。 */
async function fetchOverpass() {
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const data = await callOverpass(OSM_RADIUS_M);
      return { data: data, radiusM: OSM_RADIUS_M };
    } catch (e) {
      if (!e.busy || attempt === MAX_RETRY) {
        if (!e.busy) throw e;
        break;
      }
      console.log('Overpass が混雑中(' + e.message + ')。60秒待って再試行します…');
      await delay(RETRY_WAIT_MS);
    }
  }

  console.log('半径を ' + FALLBACK_RADIUS_M + 'm に下げて再試行します…');
  const data = await callOverpass(FALLBACK_RADIUS_M);
  return { data: data, radiusM: FALLBACK_RADIUS_M };
}

/**
 * Wikipedia geosearch。geo.js の fetchWikiNearby の baseParams と同じパラメータを使い、
 * continue を最大3回追って query.pages をマージした1オブジェクトにする。
 */
async function fetchWiki() {
  function baseParams() {
    return {
      action: 'query',
      generator: 'geosearch',
      ggscoord: LAT + '|' + LON,
      ggsradius: String(WIKI_RADIUS_M),
      ggslimit: '500',
      prop: 'coordinates|pageimages|extracts',
      // geo.js の baseParams と同じ。max にしないと coordinates が1回10件で頭打ちになる。
      colimit: 'max',
      pilimit: 'max',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      exlimit: 'max',
      pithumbsize: '480',
      format: 'json',
      origin: '*'
    };
  }

  const pages = Object.create(null);
  let cont = null;

  for (let i = 0; i <= WIKI_NEARBY_MAX_CONTINUE; i++) {
    const params = new URLSearchParams(baseParams());
    if (cont) Object.keys(cont).forEach(function (k) { params.set(k, cont[k]); });

    const res = await fetch(WIKIPEDIA_API_URL + '?' + params.toString(), {
      method: 'GET',
      // Wikimedia は User-Agent の無いリクエストを 429 で弾くので明示する
      headers: {
        Accept: 'application/json',
        'User-Agent': 'yadotabi-fixture/1.0 (https://github.com/TeeR-tee/yadotabi)'
      }
    });
    if (!res.ok) throw new Error('wikipedia ' + res.status);
    const data = await res.json();
    const got = (data && data.query && data.query.pages) || {};

    Object.keys(got).forEach(function (pid) {
      const page = got[pid];
      if (!page || page.missing !== undefined) return;
      pages[pid] = Object.assign({}, pages[pid] || {}, page);
    });

    cont = (data && data.continue) || null;
    if (!cont) break;
  }

  return { query: { pages: pages } };
}

/**
 * R162: OSM の `wikidata` タグから日本語版Wikipediaの記事名を引く対応表を作る。
 * ★ assets/geo.js の resolveWikipediaTitles と同期させること
 *   (fixture 側だけ変えると本番とずれる)。
 *
 * 対象は geo.js と同じく「wikipedia タグが無く、wikidata タグだけがある」要素。
 * wbgetentities は 50件/リクエストなので、1エリアでも数リクエストで済む。
 */
async function fetchWikidataTitles(elements) {
  const ids = new Set();
  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags['name:ja'] || tags.name || '').trim();
    if (!name) continue;
    if (tags.wikipedia || tags['wikipedia:ja']) continue;
    const raw = typeof tags.wikidata === 'string' ? tags.wikidata.trim() : '';
    if (/^Q\d+$/.test(raw)) ids.add(raw);
  }
  const list = [...ids];
  if (!list.length) return {};
  console.log('Wikidata sitelinks を照会中(' + list.length + '件 / ' + Math.ceil(list.length / 50) + 'リクエスト)…');

  const table = {};
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'sitelinks',
      sitefilter: 'jawiki',
      format: 'json',
      origin: '*'
    });
    const res = await fetch('https://www.wikidata.org/w/api.php?' + params.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'yadotabi-fixture/1.0 (https://github.com/TeeR-tee/yadotabi)'
      }
    });
    // 429/504 は押し込まずその場で止める(無料APIのマナー)
    if (res.status === 429 || res.status === 504) {
      throw new Error('wikidata busy ' + res.status + '(押し込まず中止します)');
    }
    if (!res.ok) throw new Error('wikidata ' + res.status);
    const data = await res.json();
    const entities = (data && data.entities) || {};
    for (const id of batch) {
      const link = entities[id] && entities[id].sitelinks && entities[id].sitelinks.jawiki;
      const title = link && typeof link.title === 'string' ? link.title.trim() : '';
      if (title) table[id] = title;
    }
    // 連打しない
    if (i + 50 < list.length) await delay(1200);
  }
  console.log('  jawiki記事あり: ' + Object.keys(table).length + '件');
  return table;
}

/**
 * R163: 被リンク数(prop=linkshere)の対応表を作る。
 * ★ assets/geo.js の fetchBacklinkCounts と同期させること。
 *
 * **引く相手の決め方は geo.js/engine.js 本体に決めさせる**。ここで独自に
 * 「距離順に上位N件」などと決めると本番とずれる。assets/geo.js と assets/engine.js を
 * そのまま Node に読み込み、今作った fixture(backlinks 抜き)で collect() を1回走らせて、
 * engine.js の attachBacklinks が実際に要求した記事名だけを集める。
 *
 * continue は必ず完走させる(lhlimit=max の500枠は全タイトル合算なので、
 * 1リクエストで打ち切ると被リンクの多い記事に枠を食われて他が0件で返る)。
 */
async function collectWantedTitles(fixtureWithoutBacklinks) {
  const assetsDir = join(ROOT, 'assets');
  // geo.js / engine.js は (function (global) {...})(window||globalThis) 形式なので
  // そのまま評価すれば globalThis に YadoGeo / YadoEngine が載る。
  const geoSrc = await readFile(join(assetsDir, 'geo.js'), 'utf8');
  const engineSrc = await readFile(join(assetsDir, 'engine.js'), 'utf8');
  (0, eval)(geoSrc);
  (0, eval)(engineSrc);

  const wanted = [];
  // fetchBacklinkCounts を「記事名を記録するだけ」に差し替えて collect を走らせる。
  const realFetch = globalThis.YadoGeo.fetchBacklinkCounts;
  globalThis.YadoGeo.fetchBacklinkCounts = async function (titles) {
    (titles || []).forEach((t) => { if (t && wanted.indexOf(t) < 0) wanted.push(t); });
    return {};
  };
  try {
    globalThis.YadoGeo.setFixture(fixtureWithoutBacklinks);
    await globalThis.YadoEngine.collect({
      id: 'fixture/' + AREA, name: AREA_LABEL, lat: LAT, lon: LON
    });
  } finally {
    globalThis.YadoGeo.fetchBacklinkCounts = realFetch;
  }
  return wanted;
}

/**
 * R164: 親記事(AREA_LABEL = fixture の meta.label)の本文を取る。
 * ★ assets/geo.js の fetchParentMentions と同条件にすること
 *   (prop=extracts&explaintext=1&redirects=1、1リクエスト1記事)。
 *
 * `explaintext=1` は titles を並べても1リクエスト1記事しか返らないが、
 * 親記事は1エリア1本なので追加は **+1リクエスト** で済む。
 * 照合条件(2文字以上・汎用語ブロック)は geo.js の matchParentMentions が持っており、
 * こちらでは本文をそのまま保存するだけ(条件を二重実装しない)。
 */
async function fetchParentExtract() {
  console.log('親記事の本文を取得中(' + AREA_LABEL + ')…');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: AREA_LABEL,
    origin: '*'
  });
  const res = await fetch(WIKIPEDIA_API_URL + '?' + params.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'yadotabi-fixture/1.0 (https://github.com/TeeR-tee/yadotabi)'
    }
  });
  // 429/504 は押し込まずその場で止める(無料APIのマナー)
  if (res.status === 429 || res.status === 504) {
    throw new Error('wikipedia busy ' + res.status + '(押し込まず中止します)');
  }
  if (!res.ok) throw new Error('extracts ' + res.status);
  const data = await res.json();
  const pages = (data && data.query && data.query.pages) || [];
  const page = pages.find((p) => p && typeof p.extract === 'string');
  const text = page ? page.extract : '';
  console.log('  本文: ' + text.length + '字' + (text ? '' : '(記事が見つかりませんでした)'));
  return text;
}

async function fetchBacklinks(titles) {
  if (!titles.length) return {};
  console.log('被リンク数を照会中(' + titles.length + '件 / ' + Math.ceil(titles.length / 50) + 'バッチ)…');

  const table = {};
  let reqs = 0;

  for (let b = 0; b < titles.length; b += 50) {
    const alias = Object.create(null);
    const resolveTitle = (t) => { let x = t; for (let i = 0; i < 3 && alias[x]; i++) x = alias[x]; return x; };
    let live = titles.slice(b, b + 50);
    let sub = Object.create(null);
    let cont = null;
    let batchReqs = 0;

    const settle = (list) => list.forEach((t) => {
      if (typeof table[t] !== 'number') table[t] = sub[resolveTitle(t)] || 0;
    });

    // geo.js の BACKLINK_MAX_CONTINUE と同じ上限。
    while (live.length && batchReqs < 20) {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'linkshere',
        titles: live.join('|'),
        lhnamespace: '0',
        lhlimit: 'max',
        lhprop: 'title',
        redirects: '1',
        origin: '*'
      });
      if (cont) Object.keys(cont).forEach((k) => params.set(k, cont[k]));

      const res = await fetch(WIKIPEDIA_API_URL + '?' + params.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'yadotabi-fixture/1.0 (https://github.com/TeeR-tee/yadotabi)'
        }
      });
      reqs++; batchReqs++;
      // 429/504 は押し込まずその場で止める(無料APIのマナー)
      if (res.status === 429 || res.status === 504) {
        throw new Error('wikipedia busy ' + res.status + '(押し込まず中止します)');
      }
      if (!res.ok) throw new Error('linkshere ' + res.status);
      const data = await res.json();
      const query = (data && data.query) || null;
      if (!query) break;

      Object.values(query.pages || {}).forEach((page) => {
        if (!page) return;
        if (page.missing !== undefined) {
          if (typeof table[page.title] !== 'number') table[page.title] = 0;
          return;
        }
        sub[page.title] = (sub[page.title] || 0) + ((page.linkshere || []).length);
      });
      [...(query.normalized || []), ...(query.redirects || [])].forEach((m) => {
        if (m && m.from && m.to) alias[m.from] = m.to;
      });

      cont = (data && data.continue) || null;
      if (!cont) { settle(live); live = []; break; }

      // ★ assets/geo.js の fetchBacklinkCounts と同じ手順。比較は必ず素のコードポイント順。
      const head = String(cont.lhcontinue || '').split('|')[0];
      if ((sub[head] || 0) >= 200) {
        const keep = [];
        live.forEach((t) => {
          const x = resolveTitle(t);
          if (x === head || x < head) {
            if (typeof table[t] !== 'number') table[t] = sub[x] || 0;
          } else keep.push(t);
        });
        live = keep;
        cont = null;
        sub = Object.create(null);
      }
      // 連打しない
      await delay(200);
    }

    settle(live);
    if (b + 50 < titles.length) await delay(1200);
  }

  console.log('  リクエスト数: ' + reqs + ' / 被リンクを引けた記事: ' + Object.keys(table).length + '件');
  return table;
}

async function main() {
  // Wikipedia を先に取る(Overpass は重いので、Wikipedia 側で失敗したときに
  // Overpass を無駄に叩き直さないようにする)
  console.log('Wikipedia geosearch から取得中(半径 ' + WIKI_RADIUS_M + 'm)…');
  const wiki = await fetchWiki();
  const pageCount = Object.keys(wiki.query.pages).length;
  console.log('  pages: ' + pageCount + '件');

  console.log('Overpass から取得中(半径 ' + OSM_RADIUS_M + 'm)…');
  const overpass = await fetchOverpass();
  const elements = (overpass.data && overpass.data.elements) || [];
  console.log('  elements: ' + elements.length + '件');

  // 保存前に不要な OSM タグを keep-list で落とす(slim-fixtures.mjs と同じ判定を共有)。
  const droppedKeys = slimOverpassElements(elements);
  console.log('  削除タグ数: ' + droppedKeys);

  // R162: slim 後の要素から wikidata→記事名 の対応表を作る(geo.js と同じ条件)。
  const wikidataTitles = await fetchWikidataTitles(elements);

  // R164: 親記事の本文(geo.js の fetchParentMentions が fixture モードで読む)。
  const parentExtract = await fetchParentExtract();

  const fixture = {
    meta: {
      area: AREA,
      label: AREA_LABEL,
      lat: LAT,
      lon: LON,
      osmRadiusM: overpass.radiusM,
      wikiRadiusM: WIKI_RADIUS_M,
      generatedAt: new Date().toISOString()
    },
    overpass: { elements: elements },
    wiki: wiki,
    // R162: geo.js の resolveWikipediaTitles が fixture モードで読む対応表
    wikidataTitles: wikidataTitles,
    // R164: geo.js の fetchParentMentions が fixture モードで読む親記事の本文
    parentExtract: parentExtract
  };

  // R163: engine.js 自身に「どの記事の被リンクが要るか」を決めさせてから引く。
  const wanted = await collectWantedTitles(fixture);
  fixture.backlinks = await fetchBacklinks(wanted);

  const outDir = join(ROOT, 'fixtures');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, AREA + '.json');
  await writeFile(outPath, JSON.stringify(fixture), 'utf8');
  console.log('保存しました: ' + outPath);
}

main().catch(function (e) {
  console.error('失敗しました: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
