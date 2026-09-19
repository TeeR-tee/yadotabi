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
//   (r167) 公式サイトのドメイン名の行(.feedcard__official)は市場調査(10_市場調査.md第9回)の
//      指摘で削除した。[公式]リンクとの重複表示だったため。5エリア全カードで0件であることを検査する。
//      同時に削除した TikTok/YouTube のリンクチップも、5エリア全カードで0件であることを検査する
//      (外部SNSリンクを5種類も出しているのは競合に例が無いとの指摘のため)。

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { ensureServer } from './lib/server.mjs';

let BASE;

const NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';
const HAS_ARTICLE_NO_SUMMARY_TEXT = 'Wikipediaに記事はありますが、要約をここに出せていません。';
// R123: dogo で記事が実在するのに要約が無いカード(wikipedia/wikidataタグの裏付けあり)。
// Wikipedia記事は実在するが要約(extract)が取得上限で届かなかったカード
// = HAS_ARTICLE_NO_SUMMARY_TEXT 側になる名前。
//
// 2026-09-19 R163 実測で更新。被リンク加点で dogo の表示候補が入れ替わり、
// 萬翠荘・宝厳寺が15枚の外に出て、代わりに5件が入った:
//   愛媛県美術館 / 石手寺 マントラ洞窟 / 第51番札所 石手寺 /
//   第50番札所 繁多寺 (Hanta-ji) / 松山総合公園
// **この5件はいずれも jawiki に記事が実在する**(愛媛県美術館・石手寺・繁多寺・
// 松山総合公園。collect 後の item.wikipediaTitle / wikidataId で全件確認済み)ので、
// 「記事はあります」表示は**正しい**。R154 時点のこのリストが「記事が無いはず」と
// 見なしていたのが古い前提だった、という更新であって判定は1つも緩めていない。
//
// なお R163 後の dogo は --none 8枚が**全件 HAS_ARTICLE 側**になり、
// 「真に記事が無い」カードは0枚になった(下の 6b を参照)。
const DOGO_HAS_ARTICLE_NAMES = [
  '愛媛県美術館',
  '石手寺 マントラ洞窟',
  '伊佐爾波神社',
  '第51番札所 石手寺',
  '第50番札所 繁多寺 (Hanta-ji)',
  '坂の上の雲ミュージアム',
  '子規記念博物館',
  '松山総合公園',
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
    // 2026-09-19 R164実測: dogo 展開後15件のうち9件が--none(記事あり8 + 記事なし1)。
    // R163 時点は 8件(記事あり8 + 記事なし0)だった。親記事の本文照合で
    // 振鷺閣(道後温泉本館の上の櫓。自分の記事は無い)が表示圏に入ったため +1。
    ok(noneCount === 9, '2. .feedcard__summary--none の件数が9(8+1)', noneCount);

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

    // 2026-09-19 R163 実測(展開後15件が母数): 記事が実在するもの8枚、真に記事が無いもの0枚。
    // R154 時点は 5枚 + 3枚 だったが、被リンク加点で表示候補が入れ替わり、
    // 入ってきた5件がすべて jawiki に記事を持つものだったため 8枚 + 0枚 になった。
    // **判定の中身(文言がどちらのテキストと一致するか)は1文字も変えていない**。
    ok(
      hasArticleRows.length === 8 && hasArticleRows.every((r) => r.noneText.indexOf(HAS_ARTICLE_NO_SUMMARY_TEXT) === 0),
      '6a. 記事が実在する8枚がHAS_ARTICLE_NO_SUMMARY_TEXTになっている',
      hasArticleRows
    );
    // 2026-09-19 R164実測: 1枚(振鷺閣)。親記事の本文照合で「記事は無いが
    // その土地の解説が名前を挙げた」候補が表示圏に入るようになったため、
    // R163 時点の0枚から1枚に戻った。**この検査が本当に見たいのは枚数ではなく
    // 「記事が無いカードの文言が NO_SUMMARY_TEXT ちょうどであること」**で、
    // そちらの判定は1文字も変えていない。
    ok(
      noArticleRows.length === 1 && noArticleRows.every((r) => r.noneText === NO_SUMMARY_TEXT),
      '6b. 真に記事が無い1枚がNO_SUMMARY_TEXTちょうどのまま(誤爆0件)',
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
    // 営業時間を持つカードとして萬翠荘で同じ性質(.feedcard__hours が出ること)を見た。
    // 2026-09-19 R163: 被リンク加点で表示候補が入れ替わり、萬翠荘も15枚の外に出た。
    // 見たい性質は「opening_hours を持つカードに .feedcard__hours が出ること」なので、
    // 表示内で営業時間を持つ「愛媛県美術館」に差し替える(曜日レンジ無しの時刻のみ形式。
    // 曜日レンジ付きの形式は下の a3 伊佐爾波神社「月〜日 9:00-17:00」で引き続き見ている)。
    const ehimeArt = dogoHours.find((r) => r.name === '愛媛県美術館');
    ok(
      !!ehimeArt && ehimeArt.hoursText === '⏰ 9:40-18:00',
      '(r136) a2. 愛媛県美術館に営業時間が出る',
      ehimeArt
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
    // 2026-09-19 R163 実測(被リンク加点で候補が入れ替わった後): kusatsu 4 / hakone 4 / dogo 3 / beppu 6 / kinosaki 2 = 合計19枚。
    // 合計は偶然19のままだが内訳が動いた。opening_hours を持つ候補が増減したのではなく、
    // 表示22件(cards5 + more)に入る顔ぶれが変わったことによる。
    // 2026-09-19 R164 実測(親記事の本文照合で候補が入れ替わった後):
    //   kusatsu 6 / hakone 4 / dogo 3 / beppu 6 / kinosaki 4 = 合計23枚。
    // 増えたのは外湯・源泉(御座之湯・熱乃湯・鴻の湯・御所の湯 など)が表示圏に入ったため。
    // これらは OSM に opening_hours を持つ現役の施設なので、増加は妥当。hakone は不変。
    ok(
      kusatsuHoursCount === 6 && hakoneHoursCount === 4 && dogoHoursCount === 3 && beppuHoursCount === 6 &&
        kinosakiHoursCount === 4 && total === 23,
      '(r136) c. 5エリアの .feedcard__hours 件数が実測(6/4/3/6/4=23)と一致',
      { kusatsuHoursCount, hakoneHoursCount, dogoHoursCount, beppuHoursCount, kinosakiHoursCount, total }
    );

    // R167: 公式サイトのドメイン名の行(.feedcard__official)は削除した。
    // 市場調査(10_市場調査.md 第9回)で「[公式]リンクと情報が重複している」と
    // 指摘されたため、要素自体を出さない仕様に変更。旧r137のa/b/cは
    // 「ドメイン名の行がどのカードにも一切出ない」ことを確認する検査に置き換える
    // (isBare の判定材料としての domainText 自体はapp.js内に残るが、画面表示はしない)。
    const officialCountKusatsu = await kusatsuPage.locator('.feedcard__official').count();
    const officialCountHakone = await hakonePage.locator('.feedcard__official').count();
    const officialCountDogo = await page.locator('.feedcard__official').count();
    const officialCountBeppu = await beppuPage.locator('.feedcard__official').count();
    const officialCountKinosaki = await kinosakiPage.locator('.feedcard__official').count();
    const officialTotal = officialCountKusatsu + officialCountHakone + officialCountDogo + officialCountBeppu + officialCountKinosaki;
    ok(
      officialTotal === 0,
      '(r167) 5エリア全カードで .feedcard__official(ドメイン名の行)が0件(R167で削除)',
      { officialCountKusatsu, officialCountHakone, officialCountDogo, officialCountBeppu, officialCountKinosaki, officialTotal }
    );

    // (r167) TikTok/YouTube のリンクチップも同時に削除した。5エリア全カードで
    // ラベル「TikTok」「YouTube」の .feedcard__link が1件も出ないことを確認する。
    async function countLabel(pg, label) {
      return pg.locator('.feedcard__link', { hasText: label }).evaluateAll(
        (els, l) => els.filter((el) => el.textContent.trim() === l).length,
        label
      );
    }
    const tiktokCounts = await Promise.all(
      [kusatsuPage, hakonePage, page, beppuPage, kinosakiPage].map((pg) => countLabel(pg, 'TikTok'))
    );
    const youtubeCounts = await Promise.all(
      [kusatsuPage, hakonePage, page, beppuPage, kinosakiPage].map((pg) => countLabel(pg, 'YouTube'))
    );
    const tiktokTotal = tiktokCounts.reduce((a, b) => a + b, 0);
    const youtubeTotal = youtubeCounts.reduce((a, b) => a + b, 0);
    ok(
      tiktokTotal === 0 && youtubeTotal === 0,
      '(r167) 5エリア全カードで TikTok/YouTube の .feedcard__link が0件(R167で削除)',
      { tiktokCounts, youtubeCounts }
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
