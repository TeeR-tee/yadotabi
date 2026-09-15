/**
 * engine.js の検証。YadoGeo をモックして仕様どおりか確認する。
 * 実行: node scripts/check-engine.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_PATH = path.join(ROOT, 'assets', 'engine.js');
const src = fs.readFileSync(ENGINE_PATH, 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
// vm サンドボックス内で作られた Error は別realm のため instanceof が効かない。
// 「message を持つ throw された値」であることで代替判定する。
function isErrorLike(e) { return !!e && typeof e.message === 'string' && typeof e.stack === 'string'; }
function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label, { actual, expected });
}

/** engine.js を新しいサンドボックスに読み込み、YadoGeo を差し替える */
function loadEngine(geoMock) {
  const sandbox = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON };
  sandbox.window = sandbox;
  sandbox.YadoGeo = geoMock;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'engine.js' });
  return sandbox.YadoEngine;
}

const HOTEL = { id: 'h1', name: 'テストホテル櫻井', lat: 36.62, lon: 138.59 };

// 緯度1度 ≒ 111km。距離をおおよそ狙って置く。
function at(meters) { return HOTEL.lat + meters / 111000; }

const OSM_SPOTS = [
  // 統合対象: Wikipedia 側に「西の河原公園」がある
  { id: 'way/1', name: '西の河原公園', lat: at(900), lon: HOTEL.lon, category: 'park', categoryLabel: '公園',
    distanceM: 900, website: 'https://example.com/saino', openingHours: null, wikipediaTitle: null, wikidataId: null },
  // 名前無し → 落ちる
  { id: 'node/2', name: '   ', lat: at(300), lon: HOTEL.lon, category: 'park', categoryLabel: '公園', distanceM: 300 },
  // ホテル自身(名前一致) → 落ちる
  { id: 'node/3', name: 'テストホテル櫻井', lat: at(20), lon: HOTEL.lon, category: 'other', categoryLabel: 'スポット', distanceM: 20 },
  // 遠い(35km → 車70分) → far
  { id: 'node/4', name: '遠方の城', lat: at(35000), lon: HOTEL.lon, category: 'castle', categoryLabel: '城・城跡', distanceM: 35000 },
  // 公式サイトが javascript: → official は null になること
  { id: 'node/5', name: '怪しい館 & 庭', lat: at(1200), lon: HOTEL.lon, category: 'museum', categoryLabel: '美術館・博物館',
    distanceM: 1200, website: 'javascript:alert(1)' },
  // カテゴリ多様性の確認用に park を3件追加
  { id: 'node/6', name: '公園A', lat: at(500), lon: HOTEL.lon, category: 'park', categoryLabel: '公園', distanceM: 500 },
  { id: 'node/7', name: '公園B', lat: at(600), lon: HOTEL.lon, category: 'park', categoryLabel: '公園', distanceM: 600 },
  { id: 'node/8', name: '公園C', lat: at(700), lon: HOTEL.lon, category: 'park', categoryLabel: '公園', distanceM: 700 }
];

const WIKI_ARTICLES = [
  // OSM の「西の河原公園」と名前一致 → both に統合される
  { id: 'wp/101', title: '西の河原公園', lat: at(905), lon: HOTEL.lon, distanceM: 905,
    thumbnailUrl: 'https://upload.example/saino.jpg',
    extract: 'あ'.repeat(200), url: 'https://ja.wikipedia.org/wiki/西の河原公園' },
  // 150m以内 + 名前の包含 → 統合
  { id: 'wp/102', title: '公園A 石碑', lat: at(560), lon: HOTEL.lon, distanceM: 560,
    thumbnailUrl: null, extract: null, url: 'https://ja.wikipedia.org/wiki/x' },
  // 除外: 駅
  { id: 'wp/103', title: '長野原草津口駅', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null, extract: null, url: '' },
  // 除外: 小学校
  { id: 'wp/104', title: '草津町立草津小学校', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null, extract: null, url: '' },
  // 除外: 川
  { id: 'wp/105', title: '吾妻川', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null, extract: null, url: '' },
  // 除外: 国道
  { id: 'wp/106', title: '国道292号', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null, extract: null, url: '' },
  // 除外: 町(地名)
  { id: 'wp/107', title: '草津町', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null, extract: null, url: '' },
  // 除外: 人物(extract 判定)
  { id: 'wp/108', title: '山田太郎', lat: at(1000), lon: HOTEL.lon, distanceM: 1000, thumbnailUrl: null,
    extract: '山田太郎は、日本の政治家である。', url: '' },
  // 残る: 単独の Wikipedia 記事
  { id: 'wp/109', title: '湯畑', lat: at(1500), lon: HOTEL.lon, distanceM: 1500,
    thumbnailUrl: 'https://upload.example/yubatake.jpg', extract: '湯畑は温泉の源泉。', url: '' }
];

function geoMock(opts = {}) {
  return {
    haversineM: (a1, o1, a2, o2) => {
      const R = 6371000, toRad = Math.PI / 180;
      const dLat = (a2 - a1) * toRad, dLon = (o2 - o1) * toRad;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * toRad) * Math.cos(a2 * toRad) * Math.sin(dLon / 2) ** 2;
      return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
    },
    fetchSpots: opts.osmReject
      ? () => Promise.reject(new Error('OSMダウン'))
      : () => Promise.resolve(JSON.parse(JSON.stringify(OSM_SPOTS))),
    fetchWikiNearby: opts.noWiki ? undefined : (opts.wikiReject
      ? () => Promise.reject(new Error('Wikiダウン'))
      : () => Promise.resolve(JSON.parse(JSON.stringify(WIKI_ARTICLES))))
  };
}

const CTX = { now: new Date(2026, 8, 15), lang: 'ja' }; // 9月(季節ヒント無し)

// ---------------------------------------------------------------------------
console.log('\n(a) 統合・除外・far分離・Cardのフィールド・リンクのエンコード');
{
  const E = loadEngine(geoMock());
  const res = await E.suggest(HOTEL, CTX);
  const all = res.cards.concat(res.far);
  const byName = Object.fromEntries(all.map(c => [c.name, c]));

  // 統合(both)
  const saino = byName['西の河原公園'];
  ok(!!saino, '西の河原公園が出る');
  eq(saino.source, 'both', '名前一致で source=both');
  eq(saino.imageUrl, 'https://upload.example/saino.jpg', 'Wikipedia の写真が合体');
  ok(saino.summary.length === 121 && saino.summary.endsWith('…'), '要約は120字+…で切られる', saino.summary.length);
  eq(saino.categoryLabel, '公園', 'カテゴリは OSM 側を採用');
  eq(saino.lat, at(900), '座標は OSM 側を採用');

  const koenA = byName['公園A'];
  eq(koenA.source, 'both', '150m以内+名前包含で source=both');

  // 単独 wiki
  const yubatake = byName['湯畑'];
  ok(!!yubatake, '湯畑(wiki単独)が出る');
  eq(yubatake.source, 'wiki', 'source=wiki');
  eq(yubatake.categoryLabel, '温泉', 'wiki単独でも extract からカテゴリ推定される');
  eq(yubatake.links.official, null, 'wiki記事URLは official に入れない');

  // 除外
  ['長野原草津口駅', '草津町立草津小学校', '吾妻川', '国道292号', '草津町', '山田太郎']
    .forEach(n => ok(!byName[n], '除外: ' + n));
  ok(!all.some(c => !c.name.trim()), '名前無しOSMは除外');
  ok(!byName['テストホテル櫻井'], 'ホテル自身は除外');

  // far 分離
  eq(res.far.map(c => c.name), ['遠方の城'], 'driveMin>60 は far へ');
  ok(res.far[0].driveMin > 60, 'far の driveMin は60超', res.far[0].driveMin);
  ok(!res.cards.some(c => c.name === '遠方の城'), 'far のものは cards に無い');
  ok(res.cards.every(c => c.driveMin <= 60), 'cards は全て driveMin<=60');

  // Card の全フィールド
  eq(Object.keys(saino).sort(),
    ['categoryLabel','distanceM','driveMin','id','imageUrl','lat','links','lon','name','source','summary','walkMin'],
    'Card のフィールドが仕様どおり');
  eq(Object.keys(saino.links).sort(), ['gmap','instagram','official','tiktok','youtube'], 'links のキー');

  // 分数(距離÷80 / ÷500、切り上げ・最低1分)
  eq(saino.walkMin, Math.max(1, Math.ceil(saino.distanceM / 80)), 'walkMin = 距離÷80 切り上げ');
  eq(saino.driveMin, Math.max(1, Math.ceil(saino.distanceM / 500)), 'driveMin = 距離÷500 切り上げ');
  const near = all.find(c => c.distanceM < 80);
  ok(near === undefined || near.walkMin >= 1, 'walkMin は最低1分');

  // リンクのエンコード
  const ayashii = byName['怪しい館 & 庭'];
  eq(ayashii.links.official, null, 'javascript: は official に入らない');
  eq(ayashii.links.instagram,
    'https://www.instagram.com/explore/search/keyword/?q=' + encodeURIComponent('怪しい館 & 庭'),
    'instagram は encodeURIComponent 済み');
  eq(ayashii.links.tiktok, 'https://www.tiktok.com/search?q=' + encodeURIComponent('怪しい館 & 庭'), 'tiktok リンク');
  eq(ayashii.links.youtube, 'https://www.youtube.com/results?search_query=' + encodeURIComponent('怪しい館 & 庭'), 'youtube リンク');
  ok(ayashii.links.instagram.indexOf('&') === ayashii.links.instagram.lastIndexOf('&') , 'クエリに生の & が混ざらない');
  eq(saino.links.gmap,
    'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(HOTEL.lat + ',' + HOTEL.lon)
      + '&destination=' + encodeURIComponent(saino.lat + ',' + saino.lon) + '&travelmode=walking',
    'gmap リンクは宿発着の経路URL');
  ok(saino.links.gmap.indexOf('/maps/dir/?api=1') === 0 || saino.links.gmap.indexOf('https://www.google.com/maps/dir/?api=1') === 0,
    'gmap は経路URL(maps/dir)で始まる');
  ok(saino.links.gmap.indexOf('destination=' + encodeURIComponent(saino.lat + ',' + saino.lon)) > -1,
    'destination にスポットの座標');
  ok(saino.links.gmap.indexOf('travelmode=walking') > -1, 'travelmode=walking を含む');
  eq(saino.links.official, 'https://example.com/saino', 'http(s) の website は official に入る');

  // 宿座標が無い(non-finite)ときは従来の検索URLにフォールバック
  {
    const E2 = loadEngine(geoMock());
    const badHotel = { id: 'h2', name: '座標なし宿', lat: undefined, lon: NaN };
    const items2 = await E2.collect(HOTEL);
    const ranked2 = E2.rank(items2, HOTEL, CTX);
    const res2 = E2.present(ranked2, badHotel);
    const all2 = [...res2.cards, ...res2.more, ...res2.far];
    const saino2 = all2.find(c => c.name === '西の河原公園');
    eq(saino2.links.gmap,
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(saino2.lat + ',' + saino2.lon),
      '宿座標が非有限のときは従来の検索URLにフォールバック');
  }

  // far 側のカードも経路URLになっている
  {
    const farCard = res.far[0];
    if (farCard) {
      ok(farCard.links.gmap.indexOf('/maps/dir/?api=1') > -1, 'far のカードも経路URL(maps/dir)');
      ok(farCard.links.gmap.indexOf('origin=' + encodeURIComponent(HOTEL.lat + ',' + HOTEL.lon)) > -1,
        'far のカードも origin が宿の座標');
    }
  }

  // 上限
  ok(res.cards.length <= 30, 'cards は最大30件');
  ok(res.far.length <= 10, 'far は最大10件');
}

// ---------------------------------------------------------------------------
console.log('\n(a-2) rank: カテゴリ多様性・季節ヒント・裏付け');
{
  const E = loadEngine(geoMock());
  const items = await E.collect(HOTEL);
  const ranked = E.rank(items, HOTEL, CTX);
  const parks = ranked.map((r, i) => ({ i, cat: r.category })).filter(r => r.cat === 'park');
  ok(parks.length >= 3, 'park が3件以上ある(多様性テストの前提)');
  const nonParkBetween = ranked.slice(parks[0].i, parks[parks.length - 1].i).some(r => r.category !== 'park');
  ok(nonParkBetween, '同カテゴリ3件目以降が減点され、間に別カテゴリが入る');

  // 季節: 冬(1月)は温泉語が加点される
  const winter = E.rank(items, HOTEL, { now: new Date(2026, 0, 15) });
  const summer = E.rank(items, HOTEL, { now: new Date(2026, 6, 15) });
  const posWinter = winter.findIndex(r => r.name === '湯畑');
  const posSummer = summer.findIndex(r => r.name === '湯畑');
  ok(posWinter <= posSummer, '冬は「湯畑」の順位が夏以上に上がる', { posWinter, posSummer });

  // 裏付け: 写真+要約+both の西の河原公園が、裏付けの無い公園Bより上
  const pSaino = ranked.findIndex(r => r.name === '西の河原公園');
  const pB = ranked.findIndex(r => r.name === '公園B');
  ok(pSaino < pB, '裏付けのある候補が上位に来る', { pSaino, pB });

  // rank は非破壊
  ok(ranked !== items, 'rank は新しい配列を返す');
}

// ---------------------------------------------------------------------------
console.log('\n(a-3) Wikipedia単独のカテゴリ推定 / other は多様性減点の対象外');
{
  // 推定テーブルの各行を title 側で確認する
  const CAT_CASES = [
    { title: '白糸の滝', extract: '', category: 'waterfall', label: '滝' },
    { title: '万座温泉', extract: '', category: 'hot_spring', label: '温泉' },
    { title: '岩櫃城', extract: '', category: 'castle', label: '城・城跡' },
    { title: '岩櫃城跡', extract: '', category: 'castle', label: '城・城跡' },
    { title: '白根神社', extract: '', category: 'place_of_worship', label: '神社・寺院' },
    { title: '光泉寺', extract: '', category: 'place_of_worship', label: '神社・寺院' },
    { title: '群馬県立近代美術館', extract: '', category: 'museum', label: '美術館・博物館' },
    { title: '草津温泉博物館', extract: '', category: 'hot_spring', label: '温泉' }, // 先に当たった行が勝つ
    { title: '野反湖', extract: '', category: 'nature', label: '自然・景勝' },
    { title: '吾妻渓谷', extract: '', category: 'nature', label: '自然・景勝' },
    { title: '渋峠', extract: '', category: 'nature', label: '自然・景勝' },
    { title: '西の河原公園', extract: '', category: 'park', label: '公園' },
    // title で当たらず extract で当たるケース
    { title: 'さいの河原', extract: 'ここは露天風呂のある温泉地である。', category: 'hot_spring', label: '温泉' },
    // どれにも当たらない → other のまま
    { title: 'ほにゃらら', extract: 'なんらかの施設である。', category: 'other', label: 'スポット' }
  ];

  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    // 名前の包含関係(岩櫃城 / 岩櫃城跡)で dedupe されないよう 150m 以上離して置く
    fetchWikiNearby: () => Promise.resolve(CAT_CASES.map((c, i) => ({
      id: 'wp/' + (200 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const items = await E.collect(HOTEL);
  const byName = Object.fromEntries(items.map(i => [i.name, i]));
  CAT_CASES.forEach(c => {
    const got = byName[c.title];
    ok(!!got && got.category === c.category && got.categoryLabel === c.label,
      'カテゴリ推定: ' + c.title + ' → ' + c.label,
      got && { category: got.category, label: got.categoryLabel });
  });

  // other が多様性減点の対象外であること:
  // 同スコア条件で other を5件並べ、距離順のまま(減点で入れ替わらない)ことを見る
  const E2 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(
      ['ほにゃららA', 'ほにゃららB', 'ほにゃららC', 'ほにゃららD', 'ほにゃららE'].map((n, i) => ({
        id: 'wp/' + (300 + i), title: n, lat: at(1000 * (i + 1)), lon: HOTEL.lon,
        distanceM: 1000 * (i + 1), thumbnailUrl: null, extract: 'なんらかの施設である。', url: ''
      })))
  });
  const otherItems = await E2.collect(HOTEL);
  ok(otherItems.every(i => i.category === 'other'), '5件とも other に落ちる');
  const rankedOther = E2.rank(otherItems, HOTEL, CTX);
  eq(rankedOther.map(r => r.name),
    ['ほにゃららA', 'ほにゃららB', 'ほにゃららC', 'ほにゃららD', 'ほにゃららE'],
    'other は3件目以降も減点されず、距離順のまま');

  // 対照: other 以外は3件目以降が減点され、遠くても別カテゴリに追い越される。
  // 近い公園を5件 + それより遠い滝を1件置くと、滝(1件目なので無減点)が
  // 3件目以降の公園より前に出る。other なら追い越しは起きない(上の E2 で確認済み)。
  const E3 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve([
      ...['公園A', '公園B', '公園C', '公園D', '公園E'].map((n, i) => ({
        id: 'wp/' + (400 + i), title: n, lat: at(500 * (i + 1)), lon: HOTEL.lon,
        distanceM: 500 * (i + 1), thumbnailUrl: null, extract: '', url: ''
      })),
      { id: 'wp/410', title: '遠い滝', lat: at(4000), lon: HOTEL.lon, distanceM: 4000,
        thumbnailUrl: null, extract: '', url: '' }
    ])
  });
  const parkItems = await E3.collect(HOTEL);
  ok(parkItems.filter(i => i.category === 'park').length === 5, '公園5件が park に推定される');
  ok(parkItems.some(i => i.category === 'waterfall'), '「遠い滝」は waterfall に推定される');
  const rankedPark = E3.rank(parkItems, HOTEL, CTX);
  const posTaki = rankedPark.findIndex(r => r.name === '遠い滝');
  const posParkC = rankedPark.findIndex(r => r.name === '公園C');
  ok(posTaki < posParkC,
    '対照: 3件目以降の park は減点され、より遠い別カテゴリに追い越される',
    { order: rankedPark.map(r => r.name) });

  // Wikipedia単独候補が OSM 候補に不当に沈まないこと(懸念3の本題)
  const E4 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/10', name: '寺A', lat: at(400), lon: HOTEL.lon, category: 'place_of_worship', categoryLabel: '神社・寺院', distanceM: 400 },
      { id: 'node/11', name: '寺B', lat: at(500), lon: HOTEL.lon, category: 'place_of_worship', categoryLabel: '神社・寺院', distanceM: 500 },
      { id: 'node/12', name: '寺C', lat: at(600), lon: HOTEL.lon, category: 'place_of_worship', categoryLabel: '神社・寺院', distanceM: 600 }
    ]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/500', title: '謎の名所X', lat: at(2000), lon: HOTEL.lon, distanceM: 2000,
        thumbnailUrl: null, extract: 'よく分からない場所である。', url: '' },
      { id: 'wp/501', title: '謎の名所Y', lat: at(2100), lon: HOTEL.lon, distanceM: 2100,
        thumbnailUrl: null, extract: 'よく分からない場所である。', url: '' },
      { id: 'wp/502', title: '謎の名所Z', lat: at(2200), lon: HOTEL.lon, distanceM: 2200,
        thumbnailUrl: null, extract: 'よく分からない場所である。', url: '' }
    ])
  });
  const mixItems = await E4.collect(HOTEL);
  const rankedMix = E4.rank(mixItems, HOTEL, CTX);
  const posZ = rankedMix.findIndex(r => r.name === '謎の名所Z');
  const posTeraC = rankedMix.findIndex(r => r.name === '寺C');
  ok(posZ < posTeraC,
    '3件目の other(Wiki単独)が、3件目の同カテゴリOSM候補より上に来る', { posZ, posTeraC });
}

// ---------------------------------------------------------------------------
console.log('\n(a-4) R18 誤併合: 名前の包含だけで別施設を同一視しない');
{
  // 「長い名前 ⊃ 短い名前」かつ 150m 以内のペアを並べ、併合されるべきか確認する。
  // merge=true なら1件に寄る(短い名前が代表)、false なら2件のまま残る。
  const CASES = [
    // --- 別物(差分が敷地内の別施設・付帯設備) ---
    { long: '草津温泉バスターミナル', short: '草津温泉', merge: false },
    { long: '草津温泉スキー場', short: '草津温泉', merge: false },
    { long: '天成園足湯', short: '天成園', merge: false },
    { long: '天成園 屋上浴場', short: '天成園', merge: false },
    { long: '西の河原源泉足湯', short: '西の河原源泉', merge: false },
    { long: '箱根強羅公園熱帯植物園', short: '強羅公園', merge: false },
    { long: '今井八幡神社 児童遊園地', short: '今井八幡神社', merge: false },
    { long: '高森道了尊入口', short: '道了尊', merge: false },
    { long: '伊東市観光会館別館', short: '伊東市観光会館', merge: false },
    { long: '白糸の滝駐車場', short: '白糸の滝', merge: false },
    { long: '湯畑前', short: '湯畑', merge: false },
    { long: '早雲寺トンネル', short: '早雲寺', merge: false },
    // --- 同一(差分が別表記・山号・指定名・主要建物) ---
    { long: '湯畑源泉', short: '湯畑', merge: true },
    { long: '草津山 光泉寺', short: '光泉寺', merge: true },
    { long: '石垣山城', short: '石垣山', merge: true },
    { long: '石垣山一夜城', short: '石垣山', merge: true },
    { long: '史跡 石垣山', short: '石垣山', merge: true },
    { long: '大久寺 本堂', short: '大久寺', merge: true },
    { long: '山角天神社 社殿', short: '山角天神社', merge: true },
    { long: '縣社 報徳二宮神社', short: '報徳二宮神社', merge: true },
    // 「分館」は前に付けば正式名の修飾なので同じ場所
    { long: '小田原市郷土文化館分館 松永記念館', short: '松永記念館', merge: true }
  ];

  for (const c of CASES) {
    // 2件を 20m 差(= DEDUPE_NEAR_M 以内)で置く。距離順に短い方が後に来ても
    // 代表名は「短い方」になる仕様なので、判定は件数と残った名前で見る。
    const E = loadEngine({
      ...geoMock(),
      fetchWikiNearby: () => Promise.resolve([]),
      fetchSpots: () => Promise.resolve([
        { id: 'node/900', name: c.long, lat: at(500), lon: HOTEL.lon,
          category: 'other', categoryLabel: 'スポット', distanceM: 500 },
        { id: 'node/901', name: c.short, lat: at(520), lon: HOTEL.lon,
          category: 'other', categoryLabel: 'スポット', distanceM: 520 }
      ])
    });
    const items = await E.collect(HOTEL);
    const names = items.map(i => i.name).sort();
    if (c.merge) {
      ok(items.length === 1 && items[0].name === c.short,
        `同一: 「${c.long}」=「${c.short}」→ 1件に寄る`, names);
    } else {
      ok(items.length === 2,
        `別物: 「${c.long}」≠「${c.short}」→ 2件のまま`, names);
    }
  }

  // Wikipedia 記事の要約・写真が別施設に流れないこと(誤継承の実害そのもの)
  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/910', name: '天成園足湯', lat: at(500), lon: HOTEL.lon,
        category: 'hot_spring', categoryLabel: '共同浴場', distanceM: 500 }
    ]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/910', title: '天成園', lat: at(520), lon: HOTEL.lon, distanceM: 520,
        thumbnailUrl: 'https://upload.example/tenseien.jpg',
        extract: '天成園は箱根湯本温泉にある温泉ホテル。', url: '' }
    ])
  });
  const merged = await E.collect(HOTEL);
  const ashiyu = merged.find(i => i.name === '天成園足湯');
  ok(!!ashiyu && ashiyu.source === 'osm' && !ashiyu.summary && !ashiyu.imageUrl,
    '足湯がホテル「天成園」の要約・写真を継承しない',
    ashiyu && { source: ashiyu.source, summary: ashiyu.summary, imageUrl: ashiyu.imageUrl });

  // 逆に、妥当な併合では裏付けがちゃんと乗ること
  const E2 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/920', name: '草津山 光泉寺', lat: at(500), lon: HOTEL.lon,
        category: 'place_of_worship', categoryLabel: '神社・寺院', distanceM: 500 }
    ]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/920', title: '光泉寺', lat: at(520), lon: HOTEL.lon, distanceM: 520,
        thumbnailUrl: 'https://upload.example/kosenji.jpg',
        extract: '光泉寺は草津温泉の寺院。', url: '' }
    ])
  });
  const merged2 = await E2.collect(HOTEL);
  const kosenji = merged2.find(i => i.name === '草津山 光泉寺');
  ok(merged2.length === 1 && !!kosenji && kosenji.source === 'both'
    && !!kosenji.summary && !!kosenji.imageUrl,
    '「草津山 光泉寺」は記事「光泉寺」の要約・写真を受け取る',
    { len: merged2.length, names: merged2.map(i => i.name) });
}

// ---------------------------------------------------------------------------
console.log('\n(a-5) R35 観光対象でない候補の除外(OSM側にも適用)+保護リスト');
{
  // 除外語に当たる名前 / 保護語で終わる名前を OSM と Wikipedia の両方から流し込み、
  // どちらの経路でも同じ判定になることを確かめる。
  // R35 以前は OSM 側に除外が一切かかっておらず、学校や役所が素通しだった。
  const NG_NAMES = [
    '愛媛大学教育学部附属特別支援学校', // 特別支援学校(部分一致)
    '草津町立草津中学校',               // 学校(末尾一致)
    '松山地方気象台',                   // 気象台
    '松山市青少年センター',             // 青少年センター
    '道後公園停留場',                   // 停留場(末尾が保護語でないので落ちる)
    '箱根町役場',                       // 町役場
    '草津町立草津保育園',               // 保育園
    '県立中央病院',                     // 病院
    '群馬銀行草津支店',                 // 支店
    '第二浄水場',                       // 浄水場
    '湯畑団地'                          // 団地
  ];
  const OK_NAMES = [
    '愛媛大学ミュージアム',   // 大学を含むが末尾が保護語 → 残す(一般観覧できる展示施設)
    'リーかあさま記念館',     // 記念館
    '重監房資料館',           // 資料館
    '道の駅六合',             // 道の駅
    '西の河原公園',           // 公園
    '白根神社',               // 神社
    '光泉寺',                 // 寺
    '小田原城',               // 城
    '箱根湯寮'                // 「寮」で終わるが日帰り温泉施設 → 除外語に入れていない
  ];

  const mkSpots = (names) => names.map((name, i) => ({
    id: 'node/ng' + i, name, lat: at(300 + i * 40), lon: HOTEL.lon,
    category: 'other', categoryLabel: 'スポット', distanceM: 300 + i * 40
  }));
  const mkArticles = (names) => names.map((title, i) => ({
    id: 'wp/ng' + i, title, lat: at(3000 + i * 40), lon: HOTEL.lon, distanceM: 3000 + i * 40,
    thumbnailUrl: null, extract: null, url: ''
  }));

  // (1) OSM 由来 ------------------------------------------------------------
  const Eo = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(mkSpots([...NG_NAMES, ...OK_NAMES])),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const osmMerged = await Eo.collect(HOTEL);
  const osmNames = osmMerged.map(i => i.name);
  NG_NAMES.forEach((n) => ok(osmNames.indexOf(n) === -1, 'OSM由来で落ちる: ' + n, osmNames));
  OK_NAMES.forEach((n) => ok(osmNames.indexOf(n) !== -1, 'OSM由来で残る: ' + n, osmNames));

  // (2) Wikipedia 由来(既存の挙動が変わっていないこと) ----------------------
  const Ew = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(mkArticles([...NG_NAMES, ...OK_NAMES]))
  });
  const wikiMerged = await Ew.collect(HOTEL);
  const wikiNames = wikiMerged.map(i => i.name);
  NG_NAMES.forEach((n) => ok(wikiNames.indexOf(n) === -1, 'wiki由来で落ちる: ' + n, wikiNames));
  OK_NAMES.forEach((n) => ok(wikiNames.indexOf(n) !== -1, 'wiki由来で残る: ' + n, wikiNames));

  // (3) 保護は extract 判定より先 --------------------------------------------
  // 「〇〇記念館」は冒頭文に除外語が出ても落とさない(保護 → 除外の順)。
  const Ep = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/p1', title: '学校法人〇〇記念館', lat: at(800), lon: HOTEL.lon, distanceM: 800,
        thumbnailUrl: null, extract: '学校法人が運営する展示施設である。', url: '' },
      { id: 'wp/p2', title: '山田太郎', lat: at(900), lon: HOTEL.lon, distanceM: 900,
        thumbnailUrl: null, extract: '山田太郎は、日本の政治家である。', url: '' }
    ])
  });
  const pNames = (await Ep.collect(HOTEL)).map(i => i.name);
  ok(pNames.indexOf('学校法人〇〇記念館') !== -1, '保護語で終われば extract の除外語より優先', pNames);
  ok(pNames.indexOf('山田太郎') === -1, '保護語が無ければ extract 判定は従来どおり効く', pNames);
}

// ---------------------------------------------------------------------------
console.log('\n(b) 片方失敗でも返る / 両方失敗で日本語 Error');
{
  const E1 = loadEngine(geoMock({ wikiReject: true }));
  const r1 = await E1.suggest(HOTEL, CTX);
  ok(r1.cards.length > 0, 'Wiki が reject でも OSM だけで返る');
  ok(r1.cards.every(c => c.source === 'osm'), 'すべて source=osm', r1.cards.map(c => c.source));
  ok(!r1.cards.concat(r1.far).some(c => c.name === '湯畑'), 'wiki 由来は含まれない');

  const E2 = loadEngine(geoMock({ osmReject: true }));
  const r2 = await E2.suggest(HOTEL, CTX);
  ok(r2.cards.length > 0, 'OSM が reject でも Wiki だけで返る');
  ok(r2.cards.every(c => c.source === 'wiki'), 'すべて source=wiki');
  ok(r2.cards.some(c => c.name === '湯畑'), '湯畑が含まれる');

  const E3 = loadEngine(geoMock({ noWiki: true }));
  const r3 = await E3.suggest(HOTEL, CTX);
  ok(r3.cards.length > 0, 'fetchWikiNearby 未実装でも OSM だけで返る(存在チェック)');

  const E4 = loadEngine(geoMock({ osmReject: true, wikiReject: true }));
  let err = null;
  try { await E4.suggest(HOTEL, CTX); } catch (e) { err = e; }
  ok(isErrorLike(err), '両方 reject で Error を投げる', err && String(err));
  ok(err && /[ぁ-んァ-ン一-龥]/.test(err.message), 'エラーメッセージが日本語', err && err.message);
  console.log('    message: ' + (err && err.message));
}

// ---------------------------------------------------------------------------
console.log('\n(c) onProgress の順序');
{
  const E = loadEngine(geoMock());
  const stages = [];
  const partials = [];
  const res = await E.suggest(HOTEL, CTX, (stage, partial) => {
    stages.push(stage);
    partials.push(partial);
  });
  eq(stages, ['osm', 'wiki', 'done'], 'onProgress は osm → wiki → done の順');
  ok(partials.every(p => Array.isArray(p.cards) && Array.isArray(p.far)), '各 partial は {cards, far}');
  ok(partials[0].cards.every(c => c.source === 'osm'), 'osm 段階は OSM のみ');
  ok(partials[1].cards.some(c => c.source === 'both' || c.source === 'wiki'), 'wiki 段階で統合済み');
  eq(partials[2].cards.map(c => c.id), res.cards.map(c => c.id), 'done の内容は戻り値と一致');
  ok(partials.every(p => Array.isArray(p.more)), '各 partial に more キーが存在する(配列)');

  // 片方失敗時も stage は3回
  const E2 = loadEngine(geoMock({ wikiReject: true }));
  const s2 = [];
  await E2.suggest(HOTEL, CTX, (stage) => s2.push(stage));
  eq(s2, ['osm', 'wiki', 'done'], 'Wiki失敗時も osm → wiki → done');

  // onProgress が例外を投げても結果は返る
  const E3 = loadEngine(geoMock());
  const r3 = await E3.suggest(HOTEL, CTX, () => { throw new Error('描画エラー'); });
  ok(r3.cards.length > 0, 'onProgress が投げても suggest は成功する');
}

// ---------------------------------------------------------------------------
console.log('\n(d) その他: context 無指定・不正ホテル');
{
  const E = loadEngine(geoMock());
  const r = await E.suggest(HOTEL);
  ok(r.cards.length > 0, 'context 無指定でも動く(new Date() を使う)');

  let err = null;
  try { await E.suggest({ name: 'x' }); } catch (e) { err = e; }
  ok(isErrorLike(err) && /[ぁ-んァ-ン一-龥]/.test(err.message), '座標不正で日本語 Error', err && err.message);
}

// ---------------------------------------------------------------------------
console.log('\n(e) present(): more(31〜60件目)');
{
  // 40件の OSM スポットを距離違いで用意し、31件以上あるケースを作る
  const manySpots = Array.from({ length: 40 }, (_, i) => ({
    id: 'node/many' + i, name: '候補' + i, lat: at(100 + i * 50), lon: HOTEL.lon,
    category: 'other', categoryLabel: 'スポット', distanceM: 100 + i * 50
  }));
  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(manySpots),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const res = await E.suggest(HOTEL, CTX);
  eq(res.cards.length, 30, '候補31件以上のとき cards は30件のまま');
  eq(res.more.length, 10, '40件中 cards30件を除いた10件が more に入る');
  ok(res.cards.every(c => c.name.startsWith('候補')), 'cards は距離順の候補');
  ok(res.more.every(c => c.name.startsWith('候補')), 'more も候補由来');
  // rank 順が連続していること(cards末尾の距離 <= more先頭の距離)
  const lastCard = res.cards[res.cards.length - 1];
  const firstMore = res.more[0];
  ok(lastCard.distanceM <= firstMore.distanceM,
    'more の先頭は cards の末尾より遠い(rank順が連続)',
    { lastCard: lastCard.distanceM, firstMore: firstMore.distanceM });

  // 候補が30件以下のとき more は空配列(undefined ではない)
  const E2 = loadEngine(geoMock());
  const res2 = await E2.suggest(HOTEL, CTX);
  ok(Array.isArray(res2.more), '候補30件以下でも more は配列');
  eq(res2.more.length, 0, '候補30件以下のとき more は空配列');
}

// ---------------------------------------------------------------------------
console.log('\n(r42) 要約(summary)は句点優先で切る');
{
  const E = loadEngine(geoMock());
  function summaryOf(text) {
    const item = { id: 'x', name: 'ダミー', lat: at(100), lon: HOTEL.lon, distanceM: 100, summary: text };
    return E.present([item], HOTEL).cards[0].summary;
  }

  // 1. 上限以下 → そのまま(「…」なし)
  const shortText = 'あ'.repeat(50) + '。';
  eq(summaryOf(shortText), shortText, '上限以下はそのまま(…なし)');

  // 2. 上限超で60%以降(72字目以降)に句点あり → その句点までで終わり、「…」を含まない
  const sentA = 'あ'.repeat(90) + '。' + 'い'.repeat(40);
  const resA = summaryOf(sentA);
  eq(resA, 'あ'.repeat(90) + '。', '60%以降に句点があればそこで切る');
  ok(!resA.endsWith('…'), '句点で切れた場合は…を含まない', resA);

  // 3. 上限超で句点が60%より手前(72字未満)にしかない → 従来どおり120字+…
  const sentB = 'あ'.repeat(30) + '。' + 'い'.repeat(150);
  const resB = summaryOf(sentB);
  eq(resB, sentB.slice(0, 120) + '…', '句点が60%より手前なら従来どおり120字+…');
  eq(resB.length, 121, '長さは121');

  // 4. 句点が1つも無い長文 → 従来どおり120字+…
  const sentC = 'あ'.repeat(200);
  const resC = summaryOf(sentC);
  eq(resC, sentC.slice(0, 120) + '…', '句点が無ければ従来どおり120字+…');
  eq(resC.length, 121, '長さは121');

  // 5. 句点がちょうど境界(下限ぎりぎり/上限直前)にあるケースの off-by-one
  // 72字目(0始まり71)がちょうど「。」→ idx=71, idx+1=72 = minLen(120*0.6=72) を満たす
  const sentD = 'あ'.repeat(71) + '。' + 'い'.repeat(60);
  const resD = summaryOf(sentD);
  eq(resD, 'あ'.repeat(71) + '。', '句点がちょうど下限(72字目)なら句点優先(境界を含む)');

  // maxChars直前(120字目)が「。」のケース → 従来どおりその位置で切って「…」なし
  const sentE = 'あ'.repeat(119) + '。' + 'い'.repeat(30);
  const resE = summaryOf(sentE);
  eq(resE, 'あ'.repeat(119) + '。', '句点が上限直前(120字目)でも句点優先');
}

console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
