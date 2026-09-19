// R111: カード内の外部リンクが `target="_blank"` かつ `rel` に `noopener` を
// トークンとして含むことの機械検査。
// 使い方: node scripts/check-links-target.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は既定で C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-debugflag.mjs の作りを踏襲する。
// ただし環境変数 PLAYWRIGHT_IMPORT があればそちらを優先する(R204: GitHub Actions 用)。
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

// R204: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
// CI 側は `npm install playwright` した node_modules を指す file:// URL を渡す。
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

  // R232: 判定に「母数が0でない」を含める。以前は attrs が空でも
  // badTarget/badRel が空配列になり「0本中0本OK」と表示して PASS していた
  // (リンクを全部消す壊し方でこの2項目が緑のままになることを実測で確認済み)。
  const badTarget = attrs.filter((a) => a.target !== '_blank');
  ok(attrs.length > 0 && badTarget.length === 0,
    `${label}: 全件が target="_blank"(${attrs.length}本中${attrs.length - badTarget.length}本OK)`,
    badTarget.length ? { violations: badTarget.length, total: attrs.length, firstHref: badTarget[0].href } : { total: attrs.length });

  const badRel = attrs.filter((a) => !String(a.rel || '').split(/\s+/).includes('noopener'));
  ok(attrs.length > 0 && badRel.length === 0,
    `${label}: 全件が rel に noopener をトークンとして含む(${attrs.length}本中${attrs.length - badRel.length}本OK)`,
    badRel.length ? { violations: badRel.length, total: attrs.length, firstHref: badRel[0].href } : { total: attrs.length });

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
      const beforeExpandCount = await page.locator('.feedcard__link').count();
      const moreBtn = page.locator('#more-btn');
      const hasMore = await moreBtn.count();
      // R232: 以前は #more-btn が無いと ok(true) で素通りしていた。展開ボタンが
      // 出なくなる不具合が起きると、展開後のリンク検査ごと黙って消える
      // (「検査しなかった」が「合格」として記録される)。ボタンの存在自体を検査項目にする。
      ok(hasMore > 0, '4. #more-btn が存在する(展開後の検査を飛ばしていない)', hasMore);
      if (hasMore > 0) {
        await moreBtn.click();
        await waitFor(1500);
        const expandedCount = await checkLinks(page, '4. 「もっと見る」展開後');
        // 展開後は展開前より確実にリンクが増える(2026-09-21 実測: 14本 → 55本)。
        // 「展開したつもりで何も増えていない」を捕まえる。
        ok(expandedCount > beforeExpandCount,
          '4. 展開でリンク本数が増えている', { before: beforeExpandCount, after: expandedCount });
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
