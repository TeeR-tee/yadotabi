// R24: `?hotel=` の名前あり/なし見出しの機械検査
// 使い方: node scripts/check-hotelparam.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-more.mjs / check-a11y.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?hotel=<lat>,<lon>(名前なし) -> #feed-title が「この宿の周辺」
//   2. ?hotel=<lat>,<lon>,(末尾カンマ・名前空) -> 同じく「この宿の周辺」
//   3. ?fixture=kusatsu&embed=1&hotel=<lat>,<lon> -> 埋め込みでも「この宿の周辺」
//   4. ?hotel=<lat>,<lon>,ちょうしゅくの宿(名前あり) -> 「ちょうしゅくの宿」(従来どおり)
//   5. ?fixture=kusatsu(hotelなし) -> 「草津温泉」(括弧書きなし)のままデグレなし
//   各パターンでコンソールエラー0件も見る。
//
// R39: 固定データバッジ(#feed-badge)の機械検査
//   a. ?fixture=kusatsu で #feed-badge が可視かつ本文が「固定データ」
//   b. #feed-title の本文に「固定データ」を含まない
//   c. ?fixture=kusatsu&embed=1 でも #feed-badge が可視
//   d. ?hotel= のみ(fixtureなし)では #feed-badge が不可視
//   判定は el.hidden ではなく offsetParent / getComputedStyle().display まで確認する。
//
// R45: バッジの生成日付(#feed-badge-date)の機械検査
//   e. ?fixture=kusatsu でバッジ本文に /\d{4}-\d{2}-\d{2}/ にマッチする日付が含まれる
//   f. ?fixture=hakone / ?fixture=dogo でも同様に日付が出る
//   g. ?hotel=36.6226,138.5960(fixtureなし)では日付要素も不可視
//   h. #feed-title は従来どおり「草津温泉」のまま(日付がタイトル側に混入していない)
//
// R99: 範囲外座標(緯度-90〜90 / 経度-180〜180 の外)の機械検査
//   i. ?hotel=999,138.5960,テスト(緯度999) -> 状態A(地図可視・状態Bに遷移しない)
//   j. ?hotel=36.6226,999,テスト(経度999) -> 同上
//   k. ?hotel=abc,def,テスト(非数値) -> 同上(従来のisFinite経路の回帰確認)

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer, PROJECT_ROOT } from './lib/server.mjs';

let BASE;

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// R89: 固定待ちの代わりに「#feed-title の描画完了」を待つ共通ヘルパ。
// 各検査関数はこれに加えて自分固有の条件待ちも行う。
// タイムアウト(5000ms)時は例外を投げず false を返し、呼び出し側で FAIL として記録する
// (waitForFunction/waitForSelector が timeout で reject するのを catch して吸収する)。
async function waitRendered(page) {
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('#feed-title');
      return el && el.textContent.trim().length > 0;
    }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function checkTitle(browser, path, expectedTitle, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  const rendered = await waitRendered(page);

  const title = rendered ? await page.locator('#feed-title').textContent() : null;
  ok(rendered && title !== null && title.trim() === expectedTitle, label + ': 見出しが「' + expectedTitle + '」', rendered ? title : 'timeout waiting #feed-title');
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
}

async function checkBadgeVisible(browser, path, expectVisible, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  let timedOut = false;
  if (expectVisible) {
    try {
      await page.locator('#feed-badge').waitFor({ state: 'visible', timeout: 5000 });
    } catch { timedOut = true; }
  } else {
    // 不可視ケースは待つ対象が無いので #feed-title の描画完了を待つ
    // (早すぎるタイミングで不可視判定して誤PASSしないようにする)。
    const rendered = await waitRendered(page);
    if (!rendered) timedOut = true;
  }

  const badge = page.locator('#feed-badge');
  const visible = timedOut ? null : await badge.evaluate((el) => {
    return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  });
  ok(!timedOut && visible === expectVisible, label + ': #feed-badge が' + (expectVisible ? '可視' : '不可視'), timedOut ? 'timeout' : visible);
  if (expectVisible) {
    // R45: 生成日付が続くことがあるため「固定データ」を含むかで見る(厳密一致はしない)
    const text = timedOut ? '' : (await badge.textContent() || '').trim();
    ok(!timedOut && text.indexOf('固定データ') === 0, label + ': #feed-badge の本文が「固定データ」で始まる', timedOut ? 'timeout' : text);
  }
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
}

// R45: バッジの生成日付(#feed-badge-date)の機械検査
async function checkBadgeDate(browser, path, expectDate, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  let timedOut = false;
  if (expectDate) {
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#feed-badge-date');
        return el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'
          && /\d{4}-\d{2}-\d{2}/.test((el.textContent || '').trim());
      }, { timeout: 5000 });
    } catch { timedOut = true; }
  } else {
    const rendered = await waitRendered(page);
    if (!rendered) timedOut = true;
  }

  const dateEl = page.locator('#feed-badge-date');
  const visible = timedOut ? null : await dateEl.evaluate((el) => {
    return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  });
  ok(!timedOut && visible === expectDate, label + ': #feed-badge-date が' + (expectDate ? '可視' : '不可視'), timedOut ? 'timeout' : visible);
  if (expectDate) {
    const text = timedOut ? '' : (await dateEl.textContent() || '').trim();
    ok(!timedOut && /\d{4}-\d{2}-\d{2}/.test(text), label + ': #feed-badge-date が日付を含む', timedOut ? 'timeout' : text);
  }
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
}

// R105: ?q= が0件のとき .mapnote に案内文が出ることの検査
// Nominatim を page.route() で空配列に差し替えて再現する(外部APIは叩かない)。
async function checkQueryNoHit(browser, q, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.route('**nominatim.openstreetmap.org**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(`${BASE}/?q=${encodeURIComponent(q)}`, { waitUntil: 'load' });

  // R108: app.js の QUERY_ECHO_MAX(20字)切り詰めに合わせて期待文字列を組み立てる
  const shownQ = q.length > 20 ? q.slice(0, 20) + '…' : q;
  const expectedText = '「' + shownQ + '」は見つかりませんでした。エリアチップか検索から選べます。';
  let timedOut = false;
  try {
    await page.waitForFunction((text) => {
      const el = document.querySelector('.mapnote');
      return el && !el.hidden && el.textContent.trim() === text;
    }, expectedText, { timeout: 8000 });
  } catch { timedOut = true; }

  const note = page.locator('.mapnote');
  const visible = timedOut ? null : await note.evaluate((el) => !el.hidden);
  const text = timedOut ? '' : (await note.textContent() || '').trim();
  ok(!timedOut && visible === true, label + ': .mapnoteが可視', timedOut ? 'timeout' : visible);
  ok(!timedOut && text === expectedText, label + ': 本文が一致', timedOut ? 'timeout' : text);
  // R108: 長いqを渡しても案内文が規定の長さ(51字)以内に切り詰められていること
  ok(!timedOut && text.length <= 51, label + ': 本文が51文字以内(R108切り詰め)', timedOut ? 'timeout' : text.length);

  const mapVisible = await page.locator('#map').evaluate((el) => {
    return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  });
  ok(mapVisible, label + ': #mapが可視(状態Aのまま)', mapVisible);
  const feedTitle = (await page.locator('#feed-title').textContent() || '').trim();
  ok(feedTitle !== 'この宿の周辺', label + ': #feed-titleが「この宿の周辺」になっていない(状態Bに遷移していない)', feedTitle);
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await page.screenshot({ path: `${PROJECT_ROOT}screenshots/r105-q-nohit-mobile.png` });

  await context.close();
}

// R99: 範囲外座標(?hotel=999,999 など)が状態Aへ黙って落ちることの検査
async function checkStateA(browser, path, label) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  let timedOut = false;
  // 状態A(範囲外座標)では #feed-title が空のまま安定するため waitRendered は使えない。
  // 代わりに Leaflet が #map に leaflet-container クラスを付けて初期化完了する
  // タイミング(ensureMap() の同期処理)を待つ。
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('#map');
      return el && el.classList.contains('leaflet-container');
    }, { timeout: 5000 });
  } catch { timedOut = true; }

  const mapVisible = timedOut ? false : await page.locator('#map').evaluate((el) => {
    return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  });
  ok(!timedOut && mapVisible, label + ': #map が可視(状態A)', timedOut ? 'timeout' : mapVisible);
  const title = timedOut ? '' : (await page.locator('#feed-title').textContent() || '').trim();
  ok(!timedOut && title !== 'この宿の周辺', label + ': #feed-title が「この宿の周辺」になっていない(状態Bに遷移していない)', timedOut ? 'timeout' : title);
  ok(consoleErrors.length === 0, label + ': コンソールエラー0件', consoleErrors);

  await context.close();
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // 1. 名前なし
    await checkTitle(browser, '/?hotel=36.6226,138.5960', 'この宿の周辺', '1.名前なし');

    // 2. 末尾カンマ・名前空
    await checkTitle(browser, '/?hotel=36.6226,138.5960,', 'この宿の周辺', '2.末尾カンマ名前空');

    // 3. 埋め込み+fixture併用でも同じ既定名
    await checkTitle(browser, '/?fixture=kusatsu&embed=1&hotel=36.6226,138.5960', 'この宿の周辺', '3.embed併用');

    // 4. 名前ありは従来どおり
    await checkTitle(browser, '/?hotel=36.6226,138.5960,ちょうしゅくの宿', 'ちょうしゅくの宿', '4.名前あり');

    // 5. fixtureのみ(hotelなし)はデグレなし(括弧書きは外れた)
    await checkTitle(browser, '/?fixture=kusatsu', '草津温泉', '5.fixtureのみデグレなし');

    // a. ?fixture=kusatsu でバッジ可視+本文一致
    await checkBadgeVisible(browser, '/?fixture=kusatsu', true, 'a.fixtureでバッジ可視');

    // b. #feed-title の本文に「固定データ」を含まない
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
      const rendered = await waitRendered(page);
      const title = rendered ? (await page.locator('#feed-title').textContent() || '').trim() : '';
      ok(rendered && !title.includes('固定データ'), 'b. #feed-title に「固定データ」を含まない', rendered ? title : 'timeout');
      await context.close();
    }

    // c. embed併用でもバッジ可視
    await checkBadgeVisible(browser, '/?fixture=kusatsu&embed=1', true, 'c.embed併用でもバッジ可視');

    // d. ?hotel= のみ(fixtureなし)ではバッジ不可視
    await checkBadgeVisible(browser, '/?hotel=36.6226,138.5960', false, 'd.hotelのみでバッジ不可視');

    // e. ?fixture=kusatsu でバッジに生成日付が出る
    await checkBadgeDate(browser, '/?fixture=kusatsu', true, 'e.kusatsuで日付表示');

    // f. hakone / dogo でも同様に日付が出る
    await checkBadgeDate(browser, '/?fixture=hakone', true, 'f.hakoneで日付表示');
    await checkBadgeDate(browser, '/?fixture=dogo', true, 'f.dogoで日付表示');

    // g. ?hotel= のみ(fixtureなし)では日付要素も不可視
    await checkBadgeDate(browser, '/?hotel=36.6226,138.5960', false, 'g.hotelのみで日付不可視');

    // h. #feed-title は従来どおり「草津温泉」のまま(日付混入なし)
    await checkTitle(browser, '/?fixture=kusatsu', '草津温泉', 'h.タイトルに日付混入なし');

    // R99: 範囲外座標は?hotel=無しと同じく状態Aへ黙ってフォールバック
    await checkStateA(browser, '/?hotel=999,138.5960,テスト', 'i.緯度999は状態A');
    await checkStateA(browser, '/?hotel=36.6226,999,テスト', 'j.経度999は状態A');
    await checkStateA(browser, '/?hotel=abc,def,テスト', 'k.非数値は状態A(回帰)');

    // R105: ?q= が0件のとき .mapnote に案内文が出る
    await checkQueryNoHit(browser, 'そんちょうざいしないちめい', 'l.q0件でmapnote表示');

    // R108: 長い?q=でも案内文が規定の長さ以内(切り詰め確認)
    await checkQueryNoHit(browser, 'あ'.repeat(100), 'm.長いqでも案内文が規定長以内');
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-hotelparam 実行エラー:', err);
  process.exitCode = 1;
});
