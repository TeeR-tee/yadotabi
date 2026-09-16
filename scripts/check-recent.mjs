// R32: 検索候補に「最近見た宿」をセクション見出し付きで統合する機械検査
// 使い方: node scripts/check-recent.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-chipcurrent.mjs の作りを踏襲する。
//
// `?demo=recentmix` / `?demo=recent` / `?demo=suggest` はいずれも renderSuggest() を
// 直接呼ぶ固定配列描画で、Nominatim を呼ばないが、念のため page.route で空配列に
// fulfill し外部APIを一切叩かずに検証する。
//
// 確認項目:
//   1. ?demo=recentmix で .suggest__head が2個、テキストが「最近見た宿」「検索結果」
//   2. 同画面で .suggest__item の1件目が 🕘 の最近行、その後に候補行が続く(DOM順)
//   3. .suggest__head には data-index が無く、クリックしても state.view が select のまま
//   4. 候補行(最近でない方)をクリックすると状態Bへ遷移する(既存の委譲が壊れていない)
//   5. ?demo=recent(空欄)では .suggest__head が0個か1個で、候補行は最近だけ
//   6. ?demo=suggest(最近なし)では .suggest__head が0個(見出しが浮かない)
//   7. コンソールエラー0件
//   8. (R59) ?demo=suggest で #search-clear が visible。クリックで #search-input が
//      空になり #suggest-list が非表示、フォーカスが #search-input に戻る
//   9. (R59) ?demo=recent(value空)で #search-clear が hidden

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

async function newPage(context) {
  const page = await context.newPage();
  // 外部APIは一切叩かない(demo=* は renderSuggest を直接呼ぶ固定配列描画のため)
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

    // --- 1・2・3・4. ?demo=recentmix ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=recentmix`, { waitUntil: 'load' });
      await waitFor(800);

      const heads = page.locator('.suggest__head');
      const headCount = await heads.count();
      ok(headCount === 2, '1. ?demo=recentmix で .suggest__head が2個', headCount);
      if (headCount === 2) {
        const t0 = (await heads.nth(0).textContent() || '').trim();
        const t1 = (await heads.nth(1).textContent() || '').trim();
        ok(t0 === '最近見た宿', '1. 1つ目の見出しが「最近見た宿」', t0);
        ok(t1 === '検索結果', '1. 2つ目の見出しが「検索結果」', t1);
      } else {
        ok(false, '1. 見出しテキスト確認(個数不一致のためスキップ)');
        ok(false, '1. 見出しテキスト確認(個数不一致のためスキップ)');
      }

      // 2. DOM順: .suggest 直下の子要素を辿り、最初の .suggest__item が 🕘 か
      const firstItemIcon = await page.locator('.suggest__item').first().locator('.suggest__icon').textContent();
      ok((firstItemIcon || '').trim() === '🕘', '2. 1件目の候補行が🕘(最近)', firstItemIcon);

      // 3. 見出しに data-index が無い。クリックしても state.view(#view-feed)が変わらない
      const headHasIndex = await heads.first().evaluate((el) => el.hasAttribute('data-index'));
      ok(headHasIndex === false, '3. .suggest__head に data-index が無い', headHasIndex);
      await heads.first().click({ force: true }).catch(() => {});
      await waitFor(300);
      const viewFeedHiddenAfterHead = await page.locator('#view-feed').evaluate((el) => el.hidden);
      ok(viewFeedHiddenAfterHead === true, '3. 見出しclick後も状態Aのまま(#view-feedが非表示のまま)', { viewFeedHiddenAfterHead });

      // 4. 候補行(最近でない方、「旅館 たむら」)をクリックすると状態Bへ
      const candidateRow = page.locator('.suggest__item', { hasText: '旅館 たむら' }).first();
      await candidateRow.click();
      await waitFor(500);
      const viewFeedHiddenAfterClick = await page.locator('#view-feed').evaluate((el) => el.hidden);
      ok(viewFeedHiddenAfterClick === false, '4. 候補行clickで状態Bへ遷移(#view-feedが表示される)', { viewFeedHiddenAfterClick });

      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 5. ?demo=recent(空欄) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=recent`, { waitUntil: 'load' });
      await waitFor(800);
      const headCount = await page.locator('.suggest__head').count();
      ok(headCount === 0 || headCount === 1, '5. ?demo=recent で .suggest__head が0個か1個', headCount);
      const items = page.locator('.suggest__item');
      const itemCount = await items.count();
      let allRecent = itemCount > 0;
      for (let i = 0; i < itemCount; i++) {
        const icon = (await items.nth(i).locator('.suggest__icon').textContent() || '').trim();
        if (icon !== '🕘') allRecent = false;
      }
      ok(allRecent, '5. 候補行は最近だけ(🕘のみ)', { itemCount });
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 6・8. ?demo=suggest(最近なし・×ボタン) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=suggest`, { waitUntil: 'load' });
      await waitFor(800);
      const headCount = await page.locator('.suggest__head').count();
      ok(headCount === 0, '6. ?demo=suggest で .suggest__head が0個(見出しが浮かない)', headCount);

      const clearVisible = await page.locator('#search-clear').isVisible();
      ok(clearVisible === true, '8. ?demo=suggest で #search-clear が visible', clearVisible);

      await page.locator('#search-clear').click();
      await waitFor(300);
      const inputValue = await page.locator('#search-input').inputValue();
      ok(inputValue === '', '8. ×クリックで #search-input が空になる', inputValue);
      const suggestHidden = await page.locator('#suggest-list').evaluate((el) => el.hidden);
      ok(suggestHidden === true, '8. ×クリックで #suggest-list が非表示になる', suggestHidden);
      const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
      ok(activeId === 'search-input', '8. ×クリック後のフォーカスが #search-input', activeId);

      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 9. ?demo=recent(value空)で #search-clear が hidden ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=recent`, { waitUntil: 'load' });
      await waitFor(800);
      const clearHidden = await page.locator('#search-clear').evaluate((el) => el.hidden);
      ok(clearHidden === true, '9. ?demo=recent で #search-clear が hidden', clearHidden);
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
  console.error('check-recent 実行エラー:', err);
  process.exitCode = 1;
});
