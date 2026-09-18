// R28: `?demo=nohotels` 宿0件画面の機械検査
// 使い方: node scripts/check-nohotels.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-chipcurrent.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?demo=nohotels で .mapnote が可視かつ本文が「この範囲には宿のデータがありません。エリアチップか検索から選べます。」と一致
//   2. 宿ピンが0個(.leaflet-marker-icon 等のマーカーが無い)
//   3. 外部APIへの fetch が0回(overpass/wikipedia ドメインへの発火が無い)
//   4. コンソールエラー0件

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

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

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const externalRequests = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('overpass') || url.includes('wikipedia')) externalRequests.push(url);
    });

    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
    await waitFor(1500);

    const mapNote = page.locator('.mapnote');
    const visible = await mapNote.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(visible, '1. .mapnote が可視', visible);
    const text = (await mapNote.textContent() || '').trim();
    ok(text === 'この範囲には宿のデータがありません。エリアチップか検索から選べます。', '1. .mapnote の本文が一致', text);

    const markerCount = await page.locator('.leaflet-marker-icon').count();
    ok(markerCount === 0, '2. 宿ピンが0個', markerCount);

    ok(externalRequests.length === 0, '3. overpass/wikipediaへのfetchが0回', externalRequests);

    ok(consoleErrors.length === 0, '4. コンソールエラー0件', consoleErrors);

    await context.close();

    // R101: タイルサーバを遮断した状態Aで「地図の背景画像を読み込めませんでした」の1行が出るか、
    // 通常時(遮断なし)には出ないことを同じ検査ファイル内で確認する。
    const tileErrorText = '地図の背景画像を読み込めませんでした。ピンと提案はそのまま使えます。';

    const blockedContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const blockedPage = await blockedContext.newPage();
    const blockedExternalRequests = [];
    blockedPage.on('request', (req) => {
      const url = req.url();
      if (url.includes('overpass') || url.includes('wikipedia')) blockedExternalRequests.push(url);
    });
    const blockedConsoleErrors = [];
    blockedPage.on('console', (msg) => { if (msg.type() === 'error') blockedConsoleErrors.push(msg.text()); });
    blockedPage.on('pageerror', (err) => blockedConsoleErrors.push(String(err)));
    await blockedPage.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
    await blockedPage.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
    await waitFor(3500);

    const blockedNote = blockedPage.locator('.mapnote');
    const blockedVisible = await blockedNote.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(blockedVisible, '5. タイル遮断時: .mapnote が可視', blockedVisible);
    const blockedText = (await blockedNote.textContent() || '').trim();
    ok(blockedText === tileErrorText, '5. タイル遮断時: .mapnote の本文がタイルエラー文言と一致', blockedText);
    ok(blockedExternalRequests.length === 0, '5. タイル遮断時: overpass/wikipediaへのfetchが0回', blockedExternalRequests);
    await blockedContext.close();

    const normalContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const normalPage = await normalContext.newPage();
    await normalPage.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
    await waitFor(3500);
    const normalNote = normalPage.locator('.mapnote');
    const normalText = (await normalNote.textContent() || '').trim();
    ok(normalText !== tileErrorText, '5. 通常時(遮断なし): タイルエラー文言が出ない', normalText);
    await normalContext.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-nohotels 実行エラー:', err);
  process.exitCode = 1;
});
