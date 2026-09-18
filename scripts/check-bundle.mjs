// R157/R158: カードを「テーマの束」にまとめた見出し(.feedbundle)の機械検査
// 使い方: node scripts/check-bundle.mjs
// check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡す(自分では起動しない)。
//
// R158 で「見出しだけ挿す」から「カードを束ごとにまとめて並べ替える」に変えた。
// 番号は元の rank 順のまま保持する(案A)ので、data-index は連番ではなく飛ぶ。
// 代わりに「見出しの下にその束のカードしか無い」ことを category 表示から照合する。
//
// 確認項目:
//   1. 展開前(初期5件)は .feedbundle が0本 = 見た目の現状維持
//   2. 「もっと見る」展開後は .feedbundle が1本以上出る
//   3. 見出し1本に中身1件の束が1つも無い
//   4. **見出しの下のカードが全てその束のテーマである**(1枚も混ざらない)
//   5. 番号バッジ・data-index が 1..N / 0..N-1 の**過不足の無い集合**(欠落・重複が無い)
//   6. 初期5件は rank 順の 1..5 のまま先頭に並ぶ(地図のピン1〜5との対応が不変)
//   7. 見出しが <h3> で、.feedcard の <h2> との階層が逆転していない
//   8. 見出しに data-index が付いていない(observeCards に拾われない)
//   9. 見出しが2本連続していない / 同じ束の見出しが2回出ていない
//  10. コンソールエラー0件

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];

/**
 * 画面に出ている categoryLabel(「神社・寺院」など)→ テーマ束名 の表を、
 * ソースから組み立てる(検査側に手書きの写像を持たない)。
 *   geo.js  CATEGORY_LABELS      : category -> label
 *   engine.js WIKI_CATEGORY_HINTS: category -> label(engine 独自の「自然・景勝」等)
 *   engine.js THEME_OF           : category -> テーマ束名
 */
function buildLabelToTheme() {
  const geoSrc = fs.readFileSync(path.join(ROOT, 'assets', 'geo.js'), 'utf8');
  const engSrc = fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8');

  const catToLabel = {};
  const geoBlock = geoSrc.match(/var CATEGORY_LABELS = \{([\s\S]*?)\};/);
  if (!geoBlock) throw new Error('geo.js の CATEGORY_LABELS を読めない');
  for (const m of geoBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)) catToLabel[m[1]] = m[2];
  for (const m of engSrc.matchAll(/\{\s*category:\s*'(\w+)',\s*label:\s*'([^']+)'/g)) {
    catToLabel[m[1]] = m[2];
  }

  const fallback = (engSrc.match(/var FALLBACK_THEME = '([^']+)'/) || [])[1];
  if (!fallback) throw new Error('engine.js の FALLBACK_THEME を読めない');
  const themeBlock = engSrc.match(/var THEME_OF = \{([\s\S]*?)\n  \};/);
  if (!themeBlock) throw new Error('engine.js の THEME_OF を読めない');
  const catToTheme = {};
  for (const m of themeBlock[1].matchAll(/(\w+):\s*(?:'([^']+)'|FALLBACK_THEME)/g)) {
    catToTheme[m[1]] = m[2] || fallback;
  }

  // label -> theme。同じ label に別テーマが当たったら検査が成り立たないので落とす。
  const labelToTheme = {};
  for (const [cat, label] of Object.entries(catToLabel)) {
    const theme = catToTheme[cat] || fallback;
    if (labelToTheme[label] && labelToTheme[label] !== theme) {
      throw new Error(`label「${label}」が複数テーマに割れている: ${labelToTheme[label]} / ${theme}`);
    }
    labelToTheme[label] = theme;
  }
  return { labelToTheme, fallback };
}

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
  const { labelToTheme, fallback } = buildLabelToTheme();
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
      const firstFive = await page.evaluate(() => Array.from(
        document.querySelectorAll('#feed-list .feedcard')
      ).slice(0, 5).map((el) => el.getAttribute('data-index')));

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
          const cat = el.querySelector('.feedcard__cat');
          return {
            kind: 'card',
            index: el.getAttribute('data-index'),
            no: no ? no.textContent.trim() : null,
            // 「⛩ 神社・寺院」から絵文字を落としてラベルだけにする
            cat: cat ? cat.textContent.trim().replace(/^\S+\s*/, '') : '',
            name: (el.querySelector('.feedcard__name') || {}).textContent || '',
          };
        });
      });

      const heads = seq.filter((s) => s.kind === 'head');
      const cards = seq.filter((s) => s.kind === 'card');

      // 2. 見出しが1本以上
      ok(heads.length >= 1, '展開後に .feedbundle が1本以上', heads.length);

      // 3. テーマを名乗る見出しで中身1件のものが無い
      //    (「そのほか」はテーマを名乗らない端数置き場なので1件でもよい)
      const thin = heads.filter((h) => !/^そのほか/.test(h.text) && /(^|[^0-9])1件/.test(h.text));
      ok(thin.length === 0, 'テーマを名乗る「1件」の束見出しが無い', thin.map((h) => h.text));

      // 3b. 「そのほか」は出るなら必ず最後の1本だけ
      const restAt = heads.findIndex((h) => /^そのほか/.test(h.text));
      ok(restAt === -1 || restAt === heads.length - 1,
        '「そのほか」は出るなら最後の1本', { restAt, n: heads.length });

      // 9a. 同じ束の見出しが2回出ていない
      const names = heads.map((h) => h.text.replace(/\s*\d+件$/, '').trim());
      ok(new Set(names).size === names.length, '同じ束の見出しが重複していない', names);

      // 9b. 見出しが2本連続していない(中身の無い見出しが出ていない)
      const adjacent = seq.some((s, i) => s.kind === 'head' && seq[i + 1] && seq[i + 1].kind === 'head');
      ok(!adjacent, '見出しが2本連続していない', adjacent);

      // 4. ★本命: 見出しの下のカードが全てその束のテーマである
      const mismatched = [];
      const headCounts = [];
      let cur = null;
      let curN = 0;
      let curClaim = 0;
      for (const s of seq) {
        if (s.kind === 'head') {
          if (cur) headCounts.push({ label: cur, claimed: curClaim, actual: curN });
          cur = s.text.replace(/\s*\d+件$/, '').trim();
          curClaim = Number((s.text.match(/(\d+)件$/) || [0, 0])[1]);
          curN = 0;
          continue;
        }
        if (!cur) continue;   // 見出しより前(初期5件)は対象外
        curN++;
        // 「そのほか」はテーマを名乗らない端数置き場なので中身の照合はしない
        if (cur === 'そのほか') continue;
        const theme = labelToTheme[s.cat] || fallback;
        if (theme !== cur) mismatched.push({ head: cur, name: s.name.trim(), cat: s.cat, theme });
      }
      if (cur) headCounts.push({ label: cur, claimed: curClaim, actual: curN });

      ok(mismatched.length === 0, '★見出しの下のカードが全てその束のテーマ(1枚も混ざらない)', mismatched);
      const countBad = headCounts.filter((h) => h.claimed !== h.actual);
      ok(countBad.length === 0, '見出しが名乗る件数と直下のカード枚数が一致', countBad);

      // 5. 番号バッジ・data-index が過不足の無い集合(案A: 順序は束ごとなので連番ではない)
      const nos = cards.map((c) => Number(c.no)).sort((a, b) => a - b);
      ok(nos.every((n, i) => n === i + 1), '番号バッジが 1..N を欠落・重複なく1回ずつ使っている',
        { n: nos.length, missing: nos.filter((n, i) => n !== i + 1).slice(0, 5) });
      const idx = cards.map((c) => Number(c.index)).sort((a, b) => a - b);
      ok(idx.every((n, i) => n === i), 'data-index が 0..N-1 を欠落・重複なく1回ずつ使っている',
        { n: idx.length, bad: idx.filter((n, i) => n !== i).slice(0, 5) });
      // 番号と data-index は同じカードで必ず no = index + 1(地図のピン番号の根拠)
      const noIdxBad = cards.filter((c) => Number(c.no) !== Number(c.index) + 1);
      ok(noIdxBad.length === 0, '番号バッジ = data-index + 1(ピン番号の根拠が保たれている)',
        noIdxBad.map((c) => ({ no: c.no, index: c.index, name: c.name.trim() })));

      // 6. 初期5件は rank 順 0..4 のまま先頭(地図のピン1〜5との対応が不変)
      const headFive = cards.slice(0, 5).map((c) => c.index);
      ok(JSON.stringify(headFive) === JSON.stringify(['0', '1', '2', '3', '4']),
        '先頭5件が data-index 0..4 のまま(地図のピン1〜5と一致)', headFive);
      ok(JSON.stringify(firstFive) === JSON.stringify(headFive),
        '展開の前後で先頭5件の並びが変わらない', { before: firstFive, after: headFive });

      // 7. 見出しは h3
      ok(heads.every((h) => h.tag === 'H3'), '見出しが <h3>', heads.map((h) => h.tag));

      // 8. 見出しに data-index が無い
      ok(heads.every((h) => !h.hasIndex), '見出しに data-index が付いていない');

      console.log('  束: ' + heads.map((h) => h.text.replace(/\s+/g, '')).join(' / ') + ' (カード' + cards.length + '枚)');
    }

    // 10. コンソールエラー0件
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
