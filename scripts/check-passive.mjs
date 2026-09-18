// F3: 受動ログ(localStorage yado.passive.v1)の機械検査
// 使い方: node scripts/check-passive.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-a11y.mjs の作りを踏襲する。

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

let BASE;
const PASSIVE_KEY = 'yado.passive.v1';

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPassive(page) {
  return page.evaluate((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, PASSIVE_KEY);
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  let hasFailure = false;
  const check = (label, ok, detail) => {
    console.log(`[${ok ? 'OK' : 'NG'}] ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) hasFailure = true;
  };

  const browser = await chromium.launch();
  try {
    // 1〜4: 通常の記録の検査
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 30, null, { timeout: 15000 });

      // 2) view レコード
      let list = await readPassive(page);
      const views = (list || []).filter((e) => e.type === 'view');
      check('view レコードがちょうど1件', views.length === 1, `件数=${views.length}`);
      if (views.length) {
        const v = views[0];
        check('view.topIds が10件', Array.isArray(v.topIds) && v.topIds.length === 10, `件数=${v.topIds && v.topIds.length}`);
        check('view.hotel.name が入っている', !!(v.hotel && v.hotel.name), `name=${v.hotel && v.hotel.name}`);
      }

      // 3) スクロール到達位置
      await page.evaluate(() => {
        const el = document.querySelector('.feedcard[data-index="2"]');
        if (el) el.scrollIntoView();
      });
      await waitFor(1500);
      list = await readPassive(page);
      const seens = (list || []).filter((e) => e.type === 'seen');
      const maxSeen = seens.length ? Math.max(...seens.map((e) => e.maxIndex)) : -1;
      check('seen レコードがあり maxIndex >= 2', seens.length > 0 && maxSeen >= 2, `件数=${seens.length} maxIndex=${maxSeen}`);

      // 4) 2枚目のカードの Instagram リンクをクリック
      const secondCard = page.locator('.feedcard[data-index="1"]');
      const igLink = secondCard.locator('a.feedcard__link', { hasText: 'Instagram' });
      const igCount = await igLink.count();
      if (igCount > 0) {
        const cardId = await secondCard.evaluate((el) => el.dataset.index);
        const [popup] = await Promise.all([
          context.waitForEvent('page'),
          igLink.first().click(),
        ]);
        await popup.close();
        await waitFor(300);
        list = await readPassive(page);
        const links = (list || []).filter((e) => e.type === 'link' && e.label === 'Instagram');
        check('link(Instagram) レコードがある', links.length > 0, `件数=${links.length} cardIndex=${cardId}`);
        if (links.length) {
          const cardIdOnPage = await page.evaluate(() => {
            const list2 = window.YadoApp.getState().cards;
            return list2[1] && list2[1].id;
          });
          check('link.cardId が2枚目のカードのIDと一致', links[links.length - 1].cardId === cardIdOnPage,
            `expected=${cardIdOnPage} actual=${links[links.length - 1].cardId}`);
        }
      } else {
        check('link(Instagram) レコードがある', false, '2枚目のカードに Instagram リンクが無い(fixture kusatsu を要確認)');
      }

      await context.close();
    }

    // 5: 上限テスト(200件以下)
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 30, null, { timeout: 15000 });

      await page.evaluate((key) => {
        const dummies = [];
        for (let i = 0; i < 250; i++) dummies.push({ t: Date.now(), type: 'tap', index: i });
        window.localStorage.setItem(key, JSON.stringify(dummies));
      }, PASSIVE_KEY);

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 30, null, { timeout: 15000 });
      await waitFor(300);

      const list = await readPassive(page);
      const len = Array.isArray(list) ? list.length : -1;
      check('250件投入後、リロードで1件追加されても配列長が200以下', len > 0 && len <= 200, `length=${len}`);

      await context.close();
    }

    // 7: 90日より古いレコードは書き込み時に落ちる(t が無いものは残す)
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const DAY = 86400000;
      await page.addInitScript(({ key, day }) => {
        const now = Date.now();
        const seed = [
          { t: now - 91 * day, type: 'tap', tag: 'old91' },
          { t: now - 89 * day, type: 'tap', tag: 'recent89' },
          { type: 'tap', tag: 'no-t' },
        ];
        window.localStorage.setItem(key, JSON.stringify(seed));
      }, { key: PASSIVE_KEY, day: DAY });

      await page.goto(`${BASE}/?fixture=kusatsu&demo=passive`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 30, null, { timeout: 15000 });

      // カードを1枚タップして passivePush を発火させる(掃除は書き込み時にのみ走る)
      await page.locator('.feedcard[data-index="0"]').click();
      await waitFor(300);

      const list = await readPassive(page);
      const tags = (list || []).map((e) => e.tag).filter(Boolean);
      check('(a) 91日前のエントリが消える', !tags.includes('old91'), `残っているtag=${tags.join(',')}`);
      check('(b) 89日前のエントリは残る', tags.includes('recent89'), `残っているtag=${tags.join(',')}`);
      check('(c) t が無いエントリは残る(判断できないものは消さない)', tags.includes('no-t'), `残っているtag=${tags.join(',')}`);

      const box = await page.locator('.passivebox').textContent().catch(() => '');
      check('.passivebox の総件数がold1件消えた分だけ減っている(残2+新規1=3件)', /総件数\s*3/.test(box || ''), `box=${box}`);

      await context.close();
    }

    // 6: localStorage を封じても壊れない
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => { consoleErrors.push(String(err)); });

      await page.addInitScript(() => {
        try {
          Object.defineProperty(window, 'localStorage', {
            get() {
              return {
                getItem() { throw new Error('blocked'); },
                setItem() { throw new Error('blocked'); },
                removeItem() { throw new Error('blocked'); },
              };
            },
          });
        } catch (e) {
          // defineProperty 自体が失敗する環境もあるが、それはそれで別の検査対象
        }
      });

      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 30, null, { timeout: 15000 }).catch(() => {});
      await waitFor(1000);

      const cardCount = await page.evaluate(() => document.querySelectorAll('.feedcard[data-index]').length);
      check('localStorage 封じでもカード30枚が出る', cardCount >= 30, `件数=${cardCount}`);
      check('localStorage 封じでコンソールエラー0件', consoleErrors.length === 0, `件数=${consoleErrors.length} ${consoleErrors.slice(0, 3).join(' / ')}`);

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
  console.error('check-passive 実行エラー:', err);
  process.exitCode = 1;
});
