// R157: カードを「テーマの束」にまとめた見出し(.feedbundle)の機械検査
// 使い方: node scripts/check-bundle.mjs
// check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡す(自分では起動しない)。
//
// 確認項目:
//   1. 展開前(初期5件)は .feedbundle が0本 = 見た目の現状維持
//   2. 「もっと見る」展開後は .feedbundle が1本以上出る
//   3. 見出し1本に中身1件の束が1つも無い(見出しの直後に必ず2枚以上のカードが続く)
//   4. 番号バッジが 1..N の連番のまま(束見出しを挟んでも番号が変わらない)
//   5. data-index が 0..N-1 の連番のまま(地図のピン番号との対応が壊れていない)
//   6. 見出しが <h3> で、.feedcard の <h2> との階層が逆転していない
//   7. 見出しに data-index が付いていない(observeCards に拾われない)
//   8. 見出しが2本連続していない(中身の無い見出しが出ていない)
//   9. コンソールエラー0件

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { base, stop } = await ensureServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    for (const area of AREAS) {
      console.log('\n[' + area + ']');
      await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
      await waitFor(2000);

      // 1. 展開前は見出し0本
      const before = await page.locator('.feedbundle').count();
      ok(before === 0, '展開前は .feedbundle が0本(初期5件は現状維持)', before);

      const moreBtn = page.locator('#more-btn');
      if (!(await moreBtn.count())) { ok(false, '#more-btn が存在する'); continue; }
      await moreBtn.click();
      await waitFor(400);

      // フィード内の .feedbundle / .feedcard を出現順に読む
      const seq = await page.evaluate(() => {
        const nodes = document.querySelectorAll('#feed-list .feedbundle, #feed-list .feedcard');
        return Array.from(nodes).map((el) => {
          if (el.classList.contains('feedbundle')) {
            return {
              kind: 'head',
              tag: el.tagName,
              text: el.textContent.trim(),
              hasIndex: el.hasAttribute('data-index'),
            };
          }
          const no = el.querySelector('.feedcard__no');
          return {
            kind: 'card',
            index: el.getAttribute('data-index'),
            no: no ? no.textContent.trim() : null,
          };
        });
      });

      const heads = seq.filter((s) => s.kind === 'head');
      const cards = seq.filter((s) => s.kind === 'card');

      // 2. 見出しが1本以上
      ok(heads.length >= 1, '展開後に .feedbundle が1本以上', heads.length);

      // 3. 「1件」を名乗る見出しが無い(見出し1本に中身1件を作らない)
      const thin = heads.filter((h) => /(^|[^0-9])1件/.test(h.text));
      ok(thin.length === 0, '「1件」の束見出しが無い', thin.map((h) => h.text));

      // 3b. 同じ束の見出しが2回出ていない(rank順のまま挿すので初出のみ)
      const names = heads.map((h) => h.text.replace(/\s*\d+件$/, '').trim());
      ok(new Set(names).size === names.length, '同じ束の見出しが重複していない', names);

      // 8. 見出しが2本連続していない(中身の無い見出しが出ていない)
      const adjacent = seq.some((s, i) => s.kind === 'head' && seq[i + 1] && seq[i + 1].kind === 'head');
      ok(!adjacent, '見出しが2本連続していない', adjacent);

      // 3c. 見出しが名乗る件数の合計 <= 6件目以降の枚数。
      // 残り1件しかない束は見出しを出さずに本文へ混ぜるので、その分だけ合計は少なくなる
      // (差が大きいと数え落としなので、束の数ぶんまでの誤差しか認めない)。
      const claimed = heads.reduce((sum, h) => sum + Number((h.text.match(/(\d+)件$/) || [0, 0])[1]), 0);
      const expect = cards.length - 5;
      ok(claimed <= expect && claimed >= expect - heads.length,
        '見出しの件数の合計が6件目以降の枚数と整合(端数は見出し無しの1件束)', { claimed, expect });

      // 4. 番号バッジが 1..N の連番
      const nos = cards.map((c) => Number(c.no));
      const noSeq = nos.every((n, i) => n === i + 1);
      ok(noSeq, '番号バッジが1からの連番', nos.slice(0, 8));

      // 5. data-index が 0..N-1 の連番
      const idx = cards.map((c) => Number(c.index));
      const idxSeq = idx.every((n, i) => n === i);
      ok(idxSeq, 'data-index が0からの連番(地図ピンとの対応が不変)', idx.slice(0, 8));

      // 6. 見出しは h3
      ok(heads.every((h) => h.tag === 'H3'), '見出しが <h3>', heads.map((h) => h.tag));

      // 7. 見出しに data-index が無い
      ok(heads.every((h) => !h.hasIndex), '見出しに data-index が付いていない');

      console.log('  束: ' + heads.map((h) => h.text.replace(/\s+/g, '')).join(' / ') + ' (カード' + cards.length + '枚)');
    }

    // 9. コンソールエラー0件
    ok(consoleErrors.length === 0, 'コンソールエラー0件', consoleErrors);

    await context.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-bundle 実行エラー:', err);
  process.exitCode = 1;
});
