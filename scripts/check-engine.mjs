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
  // URL はブラウザにも Node にもある標準グローバル。engine.js の websiteHost が使う。
  const sandbox = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, URL };
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

  // Card の全フィールド(R84: _debug は ?debug=1 の描画元。通常動作では読まれない。
  // R123: wikipediaTitle/wikidataId は記事の存在を示す裏付け。画面には出さない。
  // R136: openingHours は生の opening_hours 表記。整形・判定は app.js 側の責務)
  eq(Object.keys(saino).sort(),
    ['_debug','categoryLabel','distanceM','driveMin','id','imageUrl','lat','links','lon','openingHours','source','summary','name','walkMin','wikidataId','wikipediaTitle'].sort(),
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
console.log('\n(r115) 名前の「温泉」に引きずられない(記事冒頭の定義文で否認)');
{
  // 4エリアの fixtures から取った実際の冒頭文を使う。
  // deny=false は「温泉のまま残らねばならない」側(誤爆したら条件が広すぎる)。
  const R115_CASES = [
    // 直す側: 名前 or 冒頭文に「温泉」が出るが、定義文の種別は温泉でない
    { title: '草津温泉バスターミナル',
      extract: '草津温泉バスターミナル（くさつおんせんバスターミナル）は、群馬県吾妻郡草津町にあるバスターミナルである。施設管理は草津観光公社が行っている。',
      category: 'other', label: 'スポット' },
    { title: '草津温泉スキー場',
      extract: '草津温泉スキー場（くさつおんせんスキーじょう）は、群馬県吾妻郡草津町に位置するスキー場。\n施設は草津町が保有し、',
      category: 'other', label: 'スポット' },
    { title: '冠山 (松山市)',
      extract: '冠山（かんむりやま）は、愛媛県松山市の道後温泉にある小高い山。',
      category: 'other', label: 'スポット' },
    // R115 時点では「温泉ラベルにしない」側だったが、R119 で「既に無くなった施設なので
    // そもそも候補に出さない」に変わった(ケースは消さず期待値を移す。天成園ほか4件と同じ扱い)。
    { title: '鶴見園',
      extract: '鶴見園（つるみえん）は、大分県別府市南立石にかつて存在した遊園地。温泉と少女歌劇を呼び物とし、',
      gone: true },
    // 残す側: 定義文の種別が温泉なので温泉のまま
    { title: '花敷温泉',
      extract: '花敷温泉（はなしきおんせん）は、群馬県吾妻郡中之条町（旧国上野国）にある温泉。尻焼温泉、応徳温泉、京塚温泉と共に六合温泉郷を形成する。',
      category: 'hot_spring', label: '温泉' },
    // ここから下の4件は R115 時点では「温泉ラベルのまま残す」側だったが、R117 で
    // 「そもそも他社の宿なので候補に出さない」に変わった(ケースは消さず期待値を移す)。
    // lodging:true = 候補ごと消えるのが正しい。R115 が見ていた「定義文だけを見る」
    // 性質は、二文目にスキー場が出る万座プリンスホテルが名前でなく定義文で落ちること、
    // および下の (r117) 節の対照ケースで引き続き検査している。
    { title: '天成園',
      extract: '天成園（てんせいえん）は、神奈川県足柄下郡箱根町湯本の箱根湯本温泉にある温泉ホテル。万葉倶楽部グループに属する。',
      lodging: true },
    { title: '一の湯',
      extract: '一の湯（いちのゆ）は神奈川県箱根町の塔ノ沢温泉にある、株式会社一の湯が経営する、1630年（寛永7年）創業の老舗温泉旅館である。',
      lodging: true },
    { title: '大江戸温泉物語 別府清風',
      extract: '大江戸温泉物語 別府清風（おおえどおんせんものがたり べっぷせいふう）は、大分県別府市北浜にある温泉ホテルである。',
      lodging: true },
    { title: '万座プリンスホテル',
      extract: '万座プリンスホテル（まんざプリンスホテル）は、群馬県吾妻郡嬬恋村の万座温泉にあるホテル。西武・プリンスホテルズワールドワイドが運営しており、同社が運営する万座温泉スキー場に隣接している。',
      lodging: true }
  ];

  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    // 名前の包含(「草津温泉スキー場」等)で dedupe されないよう 500m 刻みで離す
    fetchWikiNearby: () => Promise.resolve(R115_CASES.map((c, i) => ({
      id: 'wp/' + (600 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const items = await E.collect(HOTEL);
  const byTitle = Object.fromEntries(items.map(i => [i.name, i]));
  R115_CASES.forEach(c => {
    const got = byTitle[c.title];
    if (c.lodging) {
      ok(!got, 'R115→R117: ' + c.title + ' は宿なので候補から消える',
        got && { category: got.category, label: got.categoryLabel });
      return;
    }
    if (c.gone) {
      ok(!got, 'R115→R119: ' + c.title + ' は既に無い施設なので候補から消える',
        got && { category: got.category, label: got.categoryLabel });
      return;
    }
    ok(!!got && got.category === c.category && got.categoryLabel === c.label,
      'R115: ' + c.title + ' → ' + c.label,
      got && { category: got.category, label: got.categoryLabel });
  });

  // deny は hot_spring 行だけ。他カテゴリの推定は一切変わらない
  const E2 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve([
      // 「スキー場」を含むが城の記事 → castle のまま(deny を持たない行は素通し)
      { id: 'wp/650', title: '〇〇城', lat: at(800), lon: HOTEL.lon, distanceM: 800,
        thumbnailUrl: null, extract: '〇〇城は、スキー場の近くにある城である。', url: '' },
      // 温泉語が無ければ deny は関係なく従来どおり
      { id: 'wp/651', title: '白糸の滝', lat: at(1400), lon: HOTEL.lon, distanceM: 1400,
        thumbnailUrl: null, extract: '白糸の滝は、遊園地の跡地にある滝である。', url: '' }
    ])
  });
  const other = Object.fromEntries((await E2.collect(HOTEL)).map(i => [i.name, i]));
  ok(other['〇〇城'] && other['〇〇城'].categoryLabel === '城・城跡',
    'R115: deny は hot_spring 行だけ(城は「スキー場」を含んでも城のまま)',
    other['〇〇城'] && other['〇〇城'].categoryLabel);
  ok(other['白糸の滝'] && other['白糸の滝'].categoryLabel === '滝',
    'R115: 滝の推定は変わらない', other['白糸の滝'] && other['白糸の滝'].categoryLabel);
}

// ---------------------------------------------------------------------------
console.log('\n(r117) 他社の宿(ホテル・旅館)を候補から落とす(定義文で判定)');
{
  // やどたびは「宿の周り」を出すサイトなので、候補に他社の宿が並んではいけない。
  // 判定は R115 と同じ definitionScope(記事冒頭の一文)。名前では落とさない。
  // drop=true が落ちる側、drop=false が残る側(1件でも巻き込んだら条件が広すぎる)。
  const R117_CASES = [
    // --- 落とす側: 4 fixture の実測7件の定義文をそのまま使う ---
    { title: '天成園', drop: true,
      extract: '天成園（てんせいえん）は、神奈川県足柄下郡箱根町湯本の箱根湯本温泉にある温泉ホテル。万葉倶楽部グループに属する。' },
    { title: '一の湯', drop: true,
      extract: '一の湯（いちのゆ）は神奈川県箱根町の塔ノ沢温泉にある、株式会社一の湯が経営する、1630年（寛永7年）創業の老舗温泉旅館である。' },
    { title: 'ヒルトン小田原リゾート&スパ', drop: true,
      extract: 'ヒルトン小田原リゾート&スパ（Hilton Odawara Resort & Spa）とは、神奈川県小田原市にあるヒルトングループのリゾートホテル。' },
    { title: '杉乃井ホテル', drop: true,
      extract: '杉乃井（すぎのいホテル）は、大分県別府市の別府八湯のひとつ観海寺温泉にある大型リゾートホテルである。' },
    { title: '大江戸温泉物語 別府清風', drop: true,
      extract: '大江戸温泉物語 別府清風（おおえどおんせんものがたり べっぷせいふう）は、大分県別府市北浜にある温泉ホテルである。' },
    { title: '万座プリンスホテル', drop: true,
      extract: '万座プリンスホテル（まんざプリンスホテル）は、群馬県吾妻郡嬬恋村の万座温泉にあるホテル。西武・プリンスホテルズワールドワイドが運営しており、同社が運営する万座温泉スキー場に隣接している。' },
    { title: '渋峠ホテル', drop: true,
      extract: '渋峠ホテル（しぶとうげホテル）は、長野県下高井郡山ノ内町と群馬県吾妻郡中之条町の境にある渋峠に位置するホテルである。' },
    // --- 残す側1: 宿語が二文目以降にしか出ない観光対象(走査範囲が定義文だけである証拠) ---
    { title: '渋峠', drop: false,
      extract: '渋峠（しぶとうげ）は、群馬県と長野県の境にある峠である。国道最高地点として知られ、渋峠ホテルに隣接している。' },
    { title: '〇〇美術館', drop: false,
      extract: '〇〇美術館は、神奈川県にある美術館である。かつてホテルだった建物を活用しており、隣には旅館が並ぶ。' },
    // --- 残す側2: 名前に宿語を含むが本文が別物(名前だけで落とさない証拠) ---
    { title: '〇〇ホテル前', drop: false,
      extract: '〇〇ホテル前（まえ）は、神奈川県箱根町にある展望台である。' },
    // --- 残す側3: 本物の温泉記事(定義文が「温泉である」「温泉。」) ---
    { title: '草津温泉', drop: false,
      extract: '草津温泉（くさつおんせん）は、群馬県吾妻郡草津町（旧国上野国）にある温泉。日本三名泉の一つに数えられる。' },
    { title: '尻焼温泉', drop: false,
      extract: '尻焼温泉（しりやきおんせん）は、群馬県吾妻郡中之条町（旧国上野国）にある温泉。川底から温泉が湧き出る川風呂で知られる。' },
    { title: '花敷温泉', drop: false,
      extract: '花敷温泉（はなしきおんせん）は、群馬県吾妻郡中之条町（旧国上野国）にある温泉。尻焼温泉、応徳温泉、京塚温泉と共に六合温泉郷を形成する。' }
  ];

  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    // 名前の包含(「渋峠ホテル」⊃「渋峠」等)で dedupe されないよう 500m 刻みで離す
    fetchWikiNearby: () => Promise.resolve(R117_CASES.map((c, i) => ({
      id: 'wp/' + (700 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got = new Set((await E.collect(HOTEL)).map(i => i.name));
  R117_CASES.forEach(c => {
    if (c.drop) ok(!got.has(c.title), 'R117 落とす: ' + c.title);
    else ok(got.has(c.title), 'R117 残す: ' + c.title);
  });

  // 日帰り入浴施設は OSM 由来で extract を持たないため走査対象外 = 必ず残る。
  // 「天成園 屋上浴場」「天成園足湯」は記事「天成園」が消えても観光対象として残るのが正しい。
  const E2 = loadEngine({
    ...geoMock(),
    fetchWikiNearby: () => Promise.resolve([]),
    fetchSpots: () => Promise.resolve([
      { id: 'node/4585443307', name: '天成園 屋上浴場', lat: at(400), lon: HOTEL.lon,
        category: 'public_bath', categoryLabel: '共同浴場', distanceM: 400 },
      { id: 'node/13779829434', name: '天成園足湯 (天の足湯)', lat: at(900), lon: HOTEL.lon,
        category: 'public_bath', categoryLabel: '共同浴場', distanceM: 900 },
      { id: 'node/4585443308', name: '箱根湯寮', lat: at(1400), lon: HOTEL.lon,
        category: 'public_bath', categoryLabel: '共同浴場', distanceM: 1400 },
      { id: 'node/4585443309', name: '大滝乃湯', lat: at(1900), lon: HOTEL.lon,
        category: 'public_bath', categoryLabel: '共同浴場', distanceM: 1900 }
    ])
  });
  const baths = new Set((await E2.collect(HOTEL)).map(i => i.name));
  ['天成園 屋上浴場', '天成園足湯 (天の足湯)', '箱根湯寮', '大滝乃湯'].forEach(n => {
    ok(baths.has(n), 'R117 残す(日帰り入浴施設・OSM由来): ' + n);
  });
}

// ---------------------------------------------------------------------------
console.log('\n(r119) 既に無くなった施設を候補から落とす(「かつて」+過去存在語の AND)');
{
  // 「何であるか」ではなく「まだ在るか」を見る唯一のルール。
  // 判定は definitionPredicate(定義文の述部)に「かつて」と過去存在語の**両方**が
  // 含まれること。**片方だけに緩めてはいけない**ので、残す側の対照ケースで守る。
  // drop=true が落ちる側、drop=false が残る側(1件でも巻き込んだら条件が広すぎる)。
  // extract は 4 fixture の実テキストの冒頭文をそのまま使う。
  const R119_CASES = [
    // --- 落とす側: 閉鎖・解体済みで現地に何も無い施設(実測6件) ---
    { title: '草津シズカ山スキー場', drop: true,
      extract: '草津シズカ山スキー場（くさつシズカやまスキーじょう）は、かつて群馬県吾妻郡草津町に存在していたスキー場。' },
    // 名前が NAME_PROTECT_SUFFIX の 'ロープウェイ' / '動物園' で終わる2件。
    // R119 の判定を保護リストより**先に**評価していないと、この2件は生き残る。
    { title: '白根火山ロープウェイ', drop: true,
      extract: '白根火山ロープウェイ（しらねかざんロープウェイ）は、群馬県吾妻郡草津町にかつて存在した草津観光公社のロープウェイである。白根火山ゴンドラとも呼ばれた。' },
    { title: '愛媛県立道後動物園', drop: true,
      extract: '愛媛県立道後動物園（えひめけんりつ どうごどうぶつえん）は、愛媛県松山市にかつて存在した愛媛県立の動物園。' },
    { title: '鶴見園', drop: true,
      extract: '鶴見園（つるみえん）は、大分県別府市南立石にかつて存在した遊園地。温泉と少女歌劇を呼び物とし、「九州一の大遊園地」を自称する大規模な総合レジャー施設であった。' },
    { title: 'キャンプ・チッカマウガ', drop: true,
      extract: 'キャンプ・チッカマウガ（英語: Camp Chickamauga）は、かつて大分県別府市大字野口原周辺に存在した東西：約1.92km、南北：約1.19km、面積：436,638平方メートルの在日米軍、米陸軍キャンプ地の名称である。' },
    { title: '別府鉱山', drop: true,
      extract: '別府鉱山（べっぷこうざん）は、大分県別府市にかつて存在した鉱山。明治から大正にかけて採掘が行われ、一時は九州でも有数の産出量があった。' },
    // --- 残す側1: 「あった」を含むが「かつて」が無い(AND を緩めた瞬間に巻き込む本命) ---
    // 湯築城は dogo の cards 4位。城跡・一夜城歴史公園は「跡地を整備した公園」として
    // **現地に行ける**ので絶対に落としてはいけない。
    { title: '湯築城', drop: false,
      extract: '湯築城（ゆづきじょう）は、愛媛県松山市道後公園にあった日本の城。' },
    { title: '石垣山城', drop: false,
      extract: '石垣山城（いしがきやまじょう）は、神奈川県小田原市早川にあった日本の城。' },
    { title: '羽根尾城', drop: false,
      extract: '羽根尾城（はねおじょう）は、群馬県吾妻郡長野原町（上野国吾妻郡羽根尾）にあった日本の城。' },
    // --- 残す側2: 跡地を整備した現役の公園(過去存在語そのものが無い) ---
    { title: '石垣山一夜城歴史公園', drop: false,
      extract: '石垣山一夜城歴史公園（いしがきやまいちやじょうれきしこうえん）は、神奈川県小田原市早川にある、石垣山一夜城の跡地を整備した公園。' },
    // 注: R119 当時ここにあった `別府駅商業施設`(drop:false =「かつて」軸では総称が
    // 過去のものというだけで駅ビル自体は現役、という理由で残す判定だった)は、
    // R133 で「単一の場所ではない索引記事」という別軸(`^本項では`)が加わったことで
    // 期待値が反転した(索引記事であること自体が理由で落ちるべきになった)。
    // ケース自体は消さず、下の (r133) 節に drop:true として移してある。
    // 注: R119 当時ここにあった `群馬鉄山`(drop:false =「かつて」が無いので残る)は、
    // R120 で `存在した` を単独成立にしたため期待値が反転した。ケース自体は消さず、
    // 下の (r120) 節に drop:true として移してある。
    // --- 残す側4: 「かつて」も過去存在語も無い現役の城跡公園(AND の下限を守る) ---
    { title: '長野原城', drop: false,
      extract: '長野原城（ながのはらじょう）は、群馬県吾妻郡長野原町にあった日本の城。' }
  ];

  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    // 名前の包含で dedupe されないよう 500m 刻みで離す(R117 の並べ方に合わせた)
    fetchWikiNearby: () => Promise.resolve(R119_CASES.map((c, i) => ({
      id: 'wp/' + (900 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got = new Set((await E.collect(HOTEL)).map(i => i.name));
  R119_CASES.forEach(c => {
    if (c.drop) ok(!got.has(c.title), 'R119 落とす: ' + c.title);
    else ok(got.has(c.title), 'R119 残す: ' + c.title);
  });

  // 救済経路(R80 hasOsmTagEvidence)は R119 でも効く: OSM に観光タグ付きで実在する
  // 要素と一致する記事は落ちない(= 現地に何かが残っていれば残る)。
  const E3 = loadEngine({
    ...geoMock(),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/990', title: '鶴見園', lat: at(500), lon: HOTEL.lon, distanceM: 500,
        thumbnailUrl: null, extract: '鶴見園（つるみえん）は、大分県別府市南立石にかつて存在した遊園地。', url: '' }
    ]),
    fetchSpots: () => Promise.resolve([
      { id: 'node/990', name: '鶴見園', lat: at(500), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '観光名所', distanceM: 500 }
    ])
  });
  ok(new Set((await E3.collect(HOTEL)).map(i => i.name)).has('鶴見園'),
    'R119 OSM に観光タグ付きで実在すれば救済される(現地に何か残っている)');
}

// ---------------------------------------------------------------------------
console.log('\n(r120) 「かつて」を含まない廃止表現を単独成立で落とす(存在した/存在していた)');
{
  // R119 の AND 判定は「かつて」が無いと通らないため、過去形だけで廃止を述べる記事が
  // 素通りしていた(kusatsu cards 14位 群馬鉄山)。単独成立にできるのは実測で誤爆0件だった
  // `存在した` / `存在していた` の2語だけ。**`あった` は絶対に単独にしない**ので、
  // 残す側の城ケースでその下限を守る(1件でも落ちたら条件が広すぎる)。
  const R120_CASES = [
    // --- 落とす側: 「かつて」が無く過去形だけで廃止を述べる(R120 で新たに落ちる本命) ---
    { title: '群馬鉄山', drop: true,
      extract: '群馬鉄山（ぐんまてつざん）は、群馬県吾妻郡六合村（現・中之条町）に存在した鉱山。群馬鉱山とも呼ばれる。' },
    // 「かつて」付きでも当然落ちる(R119 の経路とどちらでも落ちることの確認)。
    { title: '別府鉱山', drop: true,
      extract: '別府鉱山（べっぷこうざん）は、大分県別府市にかつて存在した鉱山。' },
    // `存在していた` も単独で成立する。
    { title: '草津シズカ山スキー場', drop: true,
      extract: '草津シズカ山スキー場（くさつシズカやまスキーじょう）は、かつて群馬県吾妻郡草津町に存在していたスキー場。' },
    // --- 残す側: 述部に `あった` を持つ城跡。単独成立に `あった` を入れた瞬間に全滅する ---
    // 湯築城は dogo の cards 4位。城跡は跡地が整備されていて**現地に行ける**。
    { title: '湯築城', drop: false,
      extract: '湯築城（ゆづきじょう）は、愛媛県松山市道後公園にあった日本の城。' },
    { title: '石垣山城', drop: false,
      extract: '石垣山城（いしがきやまじょう）は、神奈川県小田原市早川にあった日本の城。' },
    { title: '羽根尾城', drop: false,
      extract: '羽根尾城（はねおじょう）は、群馬県吾妻郡長野原町（上野国吾妻郡羽根尾）にあった日本の城。' },
    { title: '長野原城', drop: false,
      extract: '長野原城（ながのはらじょう）は、群馬県吾妻郡長野原町にあった日本の城。' },
    // 跡地を整備した現役の公園(過去存在語そのものが無い)。
    { title: '石垣山一夜城歴史公園', drop: false,
      extract: '石垣山一夜城歴史公園（いしがきやまいちやじょうれきしこうえん）は、神奈川県小田原市早川にある、石垣山一夜城の跡地を整備した公園。' }
  ];

  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R120_CASES.map((c, i) => ({
      id: 'wp/' + (1200 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got120 = new Set((await E.collect(HOTEL)).map(i => i.name));
  R120_CASES.forEach(c => {
    if (c.drop) ok(!got120.has(c.title), 'R120 落とす: ' + c.title);
    else ok(got120.has(c.title), 'R120 残す: ' + c.title);
  });

  // 救済経路は R119 と同じまま: OSM に観光タグ付きで実在すれば落ちない。
  const E120b = loadEngine({
    ...geoMock(),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/1290', title: '群馬鉄山', lat: at(500), lon: HOTEL.lon, distanceM: 500,
        thumbnailUrl: null, extract: '群馬鉄山（ぐんまてつざん）は、群馬県吾妻郡六合村（現・中之条町）に存在した鉱山。', url: '' }
    ]),
    fetchSpots: () => Promise.resolve([
      { id: 'node/1290', name: '群馬鉄山', lat: at(500), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '観光名所', distanceM: 500 }
    ])
  });
  ok(new Set((await E120b.collect(HOTEL)).map(i => i.name)).has('群馬鉄山'),
    'R120 OSM に観光タグ付きで実在すれば救済される(現地に遺構が残っている)');
}

// ---------------------------------------------------------------------------
console.log('\n(r121) 現存するが観光目的の訪問が適切でない施設を落とす(療養所・刑務所ほか)');
{
  // R119/R120 の「まだ在るか」では落ちない**現役の**施設のうち、人が収容・居住していて
  // 観光対象として提案するのが適切でないものを、定義文の述部で落とす。
  // **判定は名前ではなく述部で行う**のが要点で、これにより敷地内の公開施設
  // (重監房資料館・OSM の tourism=museum・extract 無し)は走査対象にすらならず、
  // 歴史を学ぶ導線が残る。学びの場を塞がないことが本ルールの前提条件。
  const R121_CASES = [
    // --- 落とす側: 入所者が今も生活している現役の療養所(kusatsu cards 12位) ---
    { title: '国立療養所栗生楽泉園', drop: true,
      extract: '国立療養所栗生楽泉園（こくりつりょうようじょくりうらくせんえん）は、群馬県吾妻郡草津町に位置する国立ハンセン病療養所。厚生労働省所管の施設等機関である。' },
    // --- 残す側1: 同じ敷地の公開資料館。Wikipedia 記事があっても述部は「資料館」なので残る ---
    // 実際の kusatsu では OSM 由来(extract 無し)で more に残ることを実測で確認済み。
    // ここでは「記事があっても落ちない」ことまで確かめ、学びの導線を二重に守る。
    { title: '重監房資料館', drop: false,
      extract: '重監房資料館（じゅうかんぼうしりょうかん）は、群馬県吾妻郡草津町にある国立ハンセン病資料館の分館。重監房の歴史を伝える展示施設である。' },
    // --- 残す側2: 病院・医療を語るが観光の学びの場である資料館・記念館 ---
    { title: '松永記念館', drop: false,
      extract: '松永記念館（まつながきねんかん）は、神奈川県小田原市板橋にある美術館・記念館である。' },
    // --- 残す側3: 名前に種別語を持つ現役の観光施設(誤爆の下限確認) ---
    { title: '草津温泉', drop: false,
      extract: '草津温泉（くさつおんせん）は、群馬県吾妻郡草津町にある温泉。日本三名泉の一つに数えられる。' }
  ];

  const E121 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R121_CASES.map((c, i) => ({
      id: 'wp/' + (1300 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got121 = new Set((await E121.collect(HOTEL)).map(i => i.name));
  R121_CASES.forEach(c => {
    if (c.drop) ok(!got121.has(c.title), 'R121 落とす: ' + c.title);
    else ok(got121.has(c.title), 'R121 残す: ' + c.title);
  });

  // 重監房資料館は実データでは OSM 由来(extract 無し)。述部判定なので当たらず必ず残る。
  // 「療養所ごと落として学びの導線まで塞ぐ」ことが起きないことの本命ケース。
  const E121b = loadEngine({
    ...geoMock(),
    fetchWikiNearby: () => Promise.resolve([]),
    fetchSpots: () => Promise.resolve([
      { id: 'node/8899615699', name: '重監房資料館', lat: at(2935), lon: HOTEL.lon,
        category: 'museum', categoryLabel: '美術館・博物館', distanceM: 2935 }
    ])
  });
  ok(new Set((await E121b.collect(HOTEL)).map(i => i.name)).has('重監房資料館'),
    'R121 OSM 由来の重監房資料館は残る(学びの導線を塞がない)');
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
    '湯畑団地',                         // 団地
    // R79: 末尾一致だけでは素通りしていた公共施設(部分一致の種別語で落とす)
    '別府市総合体育館',                 // 体育館
    '野口病院管理棟',                   // 管理棟(末尾一致の '病院' では当たらない)
    '京都大学大学院理学研究科附属地球熱学研究施設', // 研究施設
    '別府市公会堂',                     // 公会堂
    '別府市野口原総合運動場陸上競技場', // 運動場・競技場
    '別府郵便電話局電話分室',           // 分室(末尾一致の '郵便局' では当たらない)
    '大分県別府総合庁舎',               // 庁舎
    'トキハ別府店百貨店',               // 百貨店(末尾一致)
    '別府駅 (大分県)',                  // 曖昧さ回避カッコを剥がして '駅' に当てる
    '箱根町立体育館 (神奈川県)'         // カッコを剥がした上で部分一致にも当たる
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
    '箱根湯寮',               // 「寮」で終わるが日帰り温泉施設 → 除外語に入れていない
    // R79: 公共施設語を足したことで誤爆しうる観光対象(保護語で守る)
    '別府市観光案内センター', // 'コンベンションセンター' 等と紛れるが観光対象
    '別府タワー',             // 'タワー'(事務所ビルと紛れやすい)
    '別府市美術館',           // 既存の保護語(美術館)が効き続けること
    '海地獄',                 // '地獄'(別府の看板観光地)
    '別府ロープウェイ',       // 'ロープウェイ'
    '鉄輪むし湯足湯',         // '足湯'
    '箱根ビジターセンター',   // 'ビジターセンター'
    '草津温泉交流センター',   // '交流センター'
    '道後展望'                // '展望'
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

  // (4) R79 冒頭文でも公共施設を落とす --------------------------------------
  // 名前が種別語を持たない(「ビーコンプラザ」等)ものは冒頭文でしか判別できない。
  const Ee = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/e1', title: 'ビーコンプラザ', lat: at(800), lon: HOTEL.lon, distanceM: 800,
        thumbnailUrl: null, extract: 'ビーコンプラザは、別府市にあるコンベンション施設である。', url: '' },
      { id: 'wp/e2', title: '〇〇アリーナ', lat: at(850), lon: HOTEL.lon, distanceM: 850,
        thumbnailUrl: null, extract: '〇〇アリーナは、市営の体育館である。', url: '' },
      { id: 'wp/e3', title: '〇〇の湯', lat: at(900), lon: HOTEL.lon, distanceM: 900,
        thumbnailUrl: null, extract: '〇〇の湯は、共同浴場である。', url: '' }
    ])
  });
  const eNames = (await Ee.collect(HOTEL)).map(i => i.name);
  ok(eNames.indexOf('ビーコンプラザ') === -1, 'extract の「コンベンション」で落ちる', eNames);
  ok(eNames.indexOf('〇〇アリーナ') === -1, 'extract の「体育館である」で落ちる', eNames);
  ok(eNames.indexOf('〇〇の湯') !== -1, '共同浴場は残る(過剰除外していない)', eNames);

  // (5) R80 除外語に当たっても OSM に一致要素があれば通す ---------------------
  // OSM 候補は Overpass の観光タグを通ってきた構造化証拠なので、語より優先する。
  // 救済された記事は統合で OSM 側に吸収されるため、件数は増えず source が both になる。
  const Er = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      // a) wikipedia タグで記事を名指ししている(表記が違っても結び付く)
      { id: 'way/r1', name: '旧〇〇邸', lat: at(600), lon: HOTEL.lon, category: 'attraction',
        categoryLabel: '観光名所', distanceM: 600, website: null, openingHours: null,
        wikipediaTitle: '〇〇県立〇〇高等学校旧校舎', wikidataId: null },
      // b) 名前が完全一致し、かつ 150m 以内にある
      // 名前自体は除外語に当たらない(当たると OSM 側も落ちて救済の相手が消える)。
      // 落とされるのは冒頭文の「コンベンション」の方。
      { id: 'way/r2', name: '〇〇プラザ', lat: at(1000), lon: HOTEL.lon, category: 'attraction',
        categoryLabel: '観光名所', distanceM: 1000, website: null, openingHours: null,
        wikipediaTitle: null, wikidataId: null },
      // c) 名前が含むだけの別主体(自治体・大学)は救済の根拠にしない
      { id: 'way/r3', name: '〇〇町立郷土資料館', lat: at(1400), lon: HOTEL.lon, category: 'museum',
        categoryLabel: '美術館・博物館', distanceM: 1400, website: null, openingHours: null,
        wikipediaTitle: null, wikidataId: null }
    ]),
    fetchWikiNearby: () => Promise.resolve([
      // 'high school' 相当の除外語に当たるが、OSM が wikipedia タグで名指ししている
      { id: 'wp/r1', title: '〇〇県立〇〇高等学校旧校舎', lat: at(605), lon: HOTEL.lon, distanceM: 605,
        thumbnailUrl: 'https://example.com/r1.jpg', extract: '重要文化財の校舎である。', url: '' },
      // 冒頭文の「コンベンション」で落ちるが、同名の OSM 要素が 150m 以内にある
      { id: 'wp/r2', title: '〇〇プラザ', lat: at(1005), lon: HOTEL.lon, distanceM: 1005,
        thumbnailUrl: 'https://example.com/r2.jpg',
        extract: '〇〇プラザは、コンベンション施設である。', url: '' },
      // 自治体の記事。'〇〇町立郷土資料館' に名前が含まれるだけなので救済されない
      { id: 'wp/r3', title: '〇〇町', lat: at(1410), lon: HOTEL.lon, distanceM: 1410,
        thumbnailUrl: null, extract: '〇〇町は、日本の地方公共団体である。', url: '' }
    ])
  });
  const rItems = await Er.collect(HOTEL);
  const rNames = rItems.map(i => i.name);
  const byName = (n) => rItems.filter(i => i.name === n)[0];
  ok(rNames.indexOf('旧〇〇邸') !== -1, 'R80: wikipediaタグ一致で除外語の記事が救済される', rNames);
  eq(byName('旧〇〇邸').source, 'both', 'R80: 救済された記事は OSM に吸収され source=both');
  ok(byName('旧〇〇邸').imageUrl === 'https://example.com/r1.jpg',
    'R80: 救済で写真が付く(救済しないと写真の無い osm 単独のままだった)');
  ok(rNames.indexOf('〇〇プラザ') !== -1, 'R80: 同名かつ近接の OSM 要素で救済される', rNames);
  eq(byName('〇〇プラザ').source, 'both', 'R80: 同名救済も source=both');
  ok(rNames.indexOf('〇〇町') === -1, 'R80: 名前が含まれるだけの自治体記事は救済しない(誤爆防止)', rNames);
  eq(rNames.length, 3, 'R80: 救済で候補件数は増えない(統合で吸収される)');
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

// ---------------------------------------------------------------------------
console.log('\n(r84) _debug の有無で cards/more/far が不変(内訳は並びに影響しない)');
{
  // カテゴリ減点・季節ヒント・裏付け・far分離が全部混ざる入力にして、
  // 「_debug を取り除いたら R84 実装前とまったく同じ」を見る。
  const spots = Array.from({ length: 40 }, (_, i) => ({
    id: 'node/dbg' + i, name: 'デバッグ候補' + i, lat: at(300 + i * 400), lon: HOTEL.lon,
    category: i % 3 === 0 ? 'shrine' : (i % 3 === 1 ? 'hot_spring' : 'other'),
    categoryLabel: 'スポット', distanceM: 300 + i * 400,
    website: i % 4 === 0 ? 'https://example.com/' + i : null,
    summary: i % 2 === 0 ? '説明' + i : null,
    imageUrl: i % 5 === 0 ? 'https://example.com/' + i + '.jpg' : null,
    source: i % 6 === 0 ? 'both' : 'osm'
  }));
  const E = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(spots),
    fetchWikiNearby: () => Promise.resolve([])
  });

  const ranked = E.rank ? E.rank(spots, HOTEL, CTX) : null;
  const res = await E.suggest(HOTEL, CTX);

  // 1. Card に _debug がぶら下がっている(?debug=1 の描画元)
  ok(res.cards.length > 0 && res.cards[0]._debug && typeof res.cards[0]._debug.rank === 'number',
    '1位カードに _debug.rank がある', res.cards[0] && res.cards[0]._debug);
  ok(res.cards[0]._debug.rank === 1, '1位カードの _debug.rank は 1', res.cards[0]._debug.rank);
  ok(typeof res.cards[0]._debug.total === 'number' && typeof res.cards[0]._debug.base === 'number',
    '_debug に total と base(基礎スコア)がある', res.cards[0]._debug);

  // 2. _debug を除いた cards/more/far が「_debug が無かった頃」と完全一致する
  //    (= _debug キーを落とすだけで元の JSON に戻る＝内容を1つも書き換えていない)
  const strip = (list) => list.map((c) => {
    const copy = { ...c };
    delete copy._debug;
    return copy;
  });
  const stripped = { cards: strip(res.cards), more: strip(res.more), far: strip(res.far) };
  const raw = JSON.stringify(res);
  ok(raw.includes('"_debug"'), '素の JSON には _debug が含まれる(付いていることの確認)');
  ok(!JSON.stringify(stripped).includes('"_debug"'), '_debug を落とした JSON には _debug が残らない');
  eq(stripped.cards.length, 30, '_debug があっても cards は30件');
  eq(stripped.more.length, 10, '_debug があっても more は10件');

  // 3. rank() を2回呼んでも順序が同じ(_debug の後付けが次回の入力を汚していない)
  if (ranked) {
    const again = E.rank(spots, HOTEL, CTX);
    eq(again.map((x) => x.id), ranked.map((x) => x.id),
      'rank() を2回呼んでも順序が同じ(_debug 後付けが次回を汚さない)');
  }

  // 4. 並びが _debug.rank の昇順と一致する(内訳が実際の順位と食い違わない)
  const rankSeq = res.cards.map((c) => c._debug.rank);
  eq(rankSeq, rankSeq.map((_, i) => i + 1), 'cards の _debug.rank は 1..30 の昇順');

  // 5. カテゴリ減点が入ったカードでは total < base、入っていないカードでは total === base
  let penaltyConsistent = true;
  res.cards.concat(res.more).forEach((c) => {
    const d = c._debug;
    const expected = d.base + (d.categoryPenalty || 0);
    if (Math.abs(d.total - expected) > 1e-9) penaltyConsistent = false;
  });
  ok(penaltyConsistent, 'total === base + categoryPenalty(内訳の合計が合っている)');
}

// ---------------------------------------------------------------------------
console.log('\n(r114) 日英表記ゆれの救済(ホスト一致+カテゴリ一致+日英ペア+150m以内の AND)');
{
  // collect() に OSM だけを渡し、ペアが1件に統合されるか2件のまま残るかを見る。
  async function collectNames(spots) {
    const E = loadEngine({
      ...geoMock(),
      fetchSpots: () => Promise.resolve(JSON.parse(JSON.stringify(spots))),
      fetchWikiNearby: () => Promise.resolve([])
    });
    const items = await E.collect(HOTEL, CTX);
    return items.map((x) => x.name).sort();
  }

  // 1. 効くケース: 道後の松山城(fixtures/dogo.json の実データ相当・79m離れ)
  //    「松山城」(contact:website 由来) と「Matsuyama Castle」(website) は
  //    文字が1つも共通しないため既存3経路では潰れない。
  const castlePair = [
    { id: 'node/611661255', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000,
      website: 'https://www.matsuyamajo.jp/', wikipediaTitle: null, wikidataId: 'Q981357' },
    { id: 'node/12827570072', name: 'Matsuyama Castle', lat: 33.844972, lon: 132.7659941,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1080,
      website: 'https://matsuyamajo.jp', wikipediaTitle: null, wikidataId: null }
  ];
  eq(await collectNames(castlePair), ['松山城'],
    '松山城 と Matsuyama Castle は1件に統合され、短い日本語名が残る');

  // 2. 誤爆しないケース その1: hakone 宮永岳彦記念美術館 ↔ 弘法の里湯
  //    42m・同じ city.hadano.kanagawa.jp だが、どちらも日本語名でカテゴリも違う。
  const hadanoPair = [
    { id: 'way/160552662', name: '宮永岳彦記念美術館', lat: 35.2296, lon: 139.2203,
      category: 'museum', categoryLabel: '美術館・博物館', distanceM: 5000,
      website: 'https://www.city.hadano.kanagawa.jp/kanko-bunka-sports/bunka-geijutsu/1/index.html' },
    { id: 'way/160552663', name: '弘法の里湯', lat: 35.22996, lon: 139.22047,
      category: 'public_bath', categoryLabel: '温泉・入浴', distanceM: 5040,
      website: 'https://www.city.hadano.kanagawa.jp/kanko/onsen/2674.html' }
  ];
  eq(await collectNames(hadanoPair), ['宮永岳彦記念美術館', '弘法の里湯'],
    '宮永岳彦記念美術館 と 弘法の里湯 は併合されない(日英ペアでない)');

  // 3. 誤爆しないケース その2: beppu うみたまごの館内施設
  //    全部 umitamago.jp で至近だが、どれも日本語名なので救済に落ちてはいけない。
  const umitamagoGroup = [
    { id: 'way/182406175', name: '大分マリーンパレス水族館「うみたまご」', lat: 33.2571, lon: 131.5195,
      category: 'aquarium', categoryLabel: '水族館', distanceM: 8000, website: 'https://www.umitamago.jp/' },
    { id: 'node/12895774908', name: 'あそびーち', lat: 33.25716, lon: 131.51958,
      category: 'attraction', categoryLabel: '観光スポット', distanceM: 8010, website: 'https://www.umitamago.jp/' },
    { id: 'node/12895774909', name: 'パフォーマンスエリア・イルカプール', lat: 33.25719, lon: 131.51961,
      category: 'attraction', categoryLabel: '観光スポット', distanceM: 8015, website: 'https://www.umitamago.jp/' }
  ];
  eq((await collectNames(umitamagoGroup)).length, 3,
    'うみたまごの館内施設3件は3件のまま残る(日英ペアでない)');

  // 4〜7 は「日英ペアでも併合しない」ことの確認が目的で、英語名側に wikidataId を
  // 持たせることで R127(要約無し+記事無しの英語名単独候補を落とす)の対象から外し、
  // 併合ロジック単体をテストする(R127 追加により、記事の裏付けが無い英語名は
  // 併合されないだけでなく候補からも落ちるため、判定の切り分けに必要)。

  // 4. カテゴリが違えば、日英ペアでホストが同じでも併合しない(AND の各条件が効いている)
  const crossCategory = [
    { id: 'node/x1', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000, website: 'https://www.matsuyamajo.jp/' },
    { id: 'node/x2', name: 'Matsuyama Castle Ropeway', lat: 33.844972, lon: 132.7659941,
      category: 'attraction', categoryLabel: '観光スポット', distanceM: 1080, website: 'https://matsuyamajo.jp',
      wikidataId: 'Q99999901' }
  ];
  eq((await collectNames(crossCategory)).length, 2, 'カテゴリが違えば日英ペアでも併合しない');

  // 5. 公式サイトのホストが違えば併合しない
  const otherHost = [
    { id: 'node/y1', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000, website: 'https://www.matsuyamajo.jp/' },
    { id: 'node/y2', name: 'Matsuyama Castle', lat: 33.844972, lon: 132.7659941,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1080, website: 'https://example.com/',
      wikidataId: 'Q99999902' }
  ];
  eq((await collectNames(otherHost)).length, 2, '公式サイトのホストが違えば併合しない');

  // 6. 公式サイトが片方に無ければ併合しない
  const noWebsite = [
    { id: 'node/z1', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000, website: 'https://www.matsuyamajo.jp/' },
    { id: 'node/z2', name: 'Matsuyama Castle', lat: 33.844972, lon: 132.7659941,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1080, website: null,
      wikidataId: 'Q99999903' }
  ];
  eq((await collectNames(noWebsite)).length, 2, '片方に公式サイトが無ければ併合しない');

  // 7. 150m を超えれば併合しない(DEDUPE_NEAR_M の境界)
  const tooFar = [
    { id: 'node/w1', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000, website: 'https://www.matsuyamajo.jp/' },
    { id: 'node/w2', name: 'Matsuyama Castle', lat: 33.845651 + 300 / 111000, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1300, website: 'https://matsuyamajo.jp',
      wikidataId: 'Q99999904' }
  ];
  eq((await collectNames(tooFar)).length, 2, '300m離れていれば併合しない(150m超)');

  // 8. 不正なURLで例外を投げない(websiteHost の try/catch)
  const badUrl = [
    { id: 'node/v1', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000, website: 'not a url' },
    { id: 'node/v2', name: 'Matsuyama Castle', lat: 33.844972, lon: 132.7659941,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1080, website: 'not a url',
      wikidataId: 'Q99999905' }
  ];
  eq((await collectNames(badUrl)).length, 2, '不正なURLは例外を投げず併合もしない');
}

// ---------------------------------------------------------------------------
console.log('\n(r127) 英語名だけの OSM 単独候補を落とす(統合・昇格の後で判定)');
{
  // R127: 日本語UIに要約も写真も無い英語名カード(Kinosaki Ropeway 等)が出る問題。
  // 落とす条件は4つのAND: source=osm(統合されず単独) + 日本語文字なし
  // + summary無し + wikipediaTitle/wikidataId無し。
  async function collectNames(spots, wikiArticles) {
    const E = loadEngine({
      ...geoMock(),
      fetchSpots: () => Promise.resolve(JSON.parse(JSON.stringify(spots))),
      fetchWikiNearby: () => Promise.resolve(wikiArticles || [])
    });
    return await E.collect(HOTEL, CTX);
  }

  // --- 落とす側: fixture 実測(hakone/beppu)そのままの2件 ---
  const dropSpots = [
    { id: 'way/9001', name: 'Ajisai Bridge', lat: at(240), lon: HOTEL.lon,
      category: 'attraction', categoryLabel: '観光名所', distanceM: 240 },
    { id: 'node/9002', name: 'Tsuruya', lat: at(3617), lon: HOTEL.lon,
      category: 'spring', categoryLabel: '湧水', distanceM: 3617 }
  ];
  const gotDrop = await collectNames(dropSpots);
  const namesDrop = new Set(gotDrop.map((x) => x.name));
  ok(!namesDrop.has('Ajisai Bridge'), 'R127 落とす: Ajisai Bridge(要約無し・記事無しの単独OSM)');
  ok(!namesDrop.has('Tsuruya'), 'R127 落とす: Tsuruya(要約無し・記事無しの単独OSM)');

  // --- 残す側1: 松山城(R114統合→R80昇格でsource=bothになったもの)。
  //     統合の後で判定するため、日本語文字なしの英語名側と結合済みでも公式サイトごと残る。
  const castlePair = [
    { id: 'node/611661255', name: '松山城', lat: 33.845651, lon: 132.7657463,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1000,
      website: 'https://www.matsuyamajo.jp/', wikipediaTitle: null, wikidataId: 'Q981357' },
    { id: 'node/12827570072', name: 'Matsuyama Castle', lat: 33.844972, lon: 132.7659941,
      category: 'castle', categoryLabel: '城・城跡', distanceM: 1080,
      website: 'https://matsuyamajo.jp', wikipediaTitle: null, wikidataId: null }
  ];
  const gotCastle = await collectNames(castlePair);
  const matsuyama = gotCastle.find((x) => x.name === '松山城');
  ok(!!matsuyama, 'R127 残す: 松山城(統合の後で判定されるため消えない)');
  eq(matsuyama && matsuyama.source, 'both', 'R127 残す: 松山城は source=both のまま');
  ok(!!(matsuyama && matsuyama.website), 'R127 残す: 松山城の公式サイトが残る');

  // --- 残す側2: 日本語名のOSM単独候補(誤爆しないことの下限確認)。source=osm・要約無し
  //     でも「日本語文字あり」で1条件が外れるため残る。
  const jaOnlySpot = [
    { id: 'node/9003', name: '公園A', lat: at(500), lon: HOTEL.lon,
      category: 'park', categoryLabel: '公園', distanceM: 500 }
  ];
  const gotJa = await collectNames(jaOnlySpot);
  ok(gotJa.some((x) => x.name === '公園A'), 'R127 残す: 日本語名の単独OSM候補(公園A)は落ちない');
}

// ---------------------------------------------------------------------------
console.log('\n(r132) 行ける場所ではないもの(人物・出来事・球技場)をカードから落とす');
{
  // R119〜R121 が見ていたのは「まだ在るか」「訪問が適切か」だったが、ここで問うのは
  // もっと手前の**「そもそも行ける場所か」**という軸。人物・出来事は場所ではないので、
  // 徒歩分数と経路リンクが付くこと自体が提案として意味をなさない。
  // 判定は3つとも定義文の構造で行い、語の列挙で広げない(誤爆0件を実測で確認済み)。
  const R132_CASES = [
    // --- 落とす側1: 人物の伝記。生没年の括弧という**構造**で検出する(kusatsu 5位) ---
    // 既存の人物語は「日本の政治家」等で日本人しか想定しておらず、外国人には1語も当たらない。
    { title: 'コンウォール・リー', drop: true,
      extract: 'コンウォール・リー（Mary Helena Cornwall Legh、1857年5月20日-1941年12月18日）は、英国女性。宣教師の道を歩み1907年来日。' },
    // --- 落とす側2: 球技場。R79 が競技場/運動場/武道館を入れたときの取りこぼし(kusatsu 8位) ---
    { title: '本白根第3グランド', drop: true,
      extract: '本白根第3グランド（もとしらねだいさんぐらんど）は、群馬県草津町にある球技場である。1987年完成。' },
    // --- 落とす側3: 合戦=出来事。述部の「戦いである」で見る(hakone 11位) ---
    { title: '石橋山の戦い', drop: true,
      extract: '石橋山の戦い（いしばしやまのたたかい）は、平安時代末期の治承4年（1180年）に源頼朝と平氏政権勢力（大庭景親ら）との間で行われた戦いである。源氏軍は300騎が石橋山に陣を構え、対する平家軍は3000騎が谷を一つ隔てて布陣して戦い、源頼朝は大敗し箱根山中へ敗走した。' },
    // --- 残す側1: 名前に「戦い」を含む出来事に言及する史跡の記事。述部が「である」の形に
    //     ならないので当たらない。`戦い` 単体を除外語に入れてはいけない理由の本命ケース。
    { title: '石橋山古戦場', drop: false,
      extract: '石橋山古戦場（いしばしやまこせんじょう）は、神奈川県小田原市にある史跡。石橋山の戦いの舞台となった場所で、源頼朝ゆかりの碑が建つ。' },
    // --- 残す側2: 山。生没年らしき数字を含まない通常の地物(誤爆の下限確認) ---
    { title: '本白根山', drop: false,
      extract: '本白根山（もとしらねさん）は、群馬県吾妻郡草津町と嬬恋村にまたがる標高2,171mの火山。本白根火砕丘、鏡池火砕丘、鏡池北火砕丘などからなる火砕丘群である。' },
    // --- 残す側3: 城。括弧内に年号があっても月日まで揃わない形は人物判定に当たらない ---
    { title: '湯築城', drop: false,
      extract: '湯築城（ゆづきじょう）は、愛媛県松山市道後公園にあった日本の城。堀や土塁が現存する。' },
    // --- 残す側4: 創建年の括弧を持つ寺社。年だけの括弧で人物と誤判定しないことの確認 ---
    { title: '湯前神社', drop: false,
      extract: '湯前神社（ゆのまえじんじゃ）は、静岡県熱海市にある神社。天平勝宝元年（749年）の創建と伝わる。' }
  ];

  const E132 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R132_CASES.map((c, i) => ({
      id: 'wp/' + (1400 + i), title: c.title, lat: at(300 + i * 400), lon: HOTEL.lon,
      distanceM: 300 + i * 400, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got132 = new Set((await E132.collect(HOTEL)).map(i => i.name));
  R132_CASES.forEach(c => {
    if (c.drop) ok(!got132.has(c.title), 'R132 落とす: ' + c.title);
    else ok(got132.has(c.title), 'R132 残す: ' + c.title);
  });

  // 本命: hakone 21位の正しい行き先「石橋山古戦場の碑」は OSM 由来(extract 無し)なので
  // 述部判定の走査対象にすらならない。合戦の記事だけが消え、碑へ行く導線は必ず残る。
  const E132b = loadEngine({
    ...geoMock(),
    fetchWikiNearby: () => Promise.resolve([]),
    fetchSpots: () => Promise.resolve([
      { id: 'node/7777001', name: '石橋山古戦場の碑', lat: at(3322), lon: HOTEL.lon,
        category: 'monument', categoryLabel: '記念碑', distanceM: 3322 },
      { id: 'node/7777002', name: '湯畑', lat: at(75), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '観光名所', distanceM: 75 },
      { id: 'node/7777003', name: '道の駅　草津運動茶屋公園', lat: at(1500), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '観光名所', distanceM: 1500 }
    ])
  });
  const got132b = new Set((await E132b.collect(HOTEL)).map(i => i.name));
  ok(got132b.has('石橋山古戦場の碑'), 'R132 残す: 石橋山古戦場の碑(OSM・正しい行き先)');
  ok(got132b.has('湯畑'), 'R132 残す: 湯畑');
  // 名前に '運動' を含むが '運動場' ではないので TITLE_KEYWORD_NG に当たらない。
  // 球技場の追加で道の駅を巻き込んでいないことの確認。
  ok(got132b.has('道の駅　草津運動茶屋公園'), 'R132 残す: 道の駅　草津運動茶屋公園');
}

// ---------------------------------------------------------------------------
console.log('\n(r133) 単一の場所ではない Wikipedia の索引記事をカードから落とす');
{
  // 実測(beppu 9位): extract 冒頭が「本項では、かつて…と総称されていた、…以下の商業施設に
  // ついて述べる。」= 複数施設をまとめた索引記事。definitionPredicate() を通さず
  // extract の生の先頭に `^本項では` を当てて落とす(主題部を捨てると `本項では` 自体が
  // 消えるため)。4エリア200記事の実測ヒットは1件のみ・誤爆0件。
  const R133_CASES = [
    // --- 落とす側: 索引記事そのもの(beppu 9位・実測フィクスチャの extract) ---
    { title: '別府駅商業施設', drop: true,
      extract: '本項では、かつて別府駅商業施設（べっぷえきしょうぎょうしせつ）と総称されていた、大分県別府市のJR九州別府駅に併設されている以下の商業施設について述べる。 えきマチ1丁目別府 B-Passage（旧北名店街） BIS南館（旧南名店街） べっぷ駅前銀座商店街' },
    // --- 残す側1: 「総称」を含むが `本項では` で始まらない、単一の場所を指す記事。
    //     `総称` 単体を除外語に入れてはいけない理由の本命ケース。
    { title: '別府温泉', drop: false,
      extract: '別府温泉（べっぷおんせん）は、大分県別府市に湧出する温泉の総称。源泉数・湧出量ともに日本一を誇る。' },
    // --- 残す側2: 同じく「総称」を含む単一施設の記事。 ---
    { title: 'ビーコンプラザ', drop: false,
      extract: 'ビーコンプラザは、大分県別府市にある複合文化施設の総称であり、国際会議場・グローバルタワー等からなる。' },
    // --- 残す側3: `本項では` を含まない単一のアーケード商店街。 ---
    { title: '竹瓦小路アーケード', drop: false,
      extract: '竹瓦小路アーケード（たけがわらこうじあーけーど）は、大分県別府市にある商店街。竹瓦温泉に隣接する。' },
    // --- 残す側4: 単一の共同浴場。 ---
    { title: '竹瓦温泉', drop: false,
      extract: '竹瓦温泉（たけがわらおんせん）は、大分県別府市にある共同浴場。1938年築の建物は国の登録有形文化財。' }
  ];

  const E133 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R133_CASES.map((c, i) => ({
      id: 'wp/' + (1500 + i), title: c.title, lat: at(300 + i * 400), lon: HOTEL.lon,
      distanceM: 300 + i * 400, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got133 = new Set((await E133.collect(HOTEL)).map(i => i.name));
  R133_CASES.forEach(c => {
    if (c.drop) ok(!got133.has(c.title), 'R133 落とす: ' + c.title);
    else ok(got133.has(c.title), 'R133 残す: ' + c.title);
  });
}

// ---------------------------------------------------------------------------
console.log('\n(r136) 営業時間(openingHours)がカードまで運ばれる(engine.js は判定・整形をしない)');
{
  // geo.js の pickOpeningHours() が拾った生の opening_hours 文字列を、
  // fromOsmSpot → mergeOsmDuplicates → toCard の3経路すべてで欠落なく運ぶことを確認する。
  // 整形・営業中判定は app.js 側の責務であり、engine.js は素通しするだけでよい。
  const E136 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/8888001', name: '御座之湯', lat: at(120), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '共同浴場', distanceM: 120,
        openingHours: 'Mo-Su 08:00-21:00' },
      // opening_hours を持たないスポット(通常経路。openingHours は null のまま運ばれる)
      { id: 'node/8888002', name: '光泉寺', lat: at(200), lon: HOTEL.lon,
        category: 'shrine', categoryLabel: '神社・寺院', distanceM: 200 }
    ]),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const res136 = await E136.suggest(HOTEL, CTX);
  const byName136 = Object.fromEntries(res136.cards.concat(res136.far).map(c => [c.name, c]));
  eq(byName136['御座之湯'].openingHours, 'Mo-Su 08:00-21:00', 'openingHours が生の表記のままカードまで運ばれる');
  eq(byName136['光泉寺'].openingHours, null, 'opening_hours を持たないスポットは openingHours が null のまま');

  // mergeOsmDuplicates 経由(名前包含+150m以内で1件に寄せられるケース)でも欠落しない。
  // 「短い名前」を代表に選んでも、website 同様 openingHours は失われないことの確認。
  const E136b = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/8888003', name: '御座之湯 入口', lat: at(50), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '共同浴場', distanceM: 50 },
      { id: 'node/8888004', name: '御座之湯', lat: at(60), lon: HOTEL.lon,
        category: 'attraction', categoryLabel: '共同浴場', distanceM: 60,
        openingHours: 'Mo-Su 08:00-21:00' }
    ]),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const res136b = await E136b.suggest(HOTEL, CTX);
  const merged136b = res136b.cards.concat(res136b.far).find(c => c.name === '御座之湯');
  ok(!!merged136b, 'mergeOsmDuplicates: 短い名前(御座之湯)が代表として残る');
  eq(merged136b && merged136b.openingHours, 'Mo-Su 08:00-21:00', 'mergeOsmDuplicates 後も openingHours が失われない');
}

// ---------------------------------------------------------------------------
console.log('\n(r141) 複数県にまたがる広域国立公園・国定公園・自然公園をカードから落とす');
{
  // 実測(kusatsu 8位・9位): 上信越高原国立公園・妙高戸隠連山国立公園。どちらも
  // Wikipedia の coordinates が `36.6250, 138.6250` で完全に同一(丸めた代表点)なため、
  // 距離が2枚とも同じ 2602m になり、「宿からの距離」と「行き方(経路リンク)」という
  // やどたびの根幹が両方とも壊れる。実際の範囲は草津から70km以上離れることもある。
  // 判定は両記事が定義文で自ら書いている「またがる」という構造を手がかりにし、
  // 語の列挙で広げない(4エリア200記事の実測ヒットは2件ちょうど・誤爆0件)。
  const R141_CASES = [
    // --- 落とす側1: 3県境界にまたがる広域国立公園(kusatsu 8位・実測フィクスチャの extract) ---
    { title: '上信越高原国立公園', drop: true,
      extract: '上信越高原国立公園（じょうしんえつこうげんこくりつこうえん）は、日本国の群馬県（上野国）、長野県（信濃国）及び新潟県（越後国）の3県の境界にまたがる国立公園である。上信越国立公園とも言う。' },
    // --- 落とす側2: 2県にまたがる広域国立公園(kusatsu 9位・実測フィクスチャの extract) ---
    { title: '妙高戸隠連山国立公園', drop: true,
      extract: '妙高戸隠連山国立公園（みょうこうとがくしれんざんこくりつこうえん）は、新潟県と長野県にまたがる国立公園である。2015年に上信越高原国立公園から分離して成立した、比較的新しい国立公園である。' },
    // --- 残す側1: 単一の火山。「にまたがる」の語自体はあるが、まちがう相手が
    //     群馬県内の2市町村(=1県内)で、述部が「である」で終わらず「火山。」で終わるため
    //     広域指定の構造に当たらない。範囲が限定された単一地物の確認。
    { title: '本白根山', drop: false,
      extract: '本白根山（もとしらねさん）は、群馬県吾妻郡草津町と嬬恋村にまたがる標高2,171mの火山。本白根火砕丘、鏡池火砕丘、鏡池北火砕丘などからなる火砕丘群である。' },
    // --- 残す側2: 単一地物が「国立公園内にある」形。広い版
    //     `/(国立公園|国定公園)である/` を採らない理由そのものの自作ケース。
    //     `国立公園` の語を含むが「にまたがる…である」の構造には当たらない。
    { title: '常布の滝', drop: false,
      extract: '常布の滝（じょうふのたき）は、上信越高原国立公園内にある滝である。落差はおよそ50m。' },
    // --- 残す側3: 単一の道の駅。国立公園の語すら含まない通常の候補(誤爆の下限確認)。 ---
    { title: '道の駅　草津運動茶屋公園', drop: false,
      extract: '道の駅　草津運動茶屋公園（みちのえき　くさつうんどうちゃやこうえん）は、群馬県吾妻郡草津町にある道の駅。' }
  ];

  const E141 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R141_CASES.map((c, i) => ({
      id: 'wp/' + (1600 + i), title: c.title, lat: at(300 + i * 400), lon: HOTEL.lon,
      distanceM: 300 + i * 400, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got141 = new Set((await E141.collect(HOTEL)).map(i => i.name));
  R141_CASES.forEach(c => {
    if (c.drop) ok(!got141.has(c.title), 'R141 落とす: ' + c.title);
    else ok(got141.has(c.title), 'R141 残す: ' + c.title);
  });
}

// ---------------------------------------------------------------------------
console.log('\n(r142) 固有名を持たない一般名詞そのものの候補をカードから落とす');
{
  // 実測(4エリアfixtures突き合わせ): OSM候補で name が一般名詞と完全一致するものが
  // 11件(hakone 足湯×3・記念碑×2・国登録記念物×2、dogo 商店街×1、beppu 足湯×3)。
  // Wikipedia記事側は完全一致ヒット0件(記事タイトルは必ず固有名を持つため構造的に当たらない)。
  // 完全一致のみで判定するので、`湯畑`・`筆塚`のような4文字以下の短い固有名は
  // 1件も巻き込まない(部分一致にすると`〇〇商店街`まで落ちてしまうため絶対に避ける)。
  const R142_CASES = [
    // --- 落とす側: 実測11件のうち代表4種(NAME_PROTECT_SUFFIX に直撃する語を含む) ---
    { name: '商店街', drop: true },
    { name: '足湯', drop: true },
    { name: '記念碑', drop: true },
    { name: '国登録記念物', drop: true },
    // --- 残す側: 4文字以下の短い固有名(完全一致しないので無傷であることの確認) ---
    { name: '湯畑', drop: false },
    { name: '筆塚', drop: false },
    { name: '大湯', drop: false },
    { name: '地蔵', drop: false },
    { name: '拝殿', drop: false },
    // --- 残す側: 一般名詞を含むが固有名が付いているため完全一致しないもの ---
    { name: '道後ﾊｲｶﾗ通り', drop: false },
    { name: '西の河原公園', drop: false },
    { name: '地蔵の湯まえ足湯', drop: false },
    { name: '別府公園', drop: false },
    { name: '道後公園', drop: false }
  ];

  const E142 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(R142_CASES.map((c, i) => ({
      id: 'node/' + (9000 + i), name: c.name, lat: at(100 + i * 50), lon: HOTEL.lon,
      category: 'attraction', categoryLabel: '観光名所', distanceM: 100 + i * 50
    }))),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const got142 = new Set((await E142.collect(HOTEL)).map(i => i.name));
  R142_CASES.forEach(c => {
    if (c.drop) ok(!got142.has(c.name), 'R142 落とす: ' + c.name);
    else ok(got142.has(c.name), 'R142 残す: ' + c.name);
  });
}

// ---------------------------------------------------------------------------
console.log('\n(r143) 動物園・水族館の「中の展示」(動物の種名)をカードから落とす');
{
  // 動物園そのもの(ワンダーラクテンチ動物園・だっこしてZOO ほか)は絶対に巻き込まない。
  // 4条件AND: source=osm(単独) + category=zoo/aquarium(タグ由来)
  // + 記事の裏付け/公式サイト無し + 名前が施設語を1つも含まない。
  // drop=true が落ちる側(=中の展示)、drop=false が残る側(=動物園そのもの)。
  const R143_CASES = [
    // --- 落とす側: 4エリア実測8件のうち代表(施設語を含まない動物の種名) ---
    { name: 'ドクターフィッシュ', category: 'zoo', drop: true },
    { name: 'ニホンザル', category: 'zoo', drop: true },
    { name: 'カピバラ', category: 'zoo', drop: true },
    { name: 'ラマ、ヤギ、ヒツジ', category: 'zoo', drop: true },
    { name: 'ウサギ', category: 'zoo', drop: true },
    // --- 残す側(対照): 正当な動物園そのもの(施設語を含む・タグは同じ zoo/aquarium) ---
    { name: 'ワンダーラクテンチ動物園', category: 'zoo', drop: false },
    { name: 'だっこしてZOO', category: 'zoo', drop: false },
    { name: '愛媛県立とべ動物園', category: 'zoo', drop: false },
    // 「うみたまご」は施設語(園・館等)を含まないが、website 有りで安全弁1が先に効く
    { name: '大分マリーンパレス水族館「うみたまご」', category: 'aquarium', drop: false,
      website: 'https://www.umitamago.jp/' }
  ];

  const E143 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(R143_CASES.map((c, i) => ({
      id: 'node/' + (9100 + i), name: c.name, lat: at(100 + i * 400), lon: HOTEL.lon,
      category: c.category, categoryLabel: c.category === 'aquarium' ? '水族館' : '動物園',
      distanceM: 100 + i * 400, website: c.website || null
    }))),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const got143 = new Set((await E143.collect(HOTEL)).map(i => i.name));
  R143_CASES.forEach(c => {
    if (c.drop) ok(!got143.has(c.name), 'R143 落とす: ' + c.name);
    else ok(got143.has(c.name), 'R143 残す: ' + c.name);
  });

  // 対照: wiki/website の裏付けがあれば施設語が無くても落ちない(2つの安全弁のうち1つ目)。
  // 「草津熱帯圏」相当のケース(施設語リストに当たらないが wikidata を持つ)。
  const E143b = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([
      { id: 'node/9200', name: '草津熱帯圏', category: 'zoo', categoryLabel: '動物園',
        lat: at(500), lon: HOTEL.lon, distanceM: 500,
        wikipediaTitle: '草津熱帯圏', wikidataId: 'Q11618188', website: 'http://nettaiken.com/' }
    ]),
    fetchWikiNearby: () => Promise.resolve([])
  });
  ok(new Set((await E143b.collect(HOTEL)).map(i => i.name)).has('草津熱帯圏'),
    'R143 残す: 草津熱帯圏(施設語に当たらないが wiki/website の裏付けで先に keep)');
}

// ---------------------------------------------------------------------------
console.log('\n(r146) castle 判定は裸の「城」ではなくタイトル末尾一致(城崎などの地名を誤爆しない)');
{
  // 5エリア250記事の実測で判明した誤爆(地名の一部に「城」を含むだけ)の代表3件+本物の城3件。
  // 誤爆側は castle にならないこと、本物の城側は castle のままであることを確認する。
  const R146_CASES = [
    // --- 誤爆側(地名「城崎」「城崎郡」を含むだけで城ではない) ---
    { title: '城崎国際アートセンター', extract: '城崎国際アートセンターは兵庫県豊岡市城崎町にある文化施設である。', category: 'other', label: 'スポット' },
    { title: 'ひのそ島', extract: '兵庫県豊岡市城崎町に属する無人島である。', category: 'other', label: 'スポット' },
    { title: '竹野鉱山', extract: '兵庫県城崎郡竹野町にあった鉱山である。', category: 'other', label: 'スポット' },
    // --- 本物の城(名前が「城」で終わる) ---
    { title: '羽根尾城', extract: '群馬県吾妻郡長野原町にあった日本の城である。', category: 'castle', label: '城・城跡' },
    { title: '長野原城', extract: '群馬県吾妻郡長野原町にあった日本の城である。', category: 'castle', label: '城・城跡' },
    { title: '湯築城', extract: '愛媛県松山市道後公園にあった日本の城である。', category: 'castle', label: '城・城跡' }
  ];

  const E146 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R146_CASES.map((c, i) => ({
      id: 'wp/' + (9300 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const items146 = await E146.collect(HOTEL);
  const byName146 = Object.fromEntries(items146.map(i => [i.name, i]));
  R146_CASES.forEach(c => {
    const got = byName146[c.title];
    ok(!!got && got.category === c.category && got.categoryLabel === c.label,
      'R146 カテゴリ推定: ' + c.title + ' → ' + c.label,
      got && { category: got.category, label: got.categoryLabel });
  });

  // 曖昧さ回避カッコ付きでも末尾一致が効くこと(「〜城 (市)」のような形は今回の実測に
  // 実例は無いが、stripDisambiguation を再利用している設計を裏付ける対照ケース)。
  const E146b = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve([
      { id: 'wp/9400', title: '湯築城 (愛媛県)', lat: at(300), lon: HOTEL.lon,
        distanceM: 300, thumbnailUrl: null, extract: '愛媛県松山市にあった日本の城である。', url: '' }
    ])
  });
  const got146b = (await E146b.collect(HOTEL))[0];
  ok(!!got146b && got146b.category === 'castle',
    'R146 曖昧さ回避カッコを剥がしても末尾一致が効く: 湯築城 (愛媛県)',
    got146b && { category: got146b.category });
}

// ---------------------------------------------------------------------------
console.log('\n(r145) 災害という「出来事」そのものの記事を定義文だけで落とす(名前では絶対に落とさない)');
{
  // 5エリア250記事の実測(2026-09-18): DEFINITION_DISASTER のヒットは kinosaki の
  // 「北但馬地震」1件のみ・誤爆0件。落とす側はこの1件の実測 extract そのもの。
  // 残す側は「〜のふもとにある/建てられた記念碑である」のように災害語を含むが
  // 定義文の構造(で発生した〇〇である)に当たらない自作ケースで、構造一致の下限を確認する。
  const R145_WIKI_CASES = [
    // --- 落とす側: 実測ヒットそのもの(kinosaki 27位の extract) ---
    { title: '北但馬地震', drop: true,
      extract: '北但馬地震（きたたじまじしん）あるいは但馬地震（たじまじしん）は、1925年（大正14年）5月23日午前11時11分、兵庫県但馬地方北部で発生した地震である。地震の規模はM6.8。' },
    // --- 残す側: 災害語(震災)を含むが定義文は「記念碑である」で、構造(で発生した〇〇である)に当たらない ---
    { title: '関東大震災伝承碑', drop: false,
      extract: '関東大震災伝承碑（かんとうだいしんさいでんしょうひ）は、神奈川県箱根町にある関東大震災の記憶を伝えるために建てられた記念碑である。' },
    // --- 残す側: 台風の慰霊碑。「慰霊碑である」で終わり地震/噴火/水害/洪水のいずれの構造にも当たらない ---
    { title: '狩野川台風殉難者慰霊碑', drop: false,
      extract: '狩野川台風殉難者慰霊碑（かのがわたいふうじゅんなんしゃいれいひ）は、狩野川台風の犠牲者を弔うために建立された慰霊碑である。' }
  ];

  const E145 = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve([]),
    fetchWikiNearby: () => Promise.resolve(R145_WIKI_CASES.map((c, i) => ({
      id: 'wp/' + (9500 + i), title: c.title, lat: at(300 + i * 500), lon: HOTEL.lon,
      distanceM: 300 + i * 500, thumbnailUrl: null, extract: c.extract, url: ''
    })))
  });
  const got145 = new Set((await E145.collect(HOTEL)).map(i => i.name));
  R145_WIKI_CASES.forEach(c => {
    if (c.drop) ok(!got145.has(c.title), 'R145 落とす(定義文の構造一致): ' + c.title);
    else ok(got145.has(c.title), 'R145 残す(構造に当たらない記念碑): ' + c.title);
  });

  // --- 残す側: OSM由来の実在の記念碑(extract を持たないので isExcludedName 側だけを通る)。
  //     名前(タイトル)に災害語を含んでいても、DEFINITION_DISASTER は extract 側の
  //     判定でありOSM要素には一切当たらないことを確認する(現に画面に出ている
  //     「北但大震災伝承銅像」(kinosaki 24位)・「水害碑」(beppu 21位)の実例)。
  const R145_OSM_CASES = [
    { name: '北但大震災伝承銅像', category: 'memorial', label: '記念碑' },
    { name: '水害碑', category: 'memorial', label: '記念碑' },
    { name: '狩野川台風殉難者供養塔', category: 'memorial', label: '記念碑' }
  ];
  const E145b = loadEngine({
    ...geoMock(),
    fetchSpots: () => Promise.resolve(R145_OSM_CASES.map((c, i) => ({
      id: 'node/' + (9600 + i), name: c.name, lat: at(200 + i * 400), lon: HOTEL.lon,
      category: c.category, categoryLabel: c.label, distanceM: 200 + i * 400
    }))),
    fetchWikiNearby: () => Promise.resolve([])
  });
  const got145b = new Set((await E145b.collect(HOTEL)).map(i => i.name));
  R145_OSM_CASES.forEach(c => {
    ok(got145b.has(c.name), 'R145 残す(OSM由来の実在の記念碑、名前では判定しない): ' + c.name);
  });
}

console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
