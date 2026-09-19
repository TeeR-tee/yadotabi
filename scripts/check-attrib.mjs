// R31: 状態Bの小地図にOSM帰属表示(attribution)が存在し、かつピンと重ならないことの機械検査
// 使い方: node scripts/check-attrib.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-pinflash.mjs の作りを踏襲する。
//
// 確認項目(各URLごと):
//   (a) #feed-map .leaflet-control-attribution が存在する
//   (b) そのテキストに OpenStreetMap を含む
//   (c) getComputedStyle で display!=='none' / visibility!=='hidden' / opacity>0.5 (非表示化されていない)
//   (d) getBoundingClientRect() が #feed-map 内の全 .pin の rect と1つも交差しない
//       (R118: 点の近似ではなく矩形 vs 矩形で判定する)
//   (e) 全ピンが #feed-map の矩形からはみ出していない
//   (e2) R233: (d)(e) とその並べ替え版の母集団 info.pinRects が空でないこと。
//        ピンが1本も描かれないと (d)(e) は「0本中0本OK」で緑になるため、
//        本数の下限(PIN_MIN)と番号ピン 1..5 の中身を別項目として検査する。
//   (f) コンソールエラー0件
//   (g) R118: 提案順位に依存しないこと。state.cards の**並びだけ**を入れ替えて
//       renderFeedMap() をやり直し(正順/逆順/ランダム3通りの計5パターン)、
//       どの並びでも帰属表示とピンの矩形が1pxも重ならないことを4エリア全部で確認する。
//       rank の重み・閾値には触れない(YadoApp.reorderCardsForTest は並べ替えのみ)。
// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import { ensureServer } from './lib/server.mjs';

let BASE;

// R233: 「母数が0でも緑」を防ぐための下限。この本の4つの判定
// (重なり2件・地図内2件)はすべて `info.pinRects` を母集団にした
// `filter(...).length === 0` なので、**ピンが1本も描かれなければ4項目とも緑**になる。
// ?fixture=kusatsu / 375x812 の実測(2026-09-21)は 6本
// = 宿ピン(♨)1本 + 番号ピン 1..5 の5本。5エリア + embed の6URLすべてで同じ6本。
// fixture の微増減で赤くならないよう、実測6本に対し下限は2本(宿+スポット最低1本)に置く。
const PIN_MIN = 2;
// ★数字だけ見る検査では素通りする壊し方への備え:
// 本数が同じままでも、番号ピンのラベルが 1..5 から崩れていたら落とす。
// (ピンを1本消して代わりに1本足す・番号を振り直す・宿ピンが消えてスポットが増える、
//  といった「本数は変わらない壊れ方」を本数の検査は1つも捕まえられない)
const SPOT_LABELS = ['1', '2', '3', '4', '5'];

// info.pinRects の母数そのものを検査項目に格上げする(R233)。
// 「重ならない」「地図に収まっている」は母数が空なら無条件に真になるため、
// それらの判定の**直前に必ず**この関数を呼んでピンの母数を確かめる。
function okPinPopulation(info, label) {
  const pins = (info && info.pinRects) || [];
  ok(pins.length >= PIN_MIN, `[${label}] 地図のピンが${PIN_MIN}本以上ある(母数が0ではない)`, pins.length);
  const spots = pins.map((p) => p.label).filter((t) => /^\d+$/.test(t)).sort();
  ok(JSON.stringify(spots) === JSON.stringify(SPOT_LABELS),
    `[${label}] 番号ピンが1〜5の5本そろっている(本数だけでなく中身も)`, spots);
}

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// 矩形aとbが重なる面積(px^2)。0なら1pxも重なっていない
function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// 矩形aとbの最小距離(px)。重なっていれば0
function rectGap(a, b) {
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
}

// #feed-map の帰属表示・ピン・地図の矩形を一度に測る(R118: 矩形で判定する)
const MEASURE = () => {
  const feedMap = document.getElementById('feed-map');
  if (!feedMap) return { hasMap: false };
  const attrib = feedMap.querySelector('.leaflet-control-attribution');
  if (!attrib) return { hasMap: true, hasAttrib: false };
  const cs = window.getComputedStyle(attrib);
  const rect = attrib.getBoundingClientRect();
  const mapRect = feedMap.getBoundingClientRect();
  const pins = Array.from(feedMap.querySelectorAll('.pin')).map((p) => {
    const r = p.getBoundingClientRect();
    return {
      label: (p.textContent || '').trim(),
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
    };
  });
  return {
    hasMap: true,
    hasAttrib: true,
    text: attrib.textContent || '',
    display: cs.display,
    visibility: cs.visibility,
    opacity: parseFloat(cs.opacity),
    rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    mapRect: { left: mapRect.left, right: mapRect.right, top: mapRect.top, bottom: mapRect.bottom },
    pinRects: pins,
  };
};

// 並び替えパターンを作る(正順・逆順・ランダム3通り)。ランダムは固定シードで再現可能にする
function orderPatterns(n) {
  const asc = Array.from({ length: n }, (_, i) => i);
  const patterns = [
    { name: '正順', order: asc },
    { name: '逆順', order: asc.slice().reverse() },
  ];
  let seed = 20260916;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let k = 1; k <= 3; k++) {
    const shuffled = asc.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    patterns.push({ name: `ランダム${k}`, order: shuffled });
  }
  return patterns;
}

// R118: 並びを入れ替えても帰属表示に1pxも乗らないことを確認する
async function checkOrderIndependence(page, label) {
  const count = await page.evaluate(() =>
    (window.YadoApp && window.YadoApp.getState().cards.length) || 0);
  ok(count > 0, `[${label}] 並べ替え検査の対象カードが1件以上ある`, count);
  if (!count) return;

  for (const { name, order } of orderPatterns(count)) {
    const applied = await page.evaluate(
      (o) => window.YadoApp.reorderCardsForTest(o), order);
    ok(applied === true, `[${label}/${name}] 並べ替えの再描画が実行できた`, applied);
    if (!applied) continue;
    await waitFor(400);
    const info = await page.evaluate(MEASURE);
    // R233: 以下2つの判定はどちらも info.pinRects を母集団にしているので、
    // 並べ替え後にピンが1本も残らなければ母数0のまま緑になる。母数を先に検査する。
    okPinPopulation(info, `${label}/${name}`);
    const hits = info.pinRects
      .filter((p) => overlapArea(info.rect, p) > 0)
      .map((p) => ({ pin: p.label, area: Math.round(overlapArea(info.rect, p) * 10) / 10 }));
    ok(hits.length === 0, `[${label}/${name}] 並びを変えても帰属表示とピンが1pxも重ならない`, hits);
    const outside = info.pinRects.filter((p) =>
      p.left < info.mapRect.left - 1 || p.right > info.mapRect.right + 1 ||
      p.top < info.mapRect.top - 1 || p.bottom > info.mapRect.bottom + 1);
    ok(outside.length === 0, `[${label}/${name}] 全ピンが地図の中に収まっている`,
      outside.map((p) => p.label));
  }
}

async function checkUrl(browser, url, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(url, { waitUntil: 'load' });
  await waitFor(2000);

  const info = await page.evaluate(MEASURE);

  ok(info.hasMap === true, `[${label}] #feed-map が存在する`, info);
  ok(info.hasAttrib === true, `[${label}] .leaflet-control-attribution が存在する`, info.hasAttrib);
  if (info.hasAttrib) {
    ok(/OpenStreetMap/.test(info.text), `[${label}] 帰属テキストにOpenStreetMapを含む`, info.text);
    ok(info.display !== 'none', `[${label}] display!=='none'`, info.display);
    ok(info.visibility !== 'hidden', `[${label}] visibility!=='hidden'`, info.visibility);
    ok(info.opacity > 0.5, `[${label}] opacity>0.5`, info.opacity);

    // R233: 「帰属表示がピンと重ならない」「全ピンが地図の中」も母集団は info.pinRects。
    // ピンの描画が止まると両方とも空集合で緑になるため、母数を検査項目に格上げする。
    // (カード枚数の母数は checkOrderIndependence の ok(count > 0, …) が持っているが、
    //  ピンの母数とは別物なので別項目にする)
    okPinPopulation(info, label);

    const overlaps = info.pinRects.filter((p) => rectsIntersect(info.rect, p));
    ok(overlaps.length === 0, `[${label}] 帰属表示がピンと重ならない`, { attribRect: info.rect, overlaps });

    // 余裕(最近接ピンとの矩形間距離)を記録する。NIGHTLOG に残すための実測値
    const gaps = info.pinRects
      .map((p) => ({ pin: p.label, gap: Math.round(rectGap(info.rect, p) * 10) / 10 }))
      .sort((a, b) => a.gap - b.gap);
    if (gaps.length) {
      console.log(`  INFO [${label}] 帰属表示との最小余裕 ${gaps[0].gap}px (ピン「${gaps[0].pin}」)`);
    }

    const outside = info.pinRects.filter((p) =>
      p.left < info.mapRect.left - 1 || p.right > info.mapRect.right + 1 ||
      p.top < info.mapRect.top - 1 || p.bottom > info.mapRect.bottom + 1);
    ok(outside.length === 0, `[${label}] 全ピンが地図の中に収まっている`, outside.map((p) => p.label));

    // R118: 順位が変わっても壊れないことを機械で示す
    await checkOrderIndependence(page, label);
  }

  ok(consoleErrors.length === 0, `[${label}] コンソールエラー0件`, consoleErrors);

  await context.close();
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    await checkUrl(browser, `${BASE}/?fixture=kusatsu`, 'kusatsu');
    await checkUrl(browser, `${BASE}/?fixture=hakone`, 'hakone');
    await checkUrl(browser, `${BASE}/?fixture=dogo`, 'dogo');
    await checkUrl(browser, `${BASE}/?fixture=beppu`, 'beppu');
    await checkUrl(browser, `${BASE}/?fixture=kinosaki`, 'kinosaki');
    await checkUrl(browser, `${BASE}/?fixture=kusatsu&embed=1`, 'kusatsu-embed');
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-attrib 実行エラー:', err);
  process.exitCode = 1;
});
