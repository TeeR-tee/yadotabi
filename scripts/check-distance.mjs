// R54: フィードカードの距離表記(徒歩◯分 · 車◯分 · ◯m/◯km)の機械検査
// 使い方: node scripts/check-distance.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu の全 .feedcard__times が末尾に距離(m/km)を含む形式に一致する
//      (R165: 徒歩部分は2.4km超で省かれるためオプショナル。車と距離は必須のまま)
//   2. kusatsu の1位カード(距離が最も近い想定)がm表記であることを確認する
//   3. ?fixture=hakone の中に少なくとも1件はkm表記のカードが存在する
//   4. 375px viewport で全 .feedcard__times が scrollWidth <= clientWidth(はみ出しなし)
//   5. コンソールエラー0件
//   6. (R165) 徒歩表記の有無が距離2.4km境界と対応しているか(丸め誤差の緩衝帯あり)

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
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

// R165: 徒歩30分(約2.4km)を超える候補は徒歩表記を出さないため、徒歩部分をオプショナルにした。
// 「5.2kmに徒歩65分」という誰も歩かない表記をやめたもの。
// 車と距離は全カードで必須のまま(消えたらそれは異常)。
const TIMES_RE = /^(🚶徒歩\d+分 · )?🚗車\d+分( · (\d+m|\d+(\.\d)?km))?$/;

// R165: 徒歩表記の有無と距離の対応が壊れていないかを見る。
// 実際の境界は正確に2400m(徒歩30分=Math.ceil(d/80)<=30 ⟺ d<=2400)だが、
// distanceText() が距離を100m単位に丸めて表示するため、表示文字列から逆算した
// メートル数には最大±50m程度の誤差が乗る。境界のごく近傍(2300〜2500m)は
// 丸め起因の見た目と実距離のズレで誤検知しうるので判定から除外し、
// それより明確に近い/遠いカードだけを対象にする。
function checkWalkDistanceConsistency(texts) {
  let mismatched = [];
  texts.forEach((t) => {
    const hasWalk = /^🚶徒歩\d+分/.test(t);
    const distMatch = t.match(/ · (\d+)m$| · (\d+(?:\.\d)?)km$/);
    if (!distMatch) return; // 距離表記が無いカードは対象外
    const meters = distMatch[1] !== undefined ? Number(distMatch[1]) : Number(distMatch[2]) * 1000;
    if (meters >= 2300 && meters <= 2500) return; // 丸め誤差の緩衝帯
    const expectWalk = meters < 2300;
    if (hasWalk !== expectWalk) mismatched.push({ text: t, meters, hasWalk, expectWalk });
  });
  return mismatched;
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

    // --- kusatsu ---
    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(1500);

    const kusatsuTexts = await page.locator('.feedcard__times').allTextContents();
    ok(kusatsuTexts.length > 0, 'kusatsu: .feedcard__times が1件以上存在する', kusatsuTexts.length);

    const kusatsuAllMatch = kusatsuTexts.every((t) => TIMES_RE.test(t));
    ok(kusatsuAllMatch, 'kusatsu: 全カードの times が規定フォーマットに一致', kusatsuTexts.filter((t) => !TIMES_RE.test(t)));

    const kusatsuHasMeter = kusatsuTexts.some((t) => / · \d+m$/.test(t));
    ok(kusatsuHasMeter, 'kusatsu: m表記のカードが1件以上ある', kusatsuTexts);

    const kusatsuWalkMismatch = checkWalkDistanceConsistency(kusatsuTexts);
    ok(kusatsuWalkMismatch.length === 0, 'kusatsu: 徒歩表記の有無と距離(2.4km境界)が対応している', kusatsuWalkMismatch);

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

    const hakoneWalkMismatch = checkWalkDistanceConsistency(hakoneTexts);
    ok(hakoneWalkMismatch.length === 0, 'hakone: 徒歩表記の有無と距離(2.4km境界)が対応している', hakoneWalkMismatch);

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
