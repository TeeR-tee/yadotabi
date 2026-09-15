// R26: README用スクリーンショット3枚(state-a / state-b / embed)を撮影する。
// 使い方: node scripts/make-readme-shots.mjs
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs の作りを踏襲する。
//
// 出力: docs/shots/state-a.jpg, docs/shots/state-b.jpg, docs/shots/embed.jpg
// いずれも viewport 375x780 / deviceScaleFactor 1 / jpeg quality 75 / 150KB以下

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS_DIR = path.join(PROJECT_ROOT, 'docs', 'shots');

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
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

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
    const context = await browser.newContext({
      viewport: { width: 375, height: 780 },
      deviceScaleFactor: 1,
    });

    // --- 状態A: 地図に宿ピンが実際に出ている状態(?q=草津温泉) ---
    // 外部API(Overpass)を叩く撮影は1サイクル最大2回まで。
    let stateAOk = false;
    for (let attempt = 1; attempt <= 2 && !stateAOk; attempt++) {
      const page = await context.newPage();
      try {
        await page.goto(`${BASE}/?q=%E8%8D%89%E6%B4%A5%E6%B8%A9%E6%B3%89`, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await waitFor(2000);
        const pinCount = await page.locator('.pin--hotel').count().catch(() => 0);
        console.log(`  状態A 試行${attempt}: 宿ピン候補 ${pinCount}件`);
        if (pinCount > 0) {
          await page.screenshot({ path: path.join(SHOTS_DIR, 'state-a.jpg'), type: 'jpeg', quality: 75 });
          stateAOk = true;
        }
      } catch (e) {
        console.log(`  状態A 試行${attempt} エラー: ${e.message}`);
      } finally {
        await page.close();
      }
    }
    if (!stateAOk) {
      console.log('  状態A: 宿ピンを確認できず。ROADMAPに起票して後回しにする。');
    }

    // --- 状態B: ?fixture=kusatsu(固定データ) ---
    {
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await waitFor(2000);
      await page.screenshot({ path: path.join(SHOTS_DIR, 'state-b.jpg'), type: 'jpeg', quality: 75 });
      await page.close();
    }

    // --- 埋め込みデモ: demo/hotel-page.html ---
    {
      const page = await context.newPage();
      await page.goto(`${BASE}/demo/hotel-page.html`, { waitUntil: 'load' });
      await waitFor(2000);
      await page.evaluate(() => {
        const h2 = Array.from(document.querySelectorAll('h2')).find((el) => el.textContent.includes('このお宿のまわり'));
        if (h2) h2.scrollIntoView({ block: 'start' });
      });
      await waitFor(2000);
      await page.screenshot({ path: path.join(SHOTS_DIR, 'embed.jpg'), type: 'jpeg', quality: 75 });
      await page.close();
    }

    await context.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  // サイズ確認
  for (const name of ['state-a.jpg', 'state-b.jpg', 'embed.jpg']) {
    const p = path.join(SHOTS_DIR, name);
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      console.log(`  ${name}: ${size} bytes${size > 150000 ? ' *** OVER 150KB ***' : ''}`);
    } else {
      console.log(`  ${name}: 未生成`);
    }
  }
}

main().catch((err) => {
  console.error('make-readme-shots 実行エラー:', err);
  process.exitCode = 1;
});
