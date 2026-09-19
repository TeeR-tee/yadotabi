// R43: 状態Aの宿ピンに hover で出す宿名ツールチップの機械検査
// 使い方: node scripts/check-hoteltip.mjs
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-autozoom.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?demo=hoteltip で宿ピンが5件以上描画される(.pin--hotel の数)
//   2. 宿ピンに hover -> .leaflet-tooltip が1枚表示され、textContent が宿名と完全一致
//   3. hover を外す -> .leaflet-tooltip が0枚に戻る
//   4. 宿ピンを click -> 状態Bへ遷移(.view--feed が可視 / ヘッダーがその宿名)
//   5. ツールチップ表示中も box が地図コンテナの外へはみ出さない
//   6. L.marker に title 属性が残っていない(二重表示の防止)
//   7. 外部fetch0回・コンソールエラー0件

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import fs from 'node:fs';
import path from 'node:path';
import { ensureServer, PROJECT_ROOT } from './lib/server.mjs';

let BASE;
const SHOT_DIR = path.join(PROJECT_ROOT, 'screenshots');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackExternal(page, bucket) {
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(BASE)) return;
    if (url.includes('overpass') || url.includes('wikipedia') || url.includes('nominatim')) bucket.push(url);
  });
}

function trackConsoleErrors(page, bucket) {
  page.on('console', (msg) => { if (msg.type() === 'error') bucket.push(msg.text()); });
  page.on('pageerror', (err) => bucket.push(String(err)));
}

async function main() {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const externalRequests = [];
    const consoleErrors = [];
    trackExternal(page, externalRequests);
    trackConsoleErrors(page, consoleErrors);

    await page.goto(`${BASE}/?demo=hoteltip`, { waitUntil: 'load' });
    await waitFor(1500);

    // 1. 宿ピンが5件以上
    const pinCount = await page.locator('.pin--hotel').count();
    ok(pinCount >= 5, '1. ?demo=hoteltip で宿ピンが5件以上', pinCount);

    // 6. title 属性が残っていない(二重表示防止)
    const markerIcons = page.locator('.leaflet-marker-icon');
    const markerIconCount = await markerIcons.count();
    let anyTitle = false;
    for (let i = 0; i < markerIconCount; i++) {
      const t = await markerIcons.nth(i).getAttribute('title');
      if (t) anyTitle = true;
    }
    ok(!anyTitle, '6. L.marker に title 属性が残っていない', anyTitle);

    // 2. hover -> tooltip 表示、textContent が name と一致
    const firstPin = page.locator('.pin--hotel').first();
    const firstName = await firstPin.evaluate((el) => {
      const span = el.querySelector('span[aria-label]');
      const label = span ? span.getAttribute('aria-label') : '';
      return label ? label.replace(/^宿\s*/, '') : '';
    });
    await firstPin.hover();
    await waitFor(300);
    const tooltipsAfterHover = page.locator('.leaflet-tooltip');
    const tooltipCountAfterHover = await tooltipsAfterHover.count();
    ok(tooltipCountAfterHover === 1, '2. hover で .leaflet-tooltip が1枚表示される', tooltipCountAfterHover);
    const tooltipText = tooltipCountAfterHover > 0 ? (await tooltipsAfterHover.first().textContent() || '').trim() : '';
    ok(tooltipText === firstName, '2. tooltip の textContent が宿名と完全一致', { tooltipText, firstName });

    // 5. tooltip box が地図コンテナの外へはみ出さない
    if (tooltipCountAfterHover > 0) {
      const mapBox = await page.locator('#map').boundingBox();
      const tipBox = await tooltipsAfterHover.first().boundingBox();
      const within = mapBox && tipBox
        ? (tipBox.x >= mapBox.x - 1 && (tipBox.x + tipBox.width) <= (mapBox.x + mapBox.width + 1))
        : false;
      ok(within, '5. tooltip box が地図コンテナの外へはみ出さない', { mapBox, tipBox });
    } else {
      ok(false, '5. tooltip box が地図コンテナの外へはみ出さない(tooltip無し)', null);
    }

    // 撮影(hover 状態のまま。外部API 0回)
    await page.screenshot({ path: path.join(SHOT_DIR, 'r43-hoteltip-mobile-hover.png') });

    // 3. hover を外す -> tooltip 0枚
    await page.mouse.move(5, 5);
    await waitFor(300);
    const tooltipCountAfterUnhover = await page.locator('.leaflet-tooltip').count();
    ok(tooltipCountAfterUnhover === 0, '3. hover を外すと .leaflet-tooltip が0枚に戻る', tooltipCountAfterUnhover);

    // ここまで(状態Aのツールチップ機能)で外部fetchが0回であることを確認してから click する。
    // click 後の状態B遷移は選択宿の詳細取得(overpass/wikipedia)を行う既存仕様のため対象外。
    ok(externalRequests.length === 0, '7. ツールチップ表示までで overpass/wikipedia/nominatim へのfetchが0回', externalRequests);
    ok(consoleErrors.length === 0, '7. コンソールエラー0件(ツールチップ表示まで)', consoleErrors);

    // 4. click -> 状態Bへ遷移(非デグレの最重要条件)
    await firstPin.click();
    await waitFor(1000);
    const feedVisible = await page.locator('.view--feed').isVisible();
    ok(feedVisible, '4. 宿ピンを click すると .view--feed が可視になる', feedVisible);
    const feedTitle = (await page.locator('#feed-title').textContent() || '').trim();
    ok(feedTitle === firstName, '4. ヘッダーが click した宿名と一致', { feedTitle, firstName });

    await context.close();

    // desktop でも撮影(密集ペアの見え方確認用)
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`${BASE}/?demo=hoteltip`, { waitUntil: 'load' });
    await waitFor(1500);
    const pins = desktopPage.locator('.pin--hotel');
    const pinCountDesktop = await pins.count();
    if (pinCountDesktop > 0) {
      await pins.first().hover();
      await waitFor(300);
    }
    await desktopPage.screenshot({ path: path.join(SHOT_DIR, 'r43-hoteltip-desktop-hover.png') });
    await desktopContext.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-hoteltip 実行エラー:', err);
  process.exitCode = 1;
});
