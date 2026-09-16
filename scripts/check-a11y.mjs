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
import { ensureServer } from './lib/server.mjs';

let BASE;
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

// BASE は ensureServer() で決まるので、モジュール読み込み時ではなく main() 内で組み立てる
const PAGE_QUERIES = [
  { query: '?fixture=kusatsu', label: '?fixture=kusatsu(状態B)' },
  { query: '?demo=zoomout', label: '?demo=zoomout(状態A)' },
  { query: '?demo=suggest', label: '?demo=suggest(検索候補)' },
  { query: '?demo=recentmix', label: '?demo=recentmix(最近+候補の統合)' },
  { query: '?fixture=hakone&demo=far', label: '?fixture=hakone&demo=far(もっと遠く)' },
];

// R129: 横向きスマホで1枚目カードが読める高さになっているかの機械検査。
// 812x375/667x375(横)は可視高さ150px以上、375x812(縦)は基準どおり220pxの地図高さのまま
// (=横向き対応で縦向きが1pxも変わっていないこと)を確認する。
const LANDSCAPE_MIN_VISIBLE = 150;
const PORTRAIT_FEEDMAP_HEIGHT = 220;
const LANDSCAPE_CASES = [
  { width: 812, height: 375, label: '812x375(横)', kind: 'landscape' },
  { width: 667, height: 375, label: '667x375(横・SE)', kind: 'landscape' },
  { width: 375, height: 812, label: '375x812(縦・デグレ確認)', kind: 'portrait' },
];

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;
  const PAGES = PAGE_QUERIES.map((p) => ({ url: `${BASE}/${p.query}`, label: p.label }));

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

    // R129: 横向き(高さ500px以下)で1枚目カードが読めるか、縦向きは無変化かを検査
    const landscapeUrl = `${BASE}/?fixture=kusatsu`;
    for (const c of LANDSCAPE_CASES) {
      const context = await browser.newContext({
        viewport: { width: c.width, height: c.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto(landscapeUrl, { waitUntil: 'load' });
      await waitFor(1500);

      const info = await page.evaluate(() => {
        const feedmap = document.querySelector('.feedmap');
        const card = document.querySelector('.feedcard[data-index="0"]');
        const fm = feedmap ? feedmap.getBoundingClientRect() : null;
        const cr = card ? card.getBoundingClientRect() : null;
        const vh = window.innerHeight;
        return {
          feedmapHeight: fm ? fm.height : null,
          cardVisible: cr ? Math.max(0, Math.min(cr.bottom, vh) - Math.max(cr.top, 0)) : null,
        };
      });

      if (c.kind === 'landscape') {
        const ok = info.cardVisible !== null && info.cardVisible >= LANDSCAPE_MIN_VISIBLE;
        console.log(`[${ok ? 'OK' : 'NG'}] ${c.label} 1枚目カードの可視高さ: ${info.cardVisible == null ? '(なし)' : info.cardVisible.toFixed(1)}px (基準${LANDSCAPE_MIN_VISIBLE}px以上)`);
        if (!ok) hasFailure = true;
      } else {
        const ok = info.feedmapHeight !== null && Math.abs(info.feedmapHeight - PORTRAIT_FEEDMAP_HEIGHT) < 0.5;
        console.log(`[${ok ? 'OK' : 'NG'}] ${c.label} .feedmap 高さ: ${info.feedmapHeight}px (基準${PORTRAIT_FEEDMAP_HEIGHT}pxのまま=デグレなし)`);
        if (!ok) hasFailure = true;
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await stop();
  }

  process.exitCode = hasFailure ? 1 : 0;
  console.log(hasFailure ? '結果: NG あり' : '結果: 全件 OK');
}

main().catch((err) => {
  console.error('check-a11y 実行エラー:', err);
  process.exitCode = 1;
});
