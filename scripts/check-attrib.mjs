// R31: 状態Bの小地図にOSM帰属表示(attribution)が存在し、かつピンと重ならないことの機械検査
// 使い方: node scripts/check-attrib.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-pinflash.mjs の作りを踏襲する。
//
// 確認項目(各URLごと):
//   (a) #feed-map .leaflet-control-attribution が存在する
//   (b) そのテキストに OpenStreetMap を含む
//   (c) getComputedStyle で display!=='none' / visibility!=='hidden' / opacity>0.5 (非表示化されていない)
//   (d) getBoundingClientRect() が #feed-map 内の全 .pin の rect と1つも交差しない
//   (e) コンソールエラー0件
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

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function checkUrl(browser, url, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(url, { waitUntil: 'load' });
  await waitFor(2000);

  const info = await page.evaluate(() => {
    const feedMap = document.getElementById('feed-map');
    if (!feedMap) return { hasMap: false };
    const attrib = feedMap.querySelector('.leaflet-control-attribution');
    if (!attrib) return { hasMap: true, hasAttrib: false };
    const cs = window.getComputedStyle(attrib);
    const rect = attrib.getBoundingClientRect();
    const pins = Array.from(feedMap.querySelectorAll('.pin')).map((p) => p.getBoundingClientRect());
    return {
      hasMap: true,
      hasAttrib: true,
      text: attrib.textContent || '',
      display: cs.display,
      visibility: cs.visibility,
      opacity: parseFloat(cs.opacity),
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      pinRects: pins.map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
    };
  });

  ok(info.hasMap === true, `[${label}] #feed-map が存在する`, info);
  ok(info.hasAttrib === true, `[${label}] .leaflet-control-attribution が存在する`, info.hasAttrib);
  if (info.hasAttrib) {
    ok(/OpenStreetMap/.test(info.text), `[${label}] 帰属テキストにOpenStreetMapを含む`, info.text);
    ok(info.display !== 'none', `[${label}] display!=='none'`, info.display);
    ok(info.visibility !== 'hidden', `[${label}] visibility!=='hidden'`, info.visibility);
    ok(info.opacity > 0.5, `[${label}] opacity>0.5`, info.opacity);

    const overlaps = info.pinRects.filter((p) => rectsIntersect(info.rect, p));
    ok(overlaps.length === 0, `[${label}] 帰属表示がピンと重ならない`, { attribRect: info.rect, overlaps });
  }

  ok(consoleErrors.length === 0, `[${label}] コンソールエラー0件`, consoleErrors);

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
    await checkUrl(browser, `${BASE}/?fixture=kusatsu`, 'kusatsu');
    await checkUrl(browser, `${BASE}/?fixture=hakone`, 'hakone');
    await checkUrl(browser, `${BASE}/?fixture=dogo`, 'dogo');
    await checkUrl(browser, `${BASE}/?fixture=kusatsu&embed=1`, 'kusatsu-embed');
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-attrib 実行エラー:', err);
  process.exitCode = 1;
});
