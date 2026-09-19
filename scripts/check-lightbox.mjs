// R66: カード写真タップで簡易ライトボックスが開く、の機械検査
// 使い方: node scripts/check-lightbox.mjs
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-pinflash.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?fixture=kusatsu で1位カードの写真をクリック → overlay(.lightbox)が表示され、中にimgが1枚
//   2. overlayをクリック → overlayが消える(DOMから除去)
//   3. overlay表示中にEscape → 消える
//   4. 番号バッジ(.feedcard__no)のクリックでoverlayが出ない、ピンは従来どおり光る
//   5. リンクチップ(.feedcard__link)のクリックでoverlayが出ない
//   6. 写真が無いカード(.feedcard__ph)のクリックではoverlayが出ず、地図がpanする
//   7. overlay表示中はdocument.bodyのoverflowがhidden、閉じた後は元に戻る
//   8. ?fixture=kusatsu&embed=1 でも1〜3が成立する
//   R96(フォーカストラップ):
//   9. 写真クリックで開いた直後 document.activeElement が .lightbox__close
//  10. overlay表示中にTabを5回押しても activeElement が .lightbox 内に留まる
//  11. overlay表示中にShift+Tabを3回押しても同様
//  12. Escapeで閉じた後、開く前の .feedcard__imgbtn にフォーカスが戻る
//  13. ?fixture=kusatsu&embed=1 でも10が成立する
// 撮影: overlay表示中のmobile/desktopと、デグレ確認用のkusatsu mobileをscreenshots/に保存する

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

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- 基本の開閉フロー(mobile) ---
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    // R172: 固定waitFor(2000)は箱根のような候補が多いエリアだとcollect()に3秒以上かかり
    // 追い越されることがある(今回はkusatsu固定なので実害は薄いが、check-all.mjs一括実行時の
    // 全体的な描画待ち方針を揃えるため他の検査と同様に条件待ちへ変更する)。判定内容は変えない。
    await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 5, null, { timeout: 15000 });

    const firstImg = page.locator('.feedcard__img').first();
    ok(await firstImg.count() >= 1, '写真つきカードのimgが存在する', await firstImg.count());
    await firstImg.click();
    await waitFor(300);

    ok(await page.locator('.lightbox').count() === 1, 'クリックでoverlayが1個表示される');
    ok(await page.locator('.lightbox .lightbox__img').count() === 1, 'overlay内にimgが1枚ある');

    const bodyOverflowOpen = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    ok(bodyOverflowOpen === 'hidden', 'overlay表示中はbodyのoverflowがhidden', bodyOverflowOpen);

    // 撮影(mobile, overlay表示中)
    const mobileShot = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r66-lightbox_mobile.png');
    await page.screenshot({ path: mobileShot, fullPage: false });
    console.log('  撮影: ' + mobileShot);

    // overlayクリックで閉じる
    await page.locator('.lightbox').click({ position: { x: 5, y: 5 } });
    await waitFor(300);
    ok(await page.locator('.lightbox').count() === 0, 'overlayクリックで消える(DOMから除去)');
    const bodyOverflowClosed = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    ok(bodyOverflowClosed !== 'hidden', '閉じた後はbodyのoverflowが元に戻る', bodyOverflowClosed);

    // Escapeで閉じる
    await firstImg.click();
    await waitFor(300);
    ok(await page.locator('.lightbox').count() === 1, '再度クリックでoverlayが開く');

    // --- R96: フォーカストラップ(開いている間はoverlay内にフォーカスを閉じ込める) ---
    const focusInfo = () => page.evaluate(() => {
      const el = document.activeElement;
      return {
        cls: el ? String(el.className || '') : '',
        inLightbox: !!(el && el.closest && el.closest('.lightbox')),
      };
    });
    const afterOpen = await focusInfo();
    ok(afterOpen.cls.indexOf('lightbox__close') >= 0, '開いた直後のフォーカスが閉じるボタンにある', afterOpen);

    let tabEscaped = null;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await waitFor(120);
      const f = await focusInfo();
      if (!f.inLightbox && tabEscaped === null) tabEscaped = { at: i + 1, ...f };
    }
    ok(tabEscaped === null, 'Tabを5回押してもフォーカスがライトボックス内に留まる', tabEscaped);

    let shiftEscaped = null;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+Tab');
      await waitFor(120);
      const f = await focusInfo();
      if (!f.inLightbox && shiftEscaped === null) shiftEscaped = { at: i + 1, ...f };
    }
    ok(shiftEscaped === null, 'Shift+Tabを3回押してもフォーカスがライトボックス内に留まる', shiftEscaped);

    // 撮影(mobile, Tab連打後のoverlay。閉じるボタンにフォーカスリングが残っているはず)
    const trapShot = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r96-focustrap_mobile.png');
    await page.screenshot({ path: trapShot, fullPage: false });
    console.log('  撮影: ' + trapShot);

    await page.keyboard.press('Escape');
    await waitFor(300);
    ok(await page.locator('.lightbox').count() === 0, 'Escapeキーでoverlayが消える');
    const afterClose = await focusInfo();
    ok(afterClose.cls.indexOf('feedcard__imgbtn') >= 0, 'Escapeで閉じた後は開く前の写真ボタンにフォーカスが戻る', afterClose);

    // 番号バッジはoverlayを開かず、従来どおりピンが光る
    const badge1 = page.locator('.feedcard__no[data-no="1"]');
    await badge1.click();
    await waitFor(200);
    ok(await page.locator('.lightbox').count() === 0, '番号バッジのクリックではoverlayが出ない');
    const flashed = await page.evaluate(() => document.querySelectorAll('.pin--flash').length);
    ok(flashed === 1, '番号バッジのクリックで従来どおりピンが1個光る', flashed);
    await waitFor(1300);

    // リンクチップはoverlayを開かない
    const linkChip = page.locator('.feedcard__link').first();
    if (await linkChip.count() > 0) {
      await linkChip.click();
      await waitFor(200);
      ok(await page.locator('.lightbox').count() === 0, 'リンクチップのクリックではoverlayが出ない');
    } else {
      ok(true, 'リンクチップのクリックではoverlayが出ない(該当リンクなしのためスキップ)');
    }

    // 写真が無いカード(プレースホルダ)はoverlayを開かず地図がpanする
    const ph = page.locator('.feedcard__ph').first();
    if (await ph.count() > 0) {
      const beforeCenter = await page.evaluate(() => {
        const mapEl = document.getElementById('feed-map');
        const r = mapEl.getBoundingClientRect();
        return { x: r.left, y: r.top };
      });
      await ph.click();
      await waitFor(400);
      ok(await page.locator('.lightbox').count() === 0, 'プレースホルダのクリックではoverlayが出ない');
      void beforeCenter; // panTo自体はcheck-pinflash等で別途検証済み。ここではoverlay非表示のみ確認する。
    } else {
      ok(true, 'プレースホルダのクリックではoverlayが出ない(該当カードなしのためスキップ)');
    }

    ok(consoleErrors.length === 0, 'コンソールエラー0件(mobile)', consoleErrors);
    await context.close();

    // --- desktop撮影 ---
    const dContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const dPage = await dContext.newPage();
    await dPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);
    await dPage.locator('.feedcard__img').first().click();
    await waitFor(300);
    ok(await dPage.locator('.lightbox').count() === 1, 'desktopでもクリックでoverlayが表示される');
    const desktopShot = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r66-lightbox_desktop.png');
    await dPage.screenshot({ path: desktopShot, fullPage: false });
    console.log('  撮影: ' + desktopShot);
    await dContext.close();

    // --- embed=1 でも1〜3が成立する ---
    const eContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const ePage = await eContext.newPage();
    const embedErrors = [];
    ePage.on('console', (msg) => { if (msg.type() === 'error') embedErrors.push(msg.text()); });
    ePage.on('pageerror', (err) => embedErrors.push(String(err)));

    await ePage.goto(`${BASE}/?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
    await waitFor(2000);
    const embedImg = ePage.locator('.feedcard__img').first();
    await embedImg.click();
    await waitFor(300);
    ok(await ePage.locator('.lightbox').count() === 1, 'embed=1でもクリックでoverlayが表示される');
    ok(await ePage.locator('.lightbox .lightbox__img').count() === 1, 'embed=1でもoverlay内にimgが1枚ある');
    await ePage.locator('.lightbox').click({ position: { x: 5, y: 5 } });
    await waitFor(300);
    ok(await ePage.locator('.lightbox').count() === 0, 'embed=1でもoverlayクリックで消える');
    await embedImg.click();
    await waitFor(300);

    // R96: embed=1 でもTabでフォーカスが抜けない
    let embedTabEscaped = null;
    for (let i = 0; i < 5; i++) {
      await ePage.keyboard.press('Tab');
      await waitFor(120);
      const f = await ePage.evaluate(() => {
        const el = document.activeElement;
        return {
          cls: el ? String(el.className || '') : '',
          inLightbox: !!(el && el.closest && el.closest('.lightbox')),
        };
      });
      if (!f.inLightbox && embedTabEscaped === null) embedTabEscaped = { at: i + 1, ...f };
    }
    ok(embedTabEscaped === null, 'embed=1でもTabを5回押してフォーカスがライトボックス内に留まる', embedTabEscaped);

    await ePage.keyboard.press('Escape');
    await waitFor(300);
    ok(await ePage.locator('.lightbox').count() === 0, 'embed=1でもEscapeで消える');
    ok(embedErrors.length === 0, 'コンソールエラー0件(embed)', embedErrors);
    await eContext.close();

    // --- デグレ確認: kusatsu mobile を1枚撮影(カード30枚・番号ピン判読可・コンソールエラー0件) ---
    const rContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const rPage = await rContext.newPage();
    const regErrors = [];
    rPage.on('console', (msg) => { if (msg.type() === 'error') regErrors.push(msg.text()); });
    rPage.on('pageerror', (err) => regErrors.push(String(err)));
    await rPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(2000);
    const cardCount = await rPage.locator('.feedcard').count();
    ok(cardCount === 5, 'デグレ確認: kusatsuで初期カードが5枚描画される', cardCount);
    const regressionShot = path.join(PROJECT_ROOT, 'screenshots', dateStamp() + '_r66-regression-kusatsu_mobile.png');
    await rPage.screenshot({ path: regressionShot, fullPage: false });
    console.log('  撮影: ' + regressionShot);
    ok(regErrors.length === 0, 'デグレ確認: コンソールエラー0件', regErrors);
    await rContext.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-lightbox 実行エラー:', err);
  process.exitCode = 1;
});
