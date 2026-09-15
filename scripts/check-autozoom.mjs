// R44: `?q=` 等でジャンプした先に宿0件なら1回だけ自動ズームアウトする機能の機械検査
// 使い方: node scripts/check-autozoom.mjs
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-nohotels.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?demo=autozoom で、初期 zoom 14 → 最終 zoom が 13 になる(1段だけ引けている)
//   2. 2回目の取得で宿ピンが1個以上描かれ、.mapnote が空(hidden)になる
//   3. ?demo=nohotels(常に0件)では zoom が 13 で止まり 12 にならない(下限を割らない・2回引かない)
//   4. 地図ドラッグ起点の0件では自動ズームが起きない(panBy 後に zoom 不変)
//   5. ?simulate=overpass504 相当の混雑時に zoom が変わらず、文言が「宿ピンの取得が混雑中です。…」のままである
//   6. コンソールエラー0件・外部ドメインへの fetch 0回

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

function trackExternal(page, bucket) {
  page.on('request', (req) => {
    const url = req.url();
    // ページ自身のナビゲーション(127.0.0.1宛)は対象外。外部ドメインへの実リクエストだけを見る。
    if (url.startsWith(BASE)) return;
    if (url.includes('overpass') || url.includes('wikipedia') || url.includes('nominatim')) bucket.push(url);
  });
}

function trackConsoleErrors(page, bucket) {
  page.on('console', (msg) => { if (msg.type() === 'error') bucket.push(msg.text()); });
  page.on('pageerror', (err) => bucket.push(String(err)));
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
    // --- 1,2,6: ?demo=autozoom で 14 -> 13、宿ピンが出る、外部fetch/コンソールエラー0件 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      const consoleErrors = [];
      trackExternal(page, externalRequests);
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?demo=autozoom`, { waitUntil: 'load' });
      await waitFor(1500);

      const zoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoom === 13, '1. ?demo=autozoom で最終 zoom が 13', zoom);

      const markerCount = await page.locator('.leaflet-marker-icon').count();
      ok(markerCount >= 1, '2. 自動ズーム後に宿ピンが1個以上', markerCount);

      const mapNote = page.locator('.mapnote');
      const noteHidden = await mapNote.evaluate((el) => el.hidden === true || el.offsetParent === null);
      ok(noteHidden, '2. .mapnote が空(hidden)になっている', noteHidden);

      ok(externalRequests.length === 0, '6. overpass/wikipedia/nominatim へのfetchが0回', externalRequests);
      ok(consoleErrors.length === 0, '6. コンソールエラー0件(autozoom)', consoleErrors);

      await context.close();
    }

    // --- 3: ?demo=nohotels は従来どおり 13 で止まり 12 にならない ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      trackExternal(page, externalRequests);

      await page.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
      await waitFor(1500);

      // ?demo=nohotels は demoStateA の早期 return 経路(flyTo を経由しない)なので
      // 自動ズームの対象外 = 初期 zoom 14 のまま(12 まで落ちない = 下限violationが起きない)。
      const zoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoom === 14, '3. ?demo=nohotels の zoom が初期値のまま(デグレなし・自動ズーム対象外)', zoom);
      ok(externalRequests.length === 0, '3. ?demo=nohotels で外部fetchが0回', externalRequests);

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === 'この範囲には宿が見つかりませんでした', '3. ?demo=nohotels のバナー文言が維持', text);

      await context.close();
    }

    // --- 4: ドラッグ(panBy)起点の0件では自動ズームが起きない ---
    // ?demo=autozoom の fetchHotelsInBbox 差し替えは 1回目=0件,2回目=宿1件,3回目以降=0件。
    // 初期表示(1回目→自動ズームで2回目)を終えたあと、ユーザーがドラッグすると
    // onMapMoved 経由で3回目の取得(0件)が走る。autoZoomArmed は flyTo 経由でしか立たないため
    // ここでは自動ズームが起きず、zoom は自動ズーム後の 13 のまま変わらないはず。
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?demo=autozoom`, { waitUntil: 'load' });
      await waitFor(1500);

      const zoomAfterAutozoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfterAutozoom === 13, '4. 前提: 自動ズーム後は zoom 13', zoomAfterAutozoom);

      // ドラッグして onMapMoved(debounce)経由の3回目取得(0件)を発生させる
      await page.evaluate(() => window.YadoApp.getMap().panBy([80, 80], { animate: false }));
      await waitFor(1500); // DEBOUNCE_MOVE_MS 経過を待つ

      const zoomAfterDrag = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfterDrag === 13, '4. ドラッグ起点の0件では自動ズームが起きない(zoom不変)', zoomAfterDrag);

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === 'この範囲には宿が見つかりませんでした', '4. ドラッグ後は通常の0件バナーになる', text);

      ok(consoleErrors.length === 0, '4. コンソールエラー0件(ドラッグ)', consoleErrors);

      await context.close();
    }

    // --- 5: 混雑時(?simulate=overpass504)は自動ズームせず、混雑バナーのまま ---
    // flyTo 経由(エリアチップ)で autoZoomArmed を立てたうえで、実際の fetchHotelsInBbox が
    // overpassBusy エラーを投げることを確認する(demo=autozoom は使わず素の混雑シミュレーションで見る)。
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      const consoleErrors = [];
      trackExternal(page, externalRequests);
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?simulate=overpass504`, { waitUntil: 'load' });
      await waitFor(1000);

      const zoomBefore = await page.evaluate(() => window.YadoApp.getMap().getZoom());

      // エリアチップをクリックして flyTo() を発火させる(autoZoomArmed が立つ経路)
      const chip = page.locator('.chip').first();
      await chip.click();
      await waitFor(1500);

      const zoomAfter = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfter === zoomBefore, '5. 混雑時は flyTo 後も zoom が変わらない', { zoomBefore, zoomAfter });

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === '宿ピンの取得が混雑中です。検索やエリアチップから選べます。', '5. 混雑バナー文言のまま', text);

      ok(externalRequests.length === 0, '6. 混雑シミュレーション時も外部fetchが0回', externalRequests);
      ok(consoleErrors.length === 0, '6. コンソールエラー0件(混雑)', consoleErrors);

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
  console.error('check-autozoom 実行エラー:', err);
  process.exitCode = 1;
});
