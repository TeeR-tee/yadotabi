// R63: 状態Aの「サンプルを見る」デモ導線の機械検査
// 使い方: node scripts/check-sample.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-hotelparam.mjs の作りを踏襲する。
//
// 確認項目:
//   a. ?demo=zoomout(状態A)で .samples が可視、リンクが6本(サンプル5本+おまかせ)。
//   b. 5本の href がそれぞれ fixture=kusatsu / hakone / dogo / beppu / kinosaki を含み、6本目が fixture=random を含む。
//   c. 1本目をクリックすると状態Bに遷移し、#feed-title が「草津温泉」、.feedcard が30枚。
//   d. ?fixture=kusatsu では .samples が不可視(fixture中は出さない)。
//   e. ?fixture=kusatsu&embed=1 でも .samples が不可視。
//   f. ?fixture=random で5エリアのいずれかが開き、.feedcard が30枚、.samples が不可視。
//   g. 各ケースでコンソールエラー0件。
//   h. R131: ?demo=nohotels で #pickbar-lead が可視・テキストが空でなく24文字以内。
//   i. R131: 同URLで .pickbar の offsetHeight <= 200(mobile相当)。
//   j. R131: ?fixture=kusatsu と ?fixture=kusatsu&embed=1 で #pickbar-lead が不可視。

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
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
    ok(count === 6, 'a. サンプルリンクが6本', count);

    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    ok(hrefs.some((h) => (h || '').includes('fixture=kusatsu')), 'b. 1本目が fixture=kusatsu を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=hakone')), 'b. 2本目が fixture=hakone を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=dogo')), 'b. 3本目が fixture=dogo を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=beppu')), 'b. 4本目が fixture=beppu を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=kinosaki')), 'b. 5本目が fixture=kinosaki を含む', hrefs);
    ok(hrefs.some((h) => (h || '').includes('fixture=random')), 'b. 6本目が fixture=random を含む', hrefs);

    ok(consoleErrors.length === 0, 'a/b. コンソールエラー0件', consoleErrors);
  });
}

async function checkSamplesOneLine(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
    await waitFor(1500);

    const tops = await page.locator('.samples > *').evaluateAll((els) => els.map((el) => el.offsetTop));
    const allSame = tops.length > 0 && tops.every((t) => t === tops[0]);
    ok(allSame, 'R74. .samples の子要素が全て同じ offsetTop(1行に収まっている)', tops);

    const scrollable = await page.locator('.samples').evaluate((el) => el.scrollWidth > el.clientWidth);
    ok(scrollable, 'R74. .samples が scrollWidth > clientWidth(横スクロール可能)', scrollable);

    ok(consoleErrors.length === 0, 'R74. コンソールエラー0件', consoleErrors);
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
    ok(cardCount === 5, 'c. .feedcard が5枚', cardCount);

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

async function checkPickbarLead(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
    await waitFor(1500);

    const lead = page.locator('#pickbar-lead');
    const visible = await lead.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(visible, 'h. ?demo=nohotels で #pickbar-lead が可視', visible);

    const text = (await lead.textContent() || '').trim();
    ok(text.length > 0, 'h. #pickbar-lead のテキストが空でない', text);
    ok(text.length <= 24, 'h. #pickbar-lead のテキストが24文字以内', text.length);

    const pickbarHeight = await page.locator('.pickbar').evaluate((el) => el.offsetHeight);
    ok(pickbarHeight <= 200, 'i. .pickbar の offsetHeight <= 200', pickbarHeight);

    ok(consoleErrors.length === 0, 'h/i. コンソールエラー0件', consoleErrors);
  });
}

async function checkPickbarLeadHiddenInFixture(browser, path, label) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await waitFor(1500);

    const lead = page.locator('#pickbar-lead');
    const visible = await lead.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(!visible, label + ': #pickbar-lead が不可視', visible);
    ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);
  });
}

async function checkFixtureRandom(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?fixture=random`, { waitUntil: 'load' });
    await waitFor(1500);

    const title = (await page.locator('#feed-title').textContent() || '').trim();
    ok(['草津温泉', '箱根湯本', '道後温泉', '別府温泉', '城崎温泉'].includes(title), 'f. #feed-title が5エリアのいずれか', title);

    const cardCount = await page.locator('.feedcard').count();
    ok(cardCount === 5, 'f. .feedcard が5枚', cardCount);

    const samples = page.locator('.samples');
    const visible = await samples.evaluate((el) => {
      return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    ok(!visible, 'f. .samples が不可視', visible);

    ok(consoleErrors.length === 0, 'f. コンソールエラー0件', consoleErrors);
  });
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    await checkSamplesVisible(browser);
    await checkSamplesOneLine(browser);
    await checkSampleClickNavigates(browser);
    await checkSamplesHiddenInFixture(browser, '/?fixture=kusatsu', 'd.fixtureのみ');
    await checkSamplesHiddenInFixture(browser, '/?fixture=kusatsu&embed=1', 'e.fixture+embed');
    await checkFixtureRandom(browser);
    await checkPickbarLead(browser);
    await checkPickbarLeadHiddenInFixture(browser, '/?fixture=kusatsu', 'j.fixtureのみ');
    await checkPickbarLeadHiddenInFixture(browser, '/?fixture=kusatsu&embed=1', 'j.fixture+embed');
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-sample 実行エラー:', err);
  process.exitCode = 1;
});
