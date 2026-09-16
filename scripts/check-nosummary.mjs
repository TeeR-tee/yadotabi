// R83: 要約が無いカードの代替文(NO_SUMMARY_TEXT)の機械検査
// 使い方: node scripts/check-nosummary.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-distance.mjs の作りを踏襲する。
//
// 確認項目(?fixture=dogo 上位30枚):
//   1. 要約なしの20枚すべてに .feedcard__summary--none が付き、テキストが一致
//   2. 要約ありの10枚には --none が付かない(--none の件数がちょうど20)
//      R119 で 19→20。要約を持つ「愛媛県立道後動物園」(既に無い施設)が候補から消え、
//      代わりに要約を持たない「御幸寺山」が30位に繰り上がったため。検査項目は減らしていない。
//   3. .feedcard__summary の総数が30(要約有無にかかわらず全カードに1本)
//   4. .feedcard__summary--none の getComputedStyle().color が .feedcard__summary の既定色と異なる
//   5. コンソールエラー0件

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

const NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';

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

    await page.goto(`${BASE}/?fixture=dogo`, { waitUntil: 'load' });
    await waitFor(1500);

    const summaryCount = await page.locator('.feedcard__summary').count();
    ok(summaryCount === 30, '3. .feedcard__summary の総数が30', summaryCount);

    const noneCount = await page.locator('.feedcard__summary--none').count();
    ok(noneCount === 20, '1/2. .feedcard__summary--none の件数が20', noneCount);

    const noneTexts = await page.locator('.feedcard__summary--none').allTextContents();
    const noneTextsMatch = noneTexts.every((t) => t === NO_SUMMARY_TEXT);
    ok(noneTextsMatch, '1. --none のテキストが全てNO_SUMMARY_TEXTと一致', noneTexts.filter((t) => t !== NO_SUMMARY_TEXT));

    const colors = await page.evaluate(() => {
      const none = document.querySelector('.feedcard__summary--none');
      const normal = document.querySelector('.feedcard__summary:not(.feedcard__summary--none)');
      return {
        none: none ? getComputedStyle(none).color : null,
        normal: normal ? getComputedStyle(normal).color : null,
      };
    });
    ok(
      !!colors.none && !!colors.normal && colors.none !== colors.normal,
      '4. --none の色が既定色と異なる',
      colors
    );

    ok(consoleErrors.length === 0, '5. コンソールエラー0件', consoleErrors);

    await context.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-nosummary 実行エラー:', err);
  process.exitCode = 1;
});
