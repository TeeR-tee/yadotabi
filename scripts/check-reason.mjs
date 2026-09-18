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
//   (a) 理由あり件数が cards(30件)中 10件以上20件以下
//   (b) 「この一帯で唯一のX」が付いたカードは、そのXのカテゴリラベルを持つカードが cards 内に本当に1件だけ
//   (c) more/far に reason が付いていない
//   (d) ?debug=1 の有無でカード名の並び順が完全一致(rank 無改変の証明)

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

const AREAS = ['kusatsu', 'hakone', 'beppu', 'dogo', 'kinosaki'];

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
      more: (presented.more || []).map((c) => c.reason),
      far: (presented.far || []).map((c) => c.reason),
    };
  }, area);
}

async function main() {
  const { base, stop } = await ensureServer();

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

      // (a) 理由あり件数が10〜20件
      const withReason = data.cards.filter((c) => c.reason).length;
      ok(withReason >= 10 && withReason <= 20, `${area}: 理由あり件数が10〜20件`, withReason);

      // (b) 「この一帯で唯一のX」の X が cards 内に本当に1件だけ
      let uniqueOk = true;
      const uniqueDetails = [];
      data.cards.forEach((c) => {
        const m = c.reason && c.reason.match(/^この一帯で唯一の(.+)$/);
        if (!m) return;
        const label = m[1];
        const count = data.cards.filter((x) => x.categoryLabel === label).length;
        if (count !== 1) uniqueOk = false;
        uniqueDetails.push({ label, count });
      });
      ok(uniqueOk, `${area}: 「唯一のX」のXはcards内に本当に1件だけ`, uniqueDetails.filter((d) => d.count !== 1));

      // (c) more/far に reason が付いていない
      const moreFarHasReason = data.more.some(Boolean) || data.far.some(Boolean);
      ok(!moreFarHasReason, `${area}: more/far にreasonが付いていない`);

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
