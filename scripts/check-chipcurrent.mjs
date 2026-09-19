// R29: `?q=` / エリアチップ選択時にエリアチップを強調表示する機械検査
// 使い方: node scripts/check-chipcurrent.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// `?q=` は Nominatim (suggestHotels) を呼ぶが、強調表示自体は文字列判定だけで
// 完結するため、page.route で nominatim.openstreetmap.org を空配列で fulfill し、
// 外部APIを一切叩かずに検証する。
//
// 確認項目:
//   1. ?q=草津温泉&demo=suggest で .chip--current が1個、テキストが「草津」、aria-current も1個
//   2. その草津チップが .chips コンテナの可視範囲内にある(scrollIntoViewが効いている)
//   3. ?q=箱根湯本&demo=suggest で .chip--current のテキストが「箱根」
//   4. ?q=ぬけぬけ温泉&demo=suggest で .chip--current が0個、aria-currentも0個
//   5. ?demo=zoomout(?q=なし)で .chip--current が0個
//   6. チップ「箱根」をclickした後、.chip--current が箱根の1個だけになる
//   7. コンソールエラー0件

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import path from 'node:path';
import { ensureServer, PROJECT_ROOT } from './lib/server.mjs';

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

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function newPage(context) {
  const page = await context.newPage();
  // 外部APIは一切叩かない(強調表示は文字列判定だけで完結するため)
  // abort だとブラウザが ERR_FAILED をコンソールに出すため、空配列で fulfill する
  // (外部APIには到達しない。強調表示自体は文字列判定だけで完結するので結果は使わない)
  await page.route('**://nominatim.openstreetmap.org/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { page, consoleErrors };
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    const allConsoleErrors = [];

    // --- 1・2. ?q=草津温泉&demo=suggest ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?q=%E8%8D%89%E6%B4%A5%E6%B8%A9%E6%B3%89&demo=suggest`, { waitUntil: 'load' });
      await waitFor(1000);

      const current = page.locator('.chip--current');
      const currentCount = await current.count();
      ok(currentCount === 1, '1. ?q=草津温泉 で .chip--current が1個', currentCount);
      const text = currentCount === 1 ? (await current.textContent() || '').trim() : null;
      ok(text === '草津', '1. 該当チップのテキストが「草津」', text);
      const ariaCount = await page.locator('.chip[aria-current="true"]').count();
      ok(ariaCount === 1, '1. aria-current="true" も1個', ariaCount);

      if (currentCount === 1) {
        const chipBox = await current.boundingBox();
        const chipsBox = await page.locator('.chips').boundingBox();
        const within = !!chipBox && !!chipsBox &&
          chipBox.x >= chipsBox.x - 1 &&
          (chipBox.x + chipBox.width) <= (chipsBox.x + chipsBox.width + 1);
        ok(within, '2. 該当チップが .chips の可視範囲内にある', { chipBox, chipsBox });
      } else {
        ok(false, '2. 該当チップが .chips の可視範囲内にある(該当チップ無し)');
      }

      // 撮影(目視用)
      const shotPath = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r29-chip-kusatsu_mobile.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log('  撮影: ' + shotPath);

      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 3. ?q=箱根湯本&demo=suggest ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?q=%E7%AE%B1%E6%A0%B9%E6%B9%AF%E6%9C%AC&demo=suggest`, { waitUntil: 'load' });
      await waitFor(1000);
      const text = (await page.locator('.chip--current').textContent().catch(() => null) || '').trim();
      ok(text === '箱根', '3. ?q=箱根湯本 で .chip--current のテキストが「箱根」', text);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 4. ?q=ぬけぬけ温泉&demo=suggest(AREASに無い語) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?q=%E3%81%AC%E3%81%91%E3%81%AC%E3%81%91%E6%B8%A9%E6%B3%89&demo=suggest`, { waitUntil: 'load' });
      await waitFor(1000);
      const currentCount = await page.locator('.chip--current').count();
      ok(currentCount === 0, '4. AREASに無い語で .chip--current が0個', currentCount);
      const ariaCount = await page.locator('.chip[aria-current="true"]').count();
      ok(ariaCount === 0, '4. aria-current も0個', ariaCount);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 5. ?demo=zoomout(?q=なし) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
      await waitFor(1000);
      const currentCount = await page.locator('.chip--current').count();
      ok(currentCount === 0, '5. ?demo=zoomout で .chip--current が0個(勝手に強調しない)', currentCount);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 6. チップ「箱根」をclick ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
      await waitFor(1000);
      const hakone = page.locator('.chip', { hasText: '箱根' }).first();
      await hakone.click();
      await waitFor(500);
      const currentCount = await page.locator('.chip--current').count();
      const text = currentCount === 1 ? (await page.locator('.chip--current').textContent() || '').trim() : null;
      ok(currentCount === 1 && text === '箱根', '6. チップ「箱根」click後 .chip--current が箱根の1個だけ', { currentCount, text });
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 7. コンソールエラー0件(全ページ通算) ---
    ok(allConsoleErrors.length === 0, '7. コンソールエラー0件', allConsoleErrors);

  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-chipcurrent 実行エラー:', err);
  process.exitCode = 1;
});
