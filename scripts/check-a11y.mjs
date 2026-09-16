// R13: タップ領域44pxの機械検査
// 使い方: node scripts/check-a11y.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。
// 375px 幅(モバイル)で ?fixture=kusatsu(状態B)と ?demo=zoomout(状態A・チップ)を開き、
// 対象セレクタの当たり判定の高さを測る。44px 未満が1件でもあれば NG。

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const MIN_HEIGHT = 44;

// セレクタごとに「当たり判定の高さ」を測る方法を分ける。
// feedcard__link は見た目を太らせない方針で ::after を使ったので、
// ::after の高さ(44px固定)を計測対象にする。
const TARGETS = [
  { selector: '.topbar__back', label: '戻るボタン' },
  { selector: '.chip', label: 'エリアチップ' },
  { selector: '.feedcard__link', label: 'リンクチップ', usePseudo: true },
  { selector: '.feedcard__no', label: '番号バッジ', usePseudo: true },
  { selector: '.suggest__item', label: '検索候補の行' },
  { selector: '.pickbar__clear', label: '検索クリアボタン' },
  { selector: '.far__summary', label: 'もっと遠くの開閉' },
  { selector: '.far__item a', label: 'もっと遠くの各リンク' },
  { selector: '.morebtn', label: 'もっと見る' },
  { selector: '#feed-note a', label: '提案の作り方リンク' },
  { selector: '.samples a', label: 'サンプル導線' },
];

// aria-label が空でないことを確かめる対象(高さ検査とは別立て)
const LABEL_TARGETS = [
  { selector: '.topbar__back', label: '戻るボタン' },
];

const PAGES = [
  { url: `${BASE}/?fixture=kusatsu`, label: '?fixture=kusatsu(状態B)' },
  { url: `${BASE}/?demo=zoomout`, label: '?demo=zoomout(状態A)' },
  { url: `${BASE}/?demo=suggest`, label: '?demo=suggest(検索候補)' },
  { url: `${BASE}/?demo=recentmix`, label: '?demo=recentmix(最近+候補の統合)' },
  { url: `${BASE}/?fixture=hakone&demo=far`, label: '?fixture=hakone&demo=far(もっと遠く)' },
];

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
    const projectRoot = fileURLToPath(new URL('..', import.meta.url));
    serverProc = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    // 起動待ち(最大5秒)
    for (let i = 0; i < 25; i++) {
      if (await isPortOpen(PORT)) break;
      await waitFor(200);
    }
  }

  let hasFailure = false;
  const browser = await chromium.launch();
  try {
    for (const pageInfo of PAGES) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(pageInfo.url, { waitUntil: 'load' });
      await waitFor(1500);

      for (const target of TARGETS) {
        const heights = await page.evaluate(({ selector, usePseudo }) => {
          const els = Array.from(document.querySelectorAll(selector))
            // 非表示の状態(state A/B の反対側)にある要素は測定対象から除く
            .filter((el) => el.offsetParent !== null);
          return els.map((el) => {
            if (usePseudo) {
              const after = window.getComputedStyle(el, '::after');
              const h = parseFloat(after.height);
              if (!Number.isNaN(h) && h > 0) return h;
            }
            return el.getBoundingClientRect().height;
          });
        }, { selector: target.selector, usePseudo: !!target.usePseudo });

        if (heights.length === 0) {
          console.log(`[SKIP] ${pageInfo.label} ${target.label}(${target.selector}): 表示要素なし`);
          continue;
        }
        const minHeight = Math.min(...heights);
        const ok = minHeight >= MIN_HEIGHT;
        console.log(`[${ok ? 'OK' : 'NG'}] ${pageInfo.label} ${target.label}(${target.selector}): 最小 ${minHeight.toFixed(1)}px (件数${heights.length})`);
        if (!ok) hasFailure = true;
      }

      for (const target of LABEL_TARGETS) {
        const labels = await page.evaluate((selector) => {
          const els = Array.from(document.querySelectorAll(selector))
            .filter((el) => el.offsetParent !== null);
          return els.map((el) => el.getAttribute('aria-label'));
        }, target.selector);

        if (labels.length === 0) {
          console.log(`[SKIP] ${pageInfo.label} ${target.label} の aria-label: 表示要素なし`);
          continue;
        }
        const ok = labels.every((label) => !!label);
        console.log(`[${ok ? 'OK' : 'NG'}] ${pageInfo.label} ${target.label} の aria-label: ${JSON.stringify(labels)}`);
        if (!ok) hasFailure = true;
      }

      await context.close();
    }
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  process.exitCode = hasFailure ? 1 : 0;
  console.log(hasFailure ? '結果: NG あり' : '結果: 全件 OK');
}

main().catch((err) => {
  console.error('check-a11y 実行エラー:', err);
  process.exitCode = 1;
});
