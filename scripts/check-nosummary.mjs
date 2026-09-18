// R83/R123: 要約が無いカードの代替文(NO_SUMMARY_TEXT / HAS_ARTICLE_NO_SUMMARY_TEXT)の機械検査
// 使い方: node scripts/check-nosummary.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
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
//   (r136) 営業時間(.feedcard__hours)の表示。判定はせず表記を読める形にするだけの検査:
//      a. 営業時間があるカード(dogo #27 椿の湯・#9 愛媛大学ミュージアム 等)に .feedcard__hours が
//         正しい文言で出る(正常系5例をカード実測で突き合わせる)
//      b. 営業時間がある(取得済みの)季節分岐カード(dogo #10 松山城)には .feedcard__hours が
//         出ない(null に倒す)こと。opening_hours を持たない通常カード(dogo #1)にも出ないこと
//      c. .feedcard__hours の総数が「4エリアで openingHoursText が読める枚数」ちょうどと一致
//         (engine.js が openingHours を捨てずカードまで運んでいることの確認)
//   (r137) 公式サイトのドメイン(.feedcard__official)の表示。推測せず、解析できた分だけ出す検査:
//      a. 公式サイトを持つカード(dogo 萬翠荘 https://www.bansuisou.org/)に .feedcard__official が
//         出て、www. を剥がしたホスト名(bansuisou.org)ちょうどになる
//      b. 公式サイトを持たないカード(dogo 光泉寺は公式リンクがない = .feedcard__links に「公式」チップ無し)
//         には .feedcard__official が出ない
//      c. 4エリアの .feedcard__official 総数が実測(kusatsu 9 / hakone 6 / dogo 5 / beppu 11 = 31枚)と一致

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

let BASE;

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

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { base, stop } = await ensureServer();
  BASE = base;

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

    // (r136) 営業時間表示。dogo は page(既に開いている)を再利用する。
    const dogoHours = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        hoursText: c.querySelector('.feedcard__hours') ? c.querySelector('.feedcard__hours').textContent : null,
      }))
    );
    const tsubakinoyu = dogoHours.find((r) => r.name === '椿の湯');
    ok(
      !!tsubakinoyu && tsubakinoyu.hoursText === '⏰ 月〜日 6:30-23:00',
      '(r136) a1. 椿の湯(言い訳カード)に営業時間が出る',
      tsubakinoyu
    );
    const univMuseum = dogoHours.find((r) => r.name === '愛媛大学ミュージアム');
    ok(
      !!univMuseum && univMuseum.hoursText === '⏰ 10:00-16:30',
      '(r136) a2. 愛媛大学ミュージアムに営業時間が出る',
      univMuseum
    );
    const matsuyamajo = dogoHours.find((r) => r.name === '松山城');
    ok(
      !!matsuyamajo && matsuyamajo.hoursText === null,
      '(r136) b1. 松山城(季節分岐)には営業時間が出ない(null に倒す)',
      matsuyamajo
    );
    const isaniwa = dogoHours.find((r) => r.name === '伊佐爾波神社');
    ok(
      !!isaniwa && isaniwa.hoursText === '⏰ 月〜日 9:00-17:00',
      '(r136) a3. 伊佐爾波神社に営業時間が出る',
      isaniwa
    );
    const kojisenji = dogoHours.find((r) => r.name === '光泉寺');
    ok(
      !kojisenji || kojisenji.hoursText === null,
      '(r136) b2. opening_hours を持たないカード(光泉寺)には出ない',
      kojisenji
    );

    // kusatsu で「24時間」「ほか」付きの正常系も確認する
    const kusatsuPage = await context.newPage();
    await kusatsuPage.goto(`${BASE}/?fixture=kusatsu`, { waitUntil: 'load' });
    await waitFor(1500);
    const kusatsuHours = await kusatsuPage.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        hoursText: c.querySelector('.feedcard__hours') ? c.querySelector('.feedcard__hours').textContent : null,
      }))
    );
    const shiriyaki = kusatsuHours.find((r) => r.name === '尻焼温泉 川風呂');
    ok(
      !!shiriyaki && shiriyaki.hoursText === '⏰ 24時間',
      '(r136) a4. 尻焼温泉 川風呂(24/7)が「24時間」になる',
      shiriyaki
    );
    const otakinoyu = kusatsuHours.find((r) => r.name === '大滝乃湯');
    ok(
      !!otakinoyu && otakinoyu.hoursText === '⏰ 月〜日 9:00-21:00',
      '(r136) a5. 大滝乃湯に営業時間が出る',
      otakinoyu
    );

    // (r136) c. 4エリア合計の .feedcard__hours 件数が実測どおりであることの確認
    // (rank・候補集合は不変のため、この本数が動いたら engine 側で openingHours を
    // 取りこぼした/余計に付けた regression の合図になる)
    const hakonePage = await context.newPage();
    await hakonePage.goto(`${BASE}/?fixture=hakone`, { waitUntil: 'load' });
    await waitFor(1500);
    const beppuHoursCount = await beppuPage.locator('.feedcard__hours').count();
    const hakoneHoursCount = await hakonePage.locator('.feedcard__hours').count();
    const kusatsuHoursCount = await kusatsuPage.locator('.feedcard__hours').count();
    const dogoHoursCount = await page.locator('.feedcard__hours').count();
    const total = kusatsuHoursCount + hakoneHoursCount + dogoHoursCount + beppuHoursCount;
    // 2026-09-18 R136 実測: kusatsu 5 / hakone 4 / dogo 4 / beppu 5 = 合計18枚(NEXT.md想定どおり)。
    // dogo は opening_hours を持つカードが5枚(#1伊佐爾波神社・#9愛媛大学ミュージアム・
    // #10松山城・#24萬翠荘・#27椿の湯)だが、#10松山城は季節分岐で null に倒れるため表示は4枚。
    ok(
      kusatsuHoursCount === 5 && hakoneHoursCount === 4 && dogoHoursCount === 4 && beppuHoursCount === 5 && total === 18,
      '(r136) c. 4エリアの .feedcard__hours 件数が実測(5/4/4/5=18)と一致',
      { kusatsuHoursCount, hakoneHoursCount, dogoHoursCount, beppuHoursCount, total }
    );

    // (r137) 公式サイトのドメイン(.feedcard__official)。推測せず、解析できた分だけ出す検査。
    const officialRows = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        officialText: c.querySelector('.feedcard__official') ? c.querySelector('.feedcard__official').textContent : null,
      }))
    );
    const bansuisou = officialRows.find((r) => r.name === '萬翠荘');
    ok(
      !!bansuisou && bansuisou.officialText === '⧉ bansuisou.org',
      '(r137) a. 萬翠荘(公式サイトあり)に www. を剥がしたホスト名が出る',
      bansuisou
    );
    const yuJinja = officialRows.find((r) => r.name === '湯神社');
    ok(
      !!yuJinja && yuJinja.officialText === null,
      '(r137) b. 湯神社(公式サイトなし)には .feedcard__official が出ない',
      yuJinja
    );

    // (r137) c. 4エリア合計の .feedcard__official 件数が実測どおりであることの確認
    // 2026-09-18 R137 作業役実測: kusatsu 9 / hakone 6 / dogo 5 / beppu 11 = 合計31枚。
    // NEXT.md の計画時想定(dogo 6枚・合計32枚)とは dogo が1枚ズレる。fixtures/dogo.json を
    // 直接数えても website/contact:website 付き要素は上位30枚中5件しかなく、作業役の実測を採用する。
    // 2026-09-18 R147 で hakone が 6→7 に変化(合計31→32)。R147 でカテゴリ判定を
    // 定義文1文目のみに限定した結果、「長興山のシダレザクラ」が神社・寺院→スポットに
    // 変わって神社・寺院カテゴリの減点枠が1つ空き、公式サイトを持つ「阿弥陀寺」が
    // top30 に繰り上がったことによる正しい副作用(作業役実測)。
    const officialCountKusatsu = await kusatsuPage.locator('.feedcard__official').count();
    const officialCountHakone = await hakonePage.locator('.feedcard__official').count();
    const officialCountDogo = await page.locator('.feedcard__official').count();
    const officialCountBeppu = await beppuPage.locator('.feedcard__official').count();
    const officialTotal = officialCountKusatsu + officialCountHakone + officialCountDogo + officialCountBeppu;
    ok(
      officialCountKusatsu === 9 && officialCountHakone === 7 && officialCountDogo === 5 &&
        officialCountBeppu === 11 && officialTotal === 32,
      '(r137) c. 4エリアの .feedcard__official 件数が実測(9/7/5/11=32)と一致',
      { officialCountKusatsu, officialCountHakone, officialCountDogo, officialCountBeppu, officialTotal }
    );

    // (r139) 情報ゼロカードの空箱(196px)を低い帯に詰めた検査。
    // 写真・要約・営業時間・公式サイトが1つも無いカードだけ feedcard--bare が付き、
    // .feedcard__media の高さが下がる。他のカードは1pxも変えない。
    const bareRows = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => {
        const media = c.querySelector('.feedcard__media');
        const rect = media ? media.getBoundingClientRect() : null;
        return {
          name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
          bare: c.classList.contains('feedcard--bare'),
          mediaHeight: rect ? Math.round(rect.height) : null,
        };
      })
    );
    // R142(2026-09-18): dogo #16「商店街」は一般名詞そのものの名前のため候補から除外され、
    // #16「愛媛道後足湯カフェ 坊っちゃん」に繰り上がった(要約×画像×公式×でbare条件は同じ)。
    // 参照名をこれに差し替える(検査の意図=bareカードの帯が畳まれていること、は不変)。
    const shotengai = bareRows.find((r) => r.name === '愛媛道後足湯カフェ 坊っちゃん');
    // R140 で帯(.feedcard__media)そのものを畳んだため mediaHeight は null になる(要素が存在しない)。
    // これは R139 の「情報ゼロのカードの帯を圧縮する」という目的をさらに徹底した結果であり、
    // 検査の意図(bare カードに肥大した帯が残っていないこと)はこの条件で引き続き満たされる。
    ok(
      !!shotengai && shotengai.bare === true && shotengai.mediaHeight === null,
      '(r139) a. 情報ゼロのカード(愛媛道後足湯カフェ 坊っちゃん)が feedcard--bare になり .feedcard__media の帯が無い(R140で畳んだ・R142で商店街から繰り上がり)',
      shotengai
    );
    const isaniwaBare = bareRows.find((r) => r.name === '伊佐爾波神社');
    ok(
      !!isaniwaBare && isaniwaBare.bare === false && isaniwaBare.mediaHeight === 196,
      '(r139) b. 写真がある伊佐爾波神社には feedcard--bare が付かず .feedcard__media が従来の196pxのまま',
      isaniwaBare
    );

    // (r140) 同じ絵文字を2回言うだけの帯(旧R139の64px)を畳み、番号バッジを
    // .feedcard__body 側へ移した検査。DOM上のバッジの data-no / aria-label / クラス名は不変。
    const bareDetailRows = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => {
        const noBtn = c.querySelector('.feedcard__no');
        return {
          name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
          bare: c.classList.contains('feedcard--bare'),
          hasMedia: !!c.querySelector('.feedcard__media'),
          hasPh: !!c.querySelector('.feedcard__ph'),
          noCount: c.querySelectorAll('.feedcard__no').length,
          phFontSize: c.querySelector('.feedcard__ph') ? getComputedStyle(c.querySelector('.feedcard__ph')).fontSize : null,
        };
      })
    );
    // R142: こちらも「商店街」→「愛媛道後足湯カフェ 坊っちゃん」に参照先を差し替える。
    const shotengaiR140 = bareDetailRows.find((r) => r.name === '愛媛道後足湯カフェ 坊っちゃん');
    ok(
      !!shotengaiR140 && shotengaiR140.bare === true && shotengaiR140.hasMedia === false && shotengaiR140.hasPh === false,
      '(r140) a. bare カード(愛媛道後足湯カフェ 坊っちゃん)に .feedcard__media / .feedcard__ph が存在しない(帯を畳んだ)',
      shotengaiR140
    );
    // 伊佐爾波神社は写真あり(.feedcard__img)のため .feedcard__ph は元々存在しない。
    // 「写真は無いが情報はある(isBare=false)」カードで .feedcard__ph が維持されることを確認する。
    const univMuseumR140 = bareDetailRows.find((r) => r.name === '愛媛大学ミュージアム');
    ok(
      !!univMuseumR140 && univMuseumR140.bare === false && univMuseumR140.hasPh === true && univMuseumR140.phFontSize === '44px',
      '(r140) b. 非bare カード(愛媛大学ミュージアム=写真なし情報あり)には .feedcard__ph が引き続き存在しフォントサイズ44pxのまま',
      univMuseumR140
    );
    const allHaveOneNo = bareDetailRows.every((r) => r.noCount === 1);
    ok(
      allHaveOneNo,
      '(r140) c. dogo 全30枚で .feedcard__no が1つずつ存在する(帯を畳んでもバッジは消えない)',
      bareDetailRows.filter((r) => r.noCount !== 1)
    );

    await hakonePage.close();
    await kusatsuPage.close();
    await beppuPage.close();

    await context.close();
  } finally {
    await browser.close();
    await stop();
  }

  console.log('\n==== ' + pass + ' pass / ' + fail + ' fail ====');
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('check-nosummary 実行エラー:', err);
  process.exitCode = 1;
});
