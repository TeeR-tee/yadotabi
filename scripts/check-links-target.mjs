// R111: カード内の外部リンクが `target="_blank"` かつ `rel` に `noopener` を
// トークンとして含むことの機械検査。
// 使い方: node scripts/check-links-target.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-debugflag.mjs の作りを踏襲する。
// 外部APIは1回も叩かない(全て ?fixture= 経由)。
//
// 背景: `target="_blank" rel="noopener"` は ?embed=1 用途の前提条件そのもの。
// iframe内で同一タブ遷移が起きると宿の予約ページごとやどたびに乗っ取られたように
// 見えてしまう。にもかかわらずこの属性を見る検査が無かったため新設する。
//
// 確認項目:
//   1. ?fixture=kusatsu の .feedcard__link が1本以上ある(0本なら検査が空振り)
//   2. 1.の全件が target="_blank" かつ rel が noopener をトークンとして含む
//   3. ?fixture=kusatsu&embed=1 でも1・2と同じ(埋め込みが本丸)
//   4. 「もっと見る」展開後の .feedcard__link も全件同条件(moreHtml分岐後も属性が落ちない)

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

async function checkLinks(page, label) {
  const links = page.locator('.feedcard__link');
  const count = await links.count();
  ok(count > 0, `${label}: .feedcard__link が1本以上ある`, count);

  const attrs = await links.evaluateAll((els) =>
    els.map((el) => ({
      href: el.getAttribute('href'),
      target: el.getAttribute('target'),
      rel: el.getAttribute('rel'),
    }))
  );

  const badTarget = attrs.filter((a) => a.target !== '_blank');
  ok(badTarget.length === 0,
    `${label}: 全件が target="_blank"(${attrs.length}本中${attrs.length - badTarget.length}本OK)`,
    badTarget.length ? { violations: badTarget.length, total: attrs.length, firstHref: badTarget[0].href } : undefined);

  const badRel = attrs.filter((a) => !String(a.rel || '').split(/\s+/).includes('noopener'));
  ok(badRel.length === 0,
    `${label}: 全件が rel に noopener をトークンとして含む(${attrs.length}本中${attrs.length - badRel.length}本OK)`,
    badRel.length ? { violations: badRel.length, total: attrs.length, firstHref: badRel[0].href } : undefined);

  return count;
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- 1・2. ?fixture=kusatsu ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2500);
      await checkLinks(page, '1. ?fixture=kusatsu');
      await context.close();
    }

    // --- 3. ?fixture=kusatsu&embed=1(埋め込みが本丸) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
      await waitFor(2500);
      await checkLinks(page, '3. ?fixture=kusatsu&embed=1');
      await context.close();
    }

    // --- 4. 「もっと見る」展開後 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2500);
      const moreBtn = page.locator('#more-btn');
      const hasMore = await moreBtn.count();
      if (hasMore > 0) {
        await moreBtn.click();
        await waitFor(1500);
        await checkLinks(page, '4. 「もっと見る」展開後');
      } else {
        ok(true, '4. #more-btn が無い(展開対象なしのためスキップ)', hasMore);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-links-target 実行エラー:', err);
  process.exitCode = 1;
});
