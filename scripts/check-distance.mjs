// R54: フィードカードの距離表記(徒歩◯分 · 車◯分 · ◯m/◯km)の機械検査
// 使い方: node scripts/check-distance.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu の全 .feedcard__times が末尾に距離(m/km)を含む形式に一致する
//   2. kusatsu の1位カード(距離が最も近い想定)がm表記であることを確認する
//   3. ?fixture=hakone の中に少なくとも1件はkm表記のカードが存在する
//   4. 375px viewport で全 .feedcard__times が scrollWidth <= clientWidth(はみ出しなし)
//   5. コンソールエラー0件

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
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

const TIMES_RE = /^🚶徒歩\d+分 · 🚗車\d+分( · (\d+m|\d+(\.\d)?km))?$/;

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    // --- kusatsu ---
    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(1500);

    const kusatsuTexts = await page.locator('.feedcard__times').allTextContents();
    ok(kusatsuTexts.length > 0, 'kusatsu: .feedcard__times が1件以上存在する', kusatsuTexts.length);

    const kusatsuAllMatch = kusatsuTexts.every((t) => TIMES_RE.test(t));
    ok(kusatsuAllMatch, 'kusatsu: 全カードの times が規定フォーマットに一致', kusatsuTexts.filter((t) => !TIMES_RE.test(t)));

    const kusatsuHasMeter = kusatsuTexts.some((t) => / · \d+m$/.test(t));
    ok(kusatsuHasMeter, 'kusatsu: m表記のカードが1件以上ある', kusatsuTexts);

    const firstText = kusatsuTexts[0] || '';
    ok(/ · (\d+m|\d+(\.\d)?km)$/.test(firstText), 'kusatsu: 1位カードに距離が表示されている', firstText);

    // 375px はみ出しチェック(kusatsu)
    const overflowCount = await page.locator('.feedcard__times').evaluateAll(
      (els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length
    );
    ok(overflowCount === 0, 'kusatsu: .feedcard__times のはみ出しが0件(375px)', overflowCount);

    // --- hakone ---
    await page.goto(`${BASE}/?fixture=hakone`, { waitUntil: 'load' });
    await waitFor(1500);

    const hakoneTexts = await page.locator('.feedcard__times').allTextContents();
    ok(hakoneTexts.length > 0, 'hakone: .feedcard__times が1件以上存在する', hakoneTexts.length);

    const hakoneAllMatch = hakoneTexts.every((t) => TIMES_RE.test(t));
    ok(hakoneAllMatch, 'hakone: 全カードの times が規定フォーマットに一致', hakoneTexts.filter((t) => !TIMES_RE.test(t)));

    const hakoneHasKm = hakoneTexts.some((t) => / · \d+(\.\d)?km$/.test(t));
    ok(hakoneHasKm, 'hakone: km表記のカードが1件以上ある', hakoneTexts);

    const overflowCountHakone = await page.locator('.feedcard__times').evaluateAll(
      (els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length
    );
    ok(overflowCountHakone === 0, 'hakone: .feedcard__times のはみ出しが0件(375px)', overflowCountHakone);

    // コンソールエラー0件
    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);

    await context.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-distance 実行エラー:', err);
  process.exitCode = 1;
});
