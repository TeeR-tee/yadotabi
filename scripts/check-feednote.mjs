// R47: フィード末尾の注記(提案の作り方を正直に明かす)の機械検査
// 使い方: node scripts/check-feednote.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu で #feed-note が hidden でなく、.feedcard 30枚の下に位置する
//   2. 注記テキストに「暫定版」「OpenStreetMap」「Wikipedia」が含まれる
//   3. #feed-note a の href が https://github.com/TeeR-tee/yadotabi# で始まる
//   4. #more-btn を click して60枚に展開した後も #feed-note が最下部にある
//   5. ?fixture=hakone&demo=far で #feed-far(details)より下に #feed-note がある
//   6. ?fixture=kusatsu&embed=1 でも #feed-note が表示される(hidden でない)
//   7. ?fixture=kusatsu&simulate=empty では #feed-note が hidden(0件時は出さない)
//   8. コンソールエラー0件

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
    // --- 1〜4: ?fixture=kusatsu ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);

      const note = page.locator('#feed-note');
      const noteHidden = await note.evaluate((el) => el.hidden);
      ok(noteHidden === false, '#feed-note が hidden でない', noteHidden);

      const noteTop = await note.evaluate((el) => el.getBoundingClientRect().top);
      const lastCardBottom = await page.locator('.feedcard').last().evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTop > lastCardBottom, '#feed-note が .feedcard 30枚の下にある', { noteTop, lastCardBottom });

      const noteText = await note.textContent();
      ok(noteText.includes('暫定版'), '注記テキストに「暫定版」を含む', noteText);
      ok(noteText.includes('OpenStreetMap'), '注記テキストに「OpenStreetMap」を含む', noteText);
      ok(noteText.includes('Wikipedia'), '注記テキストに「Wikipedia」を含む', noteText);

      const href = await note.locator('a').getAttribute('href');
      ok(typeof href === 'string' && href.startsWith('https://github.com/TeeR-tee/yadotabi#'), '#feed-note a の href が正しい', href);

      // 4. もっと見るで60枚に展開後も最下部にある
      const moreBtn = page.locator('#more-btn');
      if (await moreBtn.count()) {
        await moreBtn.click();
        await waitFor(300);
      }
      const noteTopAfter = await note.evaluate((el) => el.getBoundingClientRect().top);
      const lastCardBottomAfter = await page.locator('.feedcard').last().evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTopAfter > lastCardBottomAfter, '展開後も #feed-note が最下部にある', { noteTopAfter, lastCardBottomAfter });

      ok(consoleErrors.length === 0, 'コンソールエラー0件(kusatsu)', consoleErrors);
      await context.close();
    }

    // --- 5: ?fixture=hakone&demo=far ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=hakone&demo=far`, { waitUntil: 'load' });
      await waitFor(2000);

      const farBottom = await page.locator('#feed-far').evaluate((el) => el.getBoundingClientRect().bottom);
      const noteTop = await page.locator('#feed-note').evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTop >= farBottom, '#feed-far より下に #feed-note がある', { noteTop, farBottom });

      await context.close();
    }

    // --- 6: ?fixture=kusatsu&embed=1 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
      await waitFor(2000);

      const noteHidden = await page.locator('#feed-note').evaluate((el) => el.hidden);
      ok(noteHidden === false, 'embed=1 でも #feed-note が表示される', noteHidden);

      await context.close();
    }

    // --- 7: ?fixture=kusatsu&simulate=empty ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&simulate=empty`, { waitUntil: 'load' });
      await waitFor(2000);

      const noteHidden = await page.locator('#feed-note').evaluate((el) => el.hidden);
      ok(noteHidden === true, 'simulate=empty では #feed-note が hidden', noteHidden);

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
  console.error('check-feednote 実行エラー:', err);
  process.exitCode = 1;
});
