// R16: 「もっと見る」(6〜15件目の展開)の機械検査
// 使い方: node scripts/check-more.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-a11y.mjs の作りを踏襲する。
//
// 確認項目(R155 で 初期5件+もっと見るは理由付き候補の実数ぶん=最大30件 に変更):
//   1. ?fixture=kusatsu を開き、初期状態で .feedcard が5枚、#more-btn が存在する
//   2. #more-btn を click し、.feedcard の枚数が5枚より増える(理由付き候補の数ぶん、最大30枚)
//   3. 展開後の6枚目のカードの番号バッジが「6」である
//   4. 展開後は #more-btn が消えている
//   5. コンソールエラー0件
//   R60: 展開前は .morenote が存在せず、展開後は1つ存在し「6」と「地図」を含む
//   R152: #more-btn の文言に件数の数字が出ていない

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
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

    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    // 1. 初期状態
    const initialCount = await page.locator('.feedcard').count();
    ok(initialCount === 5, '初期状態で .feedcard が5枚', initialCount);

    const moreBtn = page.locator('#more-btn');
    const moreBtnCountBefore = await moreBtn.count();
    ok(moreBtnCountBefore === 1, '#more-btn が存在する', moreBtnCountBefore);

    // R152: 「もっと見る（残りN件）」の件数表記を廃止した。数字が復活していないこと。
    const moreBtnText = moreBtnCountBefore === 1 ? (await moreBtn.textContent()) || '' : '';
    ok(moreBtnText.trim() === 'もっと見る', '#more-btn の文言が「もっと見る」だけ(件数の数字が無い)', moreBtnText);

    const moreNoteCountBefore = await page.locator('.morenote').count();
    ok(moreNoteCountBefore === 0, '展開前は .morenote が存在しない', moreNoteCountBefore);

    // 2. click して展開
    await moreBtn.click();
    await waitFor(300);

    const expandedCount = await page.locator('.feedcard').count();
    ok(expandedCount > 5, '.feedcard の枚数が5枚より増える', expandedCount);
    // R155: 打ち切りを理由付き候補の実数(REASON_POOL=30が上限)に合わせたので、
    // 件数を固定値で比較せず「30件を超えない」不等式にする(草津の実測は25件)。
    ok(expandedCount <= 30, '.feedcard の枚数が30枚を超えない', expandedCount);

    // R60: 展開後の注記
    const moreNote = page.locator('.morenote');
    const moreNoteCountAfter = await moreNote.count();
    ok(moreNoteCountAfter === 1, '展開後は .morenote が1つ存在する', moreNoteCountAfter);
    const moreNoteText = moreNoteCountAfter === 1 ? await moreNote.textContent() : '';
    ok(moreNoteText.includes('6') && moreNoteText.includes('地図'), '.morenote に「6」と「地図」を含む', moreNoteText);

    // 撮影(展開後): 目視用にフルページを保存する
    const shotPath = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r60-expanded_mobile.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log('  撮影: ' + shotPath);

    // 3. 6枚目のカードの番号バッジ
    const badge6 = await page.locator('.feedcard').nth(5).locator('.feedcard__no').textContent();
    ok(badge6 !== null && badge6.trim() === '6', '展開後6枚目の番号バッジが6', badge6);

    // 4. #more-btn が消えている
    const moreBtnCountAfter = await moreBtn.count();
    ok(moreBtnCountAfter === 0, '展開後は #more-btn が消えている', moreBtnCountAfter);

    // 5. コンソールエラー0件
    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);

    await context.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

main().catch((err) => {
  console.error('check-more 実行エラー:', err);
  process.exitCode = 1;
});
