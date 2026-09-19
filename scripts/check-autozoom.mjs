// R44: `?q=` 等でジャンプした先に宿0件なら1回だけ自動ズームアウトする機能の機械検査
// 使い方: node scripts/check-autozoom.mjs
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-nohotels.mjs の作りを踏襲する。
//
// 確認項目:
//   1. ?demo=autozoom で、初期 zoom 14 → 最終 zoom が 13 になる(1段だけ引けている)
//   2. 2回目の取得で宿ピンが1個以上描かれ、.mapnote が空(hidden)になる
//   3. ?demo=nohotels(常に0件)では zoom が 13 で止まり 12 にならない(下限を割らない・2回引かない)
//   4. 地図ドラッグ起点の0件では自動ズームが起きない(panBy 後に zoom 不変)
//   5. ?simulate=overpass504 相当の混雑時に zoom が変わらず、文言が「宿ピンの取得が混雑中です。…」のままである
//   6. コンソールエラー0件・外部ドメインへの fetch 0回
//   7. R113: 同じエリアチップを3回連打しても Overpass 相当のリクエストが増えない(1回目のみ)
//   8. R113: 別のエリアチップに切り替えると Overpass 相当のリクエストが増える(ガードが効きすぎていない裏取り)
//      ※ 7・8 は ?demo=autozoom を使わず、page.route() で overpass-api.de を fulfill しつつ回数を数える(通常モード)。

// R205: CI(ubuntu-latest)でも動かせるよう、Playwright の読み込み先を環境変数で差し替え可能にした。
// 環境変数 PLAYWRIGHT_IMPORT が無ければ従来どおり Windows の絶対パスを使うので、
// ローカル(みのるんのWindows機)の挙動は一切変わらない。
const PLAYWRIGHT_IMPORT =
  process.env.PLAYWRIGHT_IMPORT || 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_IMPORT);
import { ensureServer } from './lib/server.mjs';

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

function trackExternal(page, bucket) {
  page.on('request', (req) => {
    const url = req.url();
    // ページ自身のナビゲーション(127.0.0.1宛)は対象外。外部ドメインへの実リクエストだけを見る。
    if (url.startsWith(BASE)) return;
    if (url.includes('overpass') || url.includes('wikipedia') || url.includes('nominatim')) bucket.push(url);
  });
}

function trackConsoleErrors(page, bucket) {
  page.on('console', (msg) => { if (msg.type() === 'error') bucket.push(msg.text()); });
  page.on('pageerror', (err) => bucket.push(String(err)));
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

  const browser = await chromium.launch();
  try {
    // --- 1,2,6: ?demo=autozoom で 14 -> 13、宿ピンが出る、外部fetch/コンソールエラー0件 ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      const consoleErrors = [];
      trackExternal(page, externalRequests);
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?demo=autozoom`, { waitUntil: 'load' });
      await waitFor(1500);

      const zoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoom === 13, '1. ?demo=autozoom で最終 zoom が 13', zoom);

      const markerCount = await page.locator('.leaflet-marker-icon').count();
      ok(markerCount >= 1, '2. 自動ズーム後に宿ピンが1個以上', markerCount);

      const mapNote = page.locator('.mapnote');
      const noteHidden = await mapNote.evaluate((el) => el.hidden === true || el.offsetParent === null);
      ok(noteHidden, '2. .mapnote が空(hidden)になっている', noteHidden);

      ok(externalRequests.length === 0, '6. overpass/wikipedia/nominatim へのfetchが0回', externalRequests);
      ok(consoleErrors.length === 0, '6. コンソールエラー0件(autozoom)', consoleErrors);

      await context.close();
    }

    // --- 3: ?demo=nohotels は従来どおり 13 で止まり 12 にならない ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      trackExternal(page, externalRequests);

      await page.goto(`${BASE}/?demo=nohotels`, { waitUntil: 'load' });
      await waitFor(1500);

      // ?demo=nohotels は demoStateA の早期 return 経路(flyTo を経由しない)なので
      // 自動ズームの対象外 = 初期 zoom 14 のまま(12 まで落ちない = 下限violationが起きない)。
      const zoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoom === 14, '3. ?demo=nohotels の zoom が初期値のまま(デグレなし・自動ズーム対象外)', zoom);
      ok(externalRequests.length === 0, '3. ?demo=nohotels で外部fetchが0回', externalRequests);

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === 'この範囲には宿のデータがありません。エリアチップか検索から選べます。', '3. ?demo=nohotels のバナー文言が維持', text);

      await context.close();
    }

    // --- 4: ドラッグ(panBy)起点の0件では自動ズームが起きない ---
    // ?demo=autozoom の fetchHotelsInBbox 差し替えは 1回目=0件,2回目=宿1件,3回目以降=0件。
    // 初期表示(1回目→自動ズームで2回目)を終えたあと、ユーザーがドラッグすると
    // onMapMoved 経由で3回目の取得(0件)が走る。autoZoomArmed は flyTo 経由でしか立たないため
    // ここでは自動ズームが起きず、zoom は自動ズーム後の 13 のまま変わらないはず。
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const consoleErrors = [];
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?demo=autozoom`, { waitUntil: 'load' });
      await waitFor(1500);

      const zoomAfterAutozoom = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfterAutozoom === 13, '4. 前提: 自動ズーム後は zoom 13', zoomAfterAutozoom);

      // ドラッグして onMapMoved(debounce)経由の3回目取得(0件)を発生させる
      await page.evaluate(() => window.YadoApp.getMap().panBy([80, 80], { animate: false }));
      await waitFor(1500); // DEBOUNCE_MOVE_MS 経過を待つ

      const zoomAfterDrag = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfterDrag === 13, '4. ドラッグ起点の0件では自動ズームが起きない(zoom不変)', zoomAfterDrag);

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === 'この範囲には宿のデータがありません。エリアチップか検索から選べます。', '4. ドラッグ後は通常の0件バナーになる', text);

      ok(consoleErrors.length === 0, '4. コンソールエラー0件(ドラッグ)', consoleErrors);

      await context.close();
    }

    // --- 5: 混雑時(?simulate=overpass504)は自動ズームせず、混雑バナーのまま ---
    // flyTo 経由(エリアチップ)で autoZoomArmed を立てたうえで、実際の fetchHotelsInBbox が
    // overpassBusy エラーを投げることを確認する(demo=autozoom は使わず素の混雑シミュレーションで見る)。
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      const externalRequests = [];
      const consoleErrors = [];
      trackExternal(page, externalRequests);
      trackConsoleErrors(page, consoleErrors);

      await page.goto(`${BASE}/?simulate=overpass504`, { waitUntil: 'load' });
      await waitFor(1000);

      const zoomBefore = await page.evaluate(() => window.YadoApp.getMap().getZoom());

      // エリアチップをクリックして flyTo() を発火させる(autoZoomArmed が立つ経路)
      const chip = page.locator('.chip').first();
      await chip.click();
      await waitFor(1500);

      const zoomAfter = await page.evaluate(() => window.YadoApp.getMap().getZoom());
      ok(zoomAfter === zoomBefore, '5. 混雑時は flyTo 後も zoom が変わらない', { zoomBefore, zoomAfter });

      const mapNote = page.locator('.mapnote');
      const text = (await mapNote.textContent() || '').trim();
      ok(text === '宿ピンの取得が混雑中です。検索やエリアチップから選べます。', '5. 混雑バナー文言のまま', text);

      ok(externalRequests.length === 0, '6. 混雑シミュレーション時も外部fetchが0回', externalRequests);
      ok(consoleErrors.length === 0, '6. コンソールエラー0件(混雑)', consoleErrors);

      await context.close();
    }
    // --- 7,8(R113): 同じチップ連打で再取得が増えない/別チップでは増える ---
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      let overpassCount = 0;
      await page.route('**overpass-api.de/**', (route) => {
        overpassCount++;
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"elements":[]}' });
      });
      await page.route('**://nominatim.openstreetmap.org/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: '[]',
      }));

      // ?demo=zoomout 等の demoStateA 系URLは loadHotelsInView が早期returnして
      // fetchHotelsInBbox を一切呼ばないため検証にならない。通常モード(?demoなし)で見る。
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await waitFor(1200);
      const countAfterInitialLoad = overpassCount;

      const chips = page.locator('.chip');
      const firstChip = chips.first();
      await firstChip.click();
      await waitFor(800);
      const countAfterFirstClick = overpassCount;
      ok(countAfterFirstClick > countAfterInitialLoad, '7. 最初のチップ押下でOverpass相当のリクエストが発生', { countAfterInitialLoad, countAfterFirstClick });

      // 同じチップを連打(合計3回)しても増えない
      await firstChip.click();
      await waitFor(500);
      await firstChip.click();
      await waitFor(500);
      ok(overpassCount === countAfterFirstClick, '7. 同じチップを3回押してもリクエストが増えない', overpassCount);

      // aria-current は連打後も維持されている(チップ強調は壊れていない)
      const ariaCount = await page.locator('.chip[aria-current="true"]').count();
      ok(ariaCount === 1, '7. 連打後も aria-current が1個のまま', ariaCount);

      // 別のチップへ切り替えると増える
      const countBeforeSecondChip = overpassCount;
      const secondChip = chips.nth(1);
      await secondChip.click();
      await waitFor(800);
      ok(overpassCount > countBeforeSecondChip, '8. 別チップへ切り替えるとリクエストが増える', { countBeforeSecondChip, overpassCount });

      await context.close();
    }
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-autozoom 実行エラー:', err);
  process.exitCode = 1;
});
