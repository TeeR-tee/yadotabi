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
//   R153: 展開後は more もピンに含めてカードと地図を完全一致させたので、
//   「◯番以降は地図に表示していません」の .morenote 自体が不要になった。
//   展開前後どちらも .morenote は存在しないことを確認する(R60の逆)。
//   R152: #more-btn の文言に件数の数字が出ていない
//   R236: 「もっと見る」を押す前に、その先にあるテーマ名が #more-themes に出ている。
//     (a) 有無軸  = 5エリアすべてで展開前に #more-themes があり、テーマ名を1つ以上含む。
//                   more が0件のとき・展開後・宿未選択のトップでは出ない。
//     (b) 中身軸  = #more-themes が名乗るテーマ名が、展開後に実際に画面へ出る
//                   h3.feedbundle の文言の部分集合である(画面に無いテーマ名を名乗らない)。
//                   数字を1文字も含まない。評価の語を1つも含まない。
//     母数はどちらも画面(DOM)から取る。engine の再計算値とは突き合わせない(R240 の教訓)。

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import path from 'node:path';
import { ensureServer, PROJECT_ROOT } from './lib/server.mjs';

let BASE;

// R236: 押す前のテーマ名の行(#more-themes)を5エリアで確かめる。
const THEME_AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];
// R227・R231・R226: 表示の文言に評価の語を使うと、対象によっては嘘になる。
// check-fame.mjs:73 の BANNED_WORDS と同じ並び(あちらは #feed-origin 用なので流用せず同じ基準を持つ)。
const THEME_BANNED_WORDS = ['おすすめ', 'お勧め', '人気', '必見', '最高', 'ベスト', 'No.1',
  'ランキング', '話題', '絶対', '一番', '評価', '穴場', '定番'];
// 行の前後の決まり文句。テーマ名だけを取り出すために剥がす。
const THEME_HEAD = 'この先にあるのは';
const THEME_TAIL = 'です';

// 「この先にあるのはA、B、Cです」→ ['A','B','C']
function splitThemeLine(text) {
  let body = (text || '').trim();
  if (body.startsWith(THEME_HEAD)) body = body.slice(THEME_HEAD.length);
  if (body.endsWith(THEME_TAIL)) body = body.slice(0, -THEME_TAIL.length);
  return body.split('、').map((s) => s.trim()).filter(Boolean);
}

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

    // R153: 展開後も more にピンを打ってカードと地図を一致させたので、
    // 「◯番以降は地図に表示していません」の言い訳(.morenote)は出ないはず
    const moreNoteCountAfter = await page.locator('.morenote').count();
    ok(moreNoteCountAfter === 0, '展開後も .morenote が存在しない(地図と一致するため注記不要)', moreNoteCountAfter);

    // 撮影(展開後): 目視用にフルページを保存する
    const shotPath = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r60-expanded_mobile.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log('  撮影: ' + shotPath);

    // 3. R159: 6枚目以降のカードは地図にピンが無く押しても何も起きないため、
    //    番号バッジ自体を出さない(反転: 以前は '6' であることを確認していた)
    const badge6Count = await page.locator('.feedcard').nth(5).locator('.feedcard__no').count();
    ok(badge6Count === 0, '展開後6枚目に番号バッジが存在しない(地図にピンが無いため)', badge6Count);

    // 4. #more-btn が消えている
    const moreBtnCountAfter = await moreBtn.count();
    ok(moreBtnCountAfter === 0, '展開後は #more-btn が消えている', moreBtnCountAfter);

    // 5. コンソールエラー0件
    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);

    // ------------------------------------------------------------------
    // R236: 押す前に出るテーマ名の行(#more-themes)
    // ------------------------------------------------------------------
    // (a-3) 宿未選択のトップ(状態A)では出ない。ボタンが無いのに行だけ浮かないこと。
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(1500);
    const themesOnTop = await page.locator('#more-themes').count();
    ok(themesOnTop === 0, 'R236: 宿未選択のトップでは #more-themes が出ない', themesOnTop);

    for (const area of THEME_AREAS) {
      await page.goto(`${BASE}/?fixture=${area}`, { waitUntil: 'load' });
      await waitFor(2500);

      // 展開前の画面(DOM)から読む
      const themesCount = await page.locator('#more-themes').count();
      const btnCount = await page.locator('#more-btn').count();
      // (a-2) more が0件ならボタンも行も出ない。どちらか片方だけ出ることは無い。
      ok(themesCount === btnCount,
        `R236(${area}): #more-themes は #more-btn と同時にだけ出る`, { themesCount, btnCount });
      if (!btnCount) continue;   // このエリアに more が無ければここまで

      // (a-1) 有無軸: 行があり、テーマ名を1つ以上名乗っている
      ok(themesCount === 1, `R236(${area}): 展開前に #more-themes が1つある`, themesCount);
      const themeText = (await page.locator('#more-themes').textContent()) || '';
      const shownThemes = splitThemeLine(themeText);
      ok(shownThemes.length >= 1,
        `R236(${area}): #more-themes がテーマ名を1つ以上含む`, { themeText, shownThemes });

      // (b-1) 件数の数字が1文字も無い(R152・みのるんの設計思想)
      ok(!/[0-9０-９]/.test(themeText),
        `R236(${area}): #more-themes に数字が1文字も無い`, themeText);

      // (b-2) 評価の語を1つも含まない(R227・R231・R226)
      const hitWords = THEME_BANNED_WORDS.filter((w) => themeText.includes(w));
      ok(hitWords.length === 0,
        `R236(${area}): #more-themes に評価の語が無い`, hitWords);

      // 展開して、実際に画面へ出る見出しを DOM から取る(engine の再計算値は使わない)
      await page.locator('#more-btn').click();
      await waitFor(400);
      const headTexts = await page.locator('h3.feedbundle').allTextContents();
      // 見出しは「歴史を歩く 3件」の形。末尾の件数を落としてテーマ名だけにする
      const headNames = headTexts.map((t) => (t || '').trim().replace(/\s*\d+件$/, ''));
      ok(headNames.length >= 1,
        `R236(${area}): 展開後に h3.feedbundle が1本以上ある(母数がある)`, headNames);

      // (b-3) 中身軸: 名乗ったテーマ名が全部、展開後の見出しに実在する
      const phantom = shownThemes.filter((t) => !headNames.includes(t));
      ok(phantom.length === 0,
        `R236(${area}): #more-themes が画面に無いテーマ名を名乗っていない`,
        { shownThemes, headNames, phantom });

      // (a-4) 展開後は行ごと消える(ボタンと一緒に)
      const themesAfter = await page.locator('#more-themes').count();
      ok(themesAfter === 0, `R236(${area}): 展開後は #more-themes が消えている`, themesAfter);
    }

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
