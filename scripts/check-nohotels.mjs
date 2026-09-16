// R28: `?demo=nohotels` 宿0件画面の機械検査
// 使い方: node scripts/check-nohotels.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
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
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let serverProc = null;
  const alreadyRunning = await isPortOpen(PORT);
  if (!alreadyRunning) {
    serverProc = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
    });
    for (let i = 0; i < 25; i++) {
      if (await isPortOpen(PORT)) break;
      await waitFor(200);
    }
  }

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
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-nohotels 実行エラー:', err);
  process.exitCode = 1;
});
