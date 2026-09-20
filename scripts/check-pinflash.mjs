// R10: 番号バッジをタップすると小地図の該当ピンが光る、の機械検査
// 使い方: node scripts/check-pinflash.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu を開き、3番カードの .feedcard__no を click → 200ms後に
//      3番ピンの要素に pin--flash クラスが付いている(他のピンには付いていない)
//   2. 1400ms後に pin--flash が外れている
//   3. 別のバッジを連打しても pin--flash が付いた要素は常に1個以下
//   4. reducedMotion: 'reduce' のコンテキストで同じ click → クラスは付くが
//      アニメしない(animationName が none か duration が 0.01ms 相当)
//   5. コンソールエラー0件
//   6. R237(有無軸): .pin--spot をクリックすると対応するカードが反応する(.feedcard--flash が1枚)
//   7. R237(中身軸): 押したピンの並び順と、反応したカードの data-index が一致する
//      (ピンの本数が合っていても対応が1つずれていれば落ちる)
// 撮影: click後200ms時点のスクリーンショットを screenshots/ に保存(r10-flash を含む)

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import path from 'node:path';
import { ensureServer, PROJECT_ROOT } from './lib/server.mjs';

let BASE;

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function countFlash(page) {
  return page.evaluate(() => document.querySelectorAll('.pin--flash').length);
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- 通常のアニメあり検証 ---
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    const badge3 = page.locator('.feedcard__no[data-no="3"]');
    ok(await badge3.count() === 1, '3番バッジが存在する', await badge3.count());
    await badge3.click();
    await waitFor(200);

    const flashInfo = await page.evaluate(() => {
      const markers = Array.from(document.querySelectorAll('.pin--spot'));
      return markers.map((m) => ({
        title: m.getAttribute('title'),
        flashed: m.classList.contains('pin--flash'),
      }));
    });
    const flashedCount = flashInfo.filter((m) => m.flashed).length;
    ok(flashedCount === 1, '200ms後にピンが1個だけ光っている', flashInfo);

    // 撮影(200ms後、目視用)
    const shotPath = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r10-flash_mobile.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('  撮影: ' + shotPath);

    await waitFor(1200); // 200+1200=1400ms後
    const afterCount = await countFlash(page);
    ok(afterCount === 0, '1400ms後にpin--flashが外れている', afterCount);

    // 連打対策: 別バッジを立て続けにclick
    const badge1 = page.locator('.feedcard__no[data-no="1"]');
    const badge2 = page.locator('.feedcard__no[data-no="2"]');
    await badge1.click();
    await waitFor(50);
    await badge2.click();
    await waitFor(50);
    await badge3.click();
    await waitFor(100);
    const rapidCount = await countFlash(page);
    ok(rapidCount <= 1, '連打してもpin--flashは常に1個以下', rapidCount);

    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);
    await context.close();

    // --- reduced-motion 検証 ---
    const rmContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      reducedMotion: 'reduce',
    });
    const rmPage = await rmContext.newPage();
    const rmErrors = [];
    rmPage.on('console', (msg) => { if (msg.type() === 'error') rmErrors.push(msg.text()); });
    rmPage.on('pageerror', (err) => rmErrors.push(String(err)));

    await rmPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);
    await rmPage.locator('.feedcard__no[data-no="3"]').click();
    await waitFor(200);

    const rmInfo = await rmPage.evaluate(() => {
      const flashed = document.querySelector('.pin--flash');
      if (!flashed) return { hasClass: false };
      const span = flashed.querySelector('span');
      const cs = window.getComputedStyle(span);
      return {
        hasClass: true,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
      };
    });
    ok(rmInfo.hasClass === true, 'reduced-motionでもクラスは付く', rmInfo);
    const noAnim = rmInfo.animationName === 'none' || /^0\.01ms|^0s$/.test(rmInfo.animationDuration || '');
    ok(noAnim, 'reduced-motionではアニメしない(animationName=none または duration≈0)', rmInfo);
    ok(rmErrors.length === 0, 'reduced-motionコンテキストでコンソールエラー0件', rmErrors);

    await rmContext.close();

    // --- R37: 宿ピンをクリックすると宿位置へpanTo ---
    const hotelContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const hotelPage = await hotelContext.newPage();
    const hotelErrors = [];
    hotelPage.on('console', (msg) => { if (msg.type() === 'error') hotelErrors.push(msg.text()); });
    hotelPage.on('pageerror', (err) => hotelErrors.push(String(err)));

    await hotelPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    const hotelPin = hotelPage.locator('.pin--hotel');
    ok(await hotelPin.count() === 1, 'R37: 宿ピンが1個存在する', await hotelPin.count());

    const zoomOf = (src) => {
      const m = /\/(\d+)\/\d+\/\d+\.png/.exec(src || '');
      return m ? m[1] : null;
    };
    const beforeTileSrc = await hotelPage.evaluate(() => {
      const img = document.querySelector('img.leaflet-tile');
      return img ? img.src : null;
    });

    await hotelPin.click();
    await waitFor(400);

    const centerInfo = await hotelPage.evaluate(() => {
      const mapEl = document.getElementById('feed-map');
      const pin = document.querySelector('.pin--hotel');
      const mapRect = mapEl.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      const mapCx = mapRect.left + mapRect.width / 2;
      const mapCy = mapRect.top + mapRect.height / 2;
      const pinCx = pinRect.left + pinRect.width / 2;
      const pinCy = pinRect.top + pinRect.height / 2;
      return { dx: Math.abs(mapCx - pinCx), dy: Math.abs(mapCy - pinCy) };
    });
    ok(centerInfo.dx <= 20 && centerInfo.dy <= 20, 'R37: クリック後に宿ピンが地図の中心付近(20px以内)に来る', centerInfo);

    const afterTileSrc = await hotelPage.evaluate(() => {
      const img = document.querySelector('img.leaflet-tile');
      return img ? img.src : null;
    });
    ok(zoomOf(beforeTileSrc) !== null && zoomOf(beforeTileSrc) === zoomOf(afterTileSrc), 'R37: クリック前後でズーム段が不変', { before: beforeTileSrc, after: afterTileSrc });

    ok(hotelErrors.length === 0, 'R37: コンソールエラー0件', hotelErrors);

    await hotelContext.close();

    // --- R237: 観光地ピン → カード(地図→カードの逆方向) ---
    // 軸は2本。
    //   (a) 有無軸  : .pin--spot をクリックすると反応がある(カードに目印 .feedcard--flash が付く)
    //   (b) 中身軸  : 押したピンの番号と、目印が付いたカードの data-index が一致する
    //                 (1番を押して1番のカードに行く。本数が合っていても対応がずれていれば落ちる)
    const spotContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const spotPage = await spotContext.newPage();
    const spotErrors = [];
    spotPage.on('console', (msg) => { if (msg.type() === 'error') spotErrors.push(msg.text()); });
    spotPage.on('pageerror', (err) => spotErrors.push(String(err)));

    await spotPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    const spotPins = spotPage.locator('.pin--spot');
    const spotPinCount = await spotPins.count();
    // 母数が0件だと以下の照合がすべて素通りするので、母数そのものを先に守る(R232・R233・R235)
    ok(spotPinCount >= 5, 'R237: 観光地ピンが5個以上ある(照合の母数)', spotPinCount);

    // ピンの表示名(ツールチップ)が読めること。title 属性だけではスマホで出ないため bindTooltip が要る
    await spotPins.nth(0).hover();
    await waitFor(300);
    const tipText = await spotPage.evaluate(() => {
      const t = document.querySelector('.leaflet-tooltip');
      return t ? t.textContent.trim() : null;
    });
    ok(!!tipText && tipText.length > 0, 'R237: ピンにホバーすると場所の名前が出る', tipText);

    // (a)有無軸 + (b)中身軸 を、見えているピン全数について回す
    const pairs = [];
    for (let i = 0; i < spotPinCount; i++) {
      // 押す前に前回の目印を消しておく(前のクリックの残りを拾って緑になるのを防ぐ)
      await spotPage.evaluate(() => {
        document.querySelectorAll('.feedcard--flash').forEach((el) => el.classList.remove('feedcard--flash'));
      });
      const pinNo = await spotPins.nth(i).evaluate((el) => el.textContent.trim());
      await spotPins.nth(i).click();
      await waitFor(350);
      const flashed = await spotPage.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.feedcard--flash'));
        return els.map((el) => el.dataset.index);
      });
      pairs.push({ pin: i, pinNo, flashed });
    }

    // (a)有無軸: 全てのピンでカードにちょうど1枚だけ目印が付いた
    const reacted = pairs.filter((p) => p.flashed.length === 1);
    ok(
      pairs.length > 0 && reacted.length === pairs.length,
      'R237(有無軸): 観光地ピンを押すとカードがちょうど1枚反応する',
      pairs
    );

    // (b)中身軸: 押したピンの並び順 i と、反応したカードの data-index が一致する
    const mismatched = pairs.filter((p) => p.flashed.length !== 1 || Number(p.flashed[0]) !== p.pin);
    ok(
      pairs.length > 0 && mismatched.length === 0,
      'R237(中身軸): 押したピンの番号と移動先カードの data-index が一致する',
      { mismatched, pairs }
    );

    // 1〜5番のピンは表示している数字と data-index+1 が一致する(番号バッジとの1:1対応)
    const numbered = pairs.filter((p) => /^\d+$/.test(p.pinNo));
    const numberedBad = numbered.filter((p) => Number(p.pinNo) !== p.pin + 1);
    ok(
      numbered.length >= 5 && numberedBad.length === 0,
      'R237(中身軸): 番号付きピンの数字と移動先カードの番号が一致する',
      { numbered, numberedBad }
    );

    ok(spotErrors.length === 0, 'R237: コンソールエラー0件', spotErrors);

    await spotContext.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-pinflash 実行エラー:', err);
  process.exitCode = 1;
});
