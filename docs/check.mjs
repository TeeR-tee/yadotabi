// 本番公開物の死活チェックスクリプト
// 使い方: node docs/check.mjs
// Node 18+ の標準 fetch のみを使用(依存パッケージなし)。
//
// GitHub Pages サブパス (https://teer-tee.github.io/yadotabi/) に対して
// index.html / assets/*.js / assets/*.css / fixtures/kusatsu.json を GET し、
// 200 であること・最低限の内容が壊れていないことを確認する。
// 1行1項目で OK / NG を出力し、1件でも NG があれば exitCode = 1 にする。

const BASE = 'https://teer-tee.github.io/yadotabi/';

const TARGETS = [
  'index.html',
  'assets/app.js',
  'assets/geo.js',
  'assets/engine.js',
  'assets/style.css',
  'assets/tokens.css',
  'assets/ui.css',
  'fixtures/kusatsu.json',
  'fixtures/hakone.json',
  'fixtures/dogo.json',
  'fixtures/beppu.json',
  'fixtures/kinosaki.json',
];

const JS_FILES = new Set(['assets/app.js', 'assets/geo.js', 'assets/engine.js']);
const MIN_JS_BYTES = 1000;

let hasFailure = false;

// --- R33: 応答時間(ms)の記録 ---
// R46: レスポンスサイズ(bytes)も併せて記録する。timedFetch は res.body を消費しない
// (呼び出し元が後で res.text() / res.json() する)ため、まずは content-length ヘッダを
// 見ておく。ただし GitHub Pages は gzip 転送するため content-length は圧縮後サイズになり、
// ファイルの実サイズ(展開後)とは一致しない。本文を実際に読む checkTarget は、読んだ本文の
// 実バイト数で recordBytes() により上書きする(HEAD だけのリンク検査はヘッダ値のままでよい)。
const timings = []; // { label, ms, bytes }

// --- R150: 絶対しきい値による「遅い項目」の印 ---
// 平均比(N倍)は不採用。平均自体がコールド/ウォームで6.7倍swingし(実測20ms〜135ms)、
// 速い日は誤検知、遅い日(コールド時は平均がbimodal分布の谷に落ちる)は見逃す、逆向きに壊れる基準だったため。
const SLOW_MS = 500;
const VERY_SLOW_MS = 2000;

async function timedFetch(label, url, options) {
  const t0 = performance.now();
  const res = await fetch(url, options);
  const ms = Math.round(performance.now() - t0);
  const lenHeader = Number(res.headers.get('content-length'));
  const bytes = Number.isFinite(lenHeader) && lenHeader >= 0 ? lenHeader : null;
  timings.push({ label, ms, bytes });
  return { res, ms };
}

// 本文を実際に読んだ側から、実バイト数(展開後の実サイズ)で確定値に置き換える。
function recordBytes(label, bytes) {
  const entry = timings.find((t) => t.label === label);
  if (entry) entry.bytes = bytes;
}

function toKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function report(label, ok, detail) {
  const mark = ok ? 'OK' : 'NG';
  console.log(`[${mark}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!ok) hasFailure = true;
}

async function checkTarget(path) {
  const url = BASE + path;
  let res, ms;
  try {
    ({ res, ms } = await timedFetch(path, url));
  } catch (err) {
    report(path, false, `fetch失敗: ${err.message}`);
    return;
  }

  if (res.status !== 200) {
    report(path, false, `HTTP ${res.status}`);
    return;
  }
  const body = await res.text();
  const byteLength = Buffer.byteLength(body, 'utf8');
  recordBytes(path, byteLength);
  report(`${path} (HTTP 200)`, true, `${ms}ms / ${toKB(byteLength)}KB`);

  if (path === 'index.html') {
    const hasTitle = body.includes('<title>やどたび');
    report(`${path} に <title>やどたび が含まれる`, hasTitle);
  }

  if (path.startsWith('fixtures/')) {
    try {
      const json = JSON.parse(body);
      const hasLat = typeof json?.meta?.lat !== 'undefined';
      report(`${path} が JSON として妥当で meta.lat を持つ`, hasLat);
    } catch (err) {
      report(`${path} が JSON として妥当`, false, err.message);
    }
  }

  if (JS_FILES.has(path)) {
    const ok = byteLength >= MIN_JS_BYTES;
    report(`${path} のサイズが ${MIN_JS_BYTES}バイト以上`, ok, `${byteLength}バイト`);
  }
}

for (const path of TARGETS) {
  await checkTarget(path);
}

// --- ここから R22: index.html / demo/*.html のリンク切れ検査 ---
// 相対パス参照(css/js/iframe src/画像)と meta content(og:image等)を抽出し、
// 本番URLで200が返るかを確認する。外部ドメインは絶対に fetch しない。

// R216: 404.html を追加(4→5ページ)。GitHub Pages はリポジトリ直下の 404.html を
// 存在しないパスへの応答として自動で使う。ここに足さないとリンク切れ検査の対象外のままになる。
const HTML_PAGES = ['index.html', 'demo/embed-check.html', 'demo/hotel-page.html', 'demo/hotel-page-en.html', '404.html'];

// --- R214: 4ページの favicon href が全て同一であることを確認するための収集先 ---
const faviconHrefs = new Map();

async function collectLinks(page) {
  const url = BASE + page;
  let res, ms;
  try {
    ({ res, ms } = await timedFetch(`${page} のリンク検査用取得`, url));
  } catch (err) {
    report(`${page} のリンク検査用取得`, false, `fetch失敗: ${err.message}`);
    return [];
  }
  if (res.status !== 200) {
    report(`${page} のリンク検査用取得`, false, `HTTP ${res.status}`);
    return [];
  }

  const body = await res.text();
  const rawValues = [];
  const attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g;
  // og:image / twitter:image など「画像」系 meta の content のみを対象にする
  // (viewport や description 等のテキスト content を誤検出しないよう name/property を限定)
  const metaRe = /<meta[^>]+(?:property|name)\s*=\s*"(?:og:image|twitter:image)"[^>]*>/g;
  const metaContentRe = /content\s*=\s*"([^"]+)"/;
  let m;
  while ((m = attrRe.exec(body))) rawValues.push(m[1]);
  while ((m = metaRe.exec(body))) {
    const c = metaContentRe.exec(m[0]);
    if (c) rawValues.push(c[1]);
  }

  // --- R214: favicon(rel="icon")がインラインSVGデータURIで入っていることの検査 ---
  // HTMLコメントを除去してから探す(コメントアウトされた link タグを誤って「ある」と
  // 判定しないため)。
  const bodyWithoutComments = body.replace(/<!--[\s\S]*?-->/g, '');
  const iconMatch = /<link[^>]+rel\s*=\s*"?icon"?[^>]*>/i.exec(bodyWithoutComments);
  if (!iconMatch) {
    report(`${page} に rel="icon" の link がある`, false, 'rel="icon" が見つからない');
  } else {
    const hrefMatch = /href\s*=\s*"([^"]*)"/.exec(iconMatch[0]);
    const href = hrefMatch ? hrefMatch[1] : '';
    report(`${page} に rel="icon" の link がある`, true);
    report(`${page} の favicon href が data:image/svg+xml で始まる`, href.startsWith('data:image/svg+xml'), href.slice(0, 40));
    faviconHrefs.set(page, href);
  }

  const internalPaths = new Set();
  let externalCount = 0;

  for (const raw of rawValues) {
    // R214: data: URI(favicon 等)は外部ファイルではないためリンク検査の対象外とする
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('data:')) {
      continue;
    }
    if (/^https?:\/\//.test(raw)) {
      if (raw.startsWith(BASE)) {
        const resolved = new URL(raw);
        internalPaths.add(resolved.pathname.replace(/^\/yadotabi\//, ''));
      } else {
        externalCount++;
      }
      continue;
    }
    // 相対パス: ページの位置を基準に解決する
    const resolved = new URL(raw, url);
    if (!resolved.href.startsWith(BASE)) {
      report(`リンク ${page} → ${raw}`, false, 'サイト外に出た');
      continue;
    }
    internalPaths.add(resolved.pathname.replace(/^\/yadotabi\//, ''));
  }

  if (externalCount > 0) {
    report(`${page} 外部リンク ${externalCount}件(検査対象外)`, true);
  }

  return [...internalPaths];
}

async function checkLink(page, path) {
  const url = BASE + path;
  const label = `リンク ${page} → ${path}`;
  let res, ms;
  try {
    ({ res, ms } = await timedFetch(label, url, { method: 'HEAD' }));
  } catch (err) {
    report(label, false, `fetch失敗: ${err.message}`);
    return;
  }
  if (res.status !== 200) {
    // GitHub Pages が HEAD に非200を返す場合に備え、GETで1回だけ確認し直す
    try {
      ({ res, ms } = await timedFetch(label, url, { method: 'GET' }));
    } catch (err) {
      report(label, false, `fetch失敗: ${err.message}`);
      return;
    }
  }
  report(label, res.status === 200, `HTTP ${res.status} - ${ms}ms`);
}

for (const page of HTML_PAGES) {
  const links = await collectLinks(page);
  for (const path of links) {
    await checkLink(page, path || 'index.html');
  }
}
// --- ここまで R22 ---

// --- R214: 全ページの favicon href が全て同一であることの検査(1枚だけ更新し忘れる事故を防ぐ) ---
// R216: 対象が4ページ→5ページになったので、ラベルの数字を HTML_PAGES.length から作る。
{
  const hrefs = [...faviconHrefs.values()];
  const allSame = hrefs.length === HTML_PAGES.length && hrefs.every((h) => h === hrefs[0]);
  report(`${HTML_PAGES.length}ページの favicon href がすべて同一`, allSame, `${faviconHrefs.size}/${HTML_PAGES.length}件取得`);
}
// --- ここまで R214 ---

// --- R216: 404ページの「中身軸」 ---
// リンク軸(HTML_PAGES に入れたことで得られる到達性検査)だけでは、
//   ・案内文が英語に戻る(GitHub 既定の 404 に逆戻りする)
//   ・3本のリンクの行き先が互いに入れ替わる
// といった「リンクの本数もページ数も1本も変わらない壊れ方」を1つも捕まえられない。
// そこで本数の下限だけに頼らず、行き先と文言を1本ずつ名指しで照合する(R226 の教訓)。
{
  const page = '404.html';
  const url = BASE + page;
  let body = null;
  try {
    const { res } = await timedFetch(`${page} の中身検査用取得`, url);
    if (res.status !== 200) {
      report(`${page} の中身検査用取得`, false, `HTTP ${res.status}`);
    } else {
      body = await res.text();
    }
  } catch (err) {
    report(`${page} の中身検査用取得`, false, `fetch失敗: ${err.message}`);
  }

  if (body !== null) {
    // (1) 日本語の案内文であること。既定の英語404や英語への差し替えを捕まえる。
    //     「ページが無いこと」と「行き先があること」の両方が日本語で読める状態を条件にする。
    report(`${page} の見出しが日本語の「お探しのページはありません」`, body.includes('お探しのページはありません'));
    report(`${page} の本文に日本語の案内がある`, body.includes('このURLにページはありません'));

    // (2) 本文の日本語密度。単語1つを足しただけで緑に戻らないよう、全体が日本語であることを見る。
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    const jaChars = (text.match(/[ぁ-んァ-ヶ一-龥]/g) || []).length;
    report(`${page} の本文に日本語が100文字以上ある`, jaChars >= 100, `${jaChars}文字`);

    // (3) 3本のリンクが「どこを指しているか」まで照合する。
    //     本数だけを数えると、行き先を互いに入れ替える壊し方が素通りする。
    const EXPECTED_LINKS = [
      { href: 'https://teer-tee.github.io/yadotabi/', label: 'やどたび トップ' },
      { href: 'demo/hotel-page.html', label: '営業用デモ(日本語)' },
      { href: 'demo/hotel-page-en.html', label: '営業用デモ(英語)' },
    ];
    // <a href="..."> ... </a> を出現順に取り出し、href と中の文字列の対応を作る
    const anchors = [];
    const anchorRe = /<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let am;
    while ((am = anchorRe.exec(body))) {
      anchors.push({ href: am[1], text: am[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    }
    report(`${page} のリンクが3本ある`, anchors.length === 3, `${anchors.length}本`);
    for (const exp of EXPECTED_LINKS) {
      const hit = anchors.find((a) => a.href === exp.href);
      report(
        `${page} の「${exp.label}」の行き先が ${exp.href}`,
        Boolean(hit) && hit.text.includes(exp.label),
        hit ? `見出し「${hit.text.slice(0, 24)}」` : '該当する href が無い'
      );
    }

    // (4) 入力ゼロ原則: 入力欄・選択UIを置かない(R216)。
    const hasInputUi = /<(input|select|textarea|form)\b/i.test(body);
    report(`${page} に入力欄・選択UIが無い`, !hasInputUi);
  }
}
// --- ここまで R216 ---

// --- R34: README.md の画像もリンク検査に含める ---
// GitHub Pages は README.md をそのまま配信し、本番で HTTP 200 を返すことを確認済み。
// そのため本番URLから GET して抽出する方式を採る(ローカルfsフォールバックは不要だった)。

async function collectMarkdownLinks(page) {
  const url = BASE + page;
  let res, ms;
  try {
    ({ res, ms } = await timedFetch(`${page} のリンク検査用取得`, url));
  } catch (err) {
    report(`${page} のリンク検査用取得`, false, `fetch失敗: ${err.message}`);
    return [];
  }
  if (res.status !== 200) {
    report(`${page} のリンク検査用取得`, false, `HTTP ${res.status}`);
    return [];
  }

  const body = await res.text();
  const rawValues = [];
  // <img src="..."> 形式(HTMLタグ)
  const imgTagRe = /<img[^>]+src\s*=\s*"([^"]+)"/g;
  // ![alt](path) 形式(Markdown記法)
  const mdImgRe = /!\[[^\]]*\]\(([^)\s]+)/g;
  let m;
  while ((m = imgTagRe.exec(body))) rawValues.push(m[1]);
  while ((m = mdImgRe.exec(body))) rawValues.push(m[1]);

  const internalPaths = new Set();
  let externalCount = 0;

  for (const raw of rawValues) {
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) {
      continue;
    }
    if (/^https?:\/\//.test(raw)) {
      if (raw.startsWith(BASE)) {
        const resolved = new URL(raw);
        internalPaths.add(resolved.pathname.replace(/^\/yadotabi\//, ''));
      } else {
        externalCount++;
      }
      continue;
    }
    const resolved = new URL(raw, url);
    if (!resolved.href.startsWith(BASE)) {
      report(`リンク ${page} → ${raw}`, false, 'サイト外に出た');
      continue;
    }
    internalPaths.add(resolved.pathname.replace(/^\/yadotabi\//, ''));
  }

  if (externalCount > 0) {
    report(`${page} 外部リンク ${externalCount}件(検査対象外)`, true);
  }

  return [...internalPaths];
}

const MARKDOWN_PAGES = ['README.md'];

for (const page of MARKDOWN_PAGES) {
  const links = await collectMarkdownLinks(page);
  for (const path of links) {
    await checkLink(page, path || 'index.html');
  }
}
// --- ここまで R34 ---

// --- R109: iframe の sandbox / referrerpolicy の一貫性検査 ---
// 営業資料としてコピーされるタグが3箇所(demo/hotel-page.html の実iframeとタグ例コピー、README.md
// のタグ例)に手書きされている。どれか1箇所だけ直しても誰も気づけないため、3箇所の sandbox トークン
// 集合(順序は問わない)と referrerpolicy が互いに一致することを機械検査で止める。
// ローカルファイルを直接読むだけで、追加のネットワークアクセスは行わない。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const EXPECTED_SANDBOX = new Set(['allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox']);
const EXPECTED_REFERRERPOLICY = 'no-referrer';

function checkIframeAttrs(label, tagText) {
  if (!tagText) {
    report(`iframe属性 ${label}`, false, 'iframeタグが見つからない');
    return;
  }
  const sandboxMatch = /sandbox\s*=\s*"([^"]*)"/.exec(tagText);
  const referrerMatch = /referrerpolicy\s*=\s*"([^"]*)"/.exec(tagText);
  if (!sandboxMatch || !referrerMatch) {
    report(`iframe属性 ${label}`, false, 'sandbox または referrerpolicy が見つからない');
    return;
  }
  const actualSandbox = new Set(sandboxMatch[1].split(/\s+/).filter(Boolean));
  const sandboxOk =
    actualSandbox.size === EXPECTED_SANDBOX.size &&
    [...EXPECTED_SANDBOX].every((t) => actualSandbox.has(t));
  const referrerOk = referrerMatch[1] === EXPECTED_REFERRERPOLICY;
  report(
    `iframe属性 ${label}`,
    sandboxOk && referrerOk,
    `sandbox=[${[...actualSandbox].join(' ')}] referrerpolicy="${referrerMatch[1]}"`
  );
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

{
  const hotelPageBody = readFileSync(join(REPO_ROOT, 'demo/hotel-page.html'), 'utf8');

  // 実iframe(生HTML)
  const realIframeMatch = /<iframe\b[^>]*>/.exec(hotelPageBody);
  checkIframeAttrs('demo/hotel-page.html(実iframe)', realIframeMatch?.[0]);

  // <pre class="tag-example"> 内のコピー用タグ(HTMLエスケープ済み)
  const preMatch = /<pre class="tag-example">([\s\S]*?)<\/pre>/.exec(hotelPageBody);
  const decodedPre = preMatch ? decodeHtmlEntities(preMatch[1]) : '';
  const preIframeMatch = /<iframe\b[^>]*>/.exec(decodedPre);
  checkIframeAttrs('demo/hotel-page.html(タグ例)', preIframeMatch?.[0]);

  // README.md のタグ例
  const readmeBody = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const readmeIframeMatch = /<iframe\b[^>]*>/.exec(readmeBody);
  checkIframeAttrs('README.md(タグ例)', readmeIframeMatch?.[0]);
}
// --- ここまで R109 ---

// --- R247: README の rank() の説明が、実際に順位を決めている要素と食い違わないことの検査 ---
// 画面末尾の注記(app.js の noteHtml)は R246 で「宿からの距離 / 種類の多様性 / 百科事典でどれだけ
// 語られ触れられているか / 写真や説明が揃っているか」の4種類を名乗るよう直した。しかしその注記から
// 飛べる README の「正直な注意点」は「Wikipediaに記事や写真がある場所、公式サイトがある場所を優先
// するから偏る」としか書いておらず、**最大の重みである親記事の言及(PARENT_MENTION 80)に一言も
// 触れていなかった**。リンクの手前と先で別のことを言う状態を機械で止める。
//
// R240 の教訓に従い、**母数は engine.js の定数を import せず README.md の本文から取る**。
// 定数を import すると、定数を書き換えたときに検査も一緒にずれて何も守らない死んだ軸になる。
{
  const readmeBody = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const noteLine = readmeBody
    .split('\n')
    .find((line) => line.includes('正直な注意点') && line.includes('rank()'));

  report('README.md rank() の「正直な注意点」が存在する', Boolean(noteLine));

  if (noteLine) {
    // (a) 欠落軸: 最大の重み(親記事の言及 = PARENT_MENTION)に相当する記述があること。
    //     書き方の揺れを許すため、定数名・日本語のどちらでも通す。
    const mentionsParent =
      /PARENT_MENTION/.test(noteLine) || (noteLine.includes('親記事') && noteLine.includes('言及'));
    report(
      'README.md rank() の説明が最大の重み(親記事の言及/PARENT_MENTION)に触れている',
      mentionsParent,
      mentionsParent ? undefined : '画面の注記は「どれだけ語られ触れられているか」を名乗っているのに、READMEが最大の重みに触れていない'
    );

    // (b) 矛盾軸: 画面の注記が名乗る4種類を README 側も同じ4種類で説明していること。
    //     同じ概念を別の言葉で呼ばないよう、画面と揃えた語で照合する。
    const SCREEN_AXES = [
      { label: '宿からの距離', re: /宿からの距離|DISTANCE_PER_KM/ },
      { label: '種類の多様性', re: /種類の多様性|カテゴリ|CATEGORY_PENALTY/ },
      { label: 'どれだけ語られ触れられているか', re: /語られ|触れられ|被リンク|BACKLINK_MAX/ },
      { label: '写真や説明が揃っているか', re: /写真|要約|説明|WIKI_IMAGE|WIKI_SUMMARY/ }
    ];
    const missingAxes = SCREEN_AXES.filter((axis) => !axis.re.test(noteLine)).map((a) => a.label);
    report(
      'README.md rank() の説明が画面の注記の4種類をすべて名乗っている',
      missingAxes.length === 0,
      missingAxes.length === 0 ? undefined : `画面の注記にあるのにREADMEに無い: ${missingAxes.join(' / ')}`
    );

    // (c) 矛盾軸: 「有名さを順位に使っていない」と読める書き方を含まないこと。
    //     PARENT_MENTION と BACKLINK_MAX が効いている以上、それは嘘になる。
    const CONTRADICTIONS = [
      /有名[^。]{0,20}(使っていない|使わない|考慮していない|関係ありません|無関係)/,
      /知られ[^。]{0,20}(使っていない|使わない|考慮していない)/
    ];
    const contradiction = CONTRADICTIONS.find((re) => re.test(noteLine));
    report(
      'README.md rank() の説明が「有名さを順位に使っていない」と読める書き方を含まない',
      !contradiction,
      contradiction ? `実際は PARENT_MENTION と BACKLINK_MAX が効いているため嘘になる: ${contradiction.source}` : undefined
    );
  }
}
// --- ここまで R247 ---

// --- R248: FIXTURES.md の行番号引用が、指している先の実際のコードと一致することの検査 ---
// FIXTURES.md は `assets/geo.js` の fixtureData 分岐を「L1040」のような行番号つきで解説している
// 道案内の文書だが、**22件の引用のうち21件が指す先を外していた**(geo.js が 3008 行まで伸びた
// のに文書側が 2026-09-19 のまま据え置かれていた。enrichFame は約400行のずれ)。行番号は
// 「ある/ない」では守れず、**指した先に本当にその関数があるか**まで見ないと意味がない。
//
// R240 の教訓に従い、**母数も期待値も実ファイルから取る**。件数の定数も期待行番号の表も持たない。
// (b) は geo.js が1行でも動けば自然に発火するので、死んだ軸にはならない。
{
  const fixturesBody = readFileSync(join(REPO_ROOT, 'docs', 'FIXTURES.md'), 'utf8');
  const geoLines = readFileSync(join(REPO_ROOT, 'assets', 'geo.js'), 'utf8').split('\n');
  const engineLines = readFileSync(join(REPO_ROOT, 'assets', 'engine.js'), 'utf8').split('\n');

  // 引用の抽出: 同じ行に書かれた `関数名` のバッククォート表記を手がかりに、L<数字> と関数名を組にする。
  // 1行に複数の L<数字> がある箇所(例: 「**L1275, L1391**(`fetchSpots`)」)も全件ばらして拾う。
  const citations = [];
  fixturesBody.split('\n').forEach((line, i) => {
    const nums = line.match(/L\d{3,4}/g);
    if (!nums) return;
    // その行で言及されている関数名(バッククォート内の識別子)。engine.js 側の引用は行内に
    // `engine.js` と書かれているかで振り分ける。
    const names = (line.match(/`([A-Za-z_$][\w$]*)`/g) || []).map((m) => m.slice(1, -1));
    const inEngine = /engine\.js/.test(line);
    nums.forEach((n) => {
      citations.push({ docLine: i + 1, ref: n, lineNo: Number(n.slice(1)), names, inEngine });
    });
  });

  // (a) 存在軸: 母数の確認。引用が1件も無ければ、文書が道案内をやめたか検査が壊れている。
  report(
    `FIXTURES.md に geo.js の行番号引用がある(${citations.length}件)`,
    citations.length > 0,
    citations.length > 0 ? undefined : 'L<数字> の引用が1件も見つからない'
  );

  // (b) 行番号軸: 引用した行番号が指す実際のコード行に、同じ行で名乗っている関数名が含まれること。
  //     関数は定義行だけでなく本文中の分岐も指すため、**定義行から次の関数定義までの範囲**に
  //     引用行が入っているかで判定する。geo.js が動けば必ずここが発火する。
  //     内側に別の関数(fetchWikiNearby の baseParams など)を抱える関数があるため、
  //     終端は「次の function」ではなく**インデントが定義行と同じ `}` まで**で取る。
  const findFunctionRange = (lines, name) => {
    const defRe = new RegExp(`^(\\s*)(?:async\\s+)?function\\s+${name}\\s*\\(`);
    let start = -1;
    let indent = '';
    for (let i = 0; i < lines.length; i++) {
      const m = defRe.exec(lines[i]);
      if (m) { start = i; indent = m[1]; break; }
    }
    if (start < 0) return null;
    const closeRe = new RegExp(`^${indent}\\}`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (closeRe.test(lines[i])) { end = i + 1; break; }
    }
    return { start: start + 1, end };  // 1始まりの行番号で返す
  };

  const strayCitations = [];
  for (const c of citations) {
    const lines = c.inEngine ? engineLines : geoLines;
    const file = c.inEngine ? 'engine.js' : 'geo.js';
    // 行内に挙がった識別子のうち、そのファイルに関数定義として実在するものだけを照合対象にする。
    const ranges = c.names
      .map((name) => ({ name, range: findFunctionRange(lines, name) }))
      .filter((r) => r.range);
    if (ranges.length === 0) continue;  // 関数名を名乗っていない引用は対象外
    const hit = ranges.find((r) => c.lineNo >= r.range.start && c.lineNo <= r.range.end);
    if (!hit) {
      const names = ranges.map((r) => `${r.name}(${file}:${r.range.start}-${r.range.end})`).join(' / ');
      strayCitations.push(`FIXTURES.md:${c.docLine} の ${c.ref} は ${names} の外を指している`);
    }
  }
  report(
    `FIXTURES.md の行番号引用がすべて実際の関数の中を指している(${citations.length}件照合)`,
    strayCitations.length === 0,
    strayCitations.length === 0 ? undefined : strayCitations.join(' / ')
  );

  // (c) 前提軸: enrichFame の記述が「本番では動いている」と読める書き方になっていないこと。
  //     実態は定義と export だけで呼び出し0件(R225 は判断待ち)。実際の呼び出し件数も
  //     geo.js から数え、**呼ばれ始めたらこの軸のほうが先に赤くなる**ようにしておく。
  const enrichCallCount = geoLines.filter(
    (l) => /\benrichFame\s*\(/.test(l) && !/function\s+enrichFame/.test(l) && !/^\s*(\/\/|\*)/.test(l)
  ).length;
  report(
    `geo.js の enrichFame は呼び出し0件のまま(R225 判断待ち・実測 ${enrichCallCount}件)`,
    enrichCallCount === 0,
    enrichCallCount === 0 ? undefined : 'enrichFame が呼ばれ始めた。FIXTURES.md の「常に null」の記述を見直すこと'
  );

  const enrichLines = fixturesBody.split('\n').filter((l) => l.includes('enrichFame'));
  report('FIXTURES.md に enrichFame の記述がある', enrichLines.length > 0);

  if (enrichCallCount === 0 && enrichLines.length > 0) {
    // 呼ばれていないのに「呼ばれていない」と一言も書いていない記述を落とす。
    const admitsUncalled = enrichLines.filter(
      (l) => /呼ばれていない|呼び出しは?0件|呼び出し0件|どこからも呼ばれ/.test(l)
    ).length;
    report(
      'FIXTURES.md の enrichFame の記述が「呼ばれていない」実態に触れている',
      admitsUncalled > 0,
      admitsUncalled > 0 ? undefined : 'enrichFame は定義と export だけで呼び出し0件なのに、文書が「動いている前提」で書かれている'
    );

    // 「fixture だから null」と原因を取り違えている書き方を止める。
    const blamesFixture = enrichLines.filter(
      (l) => /(fixture|固定データ)[^。]{0,40}(含めていないため|含まれないため|だから)[^。]{0,30}null/.test(l)
    );
    report(
      'FIXTURES.md が fame の null を「固定データのせい」と説明していない',
      blamesFixture.length === 0,
      blamesFixture.length === 0 ? undefined : '実態は本番でも enrichFame が呼ばれていないため常に null'
    );
  }
}
// --- ここまで R248 ---

// --- R33: 集計行 ---
if (timings.length > 0) {
  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  const avg = Math.round(total / timings.length);
  const slowest = timings.reduce((a, b) => (b.ms > a.ms ? b : a));
  console.log(`合計 ${timings.length}件 / 総計 ${total}ms / 平均 ${avg}ms`);
  console.log(`最遅: ${slowest.label} ${slowest.ms}ms`);

  // --- R150: 絶対しきい値を超えた項目の列挙(失敗判定はしない。平常日は何も出さない) ---
  const slowOnes = timings.filter((t) => t.ms >= SLOW_MS);
  if (slowOnes.length > 0) {
    const parts = slowOnes.map((t) => `${t.label} ${t.ms}ms${t.ms >= VERY_SLOW_MS ? '(かなり遅い)' : ''}`);
    console.log(`遅い項目(${SLOW_MS}ms以上): ${parts.join(', ')}`);
  }

  // --- R46: サイズの集計行(計測できたものだけを合計する) ---
  const sized = timings.filter((t) => t.bytes !== null);
  if (sized.length > 0) {
    const totalBytes = sized.reduce((sum, t) => sum + t.bytes, 0);
    const largest = sized.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    console.log(`合計サイズ ${toKB(totalBytes)}KB(計測できた ${sized.length}件) / 最大: ${largest.label} ${toKB(largest.bytes)}KB`);
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
