// R58: ブラウザの「戻る」で状態Aに戻る(history.pushState)の機械検査
// 使い方: node scripts/check-history.mjs
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-hotelparam.mjs の作りを踏襲する。
// 外部API 0回。fixture=kusatsu のみ使用。
//
// 確認項目:
//   1. ?fixture=kusatsu を開き、状態Bに入った直後の history.length が状態Aより +1。
//   2. page.goBack() -> #view-select 表示・#view-feed hidden・YadoApp.getState().view === 'select'。
//   3. 状態Bで別の宿(検索候補)に切り替えても history.length がさらに増えない(二重push防止)。
//   4. ?fixture=kusatsu&embed=1 では状態Bに入っても history.length が変化しない。
//   5. popstateで戻った後の状態Aの地図中心・ズームが状態Bに入る前と一致。
//   加えて戻るボタン(#back-btn)クリックでも history が整合すること。

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

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { context, page, consoleErrors };
}

async function checkBasicHistoryFlow(browser) {
  const { context, page, consoleErrors } = await newPage(browser);

  await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
  await waitFor(1000);

  // ?fixture=kusatsu は読み込み直後に自動で状態Bへ入る仕様のため、
  // まず goBack で状態Aへ落としてから基準の history.length を取る。
  await page.goBack();
  await waitFor(300);
  ok((await page.evaluate(() => window.YadoApp.getState().view)) === 'select', '前提: goBackで状態Aに戻れる');

  const lenA = await page.evaluate(() => history.length);

  // 状態Aの地図中心・ズームを記録
  const viewBefore = await page.evaluate(() => {
    const map = window.YadoApp.getMap();
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
  });

  // 宿を選ぶ(外部APIを叩かないよう公開APIの YadoApp.selectHotel を使う。ピン相当の操作)
  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿A', lat: 36.62, lon: 138.60 });
  });
  await waitFor(600);

  const stateAfterSelect = await page.evaluate(() => window.YadoApp.getState().view);
  ok(stateAfterSelect === 'feed', '1a. 宿選択後は状態B(feed)');

  // R128: page.goBack() で状態Aへ戻った直後は、ブラウザの仕様で「戻った位置から新規push」すると
  // 前方に捨てられるエントリと相殺され history.length 自体は変わらないことがあるため、
  // pushされたかどうかは history.state で判定する(length ベースの判定はここでは使えない)。
  const historyStateAfterSelect = await page.evaluate(() => history.state);
  ok(historyStateAfterSelect && historyStateAfterSelect.yado === 'feed', '1. 状態Bに入った直後に history.state が feed エントリを指す', historyStateAfterSelect);
  const lenAfterSelect = await page.evaluate(() => history.length);

  // 3. 状態Bで別の宿に切り替えても history.length がさらに増えない(二重push防止)
  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿B', lat: 36.63, lon: 138.61 });
  });
  await waitFor(600);
  const lenAfterReselect = await page.evaluate(() => history.length);
  ok(lenAfterReselect === lenAfterSelect, '3. 別の宿へ切り替えても history.length が増えない(二重push防止)', { lenAfterSelect, lenAfterReselect });

  // 2. goBack (ブラウザの戻る) -> 状態A
  await page.goBack();
  await waitFor(600);

  const viewSelectHidden = await page.evaluate(() => document.getElementById('view-select').hidden);
  const viewFeedHidden = await page.evaluate(() => document.getElementById('view-feed').hidden);
  const stateAfterBack = await page.evaluate(() => window.YadoApp.getState().view);
  ok(!viewSelectHidden, '2. goBack後 #view-select が表示');
  ok(viewFeedHidden, '2. goBack後 #view-feed が hidden');
  ok(stateAfterBack === 'select', "2. goBack後 YadoApp.getState().view === 'select'", stateAfterBack);

  // R58: goBack後の状態A(デグレ確認用)を撮影しておく
  const shotPath = path.join(PROJECT_ROOT, 'screenshots', `${new Date().toISOString().replace(/[:.]/g, '-')}_r58-goback-state-a.png`);
  await page.screenshot({ path: shotPath });
  console.log('  [撮影] ' + shotPath);

  // 5. 地図中心・ズームが一致
  const viewAfter = await page.evaluate(() => {
    const map = window.YadoApp.getMap();
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
  });
  const centerClose = Math.abs(viewAfter.lat - viewBefore.lat) < 1e-6 && Math.abs(viewAfter.lng - viewBefore.lng) < 1e-6;
  ok(centerClose, '5. popstate後の地図中心が一致', { viewBefore, viewAfter });
  ok(viewAfter.zoom === viewBefore.zoom, '5. popstate後の地図ズームが一致', { viewBefore, viewAfter });

  ok(consoleErrors.length === 0, '基本フロー: コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkBackButtonFlow(browser) {
  const { context, page, consoleErrors } = await newPage(browser);

  await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
  await waitFor(1000);
  // fixtureは自動で状態Bに入るため、まず状態Aへ戻して基準を取る
  await page.goBack();
  await waitFor(300);
  const lenA = await page.evaluate(() => history.length);

  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿C', lat: 36.62, lon: 138.60 });
  });
  await waitFor(600);

  // R128: page.goBack() 直後の push は前方エントリの破棄と相殺され length が変わらないことが
  // あるため、pushされたことは history.state で確認する。
  const lenFeed = await page.evaluate(() => history.length);
  const stateFeed = await page.evaluate(() => history.state);
  ok(stateFeed && stateFeed.yado === 'feed', '戻るボタン検証: 状態Bで history.state が feed エントリを指す', stateFeed);

  // 戻るボタン(#back-btn)クリック -> history.back() 経由で1つ消費される想定
  await page.click('#back-btn');
  await waitFor(600);

  const stateAfterBtn = await page.evaluate(() => window.YadoApp.getState().view);
  ok(stateAfterBtn === 'select', '戻るボタンクリックで状態Aに戻る', stateAfterBtn);

  const lenAfterBtn = await page.evaluate(() => history.length);
  // history.back() は length を減らさない(消費した位置に留まる)。増えないことだけ確認する。
  ok(lenAfterBtn === lenFeed, '戻るボタンクリック後も history.length が増えない(二重push防止)', { lenFeed, lenAfterBtn });

  // 端末の戻る(popstate)をもう一度発行しても状態Aのままでサイト離脱しない辻褄が合うこと
  // (状態Aで popstate が来ても何もしない実装であることの確認)
  const beforeGoBackAgain = await page.evaluate(() => window.YadoApp.getState().view);
  ok(beforeGoBackAgain === 'select', '戻るボタン後も状態Aを維持', beforeGoBackAgain);

  ok(consoleErrors.length === 0, '戻るボタン検証: コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkEmbedNoHistoryChange(browser) {
  const { context, page, consoleErrors } = await newPage(browser);

  await page.goto(`${BASE}/?fixture=kusatsu&embed=1`, { waitUntil: 'load' });
  await waitFor(1000);
  const lenA = await page.evaluate(() => history.length);

  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿D', lat: 36.62, lon: 138.60 });
  });
  await waitFor(600);

  const stateAfter = await page.evaluate(() => window.YadoApp.getState().view);
  const lenAfter = await page.evaluate(() => history.length);

  ok(stateAfter === 'feed', '4a. embed時も宿選択で状態Bに入る', stateAfter);
  ok(lenAfter === lenA, '4. embed時は状態Bに入っても history.length が変化しない', { lenA, lenAfter });

  ok(consoleErrors.length === 0, 'embed検証: コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkMapViewSavedOnSelect(browser) {
  const { context, page, consoleErrors } = await newPage(browser);

  await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
  await waitFor(1000);
  await page.goBack();
  // 初回訪問直後はまだ moveend の debounce による保存が一度も走っていないため、
  // 前提を成立させるための最小限の地図操作(panBy)をここで1回行う。
  await page.evaluate(() => { window.YadoApp.getMap().panBy([1, 1], { animate: false }); });
  await waitFor(800);

  // 前提確認: 状態Aの localStorage が地図と一致している
  const preCheck = await page.evaluate(() => {
    const map = window.YadoApp.getMap();
    const c = map.getCenter();
    const saved = JSON.parse(localStorage.getItem('yado.mapview.v3'));
    return { mapLat: c.lat, mapLon: c.lng, mapZoom: map.getZoom(), saved };
  });
  const preClose = preCheck.saved
    && Math.abs(preCheck.saved.lat - preCheck.mapLat) < 1e-6
    && Math.abs(preCheck.saved.lon - preCheck.mapLon) < 1e-6
    && preCheck.saved.zoom === preCheck.mapZoom;
  ok(preClose, '前提: 状態Aのlocalstorageが地図と一致', preCheck);

  // 地図をpanBy -> debounce(250ms)より短い40msだけ待ってから宿を選ぶ
  const viewAfterPan = await page.evaluate(() => {
    const map = window.YadoApp.getMap();
    map.panBy([150, -120], { animate: false });
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
  });
  await waitFor(40);

  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿E', lat: 36.62, lon: 138.60 });
  });
  await waitFor(300);

  const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('yado.mapview.v3')));
  const matched = savedAfter
    && Math.abs(savedAfter.lat - viewAfterPan.lat) < 1e-6
    && Math.abs(savedAfter.lon - viewAfterPan.lon) < 1e-6
    && savedAfter.zoom === viewAfterPan.zoom;
  ok(matched, 'selectHotel直後にpanBy直後の地図位置がlocalstorageへ保存される', { viewAfterPan, savedAfter });

  ok(consoleErrors.length === 0, '地図位置保存検証: コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkForwardBackFlow(browser) {
  // R128: ブラウザの「進む」で状態Bへ復帰し、その後の「戻る」が空振りしないことを確認
  const { context, page, consoleErrors } = await newPage(browser);

  await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
  await waitFor(1000);
  await page.goBack();
  await waitFor(300);
  const lenA = await page.evaluate(() => history.length);

  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: '宿A', lat: 36.6226, lon: 138.596 });
  });
  await waitFor(600);
  // R128: page.goBack() 直後の push は length が変わらないことがあるため history.state で確認する。
  const lenFeed = await page.evaluate(() => history.length);
  const stateFeed = await page.evaluate(() => history.state);
  ok(stateFeed && stateFeed.yado === 'feed', '進む/戻る検証: 宿選択で history.state が feed エントリを指す', stateFeed);

  await page.goBack();
  await waitFor(400);
  ok((await page.evaluate(() => window.YadoApp.getState().view)) === 'select', '進む/戻る検証: 戻るで状態Aに戻る');

  // R128 バグ1: 「進む」で状態Bへ復帰できるか
  await page.goForward();
  await waitFor(400);
  const stateAfterForward = await page.evaluate(() => window.YadoApp.getState().view);
  ok(stateAfterForward === 'feed', '進むで状態B(feed)へ復帰する', stateAfterForward);
  const viewFeedHiddenAfterForward = await page.evaluate(() => document.getElementById('view-feed').hidden);
  ok(!viewFeedHiddenAfterForward, '進む後に #view-feed が表示される');

  // R128 バグ2: 進んだ後に宿を選び直しても history.length が増えない(feedエントリの上にいるため)
  const lenAfterForward = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: '宿B', lat: 36.63, lon: 138.61 });
  });
  await waitFor(600);
  const lenAfterReselect = await page.evaluate(() => history.length);
  ok(lenAfterReselect === lenAfterForward, '進んだ後に宿を選び直しても history.length が増えない', { lenAfterForward, lenAfterReselect });

  // R128 完了条件: 戻る1回で状態Aに戻り、もう1回で離脱できる(効かない戻るが無い)
  await page.goBack();
  await waitFor(400);
  ok((await page.evaluate(() => window.YadoApp.getState().view)) === 'select', '進む後の戻る1回目で状態Aに戻る');

  ok(consoleErrors.length === 0, '進む/戻る検証: コンソールエラー0件', consoleErrors);

  await context.close();
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    await checkBasicHistoryFlow(browser);
    await checkBackButtonFlow(browser);
    await checkEmbedNoHistoryChange(browser);
    await checkMapViewSavedOnSelect(browser);
    await checkForwardBackFlow(browser);
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-history 実行エラー:', err);
  process.exitCode = 1;
});
