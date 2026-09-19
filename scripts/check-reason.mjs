// R151: カードの「なぜこれを出したか」1行(feedcard__reason)の機械検査(30本目)
// 使い方: node scripts/check-reason.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない。check-distance.mjs の作りを踏襲する)。
//
// 確認項目(5エリア共通):
//   (a) 表示カード(cards+more)が10件以上30件以下、かつ全て理由付き
//   (b) 「珍しいX」が付いたカードは、そのXのカテゴリラベルを持つカードが
//       cards+more(=「もっと見る」で開ける表示分の全部)内に本当に1件だけ
//   (c) far に reason が付いていない(R152: more は理由付きのみを選ぶ仕様に変わったので reason を持つ)
//   (d) ?debug=1 の有無でカード名の並び順が完全一致(rank 無改変の証明)
//   (e) R227: 💡理由行の**優先順**が「代表的な◯◯ → 歩いて行ける → 珍しい◯◯」であること
//   (f) R231: 「もっと見る」を開いた画面に同じ「このあたりでは珍しいX」が2枚以上出ていない
//   (g) R231: 「もっと見る」を開いた画面で理由行を持つカードの枚数が基準値を下回らない
//
// ■ (b) が R231 まで何も見ていなかった理由(同じ穴を他で開けないための記録)
//   (b) は `engine.js` の reasonFor() が作る**旧文言**「この一帯で唯一のX」を正規表現で
//   探していたが、画面に出る文言は `app.js` の reasonText() が上書きしていて
//   R169 以降ずっと「このあたりでは珍しいX」である。つまり (b) の正規表現は
//   5エリアのどのカードにも一度も当たらず、**0件を検査して常に緑**を返していた
//   (空集合に対する forEach は何も実行せず uniqueOk が true のままになる)。
//   しかも (b) が見ていたのは engine.js が付けた `c.reason`(内部値)であって、
//   利用者が読む DOM の理由行ではなかったので、二重にズレていた。
//   → 対策: (b) は**画面(DOM)に出ている文言**を母数に数える。加えて「0件を検査して緑」を
//   防ぐため、(f) で「そもそも何枚の理由行を見たか」を必ず出して枚数0なら落とす。
//
// ■ (e) が守っているもの(R227 の設計判断)
//   温泉街は宿の徒歩圏に見どころが集まるため、旧順(歩いて行ける が先頭)では上位5枚の
//   25枚中14枚(56%)が「歩いて行ける」という同じ文言になり、どれが何なのか区別できなかった。
//   距離は「徒歩◯分」がメタ行に既に出ているので、実績(backlinks)の裏づけがある
//   「代表的な◯◯」は距離より先に言う。
//   ★一方 rareReason(珍しい◯◯)は walkableReason より**後ろ**に置く。「珍しい」は
//   同カテゴリが表示中に1件しかないというだけの消去法的な事実で、その場所の性格を語らない。
//   前に出すと代表格に付いて嘘になる(草津1位の湯畑が「珍しい観光名所」になった実例)。
//   この2段構えを守るのが (e) と (e2)(e3) の役目。
//
//   検査は**枚数を数えない**。枚数だけ見る検査は「文言を別の文字列に変えた」壊し方を
//   素通りさせるため(R229 の実例)、画面に出ている理由行を1枚ずつ、その材料
//   (distanceM / backlinks / 同カテゴリ枚数)から**期待される文言を組み立て直して突き合わせる**。
//   app.js の各 Reason 関数と同じ条件をここに独立して持つので、
//   優先順を戻す・representativeReason を潰す・文言を変える のどれでも落ちる。
//   しきい値 REASON_BACKLINKS_MIN は app.js から実際の値を読んで、検査側の期待値と一致も見る
//   (片方だけ動いたら落ちる。読むときは check-fame.mjs と同じくコメントを除去してから)。

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREAS = ['kusatsu', 'hakone', 'beppu', 'dogo', 'kinosaki'];

// R227: 理由行の3つの文言と、それらを選ぶ条件。app.js の walkable/representative/rare と
// 同じ内容を検査側にも独立して持ち、画面と突き合わせる(app.js を写して自動追従はしない)。
const TEXT_WALKABLE = '歩いて行ける';
const PREFIX_REPRESENTATIVE = 'このあたりの代表的な';
const PREFIX_RARE = 'このあたりでは珍しい';
const EXPECT_BACKLINKS_MIN = 30; // app.js の REASON_BACKLINKS_MIN と一致すべき値
const WALKABLE_MAX_M = 800;      // app.js の walkableReason のしきい値と一致すべき値

// R231: 「珍しい」が嘘になったときの受け皿。距離の順位は座標から一意に決まる事実で、
// 何枚並んでも嘘にならない(「珍しい」「代表的な」のような評価の語は使わない)。
const SUFFIX_NEAREST = 'の中では宿から一番近い'; // 「この◯◯の中では宿から一番近い」
const PREFIX_NTH = '宿から';                     // 「宿からN番目に近い◯◯」

// R231: 「もっと見る」を開いた画面で理由行を持つカードの枚数の下限(2026-09-20 実測)。
// この値を下回る=直したつもりで理由行を消してしまった、ということ。
const EXPECT_REASON_MIN = { kusatsu: 18, hakone: 15, dogo: 14, beppu: 15, kinosaki: 16 };

/**
 * check-fame.mjs の stripJsComments と同じ方針。
 * コメントを同じ長さの空白に置き換えるので行番号・文字位置はずれない。
 * 定義をコメントアウトしても「ある」と誤判定する穴を作らないために使う。
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
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
    if (c === '/' && !/[\w$)\]]/.test(prevToken)) {
      out += c;
      i++;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '\n') break;
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

/** app.js から REASON_BACKLINKS_MIN の実際の値を読む(コメント除去後)。 */
function readBacklinksMin() {
  const src = stripJsComments(fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8'));
  const m = src.match(/\bREASON_BACKLINKS_MIN\s*=\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
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

async function suggestData(page, base, area) {
  await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
  await waitFor(2000);
  return page.evaluate(async (area) => {
    const res = await fetch('fixtures/' + area + '.json');
    const json = await res.json();
    window.YadoGeo.setFixture(json);
    const hotel = { id: 'fixture/' + json.meta.area, name: json.meta.label, lat: json.meta.lat, lon: json.meta.lon };
    const items = await window.YadoEngine.collect(hotel);
    const ranked = window.YadoEngine.rank(items, hotel, { now: new Date() });
    const presented = window.YadoEngine.present(ranked, hotel);
    return {
      cards: presented.cards.map((c) => ({ reason: c.reason, categoryLabel: c.categoryLabel })),
      moreCards: (presented.more || []).map((c) => ({ reason: c.reason, categoryLabel: c.categoryLabel })),
      more: (presented.more || []).map((c) => c.reason),
      far: (presented.far || []).map((c) => c.reason),
    };
  }, area);
}

/**
 * R231: 「もっと見る」を押して展開した状態の画面から、カード名と理由行を全部読む。
 * (b)(f)(g) はこの「利用者が実際に見る文言」を母数にする。engine.js が持つ内部の
 * c.reason ではなく DOM を見るのは、画面の文言は app.js が上書きしているため
 * (旧 (b) が内部値を見ていたせいで5年分の不具合を素通りさせた)。
 */
async function expandedReasons(page, base, area) {
  await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
  await waitFor(2000);
  const btn = page.locator('#more-btn');
  if (await btn.count() && await btn.first().isVisible()) {
    await btn.first().click();
    await waitFor(1200);
  }
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.feedcard')).map((el) => {
      const nameEl = el.querySelector('.feedcard__name');
      const reasonEl = el.querySelector('.feedcard__reason');
      const catEl = el.querySelector('.feedcard__cat');
      return {
        name: nameEl ? nameEl.textContent.trim() : '',
        // 画面の理由行は先頭に「💡 」が付く。文言だけを比べるので絵文字は外す。
        reason: reasonEl ? reasonEl.textContent.trim().replace(/^💡\s*/, '') : '',
        // カテゴリ欄は「(絵文字) ラベル」。ラベルだけ取り出す。
        categoryLabel: catEl ? catEl.textContent.trim().replace(/^\S+\s*/, '') : '',
      };
    })
  );
}

/**
 * R227: 画面に出ている初期5枚の理由行と、その文言を決める材料を名前で突き合わせて返す。
 * 母集団(同カテゴリ枚数を数える範囲)は app.js の reasonText() と同じ state.cards = 初期5枚。
 */
async function reasonWithMaterials(page, base, area) {
  await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
  await waitFor(2000);

  // 画面から: カード名と理由行(「もっと見る」は開かない。母集団が初期5枚のため)
  const dom = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.feedcard')).map((el) => {
      const nameEl = el.querySelector('.feedcard__name');
      const reasonEl = el.querySelector('.feedcard__reason');
      return {
        name: nameEl ? nameEl.textContent.trim() : '',
        // 画面の理由行は先頭に「💡 」が付く。材料と比べるので絵文字だけ外す。
        reason: reasonEl ? reasonEl.textContent.trim().replace(/^💡\s*/, '') : '',
      };
    })
  );

  // 材料から: 名前 -> { distanceM, backlinks, category, categoryLabel }
  const materials = await page.evaluate(async (area) => {
    const res = await fetch('fixtures/' + area + '.json');
    const json = await res.json();
    window.YadoGeo.setFixture(json);
    const hotel = { id: 'fixture/' + json.meta.area, name: json.meta.label, lat: json.meta.lat, lon: json.meta.lon };
    const items = await window.YadoEngine.collect(hotel);
    const ranked = window.YadoEngine.rank(items, hotel, { now: new Date() });
    const presented = window.YadoEngine.present(ranked, hotel);
    const toMaterial = (c) => {
      const d = c._debug || {};
      return {
        name: c.name,
        hasReason: !!c.reason,
        categoryLabel: c.categoryLabel,
        category: d.category,
        distanceM: isFinite(d.distanceM) ? d.distanceM : c.distanceM,
        backlinks: isFinite(d.backlinks) ? d.backlinks : null,
      };
    };
    // R231: 「珍しい」の判定母集団は cards+more なので、more の材料も返す。
    return {
      cards: presented.cards.map(toMaterial),
      more: (presented.more || []).map(toMaterial),
    };
  }, area);

  const cards = materials.cards.map((m) => {
    const shown = dom.find((x) => x.name === m.name);
    return { ...m, shownReason: shown ? shown.reason : null };
  });
  return { cards, pool: materials.cards.concat(materials.more) };
}

/**
 * R227 + R231: 材料から「あるべき理由行」を組み立てる。app.js の reasonText() と同じ優先順:
 *   代表的な◯◯ → 歩いて行ける → 珍しい◯◯(または距離順の受け皿)
 * app.js を読んで写すのではなく、仕様として独立に書くので、app.js 側を戻すと食い違って落ちる。
 *
 * @param {object} card 判定するカード
 * @param {object[]} cardsInView 行が出るか出ないかを決める母集団(初期5枚)
 * @param {number} backlinksMin 「代表的な◯◯」の被リンク下限
 * @param {object[]} shownPool R231: 「珍しい」を名乗る資格を判定する母集団(cards+more)
 */
function expectedReason(card, cardsInView, backlinksMin, shownPool) {
  if (!card.hasReason) return null; // engine.js が理由なしと判定したカードは行ごと出さない
  const label = card.categoryLabel || 'スポット';
  const hasCategory = !!card.category && card.category !== 'other';
  const sameCat = cardsInView.filter((c) => c.categoryLabel === label && c.category === card.category);

  // 1. 代表的な◯◯(backlinks という実績の裏づけがあるので距離より先)
  if (hasCategory) {
    const backlinks = isFinite(card.backlinks) ? card.backlinks : 0;
    if (backlinks >= backlinksMin) {
      const isMax = sameCat.every((c) => (isFinite(c.backlinks) ? c.backlinks : 0) <= backlinks);
      if (isMax) return PREFIX_REPRESENTATIVE + label;
    }
  }
  // 2. 歩いて行ける(事実。消去法の「珍しい」より先)
  if (isFinite(card.distanceM) && card.distanceM <= WALKABLE_MAX_M) return TEXT_WALKABLE;
  // 3. R231: 「珍しい◯◯」は cards+more の中でも唯一のときだけ。行が出る条件(初期5枚で唯一)は
  //    R227 から変えていないので、ここで null にはならず必ず受け皿の文言に落ちる。
  if (hasCategory && sameCat.length === 1) {
    const pool = Array.isArray(shownPool) && shownPool.length ? shownPool : cardsInView;
    const sameShown = pool.filter((c) => c.categoryLabel === label && c.category === card.category);
    if (sameShown.length <= 1) return PREFIX_RARE + label;
    const sorted = sameShown.slice().sort((a, b) => distanceOf(a) - distanceOf(b));
    const idx = sorted.findIndex((c) => c.name === card.name);
    if (idx < 0) return null;
    return idx === 0 ? 'この' + label + SUFFIX_NEAREST : PREFIX_NTH + (idx + 1) + '番目に近い' + label;
  }
  return null;
}

/** 距離の取り出し(app.js の distanceOf と同じ扱い)。欠けていたら最後尾に回す。 */
function distanceOf(card) {
  return isFinite(card.distanceM) ? card.distanceM : Infinity;
}

async function main() {
  const { base, stop } = await ensureServer();

  // (e0) しきい値が app.js と検査側で一致しているか(片方だけ動いたら落ちる)
  const backlinksMin = readBacklinksMin();
  ok(backlinksMin === EXPECT_BACKLINKS_MIN,
    `app.js の REASON_BACKLINKS_MIN が ${EXPECT_BACKLINKS_MIN}`, backlinksMin);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    for (const area of AREAS) {
      const data = await suggestData(page, base, area);

      // (a) R155: cards は理由付きのみを5件まで、more は理由付き候補の残り全件(最大REASON_POOL=30件)。
      // 5エリアとも理由付きは20件以上あるので、表示分は必ず全て理由を持つ。
      const shown = data.cards.concat(data.moreCards);
      const withReason = shown.filter((c) => c.reason).length;
      ok(data.cards.length === 5, `${area}: 初期カードが5件`, data.cards.length);
      ok(withReason === shown.length && shown.length >= 10 && shown.length <= 30,
        `${area}: 表示カード(cards+more)が10〜30件で全て理由付き`, { shown: shown.length, withReason });

      // (b) R231: 「このあたりでは珍しいX」の X が、展開後の画面に本当に1件だけ。
      // 旧 (b) は engine.js の内部値 c.reason から旧文言「この一帯で唯一のX」を探していたが、
      // 画面の文言は app.js が上書きしていて一度も当たらず、常に緑を返していた。
      const expanded = await expandedReasons(page, base, area);
      let uniqueOk = true;
      const uniqueDetails = [];
      expanded.forEach((c) => {
        if (!c.reason || c.reason.indexOf(PREFIX_RARE) !== 0) return;
        const label = c.reason.slice(PREFIX_RARE.length);
        const count = expanded.filter((x) => x.categoryLabel === label).length;
        if (count !== 1) uniqueOk = false;
        uniqueDetails.push({ name: c.name, label, count });
      });
      ok(uniqueOk, `${area}: 展開後の「${PREFIX_RARE}X」のXは画面に本当に1件だけ`,
        uniqueDetails.filter((d) => d.count !== 1));

      // (f) R231: 同じ「このあたりでは珍しいX」が展開後の画面に2枚以上出ていない。
      // 別府で「このあたりでは珍しい共同浴場」が竹瓦温泉・浜脇温泉の2枚に同時に出ていた不具合。
      // (b) は「Xのカテゴリが何枚あるか」を見るのに対し、こちらは「同じ文言が何枚出ているか」を
      // 直接数える。母数(何枚の理由行を見たか)も必ず表に出し、0枚なら落とす
      // (空集合を検査して緑、という旧 (b) の失敗をここで塞ぐ)。
      const rareCounts = new Map();
      expanded.forEach((c) => {
        if (!c.reason || c.reason.indexOf(PREFIX_RARE) !== 0) return;
        rareCounts.set(c.reason, (rareCounts.get(c.reason) || 0) + 1);
      });
      const rareDup = [...rareCounts.entries()].filter(([, n]) => n >= 2);
      const expandedWithReason = expanded.filter((c) => c.reason);
      ok(expanded.length >= 10 && expandedWithReason.length > 0,
        `${area}: 展開後の画面から理由行を読めている(母数が0ではない)`,
        { cards: expanded.length, withReason: expandedWithReason.length });
      ok(rareDup.length === 0,
        `${area}: 展開後に同じ「${PREFIX_RARE}◯◯」が2枚以上出ていない`,
        rareDup.map(([text, n]) => ({ text, n })));

      // (g) R231: 嘘を消すために理由行ごと消していないか。展開後に理由行を持つ枚数が
      // 2026-09-20 の実測値を下回らないこと。母集団を広げる直し方だと5エリアで6枚消える。
      const minReason = EXPECT_REASON_MIN[area];
      ok(expandedWithReason.length >= minReason,
        `${area}: 展開後に理由行を持つカードが${minReason}枚以上`,
        { actual: expandedWithReason.length, expect: minReason });

      // (g2) R231: 受け皿の文言が生きていること。「珍しい」を潰しただけで受け皿を
      // 出していないと (g) は通るが利用者には何の情報も増えない。別府は必ず
      // 「この共同浴場の中では宿から一番近い」(竹瓦温泉)が出るはず。
      if (area === 'beppu') {
        const takegawara = expanded.find((c) => c.name === '竹瓦温泉');
        ok(!!takegawara && takegawara.reason === 'この共同浴場' + SUFFIX_NEAREST,
          `${area}: 竹瓦温泉の理由行が「この共同浴場${SUFFIX_NEAREST}」`,
          takegawara ? takegawara.reason : '(カードが無い)');
        const hamawaki = expanded.find((c) => c.name === '浜脇温泉');
        ok(!!hamawaki && hamawaki.reason === PREFIX_NTH + '2番目に近い共同浴場',
          `${area}: 浜脇温泉の理由行が「${PREFIX_NTH}2番目に近い共同浴場」`,
          hamawaki ? hamawaki.reason : '(カードが無い)');
      }

      // (c) R152: far には reason を付けない(more は理由付き選別の続きなので持っていてよい)
      const farHasReason = data.far.some(Boolean);
      ok(!farHasReason, `${area}: far にreasonが付いていない`);

      // (d) debug=1 の有無で並び順が完全一致
      await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
      await waitFor(1500);
      const namesNoDebug = await page.locator('.feedcard__name').allTextContents();
      await page.goto(`${base}/?fixture=${area}&debug=1`, { waitUntil: 'load' });
      await waitFor(1500);
      const namesDebug = await page.locator('.feedcard__name').allTextContents();
      ok(
        JSON.stringify(namesNoDebug) === JSON.stringify(namesDebug),
        `${area}: debug=1有無で並び順が完全一致`
      );

      // (e) R227: 理由行の文言が、材料から組み立てた期待値と1枚ずつ一致するか。
      // 枚数は数えない(文言を別の文字列に変える壊し方を素通りさせないため)。
      const withMats = await reasonWithMaterials(page, base, area);
      const cards5 = withMats.cards;
      const shownPool = withMats.pool; // R231: 「珍しい」の判定母集団(cards+more)
      const mismatch = [];
      cards5.forEach((c) => {
        const expect = expectedReason(c, cards5, EXPECT_BACKLINKS_MIN, shownPool);
        const actual = c.shownReason || null;
        if (expect !== actual) {
          mismatch.push({
            name: c.name, expect, actual,
            distanceM: c.distanceM, backlinks: c.backlinks, categoryLabel: c.categoryLabel,
          });
        }
      });
      ok(mismatch.length === 0,
        `${area}: 理由行が「代表的な→歩いて行ける→珍しい」の優先順どおり`, mismatch);

      // (e2) 代表格として選ばれたカードが「歩いて行ける」で潰されていないこと。
      // 優先順を元に戻すと、徒歩圏の代表格は全部「歩いて行ける」になるのでここが落ちる。
      const shouldBeRepresentative = cards5.filter((c) => {
        const e = expectedReason(c, cards5, EXPECT_BACKLINKS_MIN, shownPool);
        return e && e.indexOf(PREFIX_REPRESENTATIVE) === 0;
      });
      const swallowed = shouldBeRepresentative.filter((c) => c.shownReason === TEXT_WALKABLE);
      ok(swallowed.length === 0,
        `${area}: 代表的な◯◯に当たるカードが「${TEXT_WALKABLE}」に潰されていない`,
        swallowed.map((c) => c.name));

      // (e3) R227: 徒歩圏(800m以下)のカードに「珍しい◯◯」が出ていないこと。
      // 「珍しい」は同カテゴリが1件だけという消去法的な情報で、その場所の性格を語らない。
      // rareReason を walkableReason より前に出すと、草津1位の湯畑が
      // 「このあたりでは珍しい観光名所」になる(草津の代表格に対して明確な嘘)。
      // 代表格でない徒歩圏のカードは「歩いて行ける」で止まるべき。
      const rareButWalkable = cards5.filter(
        (c) => c.shownReason && c.shownReason.indexOf(PREFIX_RARE) === 0 &&
          isFinite(c.distanceM) && c.distanceM <= WALKABLE_MAX_M
      );
      ok(rareButWalkable.length === 0,
        `${area}: 徒歩${WALKABLE_MAX_M}m以内のカードに「${PREFIX_RARE}◯◯」が出ていない`,
        rareButWalkable.map((c) => ({ name: c.name, distanceM: c.distanceM, reason: c.shownReason })));
    }

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
  console.error('check-reason 実行エラー:', err);
  process.exitCode = 1;
});
