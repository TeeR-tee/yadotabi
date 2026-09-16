// R69: キーボード操作の検査
// 使い方: node scripts/check-keyboard.mjs
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-sample.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu(状態B)で Tab を繰り返し、到達順がカード単位で単調に進む
//      (1枚目の要素より先に2枚目の要素が出てこない)
//   2. 1枚目の .feedcard__imgbtn に到達でき、Enter でライトボックスが開き、
//      Escape で閉じ、フォーカスが .feedcard__imgbtn に戻る
//   3. .feedcard__no にフォーカスして Enter で .pin--flash が付く
//   4. Tab を押し続けて #more-btn に到達でき、Enter で .feedcard が60枚になる
//   5. ?demo=zoomout(状態A)で #search-input → .chip → .samples a の順に到達できる。
//      検索欄に1文字入れると #search-clear がTab対象に加わる
//   6. .feedcard__imgbtn と #more-btn にフォーカスした状態で outlineWidth が 0px でない
//   7. 各ケースでコンソールエラー0件
// 撮影: .feedcard__imgbtn フォーカス時と #more-btn フォーカス時の2枚を
//   screenshots/r69-focus-img_mobile.png / r69-focus-more_mobile.png に保存する

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
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

async function activeInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      tagName: el.tagName,
      className: el.className || '',
      id: el.id || '',
      cardIndex: (() => {
        const art = el.closest('.feedcard');
        return art ? Number(art.dataset.index) : -1;
      })(),
    };
  });
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
    // --- 状態B: 到達順とカード単位の単調増加 ---
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);

    const trail = [];
    let maxCardIndex = -1;
    let monotonicOk = true;
    let sawImgBtn = false;
    let firstImgBtnHandle = null;

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await activeInfo(page);
      if (!info) continue;
      trail.push(info);
      if (info.cardIndex >= 0) {
        if (info.cardIndex < maxCardIndex) monotonicOk = false;
        maxCardIndex = Math.max(maxCardIndex, info.cardIndex);
      }
      if (!sawImgBtn && info.className.indexOf('feedcard__imgbtn') >= 0) {
        sawImgBtn = true;
        firstImgBtnHandle = await page.evaluateHandle(() => document.activeElement);
      }
    }
    console.log('  到達順(先頭20件): ' + JSON.stringify(trail.slice(0, 20).map((t) => t.className || t.tagName)));
    ok(trail.some((t) => t.id === 'back-btn'), '1. #back-btn に到達できる');
    ok(sawImgBtn, '1. .feedcard__imgbtn に到達できる(A修正の回帰確認)');
    ok(monotonicOk, '1. カード単位で到達順が単調に進む(1枚目より先に2枚目が出ない)', trail.map((t) => t.cardIndex));

    // --- 2. 写真ボタンでライトボックスの開閉とフォーカス移動 ---
    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);
    let reachedImgBtn = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const info = await activeInfo(page);
      if (info && info.className.indexOf('feedcard__imgbtn') >= 0) { reachedImgBtn = true; break; }
    }
    ok(reachedImgBtn, '2. Tabで .feedcard__imgbtn に到達できる');

    const focusOutline = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? getComputedStyle(el).outlineWidth : '0px';
    });
    ok(focusOutline !== '0px', '6. .feedcard__imgbtn フォーカス時に outlineWidth が 0px でない', focusOutline);

    // 撮影: 写真ボタンにフォーカスした状態
    const imgFocusShot = path.join(PROJECT_ROOT, 'screenshots', 'r69-focus-img_mobile.png');
    await page.screenshot({ path: imgFocusShot, fullPage: false });
    console.log('  撮影: ' + imgFocusShot);

    await page.keyboard.press('Enter');
    await waitFor(300);
    ok(await page.locator('.lightbox').count() === 1, '2. Enterでライトボックスが開く');

    await page.keyboard.press('Escape');
    await waitFor(300);
    ok(await page.locator('.lightbox').count() === 0, '2. Escapeでライトボックスが閉じる');

    const returnedToImgBtn = await page.evaluate(() => {
      const el = document.activeElement;
      return !!(el && el.className && el.className.indexOf('feedcard__imgbtn') >= 0);
    });
    ok(returnedToImgBtn, '2. 閉じた後フォーカスが .feedcard__imgbtn に戻る');
    void firstImgBtnHandle;

    // --- 3. 番号バッジにフォーカスしてEnterでpin--flash ---
    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);
    await page.locator('.feedcard__no[data-no="1"]').focus();
    await page.keyboard.press('Enter');
    await waitFor(200);
    const flashed = await page.evaluate(() => document.querySelectorAll('.pin--flash').length);
    ok(flashed === 1, '3. .feedcard__no にフォーカスしEnterで.pin--flashが付く', flashed);
    await waitFor(1300);

    // --- 4. #more-btn に到達しEnterで60枚に展開 ---
    let reachedMoreBtn = false;
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press('Tab');
      const info = await activeInfo(page);
      if (info && info.id === 'more-btn') { reachedMoreBtn = true; break; }
    }
    ok(reachedMoreBtn, '4. Tabで #more-btn に到達できる');

    if (reachedMoreBtn) {
      const moreOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
      ok(moreOutline !== '0px', '6. #more-btn フォーカス時に outlineWidth が 0px でない', moreOutline);

      const moreFocusShot = path.join(PROJECT_ROOT, 'screenshots', 'r69-focus-more_mobile.png');
      await page.screenshot({ path: moreFocusShot, fullPage: false });
      console.log('  撮影: ' + moreFocusShot);

      await page.keyboard.press('Enter');
      await waitFor(500);
      const cardCount = await page.locator('.feedcard').count();
      ok(cardCount === 60, '4. Enterで.feedcardが60枚になる', cardCount);
    } else {
      ok(false, '6. #more-btn フォーカス時に outlineWidth が 0px でない(未到達のためスキップ扱い)');
      ok(false, '4. Enterで.feedcardが60枚になる(未到達のためスキップ扱い)');
    }

    ok(consoleErrors.length === 0, '状態B: コンソールエラー0件', consoleErrors);
    await context.close();

    // --- 5. 状態A: 到達順と検索欄クリア ---
    const aContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const aPage = await aContext.newPage();
    const aErrors = [];
    aPage.on('console', (msg) => { if (msg.type() === 'error') aErrors.push(msg.text()); });
    aPage.on('pageerror', (err) => aErrors.push(String(err)));

    await aPage.goto(`${BASE}/?demo=zoomout`, { waitUntil: 'load' });
    await waitFor(1500);

    await aPage.locator('#search-input').focus();
    let searchFocused = await aPage.evaluate(() => document.activeElement && document.activeElement.id === 'search-input');
    ok(searchFocused, '5. #search-input にフォーカスできる', searchFocused);

    await aPage.keyboard.press('Tab');
    let afterSearchNoText = await activeInfo(aPage);
    ok(afterSearchNoText && afterSearchNoText.className.indexOf('chip') >= 0, '5. 未入力時は#search-inputの次に.chipへ進む(#search-clearは無い)', afterSearchNoText);

    await aPage.locator('#search-input').focus();
    await aPage.keyboard.type('a');
    await waitFor(200);
    await aPage.keyboard.press('Tab');
    const afterSearchWithText = await activeInfo(aPage);
    ok(afterSearchWithText && afterSearchWithText.id === 'search-clear', '5. 1文字入力後は#search-clearがTab対象に加わる', afterSearchWithText);

    // チップとサンプルリンクへ到達できることを確認する(状態Aの残りの到達順)
    let sawChip = false;
    let sawSampleLink = false;
    for (let i = 0; i < 30; i++) {
      const info = await activeInfo(aPage);
      if (info && info.className.indexOf('chip') >= 0) sawChip = true;
      if (info && info.tagName === 'A' && (await aPage.evaluate(() => {
        const el = document.activeElement;
        return !!(el && el.closest('.samples'));
      }))) sawSampleLink = true;
      if (sawSampleLink) break;
      await aPage.keyboard.press('Tab');
    }
    ok(sawChip, '5. .chip に到達できる');
    ok(sawSampleLink, '5. .samples a に到達できる');

    ok(aErrors.length === 0, '状態A: コンソールエラー0件', aErrors);
    await aContext.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-keyboard 実行エラー:', err);
  process.exitCode = 1;
});
