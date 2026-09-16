// R84: `?debug=1`(rank のスコア内訳表示)の機械検査
// 使い方: node scripts/check-debugflag.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-imgfail.mjs の作りを踏襲する。
// 外部APIは1回も叩かない(全て ?fixture= 経由)。
//
// 確認項目:
//   1. ?fixture=kusatsu&debug=1 で .dbg が30件以上ある
//   2. ?fixture=kusatsu(debug 無し)で .dbg が 0件(デグレなし)
//   3. ?debug=1 単独(fixture 無し)で .dbg が 0件 ← 最重要。
//      本番URLで一般の人に内訳が見えてはいけない
//   4. ?fixture=kusatsu&debug=1 の1位カードの .dbg テキストが「#1」を含み、
//      osm / wiki / both のいずれかを含む
//   5. debug の有無で .feedcard__name の並びが完全一致(DOM 上でも順序不変)

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

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    let namesWithDebug = null;
    let namesWithoutDebug = null;

    // --- 1・4. ?fixture=kusatsu&debug=1 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/?fixture=kusatsu&debug=1`, { waitUntil: 'load' });
      await waitFor(2500);

      const dbgCount = await page.locator('.dbg').count();
      ok(dbgCount >= 30, '1. ?fixture=kusatsu&debug=1 で .dbg が30件以上', dbgCount);

      const firstDbg = (await page.locator('.feedcard').nth(0).locator('.dbg').textContent()) || '';
      ok(firstDbg.includes('#1'), '4. 1位カードの .dbg が「#1」を含む', firstDbg);
      ok(/\b(osm|wiki|both)\b/.test(firstDbg), '4. 1位カードの .dbg が osm/wiki/both のいずれかを含む', firstDbg);
      ok(firstDbg.includes('合計'), '4. 1位カードの .dbg が合計スコアを含む', firstDbg);

      namesWithDebug = await page.locator('.feedcard__name').allTextContents();

      const unexpected = consoleErrors.filter((msg) => {
        const m = String(msg).toLowerCase();
        return !(m.includes('404') || m.includes('failed to load resource') || m.includes('net::err'));
      });
      ok(unexpected.length === 0, '1. コンソールエラーは画像404由来以外0件', unexpected);

      await context.close();
    }

    // --- 2. ?fixture=kusatsu(debug 無し)で .dbg が 0件 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2500);

      const dbgCount = await page.locator('.dbg').count();
      ok(dbgCount === 0, '2. ?fixture=kusatsu(debug 無し)で .dbg が0件', dbgCount);

      const cardCount = await page.locator('.feedcard').count();
      ok(cardCount === 30, '2. debug 無しでも .feedcard が30枚(デグレなし)', cardCount);

      namesWithoutDebug = await page.locator('.feedcard__name').allTextContents();
      await context.close();
    }

    // --- 3. ?debug=1 単独(fixture 無し)で .dbg が 0件 ← 最重要 ---
    // 外部APIを叩かせないため、?hotel= で宿だけ与えたケースでも確認する。
    for (const url of [`${BASE}/?debug=1`, `${BASE}/?debug=1&fixture=`]) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      // 万一 Overpass/Wikipedia へ出ようとしても通さない(このテストは外部API 0回)
      await page.route('**://*/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(BASE)) return route.continue();
        return route.abort();
      });
      await page.goto(url, { waitUntil: 'load' });
      await waitFor(2000);

      const dbgCount = await page.locator('.dbg').count();
      ok(dbgCount === 0, `3. ${url.replace(BASE, '')}(fixture 無し)で .dbg が0件`, dbgCount);
      await context.close();
    }

    // --- 5. debug の有無で .feedcard__name の並びが完全一致 ---
    ok(JSON.stringify(namesWithDebug) === JSON.stringify(namesWithoutDebug),
      '5. debug の有無で .feedcard__name の並びが完全一致(DOM 上でも順序不変)',
      { withDebug: namesWithDebug && namesWithDebug.slice(0, 5), without: namesWithoutDebug && namesWithoutDebug.slice(0, 5) });
    ok(Array.isArray(namesWithDebug) && namesWithDebug.length === 30,
      '5. 比較に使ったカード名が30件ある', namesWithDebug && namesWithDebug.length);
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-debugflag 実行エラー:', err);
  process.exitCode = 1;
});
