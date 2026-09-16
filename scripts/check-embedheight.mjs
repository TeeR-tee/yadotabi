// R48: `?embed=1` の高さ postMessage 通知の機械検査
// 使い方: node scripts/check-embedheight.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. /demo/hotel-page.html を開き、カード描画完了後に iframe.embed の実高さが初期値640pxより大きい
//   2. iframe内の #more-btn をクリックした後、iframeの高さがさらに増える
//   3. 増えた後のiframe高さが、iframe内のdocument.documentElement.scrollHeightと±4px以内で一致する
//   4. 親ページ側に二重スクロールが無い(iframe内 scrollHeight <= clientHeight + 4)
//   5. 非embedの検査: /index.html?fixture=kusatsu を直接開き、postMessageが一度も呼ばれないこと
//   6. ?fixture=kusatsu&embed=1 単体(親なし)を開いてもコンソールエラー0件
//   7. コンソールエラー0件(親・子とも)

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
    // --- 1〜4: 親ページでの高さ追従の検証 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/demo/hotel-page.html`, { waitUntil: 'load' });
      await waitFor(2000);

      const frameEl = page.locator('iframe.embed');
      const initialHeight = await frameEl.evaluate((el) => el.getBoundingClientRect().height);
      ok(initialHeight > 640, 'カード描画完了後、iframeの実高さが初期値640pxより大きい', initialHeight);

      const frame = page.frameLocator('iframe.embed');
      const moreBtn = frame.locator('#more-btn');
      await moreBtn.click();
      await waitFor(500);

      const expandedHeight = await frameEl.evaluate((el) => el.getBoundingClientRect().height);
      ok(expandedHeight > initialHeight, '「もっと見る」クリック後、iframeの高さがさらに増える', {
        before: initialHeight,
        after: expandedHeight,
      });

      const innerScrollHeight = await frame.locator('html').evaluate((el) => el.scrollHeight);
      ok(Math.abs(expandedHeight - innerScrollHeight) <= 4,
        '増えた後のiframe高さが内側のscrollHeightと±4px以内で一致する',
        { expandedHeight, innerScrollHeight });

      const innerOverflow = await frame.locator('html').evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      ok(innerOverflow.scrollHeight <= innerOverflow.clientHeight + 4,
        'iframe内に二重スクロールが無い', innerOverflow);

      ok(consoleErrors.length === 0, 'コンソールエラー0件(親・子)', consoleErrors);

      await context.close();
    }

    // --- 5: 非embedではpostMessageが呼ばれない ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.addInitScript(() => {
        window.__postMessageCount = 0;
        const orig = window.parent.postMessage.bind(window.parent);
        window.parent.postMessage = function (...args) {
          window.__postMessageCount++;
          return orig(...args);
        };
      });

      await page.goto(`${BASE}/index.html?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);

      const count = await page.evaluate(() => window.__postMessageCount);
      ok(count === 0, '非embed(?fixture=kusatsu)ではpostMessageが一度も呼ばれない', count);
      ok(consoleErrors.length === 0, '非embedページのコンソールエラー0件', consoleErrors);

      await context.close();
    }

    // --- 6: embed単体(親なし)でもコンソールエラー0件 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/index.html?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
      await waitFor(2000);

      ok(consoleErrors.length === 0, 'embed単体(親なし)のコンソールエラー0件', consoleErrors);

      await context.close();
    }
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-embedheight 実行エラー:', err);
  process.exitCode = 1;
});
