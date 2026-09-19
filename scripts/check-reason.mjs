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
//   (b) 「この一帯で唯一のX」が付いたカードは、そのXのカテゴリラベルを持つカードが
//       cards+more(=理由の母数から選ばれた表示分)内に本当に1件だけ
//   (c) far に reason が付いていない(R152: more は理由付きのみを選ぶ仕様に変わったので reason を持つ)
//   (d) ?debug=1 の有無でカード名の並び順が完全一致(rank 無改変の証明)
//   (e) R227: 💡理由行の**優先順**が「代表的な◯◯ → 珍しい◯◯ → 歩いて行ける」であること
//
// ■ (e) が守っているもの(R227 の設計判断)
//   温泉街は宿の徒歩圏に見どころが集まるため、旧順(歩いて行ける が先頭)では上位5枚の
//   25枚中14枚(56%)が「歩いて行ける」という同じ文言になり、どれが何なのか区別できなかった。
//   距離は「徒歩◯分」がメタ行に既に出ているので、理由行は「その土地で何者か」を先に言う。
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
    return presented.cards.map((c) => {
      const d = c._debug || {};
      return {
        name: c.name,
        hasReason: !!c.reason,
        categoryLabel: c.categoryLabel,
        category: d.category,
        distanceM: isFinite(d.distanceM) ? d.distanceM : c.distanceM,
        backlinks: isFinite(d.backlinks) ? d.backlinks : null,
      };
    });
  }, area);

  return materials.map((m) => {
    const shown = dom.find((x) => x.name === m.name);
    return { ...m, shownReason: shown ? shown.reason : null };
  });
}

/**
 * R227: 材料から「あるべき理由行」を組み立てる。app.js の reasonText() と同じ優先順:
 *   代表的な◯◯ → 珍しい◯◯ → 歩いて行ける
 * app.js を読んで写すのではなく、仕様として独立に書くので、app.js 側を戻すと食い違って落ちる。
 */
function expectedReason(card, cardsInView, backlinksMin) {
  if (!card.hasReason) return null; // engine.js が理由なしと判定したカードは行ごと出さない
  const label = card.categoryLabel || 'スポット';
  const hasCategory = !!card.category && card.category !== 'other';
  const sameCat = cardsInView.filter((c) => c.categoryLabel === label && c.category === card.category);

  if (hasCategory) {
    const backlinks = isFinite(card.backlinks) ? card.backlinks : 0;
    if (backlinks >= backlinksMin) {
      const isMax = sameCat.every((c) => (isFinite(c.backlinks) ? c.backlinks : 0) <= backlinks);
      if (isMax) return PREFIX_REPRESENTATIVE + label;
    }
    if (sameCat.length === 1) return PREFIX_RARE + label;
  }
  if (isFinite(card.distanceM) && card.distanceM <= WALKABLE_MAX_M) return TEXT_WALKABLE;
  return null;
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

      // (b) 「この一帯で唯一のX」の X が cards 内に本当に1件だけ
      let uniqueOk = true;
      const uniqueDetails = [];
      shown.forEach((c) => {
        const m = c.reason && c.reason.match(/^この一帯で唯一の(.+)$/);
        if (!m) return;
        const label = m[1];
        const count = shown.filter((x) => x.categoryLabel === label).length;
        if (count !== 1) uniqueOk = false;
        uniqueDetails.push({ label, count });
      });
      ok(uniqueOk, `${area}: 「唯一のX」のXは表示カード内に本当に1件だけ`, uniqueDetails.filter((d) => d.count !== 1));

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
      const cards5 = await reasonWithMaterials(page, base, area);
      const mismatch = [];
      cards5.forEach((c) => {
        const expect = expectedReason(c, cards5, EXPECT_BACKLINKS_MIN);
        const actual = c.shownReason || null;
        if (expect !== actual) {
          mismatch.push({
            name: c.name, expect, actual,
            distanceM: c.distanceM, backlinks: c.backlinks, categoryLabel: c.categoryLabel,
          });
        }
      });
      ok(mismatch.length === 0,
        `${area}: 理由行が「代表的な→珍しい→歩いて行ける」の優先順どおり`, mismatch);

      // (e2) 代表格として選ばれたカードが「歩いて行ける」で潰されていないこと。
      // 優先順を元に戻すと、徒歩圏の代表格は全部「歩いて行ける」になるのでここが落ちる。
      const shouldBeRepresentative = cards5.filter((c) => {
        const e = expectedReason(c, cards5, EXPECT_BACKLINKS_MIN);
        return e && e.indexOf(PREFIX_REPRESENTATIVE) === 0;
      });
      const swallowed = shouldBeRepresentative.filter((c) => c.shownReason === TEXT_WALKABLE);
      ok(swallowed.length === 0,
        `${area}: 代表的な◯◯に当たるカードが「${TEXT_WALKABLE}」に潰されていない`,
        swallowed.map((c) => c.name));
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
