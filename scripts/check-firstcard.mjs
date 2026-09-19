// R107: first-card-painted の実測msをログに残し、明らかな劣化に気づける緩いしきい値検査
// 使い方: node scripts/check-firstcard.mjs
// check-sample.mjs のヘッダ(playwright import・BASE・ok()・ensureServer())を踏襲する。
//
// しきい値 FIRST_CARD_MAX_MS = 200 について:
// 実測中央値は24ms(2026-09-16 計画役実測、fixture=kusatsu, mobile 375x812, 3回)。
// 「中央値の2倍(48ms)」ではなく約8倍の200msを採用する。理由: 24msという絶対値が
// 小さすぎるため、CI/ローカルのGCや初回JITの揺らぎ数十msでそのまま赤くなりうる。
// R33/R46/R103の「揺らぎで赤くしない」方針に沿い、桁が変わったら気づく水準に置く。
//
// 確認項目:
//   1. ?fixture=kusatsu&perf=1 (mobile) で .feedcard 描画後、#perf-box に
//      first-card-painted が出るまで待ち、ms を実測値として標準出力に出す。
//   2. ms <= FIRST_CARD_MAX_MS(200) であることを確認。
//   3. stage:osm <= stage:wiki <= stage:done <= first-card-painted の単調性を確認。
//   4. ?fixture=kusatsu(perf無し)で #perf-box が0件であることを確認。
//   5. 各ケースでコンソールエラー0件。

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import { ensureServer } from './lib/server.mjs';

let BASE;

const FIRST_CARD_MAX_MS = 200;

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

async function checkFirstCardPerf(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?fixture=kusatsu&perf=1`, { waitUntil: 'load' });
    await page.waitForSelector('.feedcard');
    await page.waitForFunction(() => (document.querySelector('#perf-box') || {}).textContent?.includes('first-card-painted'));

    const text = (await page.locator('#perf-box').textContent()) || '';

    const firstCardMatch = text.match(/first-card-painted (\d+)ms/);
    const firstCardMs = firstCardMatch ? Number(firstCardMatch[1]) : null;
    console.log(`  [perf] first-card-painted = ${firstCardMs}ms (上限 ${FIRST_CARD_MAX_MS}ms)`);
    ok(firstCardMs !== null, '1. #perf-box から first-card-painted の ms を取得できる', text);
    ok(firstCardMs !== null && firstCardMs <= FIRST_CARD_MAX_MS, `2. first-card-painted <= ${FIRST_CARD_MAX_MS}ms`, firstCardMs);

    const osmMatch = text.match(/stage:osm (\d+)ms/);
    const wikiMatch = text.match(/stage:wiki (\d+)ms/);
    const doneMatch = text.match(/stage:done (\d+)ms/);
    const osmMs = osmMatch ? Number(osmMatch[1]) : null;
    const wikiMs = wikiMatch ? Number(wikiMatch[1]) : null;
    const doneMs = doneMatch ? Number(doneMatch[1]) : null;
    console.log(`  [perf] stage:osm=${osmMs}ms stage:wiki=${wikiMs}ms stage:done=${doneMs}ms`);

    const monotonic =
      osmMs !== null && wikiMs !== null && doneMs !== null && firstCardMs !== null &&
      osmMs <= wikiMs && wikiMs <= doneMs && doneMs <= firstCardMs;
    ok(monotonic, '3. stage:osm <= stage:wiki <= stage:done <= first-card-painted の単調性', { osmMs, wikiMs, doneMs, firstCardMs });

    ok(consoleErrors.length === 0, '1-3. コンソールエラー0件', consoleErrors);
  });
}

async function checkNoPerfBoxWithoutFlag(browser) {
  await withPage(browser, async (page, consoleErrors) => {
    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await page.waitForSelector('.feedcard');
    await waitFor(500);

    const count = await page.locator('#perf-box').count();
    ok(count === 0, '4. perf無しでは #perf-box が0件', count);

    ok(consoleErrors.length === 0, '4. コンソールエラー0件', consoleErrors);
  });
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    await checkFirstCardPerf(browser);
    await checkNoPerfBoxWithoutFlag(browser);
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-firstcard 実行エラー:', err);
  process.exitCode = 1;
});
