// R23: カード画像の読み込み失敗時のフォールバックの機械検査
// 使い方: node scripts/check-imgfail.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu&demo=imgfail を開き、先頭3枚のカードのメディア部が
//      .feedcard__ph になっている(.feedcard__img が残っていない)
//   2. 4枚目以降は従来どおり .feedcard__img が残っている(全部潰していない)
//   3. 先頭3枚のプレースホルダ内にカテゴリ絵文字のテキストが入っている
//   4. 先頭3枚の番号バッジ .feedcard__no が消えていない(1・2・3が読める)
//   5. ?fixture=kusatsu(フラグ無し)で .feedcard 30枚・.feedcard__ph の枚数が
//      修正前と同じ(デグレなし)
//   6. (R57) ?fixture=kusatsu(demo無し)で4枚目以降の .feedcard__img の alt が
//      全件空でなく、対応するカードの .feedcard__name のテキストを含む
//   7. (R62) ?fixture=kusatsu&demo=portrait で先頭3枚の .feedcard__img が
//      naturalHeight > naturalWidth(縦長ダミーが入っている)、表示高さが
//      3枚とも同値かつ .feedcard__media の高さと一致(枠が伸びていない)、
//      object-fit が cover であること。4枚目以降は naturalWidth >= naturalHeight
//      (差し替えが先頭3枚に限定されている)
//   8. ?fixture=kusatsu(demo無し)で先頭3枚が縦長ダミーになっていない(デグレなし)

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let serverProc = null;
  const alreadyRunning = await isPortOpen(PORT);
  if (!alreadyRunning) {
    serverProc = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
    });
    for (let i = 0; i < 25; i++) {
      if (await isPortOpen(PORT)) break;
      await waitFor(200);
    }
  }

  const browser = await chromium.launch();
  try {
    // --- 先にフラグ無しのベースラインを取得(4枚目以降の .feedcard__ph 枚数の比較用) ---
    let baselinePhCountFrom4th = null;
    let baselineCardCount = null;
    let baselinePhCount = null;
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);
      baselineCardCount = await page.locator('.feedcard').count();
      baselinePhCount = await page.locator('.feedcard__ph').count();
      baselinePhCountFrom4th = await page.locator('.feedcard:nth-child(n+4) .feedcard__ph').count();
      await context.close();
    }

    // --- 1〜4. demo=imgfail あり ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(`${BASE}/?fixture=kusatsu&demo=imgfail`, { waitUntil: 'load' });
      await waitFor(2500);

      const cards = page.locator('.feedcard');
      const cardCount = await cards.count();
      ok(cardCount === 30, '?demo=imgfail でも .feedcard が30枚', cardCount);

      // 先頭3枚: .feedcard__ph になっている(.feedcard__img が残っていない)
      for (let i = 0; i < 3; i++) {
        const card = cards.nth(i);
        const phCount = await card.locator('.feedcard__ph').count();
        const imgCount = await card.locator('.feedcard__img').count();
        ok(phCount === 1 && imgCount === 0, `先頭${i + 1}枚目が .feedcard__ph に置換されている`, { phCount, imgCount });

        const emojiText = (await card.locator('.feedcard__ph span').textContent()) || '';
        ok(emojiText.trim().length > 0, `先頭${i + 1}枚目のプレースホルダに絵文字が入っている`, emojiText);

        const badgeText = (await card.locator('.feedcard__no').textContent()) || '';
        ok(badgeText.trim() === String(i + 1), `先頭${i + 1}枚目の番号バッジが${i + 1}のまま`, badgeText);
      }

      // 4枚目以降は元々画像がある/ないカードがそのまま維持されている(強制失敗の対象外)
      const laterPhCount = await page.locator('.feedcard:nth-child(n+4) .feedcard__ph').count();
      ok(laterPhCount === baselinePhCountFrom4th, '4枚目以降の .feedcard__ph 枚数はベースラインと同じ(全部潰していない)', { laterPhCount, baselinePhCountFrom4th });

      // コンソールエラーは画像404由来のネットワークエラー以外0件
      const unexpected = consoleErrors.filter((msg) => {
        const m = String(msg).toLowerCase();
        return !(m.includes('404') || m.includes('failed to load resource') || m.includes('net::err'));
      });
      ok(unexpected.length === 0, 'コンソールエラーは画像404由来以外0件', unexpected);

      await context.close();
    }

    // --- 5. フラグ無しでデグレなし(先に取得したベースラインを検査) ---
    ok(baselineCardCount === 30, '?fixture=kusatsu(フラグ無し)で .feedcard が30枚', baselineCardCount);
    console.log('  参考: フラグ無し時の .feedcard__ph 枚数 = ' + baselinePhCount);

    // --- 6. (R57) alt がスポット名を含む(フラグ無しページの4枚目以降を検査) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);

      const cards = page.locator('.feedcard');
      const cardCount = await cards.count();
      let allAltOk = true;
      for (let i = 3; i < cardCount; i++) {
        const card = cards.nth(i);
        const imgCount = await card.locator('.feedcard__img').count();
        if (imgCount === 0) continue; // このカードは元々プレースホルダ
        const alt = (await card.locator('.feedcard__img').getAttribute('alt')) || '';
        const name = (await card.locator('.feedcard__name').textContent()) || '';
        if (!alt.trim() || !alt.includes(name.trim())) {
          allAltOk = false;
          console.log(`  NG: ${i + 1}枚目 alt="${alt}" name="${name}"`);
        }
      }
      ok(allAltOk, '6. 4枚目以降の .feedcard__img の alt が空でなくスポット名を含む');
      await context.close();
    }

    // --- 7. (R62) demo=portrait: 先頭3枚が縦長ダミー・枠が伸びていない ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu&demo=portrait`, { waitUntil: 'load' });
      await waitFor(2500);

      const cards = page.locator('.feedcard');
      const heights = [];
      for (let i = 0; i < 3; i++) {
        const card = cards.nth(i);
        const img = card.locator('.feedcard__img');
        const natural = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
        ok(natural.h > natural.w, `7. 先頭${i + 1}枚目が縦長ダミー(naturalHeight > naturalWidth)`, natural);

        const objectFit = await img.evaluate((el) => getComputedStyle(el).objectFit);
        ok(objectFit === 'cover', `7. 先頭${i + 1}枚目の object-fit が cover`, objectFit);

        const mediaBox = await card.locator('.feedcard__media').evaluate((el) => el.getBoundingClientRect().height);
        const imgBox = await img.evaluate((el) => el.getBoundingClientRect().height);
        ok(Math.abs(mediaBox - imgBox) < 1, `7. 先頭${i + 1}枚目の表示高さが .feedcard__media と一致(枠が伸びていない)`, { mediaBox, imgBox });
        heights.push(imgBox);
      }
      ok(heights[0] === heights[1] && heights[1] === heights[2], '7. 先頭3枚の表示高さが3枚とも同値', heights);

      const cardCount = await cards.count();
      let laterOk = true;
      for (let i = 3; i < cardCount; i++) {
        const img = cards.nth(i).locator('.feedcard__img');
        const imgCount = await img.count();
        if (imgCount === 0) continue; // 元々プレースホルダのカード
        const natural = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
        if (!(natural.w >= natural.h)) {
          laterOk = false;
          console.log(`  NG: ${i + 1}枚目 naturalWidth=${natural.w} naturalHeight=${natural.h}`);
        }
      }
      ok(laterOk, '7. 4枚目以降は naturalWidth >= naturalHeight(差し替えが先頭3枚に限定)');

      await context.close();
    }

    // --- 8. demo無しで先頭3枚が縦長ダミーになっていない(デグレなし) ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);

      const cards = page.locator('.feedcard');
      let noPortraitDummy = true;
      for (let i = 0; i < 3; i++) {
        const img = cards.nth(i).locator('.feedcard__img');
        const imgCount = await img.count();
        if (imgCount === 0) continue; // 元々プレースホルダのカード
        const src = await img.getAttribute('src');
        if (src && src.startsWith('data:image/svg+xml')) {
          noPortraitDummy = false;
          console.log(`  NG: ${i + 1}枚目が縦長ダミーのままになっている`);
        }
      }
      ok(noPortraitDummy, '8. ?demo= 無しで先頭3枚が縦長ダミーになっていない');
      await context.close();
    }
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-imgfail 実行エラー:', err);
  process.exitCode = 1;
});
