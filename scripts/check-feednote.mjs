// R47: フィード末尾の注記(提案の作り方を正直に明かす)の機械検査
// 使い方: node scripts/check-feednote.mjs
// ローカルサーバーは scripts/lib/server.mjs の ensureServer() が空きポートで起動し、
// 検証後に落とす(環境変数 YADOTABI_BASE があればそれを再利用する)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu で #feed-note が hidden でなく、.feedcard 30枚の下に位置する
//   2. 注記テキストに「暫定版」「OpenStreetMap」「Wikipedia」が含まれる
//   3. #feed-note a の href が https://github.com/TeeR-tee/yadotabi# で始まる
//   4. #more-btn を click して60枚に展開した後も #feed-note が最下部にある
//   5. ?fixture=hakone&demo=far で #feed-far(details)より下に #feed-note がある
//   6. ?fixture=kusatsu&embed=1 でも #feed-note が表示される(hidden でない)
//   7. ?fixture=kusatsu&simulate=empty では #feed-note が hidden(0件時は出さない)
//   8. コンソールエラー0件
//
// R246 で足した軸(注記が名乗る「順位の作り方」が実態と合っているかを見る):
//   9.  整合軸 … 注記の文に「有名さは順位に使っていない」と読める表現が無いこと。
//       engine.js の WEIGHT で順位に最も効いているのは PARENT_MENTION(80・親記事で
//       どれだけ語られているか)で、次点タイに BACKLINK_MAX(18・他の記事からどれだけ
//       触れられているか)がある。どちらも「どれだけ知られているか」を順位に効かせる
//       重みなので、「有名な場所が下に来る」と書くのは画面の嘘になる。
//   10. 名乗り軸 … 実際に効いている要素のうち、旧文が名乗っていなかった
//       「語られ/触れられている」という観点が注記に出ていること(R236・R245 と逆向きの
//       型崩れ = 効いているのに名乗らない、を捕まえる)。
//   11. 禁止語軸 … 注記に数字・評価の語・専門用語(被リンク/スコア/重み 等)が
//       出ていないこと(R242・R245 と同じ制約。しきい値や点数を画面に出さない)。
//   12. 用語統一軸 … ★の説明(#feed-origin)と注記が、同じ概念を2通りの言葉で
//       呼んでいないこと(どちらも「触れられている」で揃える)。
//
// ★R246 の重要な設計: 母数は必ず画面(DOM)の #feed-note の textContent から取る。
// app.js の定数を import して突き合わせると、定数を書き換えたときに検査も一緒に
// ずれて死んだ軸になる(R240 の教訓)。

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

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- 1〜4: ?fixture=kusatsu ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);

      const note = page.locator('#feed-note');
      const noteHidden = await note.evaluate((el) => el.hidden);
      ok(noteHidden === false, '#feed-note が hidden でない', noteHidden);

      const noteTop = await note.evaluate((el) => el.getBoundingClientRect().top);
      const lastCardBottom = await page.locator('.feedcard').last().evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTop > lastCardBottom, '#feed-note が初期カード5枚の下にある', { noteTop, lastCardBottom });

      const noteText = await note.textContent();
      ok(noteText.includes('暫定版'), '注記テキストに「暫定版」を含む', noteText);
      ok(noteText.includes('OpenStreetMap'), '注記テキストに「OpenStreetMap」を含む', noteText);
      ok(noteText.includes('Wikipedia'), '注記テキストに「Wikipedia」を含む', noteText);

      const href = await note.locator('a').getAttribute('href');
      ok(typeof href === 'string' && href.startsWith('https://github.com/TeeR-tee/yadotabi#'), '#feed-note a の href が正しい', href);

      // --- R246: 注記が名乗る「順位の作り方」が実態と合っているか ---
      // 母数はここまでで取った noteText(= DOM の textContent)だけ。app.js は読まない。
      // リンク文言「くわしい仕組み」は注記の本文ではないので、判定から外す。
      const noteBody = noteText.replace('くわしい仕組み', '');

      // 9. 整合軸: 「有名さは順位に反映されない」と読める表現が残っていないこと。
      //    PARENT_MENTION(80)と BACKLINK_MAX(18)が現に効いている以上、これは嘘になる。
      const DENY_FAME_PATTERNS = [
        '有名な場所が下に来る',
        '有名な場所が下に',
        '有名さは使',
        '有名さは見',
        '知名度は使',
        '知られた場所が下に'
      ];
      const hitDeny = DENY_FAME_PATTERNS.filter((w) => noteBody.includes(w));
      ok(hitDeny.length === 0,
        '注記に「有名さを順位に使っていない」と読める表現が無い', { hitDeny, noteBody });

      // 10. 名乗り軸: 実際に効いている「どれだけ語られ/触れられているか」を名乗っていること。
      //     PARENT_MENTION が WEIGHT 最大なのに、旧文はこの観点を1文字も出していなかった。
      const FAME_CLAIM_WORDS = ['語られ', '触れられ'];
      const missingClaim = FAME_CLAIM_WORDS.filter((w) => !noteBody.includes(w));
      ok(missingClaim.length === 0,
        '注記が「どれだけ語られ触れられているか」を名乗っている', { missingClaim, noteBody });

      // 11. 禁止語軸: 数字・評価の語・専門用語を画面に出さない(R242・R245 と同じ制約)。
      //     数字は半角・全角の両方を見る。固有名詞の OpenStreetMap / Wikipedia は数字を
      //     含まないのでそのまま通る。
      const BANNED_WORDS = ['被リンク', 'スコア', '重み', '加点', '減点', '点数', 'しきい値', 'ランキング', '評価'];
      const hitBanned = BANNED_WORDS.filter((w) => noteBody.includes(w));
      ok(hitBanned.length === 0, '注記に専門用語・評価の語が出ていない', { hitBanned, noteBody });

      const hitDigits = noteBody.match(/[0-9０-９]/g) || [];
      ok(hitDigits.length === 0, '注記に数字が出ていない', { hitDigits, noteBody });

      // 12. 用語統一軸: ★の説明(#feed-origin)と注記が同じ概念を同じ言葉で呼んでいること。
      //     #feed-origin 側も画面(DOM)から取る。★が0枚だと R245 の仕様でこの行は
      //     出ないため、出ているときだけ突き合わせる(kusatsu は★1枚以上が出る想定)。
      const originText = await page.locator('#feed-origin').textContent();
      if (originText && originText.includes('★は、')) {
        ok(originText.includes('触れられている') && noteBody.includes('触れられ'),
          '★の説明と注記が同じ言葉(触れられている)で揃っている', { originText, noteBody });
      } else {
        ok(false, '#feed-origin に★の説明が出ている(用語統一軸の前提)', originText);
      }

      // 4. もっと見るで60枚に展開後も最下部にある
      const moreBtn = page.locator('#more-btn');
      if (await moreBtn.count()) {
        await moreBtn.click();
        await waitFor(300);
      }
      const noteTopAfter = await note.evaluate((el) => el.getBoundingClientRect().top);
      const lastCardBottomAfter = await page.locator('.feedcard').last().evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTopAfter > lastCardBottomAfter, '展開後も #feed-note が最下部にある', { noteTopAfter, lastCardBottomAfter });

      ok(consoleErrors.length === 0, 'コンソールエラー0件(kusatsu)', consoleErrors);
      await context.close();
    }

    // --- 5: ?fixture=hakone&demo=far ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=hakone&demo=far`, { waitUntil: 'load' });
      await waitFor(2000);

      const farBottom = await page.locator('#feed-far').evaluate((el) => el.getBoundingClientRect().bottom);
      const noteTop = await page.locator('#feed-note').evaluate((el) => el.getBoundingClientRect().top);
      ok(noteTop >= farBottom, '#feed-far より下に #feed-note がある', { noteTop, farBottom });

      await context.close();
    }

    // --- 6: ?fixture=kusatsu&embed=1 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
      await waitFor(2000);

      const noteHidden = await page.locator('#feed-note').evaluate((el) => el.hidden);
      ok(noteHidden === false, 'embed=1 でも #feed-note が表示される', noteHidden);

      await context.close();
    }

    // --- 7: ?fixture=kusatsu&simulate=empty ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&simulate=empty`, { waitUntil: 'load' });
      await waitFor(2000);

      const noteHidden = await page.locator('#feed-note').evaluate((el) => el.hidden);
      ok(noteHidden === true, 'simulate=empty では #feed-note が hidden', noteHidden);

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
  console.error('check-feednote 実行エラー:', err);
  process.exitCode = 1;
});
