/**
 * 固定データ(fixture)生成スクリプト — 実行方法: `node scripts/make-fixture.mjs <area>`(未指定は草津固定)
 *
 * 撮影・検証のたびに Overpass / Wikipedia を叩かないよう、対象エリアの生レスポンスを
 * 1度だけ取って `fixtures/<area>.json` に保存する。保存するのは「加工前の生JSON」で、
 * ブラウザ側(geo.js)の既存の整形コードをそのまま通す前提。
 *
 * Node 18+ の素の fetch のみを使う(npm install 禁止)。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slimOverpassElements } from './slim-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// エリアごとの座標テーブル。assets/app.js の fixtureNameFromUrl と同じ正規表現で名前を検証する。
const AREAS = {
  kusatsu: { lat: 36.6226, lon: 138.5960, label: '草津温泉' },
  hakone: { lat: 35.2324, lon: 139.1069, label: '箱根湯本', osmRadiusM: 30000 },
  dogo: { lat: 33.8520, lon: 132.7860, label: '道後温泉' },
  beppu: { lat: 33.2846, lon: 131.4914, label: '別府温泉' }
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
      ggslimit: '50',
      prop: 'coordinates|pageimages|extracts',
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
    wiki: wiki
  };

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
