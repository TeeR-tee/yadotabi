// R229: カードの「どれだけ知られている場所か」バッジ(.feedcard__fame)の機械検査(35本目)
// 使い方: node scripts/check-fame.mjs
// 単体実行時はこのスクリプトが scripts/lib/server.mjs の ensureServer() 経由で
// python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// ■ この検査が守っているもの(R224 で入れた assets/app.js の fameText() の設計判断)
//   R224 は「どれだけ人気なのかを示す」という設計思想の3本目の柱を実装したが、
//   それを守る検査が1本も無く、app.js を整理した拍子に静かに消えても34本全部が緑のままだった。
//   その穴を塞ぐのがこの本。守る規則は5つ:
//
//   1. backlinks >= FAME_NATIONAL_MIN(150) → 「★ 全国的によく知られた場所」
//   2. FAME_LOCAL_MIN(60) <= backlinks < 150 → 「★ この地方でよく知られた場所」
//   3. backlinks が 0・欠落・非有限 → **何も出さない**。
//      0 は「知名度が低い」ではなく「測れていない」。数値をそのまま信じると
//      「人気0」という存在しない評価を画面に出すことになる(R224 で一番避けたかった事故)。
//   4. 理由行(💡)が「このあたりの代表的な」で始まるカードには **地方級を出さない**。
//      どちらも“この土地の中での位置づけ”を言っており、同じ範囲の話を2回することになる
//      (R224 実測で5エリア10枚が該当した)。全国級はその土地の外まで名が通っている
//      =別の情報なので、重複していても出す。
//   5. 表示は1カードにつき .badge.feedcard__fame が最大1個・文言は上の2種類のみ・頭は「★ 」。
//
// ■ しきい値は検査側にも定数で持ち、app.js から読んだ実際の値と一致するかも見る。
//   片方だけ動いたら落ちる(app.js の 150/60 を書き換えただけで検査が黙って追従すると、
//   「しきい値を守っている」ことを何も保証できなくなるため)。
//   読むときは R222 と同じく **コメントを除去してから** 正規表現にかける
//   (定義をコメントアウトしても「ある」と誤判定する穴を作らない)。
//
// ■ 外部APIは1回も叩かない(固定データ5エリアのみ)。

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
const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];

// 検査側が「こうであるべき」と考えているしきい値。app.js から読んだ値と突き合わせる。
const EXPECT_NATIONAL_MIN = 150;
const EXPECT_LOCAL_MIN = 60;

const TEXT_NATIONAL = '全国的によく知られた場所';
const TEXT_LOCAL = 'この地方でよく知られた場所';
const REPRESENTATIVE_PREFIX = 'このあたりの代表的な';

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * R233-2: 1枚のカードに「出るべきバッジの文言」を **材料(backlinks と理由行)だけから** 決める。
 * 画面に出ているバッジ(badgeCount / badgeText)は一切見ない。
 * これを使うと「画面を見る軸」と「材料から組み直す軸」の2本を別々に数えられる。
 */
function expectedBadge(card) {
  const b = isFinite(card.backlinks) && card.backlinks > 0 ? card.backlinks : 0;
  const reasonMsg = card.reason.replace(/^💡\s*/, '');
  if (b >= EXPECT_NATIONAL_MIN) return '★ ' + TEXT_NATIONAL;
  if (b < EXPECT_LOCAL_MIN) return '';
  if (reasonMsg.indexOf(REPRESENTATIVE_PREFIX) === 0) return '';
  return '★ ' + TEXT_LOCAL;
}

/**
 * R222 の stripJsComments を踏襲(check-bundle.mjs と同じ方針)。
 * コメントは同じ長さの空白に置き換えるので行番号・文字位置はずれない。
 * 文字列リテラル・テンプレートリテラル・正規表現リテラルの中の `//` は消さない。
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

/** app.js から FAME_NATIONAL_MIN / FAME_LOCAL_MIN の実際の値を読む(コメント除去後)。 */
function readThresholds() {
  const src = stripJsComments(fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8'));
  const pick = (name) => {
    const m = src.match(new RegExp('\\b' + name + '\\s*=\\s*(-?\\d+)'));
    return m ? Number(m[1]) : null;
  };
  return { national: pick('FAME_NATIONAL_MIN'), local: pick('FAME_LOCAL_MIN') };
}

/**
 * 1エリア分のカードを DOM から読む。
 * バッジは画面に出ているものを、backlinks は ?debug=1 のスコア内訳から取るのではなく、
 * engine を直接叩いて名前で突き合わせる(画面の見た目と材料の両方を1枚ずつ対応付ける)。
 */
async function readArea(page, base, area) {
  await page.goto(`${base}/?fixture=${area}`, { waitUntil: 'load' });
  await waitFor(2000);

  // 「もっと見る」を展開して、表示されうるカードを全部俎上に載せる。
  const moreBtn = page.locator('#more-btn');
  if (await moreBtn.count() && await moreBtn.isVisible()) {
    await moreBtn.click();
    await waitFor(600);
  }

  // 画面から: カード名・理由行・バッジ(枚数と文言)
  const dom = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.feedcard')).map((el) => {
      const nameEl = el.querySelector('.feedcard__name');
      const reasonEl = el.querySelector('.feedcard__reason');
      const badges = Array.from(el.querySelectorAll('.feedcard__fame'));
      return {
        name: nameEl ? nameEl.textContent.trim() : '',
        reason: reasonEl ? reasonEl.textContent.trim() : '',
        badgeCount: badges.length,
        badgeText: badges.length ? badges[0].textContent.trim() : '',
        badgeIsBadgeClass: badges.length ? badges[0].classList.contains('badge') : true,
      };
    });
  });

  // 材料から: 名前 -> _debug.backlinks
  const backlinksByName = await page.evaluate(async (area) => {
    const res = await fetch('fixtures/' + area + '.json');
    const json = await res.json();
    window.YadoGeo.setFixture(json);
    const hotel = { id: 'fixture/' + json.meta.area, name: json.meta.label, lat: json.meta.lat, lon: json.meta.lon };
    const items = await window.YadoEngine.collect(hotel);
    const ranked = window.YadoEngine.rank(items, hotel, { now: new Date() });
    const presented = window.YadoEngine.present(ranked, hotel);
    const all = presented.cards.concat(presented.more || []);
    const map = {};
    all.forEach((c) => {
      const d = c && c._debug;
      // 「欠落」も区別したいので、_debug が無い/backlinks が無い場合は null を入れる。
      map[c.name] = d && isFinite(d.backlinks) ? d.backlinks : null;
    });
    return map;
  }, area);

  return dom.map((c) => ({
    ...c,
    backlinks: Object.prototype.hasOwnProperty.call(backlinksByName, c.name) ? backlinksByName[c.name] : null,
  }));
}

async function main() {
  const { base, stop } = await ensureServer();

  // (0) しきい値が app.js と検査側で一致しているか
  const th = readThresholds();
  ok(th.national === EXPECT_NATIONAL_MIN,
    `app.js の FAME_NATIONAL_MIN が ${EXPECT_NATIONAL_MIN}`, th.national);
  ok(th.local === EXPECT_LOCAL_MIN,
    `app.js の FAME_LOCAL_MIN が ${EXPECT_LOCAL_MIN}`, th.local);
  ok(th.local !== null && th.national !== null && th.local < th.national,
    'しきい値が 地方級 < 全国級 の順になっている', th);

  const browser = await chromium.launch();
  // R233-2: expectNational / expectLocal は **画面(badged)を一切通らず**、
  // backlinks と理由行という材料だけから組み立てた期待枚数。
  // 画面側の合計(national / local)と突き合わせることで、
  // 「バッジが全部消える」壊し方も「2種類の文言を入れ替える」壊し方も捕まえる別軸になる。
  const totals = { cards: 0, badged: 0, national: 0, local: 0, dup: 0, expectNational: 0, expectLocal: 0 };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log('\n--- エリア別の内訳(バッジ枚数/全枚数) ---');
    for (const area of AREAS) {
      const cards = await readArea(page, base, area);
      const badged = cards.filter((c) => c.badgeCount > 0);
      const national = badged.filter((c) => c.badgeText === '★ ' + TEXT_NATIONAL);
      const local = badged.filter((c) => c.badgeText === '★ ' + TEXT_LOCAL);
      // 規則4の違反: 「このあたりの代表的な」で始まる理由行 + 地方級バッジ の同居
      const dup = cards.filter(
        (c) => c.reason.replace(/^💡\s*/, '').indexOf(REPRESENTATIVE_PREFIX) === 0 &&
          c.badgeText === '★ ' + TEXT_LOCAL
      );
      // R233-2: 材料だけから組み直した期待枚数(画面を通らない別軸)。
      const expects = cards.map((c) => expectedBadge(c));
      totals.cards += cards.length;
      totals.badged += badged.length;
      totals.national += national.length;
      totals.local += local.length;
      totals.dup += dup.length;
      totals.expectNational += expects.filter((e) => e === '★ ' + TEXT_NATIONAL).length;
      totals.expectLocal += expects.filter((e) => e === '★ ' + TEXT_LOCAL).length;

      console.log(
        `  ${area}: バッジ ${badged.length}/${cards.length}枚` +
        `(全国級 ${national.length} / 地方級 ${local.length})、重複 ${dup.length}件`
      );

      // 規則1+2(エリア単位): 出るカードと出ないカードが両方ある
      ok(badged.length >= 1 && badged.length < cards.length,
        `${area}: バッジ付きが1枚以上かつ全枚数未満(全部に出る/1枚も出ないなら落ちる)`,
        { badged: badged.length, cards: cards.length });

      // 規則5: 1カードに最大1個・文言は2種類のみ・.badge クラスを持つ
      // R233-2: この3件と規則3の1件は、いずれも空配列に対する every()/length===0 なので
      // 「バッジが1枚も出ない」壊し方をすると **4件とも「正しく緑」** になっていた(R226 と同型)。
      // それぞれに母数(cards.length / badged.length)を判定として足す。
      ok(cards.length >= 1 && cards.every((c) => c.badgeCount <= 1),
        `${area}: バッジは1カードに最大1個(カード1枚以上)`,
        { cards: cards.length, over: cards.filter((c) => c.badgeCount > 1).map((c) => c.name) });
      ok(badged.length >= 1 &&
        badged.every((c) => c.badgeText === '★ ' + TEXT_NATIONAL || c.badgeText === '★ ' + TEXT_LOCAL),
        `${area}: バッジの文言が想定の2種類のいずれか(バッジ1枚以上)`,
        { badged: badged.length,
          unexpected: badged.map((c) => c.badgeText)
            .filter((t) => t !== '★ ' + TEXT_NATIONAL && t !== '★ ' + TEXT_LOCAL) });
      ok(badged.length >= 1 && badged.every((c) => c.badgeIsBadgeClass),
        `${area}: バッジが .badge クラスを併せ持つ(バッジ1枚以上)`, { badged: badged.length });

      // 規則3: 0・欠落にバッジが出ていない(= バッジ付きの backlinks は全て LOCAL_MIN 以上)
      const lowBadged = badged.filter((c) => !(isFinite(c.backlinks) && c.backlinks >= EXPECT_LOCAL_MIN));
      ok(badged.length >= 1 && lowBadged.length === 0,
        `${area}: backlinks が 0/欠落/${EXPECT_LOCAL_MIN}未満 のカードにバッジが出ていない(バッジ1枚以上)`,
        { badged: badged.length, low: lowBadged.map((c) => ({ name: c.name, backlinks: c.backlinks })) });

      // 規則1/2/4の裏返し: バッジが出るべきカードで出ていないものが無いか。
      // 期待値を検査側でもう一度組み立てて、画面と一枚ずつ突き合わせる。
      const mismatch = [];
      cards.forEach((c, i) => {
        const expect = expects[i];
        if (expect !== c.badgeText) {
          mismatch.push({ name: c.name, backlinks: c.backlinks, expect, actual: c.badgeText });
        }
      });
      ok(cards.length >= 1 && mismatch.length === 0,
        `${area}: 全カードでバッジの有無と文言が規則どおり(カード1枚以上)`,
        { cards: cards.length, mismatch });

      // 規則4: 「このあたりの代表的な」と地方級の同居が0件
      ok(dup.length === 0,
        `${area}: 「${REPRESENTATIVE_PREFIX}…」の理由行に地方級バッジが同居していない`,
        dup.map((c) => c.name));
    }

    console.log(
      `  合計: バッジ ${totals.badged}/${totals.cards}枚` +
      `(全国級 ${totals.national} / 地方級 ${totals.local})、重複 ${totals.dup}件` +
      ` / 材料からの期待(全国級 ${totals.expectNational} / 地方級 ${totals.expectLocal})\n`
    );

    // 5エリア合計でも「出る/出ない」が両方あること + 2種類とも実在すること
    ok(totals.badged >= 1 && totals.badged < totals.cards,
      '合計: バッジ付きが1枚以上かつ全枚数未満', { badged: totals.badged, cards: totals.cards });
    ok(totals.national >= 1, '合計: 全国級バッジが1枚以上実在する', totals.national);
    ok(totals.local >= 1, '合計: 地方級バッジが1枚以上実在する', totals.local);
    ok(totals.dup === 0, '合計: 理由行と地方級バッジの重複が0件', totals.dup);

    // R233-2 ★別軸(画面の badged を通らない): 材料(backlinks と理由行)から組み直した
    // 期待枚数と、画面に出ている枚数を **種類ごとに** 5エリア合計で突き合わせる。
    // - バッジを1枚も描かない壊し方 → 期待は残るが画面が0になるので落ちる。
    // - 2種類の文言を入れ替える壊し方 → 合計枚数は不変でも種類ごとの数が入れ替わるので落ちる。
    ok(totals.expectNational >= 1 && totals.national === totals.expectNational,
      '合計: 全国級バッジの枚数が材料からの期待枚数と一致する',
      { actual: totals.national, expect: totals.expectNational });
    ok(totals.expectLocal >= 1 && totals.local === totals.expectLocal,
      '合計: 地方級バッジの枚数が材料からの期待枚数と一致する',
      { actual: totals.local, expect: totals.expectLocal });
    // 5エリア合計のカード枚数の下限(エリア単位の下限とは別軸。全エリアが同時に空になっても落ちる)
    ok(totals.cards >= AREAS.length,
      `合計: カードが5エリア合計で ${AREAS.length} 枚以上`, totals.cards);

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
  console.error('check-fame 実行エラー:', err);
  process.exitCode = 1;
});
