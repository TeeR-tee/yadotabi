// R24: `?hotel=` の名前あり/なし見出しの機械検査
// 使い方: node scripts/check-hotelparam.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs / check-a11y.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?hotel=<lat>,<lon>(名前なし) -> #feed-title が「この宿の周辺」
//   2. ?hotel=<lat>,<lon>,(末尾カンマ・名前空) -> 同じく「この宿の周辺」
//   3. ?fixture=kusatsu&embed=1&hotel=<lat>,<lon> -> 埋め込みでも「この宿の周辺」
//   4. ?hotel=<lat>,<lon>,ちょうしゅくの宿(名前あり) -> 「ちょうしゅくの宿」(従来どおり)
//   5. ?fixture=kusatsu(hotelなし) -> 「草津温泉」(括弧書きなし)のままデグレなし
//   各パターンでコンソールエラー0件も見る。
//
// R39: 固定データバッジ(#feed-badge)の機械検査
//   a. ?fixture=kusatsu で #feed-badge が可視かつ本文が「固定データ」
//   b. #feed-title の本文に「固定データ」を含まない
//   c. ?fixture=kusatsu&embed=1 でも #feed-badge が可視
//   d. ?hotel= のみ(fixtureなし)では #feed-badge が不可視
//   判定は el.hidden ではなく offsetParent / getComputedStyle().display まで確認する。

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

async function checkTitle(browser, path, expectedTitle, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await waitFor(1500);

  const title = await page.locator('#feed-title').textContent();
  ok(title !== null && title.trim() === expectedTitle, label + ': 見出しが「' + expectedTitle + '」', title);
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkBadgeVisible(browser, path, expectVisible, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await waitFor(1500);

  const badge = page.locator('#feed-badge');
  const visible = await badge.evaluate((el) => {
    return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  });
  ok(visible === expectVisible, label + ': #feed-badge が' + (expectVisible ? '可視' : '不可視'), visible);
  if (expectVisible) {
    const text = (await badge.textContent() || '').trim();
    ok(text === '固定データ', label + ': #feed-badge の本文が「固定データ」', text);
  }
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
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
    // 1. 名前なし
    await checkTitle(browser, '/?hotel=36.6226,138.5960', 'この宿の周辺', '1.名前なし');

    // 2. 末尾カンマ・名前空
    await checkTitle(browser, '/?hotel=36.6226,138.5960,', 'この宿の周辺', '2.末尾カンマ名前空');

    // 3. 埋め込み+fixture併用でも同じ既定名
    await checkTitle(browser, '/?fixture=kusatsu&embed=1&hotel=36.6226,138.5960', 'この宿の周辺', '3.embed併用');

    // 4. 名前ありは従来どおり
    await checkTitle(browser, '/?hotel=36.6226,138.5960,ちょうしゅくの宿', 'ちょうしゅくの宿', '4.名前あり');

    // 5. fixtureのみ(hotelなし)はデグレなし(括弧書きは外れた)
    await checkTitle(browser, '/?fixture=kusatsu', '草津温泉', '5.fixtureのみデグレなし');

    // a. ?fixture=kusatsu でバッジ可視+本文一致
    await checkBadgeVisible(browser, '/?fixture=kusatsu', true, 'a.fixtureでバッジ可視');

    // b. #feed-title の本文に「固定データ」を含まない
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(1500);
      const title = (await page.locator('#feed-title').textContent() || '').trim();
      ok(!title.includes('固定データ'), 'b. #feed-title に「固定データ」を含まない', title);
      await context.close();
    }

    // c. embed併用でもバッジ可視
    await checkBadgeVisible(browser, '/?fixture=kusatsu&embed=1', true, 'c.embed併用でもバッジ可視');

    // d. ?hotel= のみ(fixtureなし)ではバッジ不可視
    await checkBadgeVisible(browser, '/?hotel=36.6226,138.5960', false, 'd.hotelのみでバッジ不可視');
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-hotelparam 実行エラー:', err);
  process.exitCode = 1;
});
