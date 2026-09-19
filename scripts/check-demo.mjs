// R218: 営業デモページ(demo/)をブラウザで開いて壊れていないことを確かめる機械検査
// 使い方: node scripts/check-demo.mjs
//
// なぜ作ったか:
//   既存32本のうち demo/ をブラウザで開いていたのは check-embedheight.mjs の
//   `demo/hotel-page.html` 1枚だけで、`demo/hotel-page-en.html`(英語版・R207/R208)と
//   `demo/embed-check.html`(埋め込み確認用・R85/R213)は中身を見る検査が1本も無かった。
//   この2枚は営業でそのまま人に見せる素材なのに、白紙になっても検査は全部緑のまま通る。
//   本検査はその穴を塞ぐ(hotel-page.html は check-embedheight が守っているので対象外)。
//
// 何を守るか(壊れたら FAIL する):
//   [共通・2枚とも]
//     1. HTTP 200 で開ける
//     2. <title> が空文字でない
//     3. <html lang> が期待どおり(en版=en / embed-check=ja)
//     4. JSエラー(コンソール error / pageerror)が0件
//     5. iframe が1つ存在し、その src が `embed=1` と `fixture=kusatsu` を含む
//        (固定データ運用。外部APIを叩かせないための検査でもある)
//     6. iframe が実際に描画されている(見た目の幅・高さが共に100px以上)
//     7. iframe の中身がカードを実際に描画している(.feedcard が1件以上)
//   [demo/hotel-page-en.html 固有]
//     8. 主要な見出し・導線が存在する(h1.hotel-title / section.embed-section h2 / a.cta)
//     9. 日本語版へ戻るリンク(href="hotel-page.html")がある = R207 の入口が消えていない
//    10. OGタグが揃っている(og:title / og:description / og:image / og:url が空でない)
//    11. 高さ受信スクリプトが効いていて、iframe の高さが初期値640pxより伸びる
//   [demo/embed-check.html 固有]
//    12. 見出し h1 と説明文(p が3本以上・R213 で追加した説明書き)が存在する
//
// 外部API: 叩かない。iframe は `?fixture=kusatsu`(固定データ)で読み込まれるため、
//   Overpass 等へのアクセスは発生しない(CIで落ちないための必須条件)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。CI では環境変数 PLAYWRIGHT_IMPORT で差し替える
// (R205 と同じ方式)。サーバは scripts/lib/server.mjs の ensureServer() 経由で用意し、
// check-all.mjs 経由なら親が YADOTABI_BASE で渡した既存サーバを使う。
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

// 1枚分の共通検査。ページを開いて基本の形が保たれているかを見る。
async function openDemo(browser, pathname, expectedLang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const res = await page.goto(`${BASE}${pathname}`, { waitUntil: 'load' });
  ok(res && res.status() === 200, `${pathname} が HTTP 200 で開ける`, res ? res.status() : null);

  const title = (await page.title()).trim();
  ok(title.length > 0, `${pathname} の <title> が空でない`, title);

  const lang = await page.locator('html').getAttribute('lang');
  ok(lang === expectedLang, `${pathname} の lang が "${expectedLang}"`, lang);

  // fixture の読み込みとカード描画を待つ
  await waitFor(2500);

  const frameEl = page.locator('iframe');
  const frameCount = await frameEl.count();
  ok(frameCount === 1, `${pathname} に iframe がちょうど1つある`, frameCount);

  const src = frameCount ? await frameEl.first().getAttribute('src') : '';
  ok(!!src && src.includes('embed=1'), `${pathname} の iframe src に embed=1 がある`, src);
  ok(!!src && src.includes('fixture=kusatsu'),
    `${pathname} の iframe src が固定データ(fixture=kusatsu)を使っている`, src);

  const box = frameCount
    ? await frameEl.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      })
    : { width: 0, height: 0 };
  ok(box.width >= 100 && box.height >= 100, `${pathname} の iframe が実際に描画されている`, box);

  const cards = await page.frameLocator('iframe').locator('.feedcard').count();
  ok(cards >= 1, `${pathname} の iframe 内にカードが描画されている`, cards);

  return { context, page, consoleErrors, frameEl, box };
}

function reportConsole(pathname, consoleErrors) {
  ok(consoleErrors.length === 0, `${pathname} のJSエラーが0件`, consoleErrors);
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- demo/hotel-page-en.html(英語版の営業デモ) ---
    {
      const p = '/demo/hotel-page-en.html';
      const { context, page, consoleErrors, frameEl, box } = await openDemo(browser, p, 'en');

      ok(await page.locator('h1.hotel-title').count() === 1, `${p} に宿名の見出し(h1.hotel-title)がある`);
      ok(await page.locator('section.embed-section h2').count() === 1,
        `${p} に埋め込みセクションの見出しがある`);
      ok(await page.locator('a.cta').count() === 1, `${p} に予約CTAがある`);

      const backLink = await page.locator('a[href="hotel-page.html"]').count();
      ok(backLink >= 1, `${p} に日本語版への導線(hotel-page.html)がある`, backLink);

      const og = await page.evaluate(() => {
        const get = (prop) => {
          const el = document.querySelector(`meta[property="${prop}"]`);
          return el ? (el.getAttribute('content') || '').trim() : '';
        };
        return {
          title: get('og:title'),
          description: get('og:description'),
          image: get('og:image'),
          url: get('og:url'),
        };
      });
      ok(Object.values(og).every((v) => v.length > 0), `${p} のOGタグ4種が揃っている`, og);

      // 高さ受信スクリプト(</body>直前)が効いているか。初期値は CSS の 640px。
      ok(box.height > 640, `${p} の iframe 高さが初期値640pxより伸びている(高さ通知が効いている)`, box.height);

      reportConsole(p, consoleErrors);
      await context.close();
    }

    // --- demo/embed-check.html(埋め込み確認用ページ) ---
    {
      const p = '/demo/embed-check.html';
      const { context, page, consoleErrors } = await openDemo(browser, p, 'ja');

      ok(await page.locator('h1').count() === 1, `${p} に見出し(h1)がある`);

      const paragraphs = await page.locator('body > p').count();
      ok(paragraphs >= 3, `${p} に説明文が3本以上ある(R213の説明書きが残っている)`, paragraphs);

      reportConsole(p, consoleErrors);
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
  console.error('check-demo 実行エラー:', err);
  process.exitCode = 1;
});
