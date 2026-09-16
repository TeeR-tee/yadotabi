// R83/R123: 要約が無いカードの代替文(NO_SUMMARY_TEXT / HAS_ARTICLE_NO_SUMMARY_TEXT)の機械検査
// 使い方: node scripts/check-nosummary.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、このスクリプトが
// 自分で `python -m http.server 3000` を起動して検証後に落とす。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-distance.mjs の作りを踏襲する。
//
// 確認項目(?fixture=dogo 上位30枚):
//   1. 真に記事が無い12枚すべてに .feedcard__summary--none が付き、NO_SUMMARY_TEXT と一致
//      (R123: 20枚だった「要約なし」のうち8枚は wikipedia/wikidata タグを持ち記事が実在するため、
//      NO_SUMMARY_TEXT ではなく HAS_ARTICLE_NO_SUMMARY_TEXT に切り替わる)
//   2. 要約ありの10枚には --none が付かない(--none の件数がちょうど20 = 12+8)
//      R119 で 19→20。要約を持つ「愛媛県立道後動物園」(既に無い施設)が候補から消え、
//      代わりに要約を持たない「御幸寺山」が30位に繰り上がったため。検査項目は減らしていない。
//   3. .feedcard__summary の総数が30(要約有無にかかわらず全カードに1本)
//   4. .feedcard__summary--none の getComputedStyle().color が .feedcard__summary の既定色と異なる
//   5. コンソールエラー0件
//   6. R123: 記事が実在する8枚(10位松山城 等)は HAS_ARTICLE_NO_SUMMARY_TEXT を含み、
//      真に記事が無い12枚は NO_SUMMARY_TEXT ちょうどに一致すること(誤爆0件を1枚ずつ確認)
//   7. R124: wikipediaTitle が無く wikidataId しか無い候補(?fixture=beppu 18位「うみたまご」)でも
//      要約行にリンクが出ること(Wikidata転送URL経由。行き止まり修正の不変条件)
//   8. R124: 4エリア全カードで、HAS_ARTICLE_NO_SUMMARY_TEXT を含む .feedcard__summary--none には
//      必ず a[href] が1本以上あること(「記事はあります」と言っておいてリンクが無い行き止まりが無い)

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

const NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';
const HAS_ARTICLE_NO_SUMMARY_TEXT = 'Wikipediaに記事はありますが、要約をここに出せていません。';
// R123: dogo で記事が実在するのに要約が無い8枚(wikipedia/wikidataタグの裏付けあり)
const DOGO_HAS_ARTICLE_NAMES = [
  '愛媛大学ミュージアム',
  '松山城',
  '勝山',
  '城山公園',
  '坂の上の雲ミュージアム',
  '媛彦温泉',
  '勝岡山',
  '萬翠荘',
];

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let serverProc = null;
  const alreadyRunning = await isPortOpen(PORT);
  if (!alreadyRunning) {
    serverProc = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
    });
    for (let i = 0; i < 25; i++) {
      if (await isPortOpen(PORT)) break;
      await waitFor(200);
    }
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`${BASE}/?fixture=dogo`, { waitUntil: 'load' });
    await waitFor(1500);

    const summaryCount = await page.locator('.feedcard__summary').count();
    ok(summaryCount === 30, '3. .feedcard__summary の総数が30', summaryCount);

    const noneCount = await page.locator('.feedcard__summary--none').count();
    ok(noneCount === 20, '2. .feedcard__summary--none の件数が20(12+8)', noneCount);

    // R123: カードごとに名前と--none本文を突き合わせ、記事あり8枚/記事なし12枚の文言を確認
    const cardRows = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        noneText: c.querySelector('.feedcard__summary--none') ? c.querySelector('.feedcard__summary--none').textContent : null,
      }))
    );
    const noneRows = cardRows.filter((r) => r.noneText !== null);
    const hasArticleRows = noneRows.filter((r) => DOGO_HAS_ARTICLE_NAMES.includes(r.name));
    const noArticleRows = noneRows.filter((r) => !DOGO_HAS_ARTICLE_NAMES.includes(r.name));

    ok(
      hasArticleRows.length === 8 && hasArticleRows.every((r) => r.noneText.indexOf(HAS_ARTICLE_NO_SUMMARY_TEXT) === 0),
      '6a. 記事が実在する8枚がHAS_ARTICLE_NO_SUMMARY_TEXTになっている',
      hasArticleRows
    );
    ok(
      noArticleRows.length === 12 && noArticleRows.every((r) => r.noneText === NO_SUMMARY_TEXT),
      '6b. 真に記事が無い12枚がNO_SUMMARY_TEXTちょうどのまま(誤爆0件)',
      noArticleRows
    );

    const noneTexts = noneRows.map((r) => r.noneText);
    const noneTextsMatch = noneTexts.every((t) => t === NO_SUMMARY_TEXT || t.indexOf(HAS_ARTICLE_NO_SUMMARY_TEXT) === 0);
    ok(noneTextsMatch, '1. --none のテキストが全てNO_SUMMARY_TEXTかHAS_ARTICLE_NO_SUMMARY_TEXTのいずれかと一致', noneTexts);

    const colors = await page.evaluate(() => {
      const none = document.querySelector('.feedcard__summary--none');
      const normal = document.querySelector('.feedcard__summary:not(.feedcard__summary--none)');
      return {
        none: none ? getComputedStyle(none).color : null,
        normal: normal ? getComputedStyle(normal).color : null,
      };
    });
    ok(
      !!colors.none && !!colors.normal && colors.none !== colors.normal,
      '4. --none の色が既定色と異なる',
      colors
    );

    ok(consoleErrors.length === 0, '5. コンソールエラー0件', consoleErrors);

    // R124: wikidataId しか無い候補でもリンクが出ること(?fixture=beppu 18位「うみたまご」)
    const beppuPage = await context.newPage();
    const beppuConsoleErrors = [];
    beppuPage.on('console', (msg) => { if (msg.type() === 'error') beppuConsoleErrors.push(msg.text()); });
    beppuPage.on('pageerror', (err) => beppuConsoleErrors.push(String(err)));
    await beppuPage.goto(`${BASE}/?fixture=beppu`, { waitUntil: 'load' });
    await waitFor(1500);

    const umitamagoRow = await beppuPage.locator('.feedcard').evaluateAll((cards) => {
      const card = cards.find((c) => {
        const nameEl = c.querySelector('.feedcard__name');
        return nameEl && nameEl.textContent.indexOf('うみたまご') !== -1;
      });
      if (!card) return null;
      const noneEl = card.querySelector('.feedcard__summary--none');
      const link = noneEl ? noneEl.querySelector('a[href]') : null;
      return {
        found: true,
        noneText: noneEl ? noneEl.textContent : null,
        href: link ? link.getAttribute('href') : null,
        target: link ? link.getAttribute('target') : null,
        rel: link ? link.getAttribute('rel') : null,
      };
    });
    ok(
      !!umitamagoRow && !!umitamagoRow.href && /^https:\/\/www\.wikidata\.org\/wiki\/Special:GoToLinkedPage\/jawiki\/Q[1-9][0-9]*$/.test(umitamagoRow.href) &&
        umitamagoRow.target === '_blank' && umitamagoRow.rel === 'noopener',
      '7. wikidataId のみの候補(うみたまご)にWikidata転送リンクが出る',
      umitamagoRow
    );

    // R124: 4エリア全カードで、HAS_ARTICLE_NO_SUMMARY_TEXT を含む --none には必ずリンクが1本以上あること
    const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu'];
    const deadEnds = [];
    for (const area of AREAS) {
      const areaPage = area === 'beppu' ? beppuPage : (area === 'dogo' ? page : await context.newPage());
      if (area !== 'beppu' && area !== 'dogo') {
        await areaPage.goto(`${BASE}/?fixture=${area}`, { waitUntil: 'load' });
        await waitFor(1500);
      }
      const rows = await areaPage.locator('.feedcard__summary--none').evaluateAll((els) =>
        els.map((el) => ({
          text: el.textContent,
          linkCount: el.querySelectorAll('a[href]').length,
        }))
      );
      rows.forEach((r) => {
        if (r.text.indexOf(HAS_ARTICLE_NO_SUMMARY_TEXT) === 0 && r.linkCount < 1) {
          deadEnds.push({ area, text: r.text });
        }
      });
      if (area !== 'beppu' && area !== 'dogo') await areaPage.close();
    }
    ok(deadEnds.length === 0, '8. 4エリアで「記事はあります」文言なのにリンクが0本のカードが無い', deadEnds);

    await beppuPage.close();

    await context.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-nosummary 実行エラー:', err);
  process.exitCode = 1;
});
