// R10: 番号バッジをタップすると小地図の該当ピンが光る、の機械検査
// 使い方: node scripts/check-pinflash.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
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
// 撮影: click後200ms時点のスクリーンショットを screenshots/ に保存(r10-flash を含む)

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
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

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function countFlash(page) {
  return page.evaluate(() => document.querySelectorAll('.pin--flash').length);
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
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-pinflash 実行エラー:', err);
  process.exitCode = 1;
});
