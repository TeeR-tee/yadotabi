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
//   2b. R233: 3〜9 の判定の母集団(heads・cards)が空でないこと。カードが0枚でも
//       filter(...).length === 0 は真になり6件中5件が緑で通るため、
//       カード枚数(CARD_MIN)と見出し本数(HEAD_MIN)を別項目として検査する。
//   2c. R233: 束見出しが名乗るテーマ名が engine.js 由来の表にある名前だけであること
//       (本数も枚数も変わらない「テーマ名の書き換え」を捕まえる)
//   3. 見出し1本に中身1件の束が1つも無い
//   4. **見出しの下のカードが全てその束のテーマである**(1枚も混ざらない)
//   5. 番号バッジ・data-index が 1..N / 0..N-1 の**過不足の無い集合**(欠落・重複が無い)
//   6. 初期5件は rank 順の 1..5 のまま先頭に並ぶ(地図のピン1〜5との対応が不変)
//   7. 見出しが <h3> で、.feedcard の <h2> との階層が逆転していない
//   8. 見出しに data-index が付いていない(observeCards に拾われない)
//   9. 見出しが2本連続していない / 同じ束の見出しが2回出ていない
//  10. コンソールエラー0件
//  11. R226: 「写真と解説がまだ無い場所」の区切り(.feedbundle--bare)
//      - 該当カードがあるときだけ1本出る(0枚のエリアで見出しだけ浮かない)
//      - ★区切りより後ろは .feedcard--bare だけ / 該当カードは1枚残らず後ろ
//        (見出し本数もカード枚数も変えずに中身を入れ替える壊し方はここでしか落ちない)
//      - 文言が app.js の BARE_BUNDLE_HEAD と一致し、場所を評価する語を含まない

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import { ensureServer } from './lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];

/**
 * R222: JavaScript ソースからコメント(`//` 行コメント と ブロックコメント)を
 * 取り除く。R214 で `docs/check.mjs` が「コメントアウトされた <link rel="icon"> を
 * 『ある』と誤判定していた」のと同じ穴が、この検査の定義抽出にもあったため。
 * 例: `// var FALLBACK_THEME = '…';` と消しても、従来は正規表現が拾って緑のまま通った。
 *
 * HTMLコメントと違い、JSは `'https://example.com'` のような**文字列リテラルの中の `//`**を
 * 消してはいけない。素朴な `replace(/\/\/.*$/gm, '')` は URL を壊すので使えない。
 * そこで1文字ずつ読み、いま「文字列の中か / コメントの中か」を持ちながら進める。
 *   - `'…'` `"…"` `` `…` `` の中は素通し(`\` によるエスケープも見る)
 *   - 正規表現リテラル `/…/` も素通し(直前の意味のあるトークンから割り算と区別する)
 * コメントは**同じ長さの空白に置き換える**(改行は残す)ので、行番号も文字位置もずれない。
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  // 直前に現れた「意味のある文字」。`/` が正規表現の始まりか割り算かの判定に使う。
  let prevToken = '';
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      prevToken = quote;
      continue;
    }
    // 正規表現リテラルの始まりか?(割り算の `/` と区別する)
    // 直前が値で終わっていれば割り算、そうでなければ正規表現とみなす。
    if (c === '/' && !/[\w$)\]]/.test(prevToken)) {
      out += c;
      i++;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '\n') break;          // 改行を跨ぐ正規表現は無いので打ち切る
        else if (src[i] === '/' && !inClass) { out += src[i]; i++; break; }
        out += src[i];
        i++;
      }
      prevToken = '/';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prevToken = c;
    i++;
  }
  return out;
}

/**
 * 画面に出ている categoryLabel(「神社・寺院」など)→ テーマ束名 の表を、
 * ソースから組み立てる(検査側に手書きの写像を持たない)。
 *   geo.js  CATEGORY_LABELS      : category -> label
 *   engine.js WIKI_CATEGORY_HINTS: category -> label(engine 独自の「自然・景勝」等)
 *   engine.js THEME_OF           : category -> テーマ束名
 */
function buildLabelToTheme() {
  // R222: 定義を探す正規表現は**コメントを除いたソース**にかける。
  // そうしないと、定義をコメントアウトしても検査が「ある」と言い続けてしまう。
  const geoSrc = stripJsComments(fs.readFileSync(path.join(ROOT, 'assets', 'geo.js'), 'utf8'));
  const engSrc = stripJsComments(fs.readFileSync(path.join(ROOT, 'assets', 'engine.js'), 'utf8'));

  // R164: 1つの category が複数の label で画面に出ることがあるので **配列で持つ**。
  // 以前は engine 側の label で上書きしていたため、geo 側の label が表から消えていた。
  // 実例: hot_spring は geo.js では「温泉源」(OSM タグ由来)、engine.js の
  // WIKI_CATEGORY_HINTS では「温泉」(Wikipedia 単独候補用)の2つの label を持つ。
  // 上書きすると「温泉源」が表から落ち、白旗源泉・地蔵源泉・煮川源泉のような
  // カードが fallback テーマ扱いになって、正しく束ねられているのに FAIL になる
  // (R164 で湯畑・源泉が表示圏に入って初めて表面化した、検査側の取りこぼし)。
  const catToLabels = {};
  const addLabel = (cat, label) => {
    if (!catToLabels[cat]) catToLabels[cat] = [];
    if (!catToLabels[cat].includes(label)) catToLabels[cat].push(label);
  };
  const geoBlock = geoSrc.match(/var CATEGORY_LABELS = \{([\s\S]*?)\};/);
  if (!geoBlock) throw new Error('geo.js の CATEGORY_LABELS を読めない');
  for (const m of geoBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)) addLabel(m[1], m[2]);
  for (const m of engSrc.matchAll(/\{\s*category:\s*'(\w+)',\s*label:\s*'([^']+)'/g)) {
    addLabel(m[1], m[2]);
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
  for (const [cat, labels] of Object.entries(catToLabels)) {
    const theme = catToTheme[cat] || fallback;
    for (const label of labels) {
      if (labelToTheme[label] && labelToTheme[label] !== theme) {
        throw new Error(`label「${label}」が複数テーマに割れている: ${labelToTheme[label]} / ${theme}`);
      }
      labelToTheme[label] = theme;
    }
  }
  return { labelToTheme, fallback };
}

// R233: 「母数が0でも緑」を防ぐための下限。この本の6つの判定
// (thin / mismatched / countBad / idx / restWithNo / noIdxBad)は
// heads と cards を母集団にした `filter(...).length === 0` なので、
// **展開後にカードが1枚も無くても6件中5件が緑**になる
// (`heads.length >= 1` は見出しの母数しか見ていない)。
// ?fixture=kusatsu / 390x844・展開後の実測(2026-09-21)はカード24枚・見出し6本。
// 5エリアの実測は kusatsu 24 / hakone 22 / dogo 18 / beppu 17 / kinosaki 23 枚、
// 見出しは 6 / 6 / 6 / 5 / 6 本。fixture の微増減で赤くならないよう、
// 最小(17枚・5本)よりさらに下げた値を下限に置く。
const CARD_MIN = 8;
const HEAD_MIN = 2;
// ★数字だけ見る検査では素通りする壊し方への備え:
// 束見出しのテーマ名だけを書き換えても、見出し本数もカード枚数も1つも変わらない。
// テーマ名は engine.js の THEME_OF / FALLBACK_THEME から作った表(labelToTheme)の
// 値の集合に入っているはずなので、名乗っているテーマ名が表に無ければ落とす。
// (「そのほか」だけはテーマを名乗らない端数置き場なので別扱い)
const REST_HEAD = 'そのほか';
// R226: 「写真も解説も無い」カード(app.js の isBareCard / .feedcard--bare)を
// 最後の1束に寄せた区切りの見出し。文言は app.js の BARE_BUNDLE_HEAD から読み、
// 検査側に手書きしない(表示の文言を直したのに検査だけ古い、が起きないようにする)。
const BARE_HEAD = (() => {
  const src = stripJsComments(fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8'));
  const m = src.match(/var BARE_BUNDLE_HEAD = '([^']+)'/);
  if (!m) throw new Error('app.js の BARE_BUNDLE_HEAD を読めない');
  return m[1];
})();
// ★評価の語を見出しに入れない(R227・R231 の教訓)。対象は「いま写真と解説が無い」
// という状態だけで、場所そのものの価値ではないため、価値を断ずる語が混ざったら落とす。
const JUDGING_WORDS = ['つまらない', '微妙', '情報が薄い', '薄い', '地味', 'しょぼ', '期待でき', '残念', 'おすすめしない', 'イマイチ', 'いまいち', '価値'];
// R226: 5エリア合計の下限(R233 の「母数が0でも緑」対策)。
// 実測は合計11枚・見出し3本。fixture の増減で赤くならないよう下げてある。
const BARE_CARD_MIN = 4;
const BARE_HEAD_MIN = 1;

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
  const bareTotals = [];
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
      // R172: 固定waitFor(2000)だと箱根(候補2855件・collect()に約3秒)で描画待ちを
      // 追い越し、初期カードが0枚のまま次の操作に進んでFAILすることがあった。
      // 「初期カード5枚が揃うまで」の条件待ちに変える(判定内容・待ち時間の上限は変えない)。
      await page.waitForFunction(() => document.querySelectorAll('.feedcard[data-index]').length >= 5, null, { timeout: 15000 });

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
              // R226: 「写真と解説がまだ無い場所」の区切り見出しかどうか
              bare: el.classList.contains('feedbundle--bare'),
            };
          }
          const no = el.querySelector('.feedcard__no');
          const cat = el.querySelector('.feedcard__cat');
          return {
            kind: 'card',
            index: el.getAttribute('data-index'),
            // R226: app.js が isBare と判定したカード(写真も解説も無い)
            bare: el.classList.contains('feedcard--bare'),
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

      // 2b. R233: 以下6つの判定(thin / mismatched / countBad / idx / restWithNo / noIdxBad)は
      //     すべて heads・cards を母集団にした filter(...).length === 0 なので、
      //     展開後にカードが1枚も出なくなると6件中5件が緑のまま通る。
      //     カードの母数は見出しの母数とは別物なので、別項目として検査する。
      ok(cards.length >= CARD_MIN, `展開後のカードが${CARD_MIN}枚以上ある(母数が0ではない)`, cards.length);
      ok(heads.length >= HEAD_MIN, `展開後の束見出しが${HEAD_MIN}本以上ある(母数が0ではない)`, heads.length);

      // 2c. ★本数も枚数も変わらない壊し方(テーマ名の書き換え)を捕まえる。
      //     見出しが名乗るテーマ名は engine.js 由来の labelToTheme の値のどれかであるはず。
      //     表に無い名前を名乗る見出しがあれば、束の分け方そのものが壊れている。
      const knownThemes = new Set(Object.values(labelToTheme).concat([fallback]));
      const unknownHeads = heads
        .map((h) => h.text.replace(/\s*\d+件$/, '').trim())
        // R226: BARE_HEAD もテーマを名乗らない置き場なので REST_HEAD と同じ扱い
        .filter((name) => name !== REST_HEAD && name !== BARE_HEAD && !knownThemes.has(name));
      ok(unknownHeads.length === 0,
        '束見出しのテーマ名が engine.js の THEME_OF にある名前だけ(名前の書き換えを検知)',
        { unknown: unknownHeads, known: Array.from(knownThemes) });

      // 3. テーマを名乗る見出しで中身1件のものが無い
      //    (「そのほか」はテーマを名乗らない端数置き場なので1件でもよい)
      // R226: BARE_HEAD もテーマを名乗らないので、1件でも嘘にならない(実測 dogo が1件)
      const thin = heads.filter((h) => !/^そのほか/.test(h.text) && !h.bare && /(^|[^0-9])1件/.test(h.text));
      ok(thin.length === 0, 'テーマを名乗る「1件」の束見出しが無い', thin.map((h) => h.text));

      // 3b. 「そのほか」は出るなら必ず末尾側の1本だけ。
      //     R226 で「写真と解説がまだ無い場所」の束がその後ろに付くようになったため、
      //     末尾から数えて「そのほか」「BARE_HEAD」以外が挟まっていないことで見る。
      const restAt = heads.findIndex((h) => /^そのほか/.test(h.text));
      const tailOnly = heads.slice(restAt === -1 ? heads.length : restAt)
        .every((h) => /^そのほか/.test(h.text) || h.bare);
      ok(restAt === -1 || tailOnly,
        '「そのほか」は出るなら末尾側(後ろに来てよいのは写真と解説がまだ無い場所の束だけ)',
        { restAt, n: heads.length, tail: heads.slice(restAt === -1 ? heads.length : restAt).map((h) => h.text) });

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
        // 「そのほか」「写真と解説がまだ無い場所」はテーマを名乗らない置き場なので
        // テーマの照合はしない(R226 の束は別項目で中身を照合する)
        if (cur === 'そのほか' || cur === BARE_HEAD) continue;
        const theme = labelToTheme[s.cat] || fallback;
        if (theme !== cur) mismatched.push({ head: cur, name: s.name.trim(), cat: s.cat, theme });
      }
      if (cur) headCounts.push({ label: cur, claimed: curClaim, actual: curN });

      ok(mismatched.length === 0, '★見出しの下のカードが全てその束のテーマ(1枚も混ざらない)', mismatched);
      const countBad = headCounts.filter((h) => h.claimed !== h.actual);
      ok(countBad.length === 0, '見出しが名乗る件数と直下のカード枚数が一致', countBad);

      // ---- R226: 「写真と解説がまだ無い場所」の区切り ----
      // 数字(見出し本数・カード枚数)は1つも変わらない壊し方があるため、
      // 本数の下限ではなく**どのカードがどの見出しの下にいるか**を照合する。
      const bareCards = cards.filter((c) => c.bare);
      const bareHeads = heads.filter((h) => h.bare);

      // R226-1. 区切りの見出しは、該当カードがあるときだけ出て、あるなら1本だけ。
      //         該当0枚のエリア(実測: hakone・beppu)で見出しだけが浮くのを防ぐ。
      ok(bareHeads.length === (bareCards.length ? 1 : 0),
        `★写真と解説がまだ無いカードが${bareCards.length}枚のとき区切り見出しは${bareCards.length ? 1 : 0}本`,
        { bareCards: bareCards.length, bareHeads: bareHeads.length });

      // R226-2. ★中身の照合(数字が変わらない壊し方を捕まえる)。
      //         区切りより後ろにいるのは .feedcard--bare のカードだけで、
      //         .feedcard--bare のカードは1枚残らず区切りより後ろにいること。
      //         見出しの本数も束の数もカード枚数も変えずに、bare と非bare を
      //         入れ替える壊し方は、この照合でしか捕まらない。
      const bareHeadPos = seq.findIndex((s) => s.kind === 'head' && s.bare);
      const misplaced = [];
      seq.forEach((s, i) => {
        if (s.kind !== 'card') return;
        const after = bareHeadPos !== -1 && i > bareHeadPos;
        if (s.bare && !after) misplaced.push({ name: s.name.trim(), want: '区切りの後ろ', at: '前' });
        if (!s.bare && after) misplaced.push({ name: s.name.trim(), want: '区切りの前', at: '後ろ' });
      });
      ok(misplaced.length === 0,
        '★区切りより後ろは写真と解説が無いカードだけ / 該当カードは1枚残らず区切りより後ろ',
        misplaced.slice(0, 5));

      // R226-3. 区切りの見出しの文言が app.js の BARE_BUNDLE_HEAD と一致する
      //         (見出し本数も枚数も変わらない「文言の書き換え」を捕まえる)。
      const bareHeadNames = bareHeads.map((h) => h.text.replace(/\s*\d+件$/, '').trim());
      ok(bareHeadNames.every((n) => n === BARE_HEAD),
        `区切り見出しの文言が app.js の BARE_BUNDLE_HEAD(「${BARE_HEAD}」)と一致`,
        bareHeadNames);

      // R226-4. ★見出しの文言に評価の語が入っていない(R227・R231 の教訓)。
      //         対象は「いま写真と解説が無い」状態だけで、場所の価値ではない。
      const judging = JUDGING_WORDS.filter((w) => BARE_HEAD.includes(w));
      ok(judging.length === 0, '区切り見出しの文言に場所を評価する語が入っていない', judging);

      bareTotals.push({ area, cards: bareCards.length, heads: bareHeads.length });

      // 5. R159: 番号バッジは地図にピンがある初期5件(index 0..4)だけが持つ。
      //    6件目以降(index >= 5)は地図にピンが無く押しても何も起きない死んだボタンになるため、
      //    番号バッジ自体を出さない(no === null)。
      const idx = cards.map((c) => Number(c.index)).sort((a, b) => a - b);
      ok(idx.every((n, i) => n === i), 'data-index が 0..N-1 を欠落・重複なく1回ずつ使っている',
        { n: idx.length, bad: idx.filter((n, i) => n !== i).slice(0, 5) });
      const firstFiveNos = cards.filter((c) => Number(c.index) < 5).map((c) => Number(c.no)).sort((a, b) => a - b);
      ok(JSON.stringify(firstFiveNos) === JSON.stringify([1, 2, 3, 4, 5]),
        '初期5件(index 0..4)だけが番号バッジ1..5を持つ', firstFiveNos);
      const restWithNo = cards.filter((c) => Number(c.index) >= 5 && c.no !== null);
      ok(restWithNo.length === 0, '6件目以降(index>=5)は番号バッジを持たない(no === null)',
        restWithNo.map((c) => ({ no: c.no, index: c.index, name: c.name.trim() })));
      // 番号と data-index は同じカードで必ず no = index + 1(地図のピン番号の根拠、初期5件のみ対象)
      const noIdxBad = cards.filter((c) => Number(c.index) < 5 && Number(c.no) !== Number(c.index) + 1);
      ok(noIdxBad.length === 0, '番号バッジ = data-index + 1(ピン番号の根拠が保たれている、初期5件)',
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

    // R226-5. ★母数が0でも緑になる穴を塞ぐ(R233 の教訓)。
    //   R226-1〜3 はどれも「bare のカードと bare の見出しが噛み合っているか」を見るので、
    //   isBareCard() を常に false にすると **カードの class も見出しも同時に消えて
    //   5エリアすべてが緑のまま通る**(実証済み: 壊し方Aで 116 pass / 0 fail)。
    //   hakone・beppu は実測0枚が正しい姿なのでエリアごとの下限は置けない。
    //   そこで **5エリア合わせて何枚あるか** を別項目にする。
    //   実測(2026-09-20)は kusatsu 7 / hakone 0 / dogo 1 / beppu 0 / kinosaki 3 = 11枚・見出し3本。
    //   fixture の微増減で赤くならないよう、実測よりかなり下げた値を下限に置く。
    const bareCardTotal = bareTotals.reduce((n, t) => n + t.cards, 0);
    const bareHeadTotal = bareTotals.reduce((n, t) => n + t.heads, 0);
    ok(bareCardTotal >= BARE_CARD_MIN,
      `★5エリア合計で写真と解説が無いカードが${BARE_CARD_MIN}枚以上(判定が常に偽になる壊れ方を検知)`,
      { total: bareCardTotal, byArea: bareTotals });
    ok(bareHeadTotal >= BARE_HEAD_MIN,
      `★5エリア合計で区切り見出しが${BARE_HEAD_MIN}本以上ある(区切りが1つも出ない壊れ方を検知)`,
      { total: bareHeadTotal, byArea: bareTotals });

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
