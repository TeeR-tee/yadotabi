// R61: 状態Aの地図初期位置を「最近見た宿」があればそこにする機械検査
// 使い方: node scripts/check-initpos.mjs
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-recent.mjs の作りを踏襲する。
//
// ?demo=initpos は demoStateA=true・demoNoSaveView=true にするだけで、
// localStorage への投入は行わない(demo=recent と同じ方針)。テストは
// addInitScript で yado.recent.v3 / yado.mapview.v3 を事前投入する。
//
// 確認項目:
//   1. recent に道後(33.8520, 132.7860)1件、mapview なし → center が道後(誤差0.01以内)・zoom14
//   2. recent と mapview の両方あり → mapview が勝つ
//   3. どちらも無し → DEFAULT_VIEW(36.6226, 138.5960)
//   4. recent が []/壊れたJSON/座標欠落要素 → DEFAULT_VIEW にフォールバックし例外を投げない
//   5. ?q=箱根&demo=initpos で recent があっても URL 指定が勝つ
//   6. コンソールエラー0件

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

const DEFAULT_VIEW = { lat: 36.6226, lon: 138.5960, zoom: 14 };
const DOGO = { lat: 33.8520, lon: 132.7860 };

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

async function newPage(context) {
  const page = await context.newPage();
  // 外部APIは一切叩かない
  await page.route('**://nominatim.openstreetmap.org/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route('**://overpass-api.de/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"elements":[]}',
  }));
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { page, consoleErrors };
}

async function seedLocalStorage(context, { recent, mapview } = {}) {
  await context.addInitScript(({ recent, mapview }) => {
    try {
      if (recent !== undefined) window.localStorage.setItem('yado.recent.v3', recent);
      if (mapview !== undefined) window.localStorage.setItem('yado.mapview.v3', mapview);
    } catch (e) { /* ignore */ }
  }, { recent, mapview });
}

async function getCenter(page) {
  return page.evaluate(() => {
    const map = window.YadoApp.getMap();
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
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
    const allConsoleErrors = [];

    // --- 1. recent 1件、mapview なし → recent の道後 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await seedLocalStorage(context, {
        recent: JSON.stringify([{ name: '道後温泉本館', lat: DOGO.lat, lon: DOGO.lon, kind: 'hotel' }]),
      });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=initpos`, { waitUntil: 'load' });
      await waitFor(600);
      const center = await getCenter(page);
      ok(Math.abs(center.lat - DOGO.lat) < 0.01 && Math.abs(center.lon - DOGO.lon) < 0.01,
        '1. recentのみ → centerが道後(誤差0.01以内)', center);
      ok(center.zoom === DEFAULT_VIEW.zoom, '1. zoomが既定(14)', center.zoom);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 2. recent と mapview 両方あり → mapview が勝つ ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const mapview = { lat: 43.0000, lon: 141.0000, zoom: 10 };
      await seedLocalStorage(context, {
        recent: JSON.stringify([{ name: '道後温泉本館', lat: DOGO.lat, lon: DOGO.lon, kind: 'hotel' }]),
        mapview: JSON.stringify(mapview),
      });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=initpos`, { waitUntil: 'load' });
      await waitFor(600);
      const center = await getCenter(page);
      ok(Math.abs(center.lat - mapview.lat) < 0.001 && Math.abs(center.lon - mapview.lon) < 0.001,
        '2. mapviewありならmapviewが勝つ', center);
      ok(center.zoom === mapview.zoom, '2. zoomもmapview優先', center.zoom);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 3. どちらも無し → DEFAULT_VIEW ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=initpos`, { waitUntil: 'load' });
      await waitFor(600);
      const center = await getCenter(page);
      ok(Math.abs(center.lat - DEFAULT_VIEW.lat) < 0.001 && Math.abs(center.lon - DEFAULT_VIEW.lon) < 0.001,
        '3. どちらも無し → DEFAULT_VIEW', center);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 4. recent が壊れている/空/座標欠落 → DEFAULT_VIEW にフォールバック(例外なし) ---
    const brokenCases = [
      { label: '空配列', value: JSON.stringify([]) },
      { label: '壊れたJSON', value: '{not valid json' },
      { label: '座標欠落要素', value: JSON.stringify([{ name: '座標なし宿' }]) },
      { label: 'null要素', value: JSON.stringify([null]) },
    ];
    for (const c of brokenCases) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await seedLocalStorage(context, { recent: c.value });
      const { page, consoleErrors } = await newPage(context);
      await page.goto(`${BASE}/?demo=initpos`, { waitUntil: 'load' });
      await waitFor(600);
      const center = await getCenter(page);
      ok(Math.abs(center.lat - DEFAULT_VIEW.lat) < 0.001 && Math.abs(center.lon - DEFAULT_VIEW.lon) < 0.001,
        `4. recentが${c.label} → DEFAULT_VIEWにフォールバック`, center);
      ok(consoleErrors.length === 0, `4. recentが${c.label}で例外を投げない`, consoleErrors);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 5. ?q=箱根&demo=initpos で recent があっても URL 指定が勝つ ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await seedLocalStorage(context, {
        recent: JSON.stringify([{ name: '道後温泉本館', lat: DOGO.lat, lon: DOGO.lon, kind: 'hotel' }]),
      });
      const { page, consoleErrors } = await newPage(context);
      // ?q= のジオコーディング(Nominatim)は空応答にしてあるので、フォールバック無しでも
      // 「初期表示が道後のまま固定されない(=URL処理が動いている)」ことを見る。
      // q自体の解決は外部APIが必要なため、ここでは「initposのrecentが素通りせず
      // 検索欄にqが反映されている」ことで代替確認する。
      await page.goto(`${BASE}/?q=%E7%AE%B1%E6%A0%B9&demo=initpos`, { waitUntil: 'load' });
      await waitFor(600);
      const qValue = await page.locator('#search-input').inputValue();
      ok(qValue === '箱根', '5. ?q=箱根が優先されsearch-inputに反映される', qValue);
      allConsoleErrors.push(...consoleErrors);
      await context.close();
    }

    // --- 6. コンソールエラー0件(全ページ通算) ---
    ok(allConsoleErrors.length === 0, '6. コンソールエラー0件', allConsoleErrors);

  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-initpos 実行エラー:', err);
  process.exitCode = 1;
});
