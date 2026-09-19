// R221: JavaScript が無効なときの案内(index.html の <noscript>)を守る機械検査
// 使い方: node scripts/check-noscript.mjs
//
// なぜ作ったか:
//   R215 で「JSが無効だと本番が真っ白」という問題を直し、`index.html` の <body> 先頭に
//   <noscript> の案内(9行・中身はすべてインライン style)を入れた。
//   ところが既存33本の検査は**すべて JS が動く前提**で、JSを切ってページを開くものが1本も無い
//   (`grep -rlni "noscript" scripts/` も `javaScriptEnabled` の類も0件だった)。
//   <noscript> は今後 index.html を触るどのタスクも必ず通過する <body> の先頭にあるため、
//   整理の拍子に消えても・壊れても33本は全部緑のまま通ってしまう。本検査はその穴を塞ぐ。
//
// 何を守るか(壊れたら FAIL する):
//   [JS無効(javaScriptEnabled: false)で index.html を開いたとき]
//     1. HTTP 200 で開ける
//     2. body の innerText が 200文字以上ある(= 真っ白に戻っていない。R215 前は2文字だった)
//     3. その文字に「JavaScript」「再読み込み」「やどたび」の3語がすべて含まれる
//     4. 本番URL https://teer-tee.github.io/yadotabi/ へのリンクが1本以上ある
//   [JS有効(javaScriptEnabled: true)で開いたとき = 普段の利用者]
//     5. innerText に「再読み込みしてください」が含まれない(= noscript の中身が漏れていない)
//     6. カードが実際に描画される(.feedcard が1件以上。noscript を足したせいで本体が
//        壊れていないことの確認)
//
// 外部API: 叩かない。JS無効側は静的HTMLを読むだけ、JS有効側は `?fixture=kusatsu`(固定データ)
//   で開くため Overpass 等へのアクセスは発生しない(CIで落ちないための必須条件)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。CI では環境変数 PLAYWRIGHT_IMPORT で差し替える
// (R205 と同じ方式)。サーバは scripts/lib/server.mjs の ensureServer() 経由で用意し、
// check-all.mjs 経由なら親が YADOTABI_BASE で渡した既存サーバを使う。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import { ensureServer } from './lib/server.mjs';

const PROD_URL = 'https://teer-tee.github.io/yadotabi/';
const MIN_TEXT_LENGTH = 200;
const REQUIRED_WORDS = ['JavaScript', '再読み込み', 'やどたび'];

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

// --- JS無効で開く(noscript の案内が出ているはず) ---
async function checkWithoutJs(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  try {
    const res = await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    ok(res && res.status() === 200, 'JS無効: index.html が HTTP 200 で開ける', res ? res.status() : null);

    const text = (await page.locator('body').innerText()).trim();
    ok(text.length >= MIN_TEXT_LENGTH,
      `JS無効: 案内が ${MIN_TEXT_LENGTH}文字以上ある(真っ白になっていない)`, text.length);

    for (const word of REQUIRED_WORDS) {
      ok(text.includes(word), `JS無効: 案内に「${word}」が含まれる`, text.slice(0, 120));
    }

    const prodLinks = await page.locator(`noscript a[href="${PROD_URL}"]`).count();
    ok(prodLinks >= 1, `JS無効: 本番URL(${PROD_URL})へのリンクがある`, prodLinks);
  } finally {
    await context.close();
  }
}

// --- JS有効で開く(noscript の中身は見えず、本体が普通に動くはず) ---
async function checkWithJs(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/index.html?fixture=kusatsu`, { waitUntil: 'load' });
    // fixture の読み込みとカード描画を待つ
    await waitFor(2500);

    const text = (await page.locator('body').innerText()).trim();
    ok(!text.includes('再読み込みしてください'),
      'JS有効: noscript の中身が画面に出ていない', text.slice(0, 120));

    const cards = await page.locator('.feedcard').count();
    ok(cards >= 1, 'JS有効: カードが描画されている(本体が壊れていない)', cards);
  } finally {
    await context.close();
  }
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    await checkWithoutJs(browser);
    await checkWithJs(browser);
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-noscript 実行エラー:', err);
  process.exitCode = 1;
});
