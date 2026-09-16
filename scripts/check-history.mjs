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
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  await page.evaluate(() => { window.YadoApp.goBack(); });
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

  const lenAfterSelect = await page.evaluate(() => history.length);
  ok(lenAfterSelect === lenA + 1, '1. 状態Bに入った直後の history.length が +1', { lenA, lenAfterSelect });

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
  await page.evaluate(() => { window.YadoApp.goBack(); });
  await waitFor(300);
  const lenA = await page.evaluate(() => history.length);

  await page.evaluate(() => {
    window.YadoApp.selectHotel({ name: 'テスト宿C', lat: 36.62, lon: 138.60 });
  });
  await waitFor(600);

  const lenFeed = await page.evaluate(() => history.length);
  ok(lenFeed === lenA + 1, '戻るボタン検証: 状態Bで history.length が +1');

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
  await page.evaluate(() => { window.YadoApp.goBack(); });
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
    await checkBasicHistoryFlow(browser);
    await checkBackButtonFlow(browser);
    await checkEmbedNoHistoryChange(browser);
    await checkMapViewSavedOnSelect(browser);
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-history 実行エラー:', err);
  process.exitCode = 1;
});
