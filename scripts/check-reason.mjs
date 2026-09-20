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
//   (h) R233-3: 母数の下限(5エリア合計)と、cards5 を通らない別軸(展開後の全カードの文言照合)
//   (i) R240: 待ち方を固定時間から「描けたか」に替えたことを守る母数軸
//       (d で読んだカード名25件・展開後の枚数の下限)
//
// ■ (h) を足した理由(R233-3。「母数が0でも緑」を塞ぐ)
//   (e)(e2)(e3) の3つは `ok(mismatch.length === 0)` `ok(swallowed.length === 0)`
//   `ok(rareButWalkable.length === 0)` という形で、**母集団 cards5 が空でも必ず緑**になる。
//   しかも3つとも母数が cards5(= reasonWithMaterials() が返す materials.cards)という
//   **1本の軸から作られている**ので、cards5 が空になる壊し方をすると3件同時に緑になる。
//   → 対策は2本立て:
//     (h1) **母数そのものを検査項目に格上げ**する。エリア単位ではなく **5エリア合計**で
//          下限を置く(R226 で確立した形)。全エリアが同時に空になっても落ちる。
//     (h2) **cards5 を通らない別軸**を足す。(e) は初期5枚しか見ないので、
//          **「もっと見る」を開いた全カード(cards+more)** の理由行を材料から組み直して
//          1枚ずつ突き合わせる。(e) と同じ expectedReason() を使うが、母集団が別。
//
//   ★この別軸が本当に効くことは実測で確かめた(2026-09-24)。旧版(R233-2 時点)に対して:
//     - 壊し方C2「more のカードだけ『このあたりの代表的な◯◯』を『歩いて行ける』に差し替える」
//       → 旧版 59 pass / 0 fail(素通り)。理由行の**本数は78本のまま1本も変わらない**ので
//         (f)(g) のような枚数を数える検査では原理的に捕まえられない。画面では
//         「代表的な◯◯」30本が消えて「歩いて行ける」が60本に増えるという大きな嘘になる。
//     - 壊し方F「more のカードだけ『歩いて行ける』を『このあたりの代表的な◯◯』に格上げする」
//       → 旧版 59 pass / 0 fail(素通り)。本数不変のまま嘘の権威づけが増える。
//   ※計画役が推した2つの壊し方は**どちらも旧版で既に捕まった**ので採用していない:
//     「理由行の描画をやめる」→ 旧版 42 pass / 17 fail、
//     「歩いて行ける と 珍しい◯◯ の優先順を入れ替える」→ 旧版 58 pass / 1 fail。
//     「既に別の軸で守られている」ものを実証に使っても格上げの効果は示せない(R233-2 の教訓)。
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

// R233-3: (e)(e2)(e3) が見ている母集団の下限。**5エリア合計**で置く(エリア単位ではない)。
// 2026-09-24 の実測値: cards5 は5エリアとも5枚ちょうどで合計25枚、そのうち理由行が
// 画面に出ているのは24枚(箱根の1枚だけ engine.js が理由なしと判定して行を出さない)。
// shouldBeRepresentative は 草津1・箱根3・別府4・道後3・城崎1 の合計12枚で、
// **0件のエリアは無い**が、エリア単位の下限を置くと fixtures の更新で簡単に割れるので
// 合計で持つ。rareButWalkable の母数(徒歩800m以内の cards5)は
// 草津5・箱根2・別府1・道後3・城崎4 の合計15枚で、**別府は1枚しかない**。
// 下限は実測値そのものではなく、5エリア全滅を確実に捕まえられる控えめな値にしてある。
const EXPECT_CARDS5_TOTAL = 25;            // 5エリア × 初期5枚(この値は仕様上固定)
const EXPECT_CARDS5_SHOWN_MIN = 20;        // cards5 のうち画面に理由行が出ている枚数(実測24)
const EXPECT_REPRESENTATIVE_TOTAL_MIN = 6; // 代表格に当たる cards5 の合計(実測12)
const EXPECT_WALKABLE_TOTAL_MIN = 8;       // 徒歩800m以内の cards5 の合計(実測15)
// (h2) 別軸: 展開後(cards+more)の理由行の合計本数の下限(実測78本)。
const EXPECT_EXPANDED_REASON_TOTAL_MIN = 60;

// ===== R240: 待ち方を「描けたか」に替えたことを守る母数軸 =====
// 固定待ちを詰めたので、描け切る前に読んでしまうと**照合の中身は全部一致したまま母数だけが減る**
// (空集合に対する forEach は何も実行しないので mismatch 0 = 緑になる)。R233 で塞いだのと同じ型の穴が
// 待ち方の変更で再び開くため、読み取りの母数そのものを検査項目に持つ。
const EXPECT_DEBUG_NAMES_TOTAL = 25;  // (d) で読むカード名: 5エリア × 初期5枚(仕様上固定)
// 2026-09-24 実測の展開後枚数: kusatsu 24 / hakone 22 / beppu 17 / dogo 18 / kinosaki 23。
// 最小は別府の17枚。「もっと見る」を押す前に読むと初期5枚になるので、そこを確実に捕まえる値にする。
const EXPECT_EXPANDED_MIN_PER_AREA = 12;

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

// R240: 固定待ち(`waitFor(2000)` の素の setTimeout)を「描けたことを見て進む待ち方」に置き換える。
// 2026-09-24 実測: 5エリアとも `?fixture=` の描画完了は **103〜434ms**(goto の load 後から計測)、
// 「もっと見る」の展開は **45〜72ms** で終わっていた。つまり 2000ms / 1200ms の固定待ちは
// **実測の5〜25倍**を寝ており、この本の 79.6〜79.9s のうち大半がその待ちだった。
// 上限(タイムアウト)は必ず残す = 描けなければ待ち続けずに落ちる。
const RENDER_TIMEOUT_MS = 15000; // 実測 434ms の約35倍。描けないときは待ち続けず落とすための上限
const EXPAND_TIMEOUT_MS = 15000; // 実測 72ms に対する上限。同上

/**
 * R240: 「宿の提案が描き切った」ことを DOM だけで判定して待つ。
 * app.js の renderFeed() は読み込み中(state.stage が loading/wikifirst/osm/wiki)のあいだ
 *   - 実カードの後ろに `.feedcard--skeleton` を残す
 *   - `#feed-status` に「周辺を集めています…」等の進捗文言を出す
 *   - 「もっと見る」ボタンを出さない
 * ので、**スケルトンが消え・進捗文言が消え・実カードが1枚以上ある**の3つが揃った時点が
 * `state.stage === 'done'` の描画完了にあたる。app.js には手を入れず、画面に出ているものだけで判定する。
 */
async function waitRendered(page) {
  await page.waitForFunction(() => {
    const list = document.getElementById('feed-list');
    if (!list) return false;
    if (list.querySelector('.feedcard--skeleton')) return false;
    const status = document.getElementById('feed-status');
    if (status && !status.hidden && status.textContent.trim()) return false;
    return list.querySelectorAll('.feedcard').length > 0;
  }, null, { timeout: RENDER_TIMEOUT_MS });
}

/** R240: `?fixture=` を開いて描き切るまで待つ(goto + waitRendered の定型)。 */
async function openFixture(page, base, area, query) {
  await page.goto(`${base}/?fixture=${area}${query || ''}`, { waitUntil: 'load' });
  await waitRendered(page);
}

/**
 * R240: 「もっと見る」を押して、**カードが実際に増え切るまで**待つ。
 * 押す前の枚数を控えておき、`.feedcard` がそれを超えたことを見て進む
 * (固定待ちだと「増える前に読む」のを時間で祈っているだけになる)。
 * ボタンが無い/見えないときは押さずにそのまま返す(この本の従来の挙動と同じ)。
 */
async function expandMore(page) {
  const btn = page.locator('#more-btn');
  if (!(await btn.count()) || !(await btn.first().isVisible())) return;
  const before = await page.locator('.feedcard').count();
  await btn.first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('.feedcard').length > n,
    before,
    { timeout: EXPAND_TIMEOUT_MS }
  );
}

async function suggestData(page, base, area) {
  await openFixture(page, base, area);
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
  await openFixture(page, base, area);
  await expandMore(page);
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
  await openFixture(page, base, area);

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
 * R233-3 ★別軸: 「もっと見る」を開いた画面の**全カード(cards+more)**について、
 * 材料から組み直した期待文言と画面の文言を突き合わせるための材料を返す。
 *
 * (e)(e2)(e3) は母集団が cards5(初期5枚)の1本に寄っていて、6枚目以降を一度も見ない。
 * そのため「more のカードだけ文言を別の有効な文言に差し替える」壊し方は、理由行の
 * **本数が1本も変わらない**ので (f)(g) の枚数検査でも捕まえられず、素通りしていた。
 * ここは cards5 を経由せず、展開後の DOM と cards+more の材料を直接突き合わせる。
 *
 * 期待値の組み立ては app.js の reasonText() と同じく **行が出るか出ないかは初期5枚**、
 * **「珍しい」を名乗る資格は cards+more** という2つの母集団を使う(expectedReason と同じ)。
 */
async function expandedWithMaterials(page, base, area) {
  await openFixture(page, base, area);
  await expandMore(page);
  const dom = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.feedcard')).map((el) => {
      const nameEl = el.querySelector('.feedcard__name');
      const reasonEl = el.querySelector('.feedcard__reason');
      return {
        name: nameEl ? nameEl.textContent.trim() : '',
        reason: reasonEl ? reasonEl.textContent.trim().replace(/^💡\s*/, '') : '',
      };
    })
  );
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
    return {
      cards: presented.cards.map(toMaterial),
      more: (presented.more || []).map(toMaterial),
    };
  }, area);

  const pool = materials.cards.concat(materials.more);
  const all = pool.map((m) => {
    const shown = dom.find((x) => x.name === m.name);
    return { ...m, shownReason: shown ? shown.reason : null };
  });
  // R240 母数軸の材料: all.length は **材料側(engine の再計算)** の枚数なので、展開が
  // 効いていなくても 104 のまま動かない。画面に本当に何枚並んだかは dom.length で数える。
  return { all, cardsInView: materials.cards, pool, domCount: dom.length };
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

  // R233-3: (e)(e2)(e3) の母数を5エリア合計で積む(エリア単位だと全滅を捕まえられない)。
  // expandedChecked / expandedMismatch は cards5 を通らない別軸の母数。
  const totals = {
    cards5: 0, cards5Shown: 0, representative: 0, walkable: 0,
    expandedCards: 0, expandedReason: 0, expandedChecked: 0,
    // R240: 待ちを詰めた結果「描け切る前に読んで空振り」しても緑にならないための母数軸。
    debugNames: 0,   // (d) で読めたカード名の合計(5エリア × 初期5枚)
    expandedMin: Infinity, // 展開後カード枚数の最小値(エリア単位。展開が効いたことの下限)
  };
  const expandedMismatch = [];

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
      await openFixture(page, base, area);
      const namesNoDebug = await page.locator('.feedcard__name').allTextContents();
      await openFixture(page, base, area, '&debug=1');
      const namesDebug = await page.locator('.feedcard__name').allTextContents();
      // R240 母数軸: 名前を1つも読めていないと JSON.stringify([]) 同士が一致して緑になる。
      // 初期表示は5枚(仕様)なので、両方が5枚読めていることを一致の条件に含める。
      totals.debugNames += namesNoDebug.length;
      ok(
        namesNoDebug.length === 5 && namesDebug.length === 5 &&
          JSON.stringify(namesNoDebug) === JSON.stringify(namesDebug),
        `${area}: debug=1有無で並び順が完全一致(各5枚のカード名を照合)`,
        { noDebug: namesNoDebug.length, debug: namesDebug.length }
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
      // R233-3 (h1): mismatch.length === 0 は **cards5 が空でも必ず緑**になる形だった。
      // 何枚を突き合わせたのかを必ず表に出し、合計は main の最後で下限と突き合わせる。
      const cards5Shown = cards5.filter((c) => c.shownReason);
      totals.cards5 += cards5.length;
      totals.cards5Shown += cards5Shown.length;
      ok(mismatch.length === 0,
        `${area}: 理由行が「代表的な→歩いて行ける→珍しい」の優先順どおり`
        + `(${cards5.length}枚を照合)`, mismatch);

      // (e2) 代表格として選ばれたカードが「歩いて行ける」で潰されていないこと。
      // 優先順を元に戻すと、徒歩圏の代表格は全部「歩いて行ける」になるのでここが落ちる。
      const shouldBeRepresentative = cards5.filter((c) => {
        const e = expectedReason(c, cards5, EXPECT_BACKLINKS_MIN, shownPool);
        return e && e.indexOf(PREFIX_REPRESENTATIVE) === 0;
      });
      const swallowed = shouldBeRepresentative.filter((c) => c.shownReason === TEXT_WALKABLE);
      // R233-3 (h1): 母数 shouldBeRepresentative は cards5 より更に細い。0件のエリアは
      // 今のところ無い(草津1・箱根3・別府4・道後3・城崎1)が、0件になれば必ず緑になるので
      // 何枚見たかを表に出し、合計で下限を置く。
      totals.representative += shouldBeRepresentative.length;
      ok(swallowed.length === 0,
        `${area}: 代表的な◯◯に当たるカードが「${TEXT_WALKABLE}」に潰されていない`
        + `(${shouldBeRepresentative.length}枚を照合)`,
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
      // R233-3 (h1): この判定の母数は「徒歩800m以内の cards5」。別府は1枚しかないので
      // エリア単位の下限は置けない。何枚見たかを表に出し、合計で下限を置く。
      const walkableCards = cards5.filter((c) => isFinite(c.distanceM) && c.distanceM <= WALKABLE_MAX_M);
      totals.walkable += walkableCards.length;
      ok(rareButWalkable.length === 0,
        `${area}: 徒歩${WALKABLE_MAX_M}m以内のカードに「${PREFIX_RARE}◯◯」が出ていない`
        + `(${walkableCards.length}枚を照合)`,
        rareButWalkable.map((c) => ({ name: c.name, distanceM: c.distanceM, reason: c.shownReason })));

      // (h2) ★R233-3 別軸: cards5 を通らない。「もっと見る」を開いた**全カード**の理由行を
      // 材料から組み直して1枚ずつ突き合わせる。(e) は初期5枚しか見ないので、
      // 6枚目以降だけ文言を別の有効な文言にすり替える壊し方(本数は1本も変わらない)を
      // 素通りさせていた。ここは本数ではなく**中身**を見るので、それが落ちる。
      const exp = await expandedWithMaterials(page, base, area);
      totals.expandedCards += exp.all.length;
      // R240 母数軸: 「もっと見る」を押す前(または増え切る前)に読んでしまうと画面には
      // 初期5枚しか並んでいない。**材料側ではなく画面側の枚数**の最小値を控えて、
      // あとで下限と突き合わせる(材料側は engine の再計算なので展開の有無で動かない)。
      if (exp.domCount < totals.expandedMin) totals.expandedMin = exp.domCount;
      totals.expandedReason += exp.all.filter((c) => c.shownReason).length;
      exp.all.forEach((c) => {
        const expect = expectedReason(c, exp.cardsInView, EXPECT_BACKLINKS_MIN, exp.pool);
        const actual = c.shownReason || null;
        totals.expandedChecked++;
        if (expect !== actual) {
          expandedMismatch.push({
            area, name: c.name, expect, actual,
            distanceM: c.distanceM, backlinks: c.backlinks, categoryLabel: c.categoryLabel,
          });
        }
      });
    }

    // ===== R233-3: 母数の下限(軸1)と、cards5 を通らない別軸(軸2) =====
    console.log(
      `\n  合計: cards5 ${totals.cards5}枚(理由行あり ${totals.cards5Shown}枚)` +
      ` / 代表格 ${totals.representative}枚 / 徒歩圏 ${totals.walkable}枚` +
      ` / 展開後 ${totals.expandedCards}枚(理由行 ${totals.expandedReason}本・照合 ${totals.expandedChecked}枚)\n`
    );

    // (h1) 軸1: (e)(e2)(e3) の母数そのものを検査項目にする。**5エリア合計**で置くので、
    // 全エリアが同時に空になる壊し方(cards5 が1本の軸なので3件同時に緑になる)も落ちる。
    ok(totals.cards5 === EXPECT_CARDS5_TOTAL,
      `合計: (e)の母数 cards5 が ${EXPECT_CARDS5_TOTAL}枚`, totals.cards5);
    ok(totals.cards5Shown >= EXPECT_CARDS5_SHOWN_MIN,
      `合計: cards5 のうち画面に理由行が出ているのが ${EXPECT_CARDS5_SHOWN_MIN}枚以上`,
      { actual: totals.cards5Shown, expect: EXPECT_CARDS5_SHOWN_MIN });
    ok(totals.representative >= EXPECT_REPRESENTATIVE_TOTAL_MIN,
      `合計: (e2)の母数「代表的な◯◯に当たるカード」が ${EXPECT_REPRESENTATIVE_TOTAL_MIN}枚以上`,
      { actual: totals.representative, expect: EXPECT_REPRESENTATIVE_TOTAL_MIN });
    ok(totals.walkable >= EXPECT_WALKABLE_TOTAL_MIN,
      `合計: (e3)の母数「徒歩${WALKABLE_MAX_M}m以内のカード」が ${EXPECT_WALKABLE_TOTAL_MIN}枚以上`,
      { actual: totals.walkable, expect: EXPECT_WALKABLE_TOTAL_MIN });

    // (h2) 軸2: cards5 を通らない。展開後の全カードの理由行を材料から組み直して突き合わせる。
    // 母数(照合枚数)も同時に検査するので、ここも「0枚を照合して緑」にはならない。
    ok(totals.expandedReason >= EXPECT_EXPANDED_REASON_TOTAL_MIN,
      `合計: 展開後の理由行が5エリアで ${EXPECT_EXPANDED_REASON_TOTAL_MIN}本以上`,
      { actual: totals.expandedReason, expect: EXPECT_EXPANDED_REASON_TOTAL_MIN });
    ok(totals.expandedChecked > totals.cards5 && expandedMismatch.length === 0,
      `合計: 展開後の全カード(cards+more ${totals.expandedChecked}枚)の理由行が材料どおり`,
      { checked: totals.expandedChecked, cards5: totals.cards5, mismatch: expandedMismatch.slice(0, 8) });

    // ===== R240: 待ち方を「描けたか」に替えたことを守る母数軸 =====
    // 固定待ちを 2000ms/1200ms から「スケルトンが消えて実カードが並んだら進む」に替えたので、
    // 早すぎて読み取りが空振りしたときに**中身の照合が全部一致したまま緑になる**ことを塞ぐ。
    ok(totals.debugNames === EXPECT_DEBUG_NAMES_TOTAL,
      `合計: (d)で読んだカード名が ${EXPECT_DEBUG_NAMES_TOTAL}件(5エリア×初期5枚)`,
      { actual: totals.debugNames, expect: EXPECT_DEBUG_NAMES_TOTAL });
    ok(totals.expandedMin >= EXPECT_EXPANDED_MIN_PER_AREA,
      `合計: 「もっと見る」展開後のカード枚数がどのエリアも ${EXPECT_EXPANDED_MIN_PER_AREA}枚以上`
      + `(押す前に読むと初期5枚のまま)`,
      { min: totals.expandedMin, expect: EXPECT_EXPANDED_MIN_PER_AREA });

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
