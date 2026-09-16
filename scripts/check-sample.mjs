// R63: 状態Aの「サンプルを見る」デモ導線の機械検査
// 使い方: node scripts/check-sample.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-hotelparam.mjs の作りを踏襲する。
//
// 確認項目:
//   a. ?demo=zoomout(状態A)で .samples が可視、リンクが3本。
//   b. 3本の href がそれぞれ fixture=kusatsu / hakone / dogo を含む。
//   c. 1本目をクリックすると状態Bに遷移し、#feed-title が「草津温泉」、.feedcard が30枚。
//   d. ?fixture=kusatsu では .samples が不可視(fixture中は出さない)。
//   e. ?fixture=kusatsu&embed=1 でも .samples が不可視。
//   f. 各ケースでコンソールエラー0件。

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

function newTrackedContext(browser) {
  return browser.newContext({ viewport: { width: 375, height: 812 } });
}

async function withPage(browser, fn) {
  const context = await newTrackedContext(browser);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  try {
    await fn(page, consoleErrors);
  } finally {
    await context.close();
  }
}

async function checkSamplesVisible(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
    await waitFor(1500);

    const samples = page.locator('.samples');
    const visible = await samples.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(visible, 'a. ?demo=zoomout で .samples が可視', visible);

    const links = page.locator('.samples a');
    const count = await links.count();
    ok(count === 3, 'a. サンプルリンクが3本', count);

    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    ok(hrefs.some((h) => (h || '').includes('fixture=kusatsu')), 'b. 1本目が fixture=kusatsu を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=hakone')), 'b. 2本目が fixture=hakone を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=dogo')), 'b. 3本目が fixture=dogo を含む', hrefs);

    ok(consoleErrors.length === 0, 'a/b. コンソールエラー0件', consoleErrors);
  });
}

async function checkSampleClickNavigates(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
    await waitFor(1500);

    const firstLink = page.locator('.samples a').first();
    await firstLink.click();
    await waitFor(1500);

    const feedVisible = await page.locator('#view-feed').evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    const selectVisible = await page.locator('#view-select').evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(feedVisible, 'c. クリック後 #view-feed が可視', feedVisible);
    ok(!selectVisible, 'c. クリック後 #view-select が不可視', selectVisible);

    const title = (await page.locator('#feed-title').textContent() || '').trim();
    ok(title === '草津温泉', 'c. #feed-title が「草津温泉」', title);

    const cardCount = await page.locator('.feedcard').count();
    ok(cardCount === 30, 'c. .feedcard が30枚', cardCount);

    ok(consoleErrors.length === 0, 'c. コンソールエラー0件', consoleErrors);
  });
}

async function checkSamplesHiddenInFixture(browser, path, label) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await waitFor(1500);

    const samples = page.locator('.samples');
    const visible = await samples.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(!visible, label + ': .samples が不可視', visible);
    ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);
  });
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
    await checkSamplesVisible(browser);
    await checkSampleClickNavigates(browser);
    await checkSamplesHiddenInFixture(browser, '/?fixture=kusatsu', 'd.fixtureのみ');
    await checkSamplesHiddenInFixture(browser, '/?fixture=kusatsu&embed=1', 'e.fixture+embed');
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-sample 実行エラー:', err);
  process.exitCode = 1;
});
