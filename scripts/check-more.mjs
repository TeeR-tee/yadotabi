// R16: 「もっと見る」(31〜60件目の展開)の機械検査
// 使い方: node scripts/check-more.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-a11y.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu を開き、初期状態で .feedcard が30枚、#more-btn が存在する
//   2. #more-btn を click し、.feedcard の枚数が30枚より増える
//   3. 展開後の31枚目のカードの番号バッジが「31」である
//   4. 展開後は #more-btn が消えている
//   5. コンソールエラー0件

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
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    // 1. 初期状態
    const initialCount = await page.locator('.feedcard').count();
    ok(initialCount === 30, '初期状態で .feedcard が30枚', initialCount);

    const moreBtn = page.locator('#more-btn');
    const moreBtnCountBefore = await moreBtn.count();
    ok(moreBtnCountBefore === 1, '#more-btn が存在する', moreBtnCountBefore);

    // 2. click して展開
    await moreBtn.click();
    await waitFor(300);

    const expandedCount = await page.locator('.feedcard').count();
    ok(expandedCount > 30, '.feedcard の枚数が30枚より増える', expandedCount);

    // 撮影(展開後): 目視用にフルページを保存する
    const shotPath = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r16-expanded_mobile.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log('  撮影: ' + shotPath);

    // 3. 31枚目のカードの番号バッジ
    const badge31 = await page.locator('.feedcard').nth(30).locator('.feedcard__no').textContent();
    ok(badge31 !== null && badge31.trim() === '31', '展開後31枚目の番号バッジが31', badge31);

    // 4. #more-btn が消えている
    const moreBtnCountAfter = await moreBtn.count();
    ok(moreBtnCountAfter === 0, '展開後は #more-btn が消えている', moreBtnCountAfter);

    // 5. コンソールエラー0件
    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);

    await context.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

main().catch((err) => {
  console.error('check-more 実行エラー:', err);
  process.exitCode = 1;
});
