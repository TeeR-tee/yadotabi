// R83/R123: 要約が無いカードの代替文(NO_SUMMARY_TEXT / HAS_ARTICLE_NO_SUMMARY_TEXT)の機械検査
// 使い方: node scripts/check-nosummary.mjs
// 事前に別ターミナルでローカルサーバーを起動しておくか、単体実行時はこのスクリプトが
// scripts/lib/server.mjs の ensureServer() 経由で python -m http.server を空きポートで起動し検証後に落とす
// (check-all.mjs 経由なら親が YADOTABI_BASE で既存サーバーを渡すのでこの本は自分では起動しない)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない)。check-distance.mjs の作りを踏襲する。
//
// 確認項目(?fixture=dogo 展開後全件。R155で打ち切りが理由付き候補の実数=28枚に変更):
//   1. 真に記事が無い枚数すべてに .feedcard__summary--none が付き、NO_SUMMARY_TEXT と一致
//      (R123: 「要約なし」のうち一部は wikipedia/wikidata タグを持ち記事が実在するため、
//      NO_SUMMARY_TEXT ではなく HAS_ARTICLE_NO_SUMMARY_TEXT に切り替わる)
//   2. 要約ありのカードには --none が付かない
//   3. .feedcard__summary の総数が展開後の全件数と一致(要約有無にかかわらず全カードに1本)
//   4. .feedcard__summary--none の getComputedStyle().color が .feedcard__summary の既定色と異なる
//   5. コンソールエラー0件
//   6. R123: 記事が実在する8枚(10位松山城 等)は HAS_ARTICLE_NO_SUMMARY_TEXT を含み、
//      真に記事が無い12枚は NO_SUMMARY_TEXT ちょうどに一致すること(誤爆0件を1枚ずつ確認)
//   7. R124: wikipediaTitle が無く wikidataId しか無い候補(?fixture=beppu「別府市美術館」)でも
//      要約行にリンクが出ること(Wikidata転送URL経由。行き止まり修正の不変条件)
//   8. R124/R149: 5エリア全カードで、HAS_ARTICLE_NO_SUMMARY_TEXT を含む .feedcard__summary--none には
//      必ず a[href] が1本以上あること(「記事はあります」と言っておいてリンクが無い行き止まりが無い)
//   (r136) 営業時間(.feedcard__hours)の表示。判定はせず表記を読める形にするだけの検査:
//      a. 営業時間があるカード(dogo #27 椿の湯・#9 愛媛大学ミュージアム 等)に .feedcard__hours が
//         正しい文言で出る(正常系5例をカード実測で突き合わせる)
//      b. 営業時間がある(取得済みの)季節分岐カード(dogo #10 松山城)には .feedcard__hours が
//         出ない(null に倒す)こと。opening_hours を持たない通常カード(dogo #1)にも出ないこと
//      c. .feedcard__hours の総数が「5エリアで openingHoursText が読める枚数」ちょうどと一致
//         (engine.js が openingHours を捨てずカードまで運んでいることの確認)
//   (r137) 公式サイトのドメイン(.feedcard__official)の表示。推測せず、解析できた分だけ出す検査:
//      a. 公式サイトを持つカード(dogo 萬翠荘 https://www.bansuisou.org/)に .feedcard__official が
//         出て、www. を剥がしたホスト名(bansuisou.org)ちょうどになる
//      b. 公式サイトを持たないカード(dogo 光泉寺は公式リンクがない = .feedcard__links に「公式」チップ無し)
//         には .feedcard__official が出ない
//      c. 5エリアの .feedcard__official 総数が実測(kusatsu 9 / hakone 7 / dogo 5 / beppu 11 / kinosaki 4 = 36枚)と一致

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

let BASE;

const NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';
const HAS_ARTICLE_NO_SUMMARY_TEXT = 'Wikipediaに記事はありますが、要約をここに出せていません。';
// R123: dogo で記事が実在するのに要約が無い8枚(wikipedia/wikidataタグの裏付けあり)
// R154(colimit=max)後の実測。Wikipedia記事は実在するが要約(extract)が
// 取得上限で届かなかったカード = HAS_ARTICLE_NO_SUMMARY_TEXT 側になる名前。
const DOGO_HAS_ARTICLE_NAMES = [
  '伊佐爾波神社',
  '坂の上の雲ミュージアム',
  '萬翠荘',
  '宝厳寺',
  '子規記念博物館',
];

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// R152: 初期表示は5枚に絞られたので、枚数や要素数を数える検査は
// 「もっと見る」を展開した全件(R155: 理由付き候補の実数)を母数にする。
async function expandAll(p) {
  const btn = p.locator('#more-btn');
  if (await btn.count()) {
    await btn.click();
    await waitFor(900);
  }
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

    // R152: 初期カードは5枚になり、その5枚は全て要約を持つ(--none が出ない)。
    // 「要約が無いときの文言」を検査するのがこの本の目的なので、「もっと見る」を
    // 展開した全件(R155実測: dogo 28件)を母数にする。
    if (await page.locator('#more-btn').count()) {
      await page.locator('#more-btn').click();
      await waitFor(900);
    }

    const totalCardCount = await page.locator('.feedcard').count();
    const summaryCount = await page.locator('.feedcard__summary').count();
    // R154実測: dogo 展開後15件、全カードに.feedcard__summaryが1本ずつ付く。
    ok(summaryCount === totalCardCount && totalCardCount === 15, '3. .feedcard__summary の総数が展開後の全件数(15)と一致', summaryCount);

    const noneCount = await page.locator('.feedcard__summary--none').count();
    // R154実測: dogo 展開後15件のうち8件が--none(記事ありHAS_ARTICLE 5 + 記事なし3)。
    ok(noneCount === 8, '2. .feedcard__summary--none の件数が8(5+3)', noneCount);

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

    // R154実測(展開後15件が母数): 記事が実在するもの5枚、真に記事が無いもの3枚。
    ok(
      hasArticleRows.length === 5 && hasArticleRows.every((r) => r.noneText.indexOf(HAS_ARTICLE_NO_SUMMARY_TEXT) === 0),
      '6a. 記事が実在する5枚がHAS_ARTICLE_NO_SUMMARY_TEXTになっている',
      hasArticleRows
    );
    ok(
      noArticleRows.length === 3 && noArticleRows.every((r) => r.noneText === NO_SUMMARY_TEXT),
      '6b. 真に記事が無い3枚がNO_SUMMARY_TEXTちょうどのまま(誤爆0件)',
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

    // R124: wikidataId しか無い候補でもリンクが出ること(?fixture=beppu)
    // R154: 「うみたまご」は colimit=max で要約が付き --none から外れたため、
    // wikidata タグのみ(wikipedia タグ無し)で要約が届いていない「別府市美術館」に差し替える。
    const beppuPage = await context.newPage();
    const beppuConsoleErrors = [];
    beppuPage.on('console', (msg) => { if (msg.type() === 'error') beppuConsoleErrors.push(msg.text()); });
    beppuPage.on('pageerror', (err) => beppuConsoleErrors.push(String(err)));
    await beppuPage.goto(`${BASE}/?fixture=beppu`, { waitUntil: 'load' });
    await waitFor(1500);
    await expandAll(beppuPage);

    const umitamagoRow = await beppuPage.locator('.feedcard').evaluateAll((cards) => {
      const card = cards.find((c) => {
        const nameEl = c.querySelector('.feedcard__name');
        return nameEl && nameEl.textContent.indexOf('別府市美術館') !== -1;
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
    // R162: geo.js の resolveWikipediaTitles が wikidata タグから記事名を復元するように
    // なったため、「別府市美術館」は Q番号 → jawiki「別府市美術館」が解決され、
    // Wikidata の転送URLではなく**記事への直リンク**が出るようになった(行き止まりの
    // 解消としてはより良い側への変化)。不変条件は R124 と同じ「リンクが必ず1本出る」で、
    // 転送URL・直リンクのどちらでも満たしていればよい、という判定に緩める。
    const WIKIDATA_REDIRECT_RE = /^https:\/\/www\.wikidata\.org\/wiki\/Special:GoToLinkedPage\/jawiki\/Q[1-9][0-9]*$/;
    const WIKIPEDIA_ARTICLE_RE = /^https:\/\/ja\.wikipedia\.org\/wiki\/\S+$/;
    ok(
      !!umitamagoRow && !!umitamagoRow.href &&
        (WIKIDATA_REDIRECT_RE.test(umitamagoRow.href) || WIKIPEDIA_ARTICLE_RE.test(umitamagoRow.href)) &&
        umitamagoRow.target === '_blank' && umitamagoRow.rel === 'noopener',
      '7. wikidataId のみの候補(別府市美術館)に記事リンク(転送URLまたは直リンク)が出る',
      umitamagoRow
    );

    // R124: 5エリア全カードで、HAS_ARTICLE_NO_SUMMARY_TEXT を含む --none には必ずリンクが1本以上あること
    // 2026-09-18 R149: kinosaki を追加(既存のページ使い回し構造に合わせ、
    // kusatsu/beppu以外・dogo以外は context.newPage() で開いて finally 前で close する)
    const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];
    const deadEnds = [];
    for (const area of AREAS) {
      const areaPage = area === 'beppu' ? beppuPage : (area === 'dogo' ? page : await context.newPage());
      if (area !== 'beppu' && area !== 'dogo') {
        await areaPage.goto(`${BASE}/?fixture=${area}`, { waitUntil: 'load' });
        await waitFor(1500);
        await expandAll(areaPage);
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
    ok(deadEnds.length === 0, '8. 5エリアで「記事はあります」文言なのにリンクが0本のカードが無い', deadEnds);

    // (r136) 営業時間表示。dogo は page(既に開いている)を再利用する。
    const dogoHours = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        hoursText: c.querySelector('.feedcard__hours') ? c.querySelector('.feedcard__hours').textContent : null,
      }))
    );
    // R152: 椿の湯(旧#27)は15枚打ち切りの外に出たので a1 は廃止。
    // 営業時間が出ることは下の a3(伊佐爾波神社)で引き続き見ている。
    // R154: 愛媛大学ミュージアム(旧#9)は15枚打ち切りの外に出た。曜日レンジ付きの
    // 営業時間を持つカードとして萬翠荘で同じ性質(.feedcard__hours が出ること)を見る。
    const univMuseum = dogoHours.find((r) => r.name === '萬翠荘');
    ok(
      !!univMuseum && univMuseum.hoursText === '⏰ 火〜日 9:00-18:00',
      '(r136) a2. 萬翠荘に営業時間が出る',
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
    await expandAll(kusatsuPage);
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

    // (r136) c. 5エリア合計の .feedcard__hours 件数が実測どおりであることの確認
    // (rank・候補集合は不変のため、この本数が動いたら engine 側で openingHours を
    // 取りこぼした/余計に付けた regression の合図になる)
    const hakonePage = await context.newPage();
    await hakonePage.goto(`${BASE}/?fixture=hakone`, { waitUntil: 'load' });
    await waitFor(1500);
    await expandAll(hakonePage);
    const kinosakiPage = await context.newPage();
    await kinosakiPage.goto(`${BASE}/?fixture=kinosaki`, { waitUntil: 'load' });
    await waitFor(1500);
    await expandAll(kinosakiPage);
    const beppuHoursCount = await beppuPage.locator('.feedcard__hours').count();
    const hakoneHoursCount = await hakonePage.locator('.feedcard__hours').count();
    const kusatsuHoursCount = await kusatsuPage.locator('.feedcard__hours').count();
    const dogoHoursCount = await page.locator('.feedcard__hours').count();
    const kinosakiHoursCount = await kinosakiPage.locator('.feedcard__hours').count();
    const total = kusatsuHoursCount + hakoneHoursCount + dogoHoursCount + beppuHoursCount + kinosakiHoursCount;
    // 2026-09-19 R154 実測(colimit=max で候補が入れ替わった後): kusatsu 5 / hakone 5 / dogo 2 / beppu 5 / kinosaki 2 = 合計19枚。
    ok(
      kusatsuHoursCount === 5 && hakoneHoursCount === 5 && dogoHoursCount === 2 && beppuHoursCount === 5 &&
        kinosakiHoursCount === 2 && total === 19,
      '(r136) c. 5エリアの .feedcard__hours 件数が実測(5/5/2/5/2=19)と一致',
      { kusatsuHoursCount, hakoneHoursCount, dogoHoursCount, beppuHoursCount, kinosakiHoursCount, total }
    );

    // (r137) 公式サイトのドメイン(.feedcard__official)。推測せず、解析できた分だけ出す検査。
    const officialRows = await page.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => ({
        name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
        officialText: c.querySelector('.feedcard__official') ? c.querySelector('.feedcard__official').textContent : null,
      }))
    );
    // R152: 萬翠荘(旧#24)は15枚打ち切りの外に出た。表示されるカードのうち
    // www. 付きの公式サイトを持つ「坂の上の雲ミュージアム」で同じ性質を見る。
    const sakanoue = officialRows.find((r) => r.name === '坂の上の雲ミュージアム');
    ok(
      !!sakanoue && sakanoue.officialText === '⧉ sakanouenokumomuseum.jp',
      '(r137) a. 坂の上の雲ミュージアム(公式サイトあり)に www. を剥がしたホスト名が出る',
      sakanoue
    );
    const yuJinja = officialRows.find((r) => r.name === '湯神社');
    ok(
      !!yuJinja && yuJinja.officialText === null,
      '(r137) b. 湯神社(公式サイトなし)には .feedcard__official が出ない',
      yuJinja
    );

    // (r137) c. 5エリア合計の .feedcard__official 件数が実測どおりであることの確認
    // 2026-09-18 R137 作業役実測: kusatsu 9 / hakone 6 / dogo 5 / beppu 11 = 合計31枚。
    // NEXT.md の計画時想定(dogo 6枚・合計32枚)とは dogo が1枚ズレる。fixtures/dogo.json を
    // 直接数えても website/contact:website 付き要素は上位30枚中5件しかなく、作業役の実測を採用する。
    // 2026-09-18 R147 で hakone が 6→7 に変化(合計31→32)。R147 でカテゴリ判定を
    // 定義文1文目のみに限定した結果、「長興山のシダレザクラ」が神社・寺院→スポットに
    // 変わって神社・寺院カテゴリの減点枠が1つ空き、公式サイトを持つ「阿弥陀寺」が
    // top30 に繰り上がったことによる正しい副作用(作業役実測)。
    // 2026-09-19 R154 実測(colimit=max で候補が入れ替わった後): kusatsu 7 / hakone 10 / dogo 5 / beppu 9 / kinosaki 3 = 合計34枚。
    // 打ち切りを緩めたぶん、公式サイトを持つカードも増えている。
    const officialCountKusatsu = await kusatsuPage.locator('.feedcard__official').count();
    const officialCountHakone = await hakonePage.locator('.feedcard__official').count();
    const officialCountDogo = await page.locator('.feedcard__official').count();
    const officialCountBeppu = await beppuPage.locator('.feedcard__official').count();
    const officialCountKinosaki = await kinosakiPage.locator('.feedcard__official').count();
    const officialTotal = officialCountKusatsu + officialCountHakone + officialCountDogo + officialCountBeppu + officialCountKinosaki;
    ok(
      officialCountKusatsu === 7 && officialCountHakone === 10 && officialCountDogo === 5 &&
        officialCountBeppu === 9 && officialCountKinosaki === 3 && officialTotal === 34,
      '(r137) c. 5エリアの .feedcard__official 件数が実測(7/10/5/9/3=34)と一致',
      { officialCountKusatsu, officialCountHakone, officialCountDogo, officialCountBeppu, officialCountKinosaki, officialTotal }
    );

    // (r139) 情報ゼロカードの空箱(196px)を低い帯に詰めた検査。
    // 写真・要約・営業時間・公式サイトが1つも無いカードだけ feedcard--bare が付き、
    // .feedcard__media の高さが下がる。他のカードは1pxも変えない。
    // R154(colimit=max): dogo は全カードに写真が付き bare カードが消滅したため、
    // bare カードが残る kusatsu(湯畑)で同じ性質を見る。検査の意図は不変。
    const bareRows = await kusatsuPage.locator('.feedcard').evaluateAll((cards) =>
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
    // R154: 参照先を kusatsu の「湯畑」に差し替える(要約×画像×営業時間×公式×で
    // bare 条件は同じ。検査の意図=bareカードの帯が畳まれていること、は不変)。
    const shotengai = bareRows.find((r) => r.name === '湯畑');
    // R140 で帯(.feedcard__media)そのものを畳んだため mediaHeight は null になる(要素が存在しない)。
    // これは R139 の「情報ゼロのカードの帯を圧縮する」という目的をさらに徹底した結果であり、
    // 検査の意図(bare カードに肥大した帯が残っていないこと)はこの条件で引き続き満たされる。
    ok(
      !!shotengai && shotengai.bare === true && shotengai.mediaHeight === null,
      '(r139) a. 情報ゼロのカード(kusatsu 湯畑)が feedcard--bare になり .feedcard__media の帯が無い(R140で畳んだ・R154でdogoから移動)',
      shotengai
    );
    const isaniwaBare = bareRows.find((r) => r.name === '大滝乃湯');
    ok(
      !!isaniwaBare && isaniwaBare.bare === false && isaniwaBare.mediaHeight === 196,
      '(r139) b. 情報のある大滝乃湯には feedcard--bare が付かず .feedcard__media が従来の196pxのまま',
      isaniwaBare
    );

    // (r140) 同じ絵文字を2回言うだけの帯(旧R139の64px)を畳み、番号バッジを
    // .feedcard__body 側へ移した検査。DOM上のバッジの data-no / aria-label / クラス名は不変。
    const bareDetailRows = await kusatsuPage.locator('.feedcard').evaluateAll((cards) =>
      cards.map((c) => {
        const noBtn = c.querySelector('.feedcard__no');
        return {
          name: c.querySelector('.feedcard__name') ? c.querySelector('.feedcard__name').textContent : '',
          bare: c.classList.contains('feedcard--bare'),
          hasMedia: !!c.querySelector('.feedcard__media'),
          hasPh: !!c.querySelector('.feedcard__ph'),
          index: Number(c.getAttribute('data-index')),
          noCount: c.querySelectorAll('.feedcard__no').length,
          phFontSize: c.querySelector('.feedcard__ph') ? getComputedStyle(c.querySelector('.feedcard__ph')).fontSize : null,
        };
      })
    );
    // R154: こちらも kusatsu の「湯畑」に参照先を差し替える。
    const shotengaiR140 = bareDetailRows.find((r) => r.name === '湯畑');
    ok(
      !!shotengaiR140 && shotengaiR140.bare === true && shotengaiR140.hasMedia === false && shotengaiR140.hasPh === false,
      '(r140) a. bare カード(kusatsu 湯畑)に .feedcard__media / .feedcard__ph が存在しない(帯を畳んだ)',
      shotengaiR140
    );
    // 「写真は無いが情報はある(isBare=false)」カードで .feedcard__ph が維持されることを確認する。
    // R154: kusatsu の大滝乃湯(写真なし・営業時間あり)で同じ性質を見る。
    const univMuseumR140 = bareDetailRows.find((r) => r.name === '大滝乃湯');
    ok(
      !!univMuseumR140 && univMuseumR140.bare === false && univMuseumR140.hasPh === true && univMuseumR140.phFontSize === '44px',
      '(r140) b. 非bare カード(大滝乃湯=写真なし情報あり)には .feedcard__ph が引き続き存在しフォントサイズ44pxのまま',
      univMuseumR140
    );
    // R159: 地図にピンが無い6件目以降(index>=5)は押しても何も起きない死んだボタンになるため
    // 番号バッジを出さない。初期5件(index<5)は今まで通り1つずつ持つ。
    const noMismatch = bareDetailRows.filter((r) => (r.index < 5 ? r.noCount !== 1 : r.noCount !== 0));
    ok(
      noMismatch.length === 0,
      '(r140) c. dogo 展開後、初期5件のみ .feedcard__no が1つずつ存在し6件目以降は無い(帯を畳んでもバッジ有無はindexで決まる)',
      noMismatch
    );

    await hakonePage.close();
    await kusatsuPage.close();
    await beppuPage.close();
    await kinosakiPage.close();

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
