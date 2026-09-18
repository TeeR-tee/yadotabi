// R68: `?embed=1&bg=<6桁HEX>` の背景色パラメータの機械検査
// 使い方: node scripts/check-embedbg.mjs
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-embedheight.mjs の作りを踏襲する。
// 外部API 0回(fixture=kusatsu のみ)。
//
// 確認項目:
//   1. ?fixture=kusatsu&embed=1&bg=fff7e6 で body の computedStyle background-color が rgb(255, 247, 230)
//   2. 同上を #fff7e6 (%23 エンコード)にしても同じ値になる
//   3. 無効値(zzzzzz / fff / red / fff7e6;color:red)はいずれも既定色 rgb(247, 247, 249) のまま
//   4. embed なし(?fixture=kusatsu&bg=fff7e6)では既定色のまま
//   5. 有効値のとき documentElement の --c-bg が #fff7e6、無効値のときは空文字
//   6. カードは30枚のままで .feedcard の背景色が変わっていない

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

let BASE;

const DEFAULT_BG = 'rgb(247, 247, 249)';
const CUSTOM_BG = 'rgb(255, 247, 230)';

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openAndRead(browser, query) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}/index.html?${query}`, { waitUntil: 'load' });
  await waitFor(2000);

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const cssVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--c-bg'));
  const cardCount = await page.locator('.feedcard').count();
  const cardBg = cardCount > 0
    ? await page.locator('.feedcard').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    : null;

  await context.close();
  return { bodyBg, cssVar, cardCount, cardBg, consoleErrors };
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // 1. 有効な6桁HEX(素の値)
    {
      const r = await openAndRead(browser, 'fixture=kusatsu&embed=1&bg=fff7e6');
      ok(r.bodyBg === CUSTOM_BG, '有効値 bg=fff7e6 で body の背景色が変わる', r.bodyBg);
      ok(r.cssVar === '#fff7e6', '--c-bg が #fff7e6 になる', r.cssVar);
      ok(r.consoleErrors.length === 0, 'コンソールエラー0件(有効値・素)', r.consoleErrors);
    }

    // 2. 有効な6桁HEX(#付き・%23エンコード)
    {
      const r = await openAndRead(browser, 'fixture=kusatsu&embed=1&bg=%23fff7e6');
      ok(r.bodyBg === CUSTOM_BG, '有効値 bg=%23fff7e6 でも同じ背景色になる', r.bodyBg);
      ok(r.cssVar === '#fff7e6', '--c-bg が #fff7e6 になる(#付き)', r.cssVar);
    }

    // 3. 無効値はすべて既定色のまま
    const invalidCases = ['zzzzzz', 'fff', 'red', 'fff7e6%3Bcolor%3Ared'];
    for (const v of invalidCases) {
      const r = await openAndRead(browser, `fixture=kusatsu&embed=1&bg=${v}`);
      ok(r.bodyBg === DEFAULT_BG, `無効値 bg=${v} は既定色のまま(無視)`, r.bodyBg);
      ok(r.cssVar === '', `無効値 bg=${v} では --c-bg が空文字`, r.cssVar);
    }

    // 3b. 暗すぎる色(相対輝度 < 0.5)は既定色にフォールバック(R112)
    const darkCases = ['000000', '333333'];
    for (const v of darkCases) {
      const r = await openAndRead(browser, `fixture=kusatsu&embed=1&bg=${v}`);
      ok(r.bodyBg === DEFAULT_BG, `暗色 bg=${v} は既定色にフォールバックする(R112)`, r.bodyBg);
      ok(r.cssVar === '', `暗色 bg=${v} では --c-bg が空文字(R112)`, r.cssVar);
    }

    // 4. embed なしでは bg が効かない
    {
      const r = await openAndRead(browser, 'fixture=kusatsu&bg=fff7e6');
      ok(r.bodyBg === DEFAULT_BG, 'embedなしでは bg=fff7e6 が無視され既定色のまま', r.bodyBg);
    }

    // 6. 初期カード5枚・カード自体の背景色は変わらない(有効値のケースで確認)
    {
      const r = await openAndRead(browser, 'fixture=kusatsu&embed=1&bg=fff7e6');
      ok(r.cardCount === 5, 'カードは5枚のまま', r.cardCount);
      ok(r.cardBg !== null && r.cardBg !== CUSTOM_BG, '.feedcard の背景色は宿の地色に変わっていない', r.cardBg);
    }
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-embedbg 実行エラー:', err);
  process.exitCode = 1;
});
