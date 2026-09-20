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

// --- R249: CHECKS.md の `ファイル名:行番号` 引用が、指している先の実際のコードと一致することの検査 ---
// CHECKS.md は「リンク切れ検査が何を見ているか」を `docs/check.mjs:131` のような行番号つきで
// 解説している道案内の文書だが、**7種類9箇所の引用が9箇所とも指す先を外していた**
// (R248 で直した FIXTURES.md と同じ型)。FIXTURES.md との違いは3つ:
//   (1) 名乗り方が `ファイル名:行番号` 形式、
//   (2) 指す先が docs/check.mjs / scripts/check-all.mjs / demo/hotel-page.html の3ファイルにまたがる、
//   (3) 名乗るのが関数名だけでなく**正規表現リテラル・変数名・HTMLの属性やクラス名**も含む。
//
// R240 の教訓に従い、**母数も期待値も実ファイルから取る**。件数の定数も期待行番号の表も持たない。
// R248 申し送りの「拾えない引用を黙って飛ばすと母数が減って軸が死ぬ」に従い、**名乗りが1つも
// 取れなかった引用は件数を report に出し、想定(=引用の総数)を下回ったら落とす**。
{
  const checksBody = readFileSync(join(REPO_ROOT, 'docs', 'CHECKS.md'), 'utf8');
  const checksLines = checksBody.split('\n');

  // 引用の抽出: `ファイル名:行番号` と、同じ行に続く `:行番号` だけの追随表記(例: `:193`)も拾う。
  // 追随表記は直前に出たファイル名に属するものとして扱う。
  const citeRe = /`?((?:[\w.-]+\/)*[\w.-]+\.(?:mjs|js|html)):(\d+)`?|`:(\d+)`/g;
  const citations = [];
  checksLines.forEach((line, i) => {
    let lastFile = null;
    let m;
    citeRe.lastIndex = 0;
    while ((m = citeRe.exec(line))) {
      if (m[1]) {
        lastFile = m[1];
        citations.push({ docLine: i + 1, file: m[1], lineNo: Number(m[2]), text: line });
      } else if (lastFile) {
        citations.push({ docLine: i + 1, file: lastFile, lineNo: Number(m[3]), text: line });
      }
    }
  });

  // (a) 存在軸: 母数の確認。引用が1件も無ければ、文書が道案内をやめたか抽出が壊れている。
  report(
    `CHECKS.md に ファイル名:行番号 の引用がある(${citations.length}件)`,
    citations.length > 0,
    citations.length > 0 ? undefined : '`ファイル名:行番号` の引用が1件も見つからない'
  );

  // (c) 対象実在軸: 引用されたファイルが実在し、引用行番号がそのファイルの総行数以内であること。
  const fileCache = new Map();
  const readTarget = (rel) => {
    if (!fileCache.has(rel)) {
      try {
        fileCache.set(rel, readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n'));
      } catch {
        fileCache.set(rel, null);
      }
    }
    return fileCache.get(rel);
  };
  // CHECKS.md はファイル名だけ(`check-all.mjs:43`)でも名乗るので、リポジトリ内から場所を探す。
  const SEARCH_DIRS = ['', 'docs/', 'scripts/', 'demo/', 'assets/'];
  const resolveTarget = (rel) => {
    for (const dir of SEARCH_DIRS) {
      const cand = rel.includes('/') ? rel : dir + rel;
      const lines = readTarget(cand);
      if (lines) return { path: cand, lines };
    }
    return null;
  };

  const badTargets = [];
  for (const c of citations) {
    const t = resolveTarget(c.file);
    if (!t) {
      badTargets.push(`CHECKS.md:${c.docLine} が指す ${c.file} が実在しない`);
      continue;
    }
    c.path = t.path;
    c.lines = t.lines;
    if (c.lineNo < 1 || c.lineNo > t.lines.length) {
      badTargets.push(`CHECKS.md:${c.docLine} の ${c.file}:${c.lineNo} は総行数 ${t.lines.length} を超えている`);
    }
  }
  report(
    `CHECKS.md の引用先のファイルが実在し行番号が総行数以内(${citations.length}件照合)`,
    badTargets.length === 0,
    badTargets.length === 0 ? undefined : badTargets.join(' / ')
  );

  // (b) 行番号軸: 引用が指す実際の行に、その引用のすぐ近くで名乗っているコード片が含まれること。
  //     名乗りの候補は同じ行のバッククォート内の文字列から作る。CHECKS.md は
  //       - 識別子 (`attrRe` `internalPaths` `SCRIPTS` `resolved.pathname` `checkLink`)
  //       - 正規表現リテラル (`attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g`)
  //       - HTML の属性・クラス (`<pre class="tag-example">`)
  //     を名乗るので、バッククォート内から**識別子(ドット区切りを含む)とHTMLのクラス名**を抜く。
  const NOISE = new Set(['index.html', 'true', 'false', 'null', 'href', 'src', 'new', 'URL', 'Set', 'BASE']);
  const namesOf = (line) => {
    const out = new Set();
    for (const seg of line.match(/`[^`]+`/g) || []) {
      const body = seg.slice(1, -1);
      // ファイル名:行番号 の表記そのものは名乗りではない
      if (/^(?:[\w.-]+\/)*[\w.-]+\.(?:mjs|js|html):\d+$/.test(body) || /^:\d+$/.test(body)) continue;
      // `<pre class="tag-example">` のようなHTMLのクラス名
      for (const cm of body.match(/class\s*=\s*"([^"]+)"/g) || []) {
        out.add(cm.replace(/class\s*=\s*"|"/g, ''));
      }
      // 識別子(ドット区切りの `resolved.pathname` も1つとして扱う)
      for (const id of body.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) || []) {
        if (id.length >= 3 && !NOISE.has(id)) out.add(id);
      }
    }
    return [...out];
  };

  const strayCitations = [];
  let unverifiable = 0;
  for (const c of citations) {
    if (!c.lines || c.lineNo < 1 || c.lineNo > c.lines.length) continue;  // (c) 側で既に赤い
    const target = c.lines[c.lineNo - 1];
    const names = namesOf(c.text).filter((n) => c.lines.some((l) => l.includes(n)));
    if (names.length === 0) { unverifiable++; continue; }
    if (!names.some((n) => target.includes(n))) {
      strayCitations.push(
        `CHECKS.md:${c.docLine} の ${c.file}:${c.lineNo} に ${names.slice(0, 4).join('/')} が無い(実際の行: ${target.trim().slice(0, 50)})`
      );
    }
  }
  report(
    `CHECKS.md の行番号引用がすべて名乗ったコードの行を指している(${citations.length - unverifiable}/${citations.length}件照合)`,
    strayCitations.length === 0,
    strayCitations.length === 0 ? undefined : strayCitations.join(' / ')
  );
  // 照合できなかった引用の件数を必ず出す。母数が減って軸が死ぬのを防ぐため、
  // **照合できた件数が引用総数を下回ったら落とす**(黙って飛ばさない)。
  report(
    `CHECKS.md の引用を1件も飛ばさずに照合できた(照合不能 ${unverifiable}件)`,
    unverifiable === 0,
    unverifiable === 0 ? undefined : 'バッククォートでコード片を名乗っていない引用がある。名乗りを足すか抽出側を直すこと'
  );

  // (d) 一対一軸: 1行目が言う「表と SCRIPTS 配列が一対一」を、数え方を実装と揃えて実測で確かめる。
  //     表の行は `^| check` の34本 + `^| docs/check.mjs` の1本、SCRIPTS は 'scripts/check-*' の34件 + docs/check.mjs。
  const tableRows = checksLines.filter((l) => /^\| (?:check-|`?docs\/check\.mjs)/.test(l)).length;
  const allLines = readTarget('scripts/check-all.mjs') || [];
  const scriptsEntries = allLines.filter((l) => /^\s*'(?:scripts\/check-[\w-]+|docs\/check)\.mjs',?\s*$/.test(l)).length;
  report(
    `CHECKS.md の表と check-all.mjs の SCRIPTS が一対一(表 ${tableRows}行 / 配列 ${scriptsEntries}件)`,
    tableRows === scriptsEntries && tableRows > 0,
    tableRows === scriptsEntries ? undefined : '表か SCRIPTS 配列のどちらかが古い。名前ベースで突き合わせて直すこと'
  );
}
// --- ここまで R249 ---

// --- R235: 「構造上どうやっても落ちない照合(死んだ照合)」が検査本の中に1件も無いことの検査 ---
// 発端は `scripts/check-nosummary.mjs` の 6a:
//   ok(hasArticleRows.length === 0 && hasArticleRows.every((r) => r.noneText.indexOf(CONST) === 0), '6a. …')
// `&&` の左が真のとき hasArticleRows は必ず空配列なので、右の `.every()` は**空配列への呼び出しで
// 常に true**。検査名は「文言が CONST になっている」と名乗っているのに、その文言照合は1度も
// 走っていなかった(R225「export されている=使われている、ではない」と同型)。
// **検査があるから守られている、も疑う**。同じ形が他に生えていないかを全検査本から静的に探す。
//
// R240 の教訓に従い、**母数も実ファイルから数える**(件数の定数を書かない)。
// R249 の readTarget と同じやり方で検査本のソースを読むだけで、追加のネットワークアクセスはしない。
{
  const { readdirSync } = await import('node:fs');

  // (a) 母数軸: 走査対象の検査本を実ファイルから数える。
  //     scripts/check-*.mjs のうち束ね役の check-all.mjs を除いた34本 + docs/check.mjs 自身 = 35本。
  //     件数の定数は持たず、「1本でも読めなければ落ちる」形にする(黙って飛ばすと母数が減って軸が死ぬ)。
  let scriptNames = [];
  try {
    scriptNames = readdirSync(join(REPO_ROOT, 'scripts'))
      .filter((f) => /^check-[\w-]+\.mjs$/.test(f) && f !== 'check-all.mjs')
      .sort();
  } catch {
    scriptNames = [];
  }
  const bookPaths = scriptNames.map((f) => 'scripts/' + f).concat(['docs/check.mjs']);

  const books = [];
  const unreadable = [];
  for (const rel of bookPaths) {
    try {
      books.push({ path: rel, lines: readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n') });
    } catch {
      unreadable.push(rel);
    }
  }
  report(
    `死んだ照合軸: 走査対象の検査本を実ファイルから数えて全部読めた(${books.length}/${bookPaths.length}本)`,
    books.length === bookPaths.length && books.length > 1 && unreadable.length === 0,
    unreadable.length === 0
      ? (books.length > 1 ? undefined : 'scripts/ から検査本を1本も数えられていない。readdirSync 側が壊れている')
      : '読めなかった: ' + unreadable.join(' / ')
  );

  // (b) 死んだ形軸: `xs.length === 0 && xs.every(` と逆順 `xs.every(…) && xs.length === 0` を全本から探す。
  //     どちらも「左が真なら配列は空 → 空配列への every は常に true」で、照合が死ぬ形。
  //     `length > 0 && …every(` は母数が空でないことを確かめている**生きた**形なので対象外
  //     (check-nosummary.mjs の (r234) b1 が実例)。
  //     見つかったらファイル名・行番号・その行を名指しで出す(例外リストは作らない = R249 の判断)。
  const DEAD_FORMS = [
    { re: /\.length\s*===\s*0\s*&&[^;]*\.every\s*\(/, why: 'length === 0 の右で空配列に every(常に true)' },
    { re: /\.every\s*\([^;]*\)\s*&&[^;]*\.length\s*===\s*0/, why: 'every の左が空配列(常に true)で length === 0 と AND' },
  ];
  const deadMatches = [];
  for (const book of books) {
    book.lines.forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/.*)?$/, ''); // 行まるごとコメントは対象外
      if (!code || /^\s*\/\//.test(line)) return;
      for (const form of DEAD_FORMS) {
        if (form.re.test(code)) {
          deadMatches.push(`${book.path}:${i + 1} ${form.why} -> ${line.trim()}`);
          break;
        }
      }
    });
  }
  report(
    `死んだ照合軸: 「常に true になる照合」が検査本${books.length}本に0件(${deadMatches.length}件検出)`,
    deadMatches.length === 0,
    deadMatches.length === 0
      ? undefined
      : '枚数判定と中身判定を ok() 2本に割るか、中身の母数を空にならない側から取り直すこと / ' + deadMatches.join(' / ')
  );

  // (c) 生存確認軸: R235 で生かした照合を、直した本人が後から消してしまう事故を防ぐ。
  //     check-nosummary.mjs の中に HAS_ARTICLE_NO_SUMMARY_TEXT を**実際に照合している ok()**が
  //     1本以上あること(定数の定義行・コメント行は数えない)。
  const nosummary = books.find((b) => b.path === 'scripts/check-nosummary.mjs');
  const liveCompareLines = nosummary
    ? nosummary.lines.filter(
        (l) =>
          !/^\s*\/\//.test(l) &&
          /HAS_ARTICLE_NO_SUMMARY_TEXT/.test(l) &&
          !/^\s*const\s+HAS_ARTICLE_NO_SUMMARY_TEXT\s*=/.test(l) &&
          /(indexOf\s*\(|===|!==|startsWith\s*\()/.test(l)
      )
    : [];
  report(
    `死んだ照合軸: check-nosummary.mjs が HAS_ARTICLE_NO_SUMMARY_TEXT を実際に照合している(${liveCompareLines.length}行)`,
    !!nosummary && liveCompareLines.length > 0,
    !nosummary
      ? 'scripts/check-nosummary.mjs が読めない'
      : liveCompareLines.length > 0
        ? undefined
        : '定数が定義だけされて誰も比較していない。R235 で生かした照合が消えている'
  );
}
// --- ここまで R235 ---

// --- R250: 地図の番号なしピン(「・」)の説明が、画面に実在するときだけ出ることの検査 ---
// 発端: 「もっと見る」を押すと地図のピンが数字つきの5本から増え、6番目以降は番号の無い
// 「・」(class は pin--sub)になるが、それが何なのかは画面に1文字も書かれていなかった。
// SUBPIN_ORIGIN_TEXT を #feed-origin に足したが、「足しただけ」では2通りに壊れる:
//   (1) 出す条件を state.more の件数や定数から決めると、地図に「・」が無い場面でも名乗る
//       (R245「画面に出ていないものを名乗らない」の型)。
//   (2) 文言に件数の数字や評価の語が混じる(R242・R246 の型)。
// そこで軸を3本に割る。R240 の教訓に従い、母数は実ファイルから取る(件数の定数を書かない)。
{
  // (a) 母数軸: assets/app.js を実ファイルから読めていること。
  //     ここが 0 行だと、下の (b)(c) は「探す対象が無い」ので素通りして偽の緑になる
  //     (R235 の破壊実証と同じ形)。件数の定数は持たず、読めた行数をそのまま名乗る。
  const appLines = (() => {
    try {
      return readFileSync(join(REPO_ROOT, 'assets', 'app.js'), 'utf8').split('\n');
    } catch {
      return [];
    }
  })();
  report(
    `「・」ピンの説明: assets/app.js を実ファイルから読めた(${appLines.length}行)`,
    appLines.length > 0,
    appLines.length > 0 ? undefined : 'assets/app.js が読めない。下の条件軸・文言軸が母数0で素通りする'
  );

  // 文言の定数(SUBPIN_ORIGIN_TEXT = '…')を実ファイルから取り出す。ここも定数を書き写さない。
  const textLine = appLines.find((l) => /^\s*var\s+SUBPIN_ORIGIN_TEXT\s*=/.test(l)) || '';
  const textMatch = textLine.match(/=\s*'([^']*)'/);
  const subpinText = textMatch ? textMatch[1] : '';

  // (b) 条件軸: 「・」の行を出すかどうかの判定が、**地図の DOM から .pin--sub を数える形**で
  //     あること。state.more の件数や数値定数から決めていないこと。
  //     判定している行(コメント行は数えない)を実ファイルから拾う。
  const condLines = appLines.filter(
    (l) => !/^\s*\/\//.test(l) && /\.pin--sub/.test(l) && /querySelectorAll/.test(l)
  );
  // 同じ判定が state.more の件数や定数から決められていないこと(両方あれば条件が二重になる)。
  const badCondLines = appLines.filter(
    (l) =>
      !/^\s*\/\//.test(l) &&
      /subPinsOnScreen\s*=/.test(l) &&
      /(state\.more|\.length\s*>\s*\d|=\s*\d)/.test(l)
  );
  report(
    `「・」ピンの説明: 出す条件を地図のDOM(.pin--sub)から数えている(${condLines.length}行)`,
    condLines.length > 0 && badCondLines.length === 0,
    condLines.length === 0
      ? '.pin--sub を querySelectorAll で数えている行が assets/app.js に無い。'
        + '件数や state.more から決めると、地図に「・」が無い場面でも名乗ってしまう'
      : badCondLines.length > 0
        ? `出す条件が state.more や数値定数から決められている: ${badCondLines.join(' / ')}`
        : undefined
  );

  // (c) 文言軸: 新しい文言に数字と評価の語が1文字も無いこと。
  //     評価の語の並びは scripts/check-more.mjs の THEME_BANNED_WORDS と同じ基準を持つ
  //     (向こうは #more-themes 用なので流用せず、同じ基準をここにも置く)。
  const SUBPIN_BANNED_WORDS = ['おすすめ', 'お勧め', '人気', '必見', '最高', 'ベスト', 'No.1',
    'ランキング', '話題', '絶対', '一番', '評価', '穴場', '定番', 'サブピン', 'ピン', '件'];
  const hasDigit = /[0-90-9]/.test(subpinText);
  const hitWords = SUBPIN_BANNED_WORDS.filter((w) => subpinText.indexOf(w) >= 0);
  report(
    `「・」ピンの説明: 文言に数字と評価の語が無い(「${subpinText}」)`,
    subpinText.length > 0 && !hasDigit && hitWords.length === 0,
    subpinText.length === 0
      ? 'SUBPIN_ORIGIN_TEXT が assets/app.js から取り出せない(定義が消えたか形が変わった)'
      : hasDigit
        ? `文言に数字が入っている: 「${subpinText}」`
        : hitWords.length > 0
          ? `文言に評価の語・専門用語が入っている: ${hitWords.join('・')}`
          : undefined
  );
}
// --- ここまで R250 ---

// --- R254: 展開後の束見出しが枚数の数字を名乗らないことの検査 ---
// 発端: 同じ「もっと見る」まわりなのに、押す前の R236 の行と R250 の3行目は
// 件数の数字を0文字にすると決めて作ったのに、押した後の束見出しだけが
// 「そのほか 5件」「写真と解説がまだ無い場所 7件」と数字を出していた。
// その 5 が何を数えた 5 なのか(テーマが付かなかったカード/1件だけだったテーマから
// 送られてきたカード)は画面のどこにも書かれておらず、みのるんの
// 「『60何件見つかりました』だと『何をもって60何件なんですか』という話」がそのまま当たる。
// 直したあと、これは2通りに戻りうる:
//   (1) 数字が見出しに戻る(「◯件」や「約◯」)。
//   (2) 数字を消すついでに見出しごと消してしまい、R226・R158 で入れた
//       「どこから先が写真も解説も無い帯か」の区切りが失われる。
// そこで軸を3本に割る。R240・R250 の教訓に従い、母数は実ファイルから取り、件数の定数は書かない。
{
  // (a) 母数軸: assets/app.js の moreBundledHtml() の中から、見出し(<h3 class="feedbundle">)を
  //     組んでいる行を実ファイルで数える。ここが 0 本だと下の (b)(c) は「探す対象が無い」ので
  //     素通りして偽の緑になる(R235 の破壊実証と同じ形)。本数の定数は持たず、数えた本数を名乗る。
  const appLinesR254 = (() => {
    try {
      return readFileSync(join(REPO_ROOT, 'assets', 'app.js'), 'utf8').split('\n');
    } catch {
      return [];
    }
  })();
  // moreBundledHtml() の本体だけを切り出す(関数の外に同じ文字列があっても巻き込まないため)。
  const headStartR254 = appLinesR254.findIndex((l) => /function\s+moreBundledHtml\s*\(/.test(l));
  const bodyR254 = headStartR254 >= 0
    ? appLinesR254.slice(headStartR254).slice(0, (() => {
        const after = appLinesR254.slice(headStartR254);
        const end = after.findIndex((l, i) => i > 0 && /^\s{2}\}\s*$/.test(l));
        return end > 0 ? end + 1 : after.length;
      })())
    : [];
  // 見出しを組んでいる行(コメント行は数えない)。
  const headLinesR254 = bodyR254.filter(
    (l) => !/^\s*\/\//.test(l) && /<h3 class="feedbundle/.test(l)
  );
  report(
    `束見出しの数字: moreBundledHtml() の見出しを組む分岐を実ファイルから数えた(${headLinesR254.length}本)`,
    headLinesR254.length >= 2,
    headLinesR254.length >= 2
      ? undefined
      : `moreBundledHtml() の中に見出しを組む行が ${headLinesR254.length} 本しか無い。`
        + '下の数字軸・見出し存続軸が母数0で素通りする'
  );

  // (b) 数字軸: 見出しを組んでいる式に「件」と b.indices.length が現れないこと。
  //     数字を直接埋める形(「5件」「約5」)も、長さから組み立てる形も両方ここで捕まえる。
  const numHitsR254 = headLinesR254.filter(
    (l) => /件/.test(l) || /\.indices\.length/.test(l) || /[0-90-9]\s*<\/(h3|span)>/.test(l)
  );
  report(
    `束見出しの数字: 見出しを組む式に「件」も indices.length も無い(${headLinesR254.length}本を照合)`,
    headLinesR254.length >= 2 && numHitsR254.length === 0,
    headLinesR254.length < 2
      ? '母数が足りないので照合できていない(上の母数軸を先に直す)'
      : numHitsR254.length > 0
        ? `見出しが枚数の数字を名乗っている: ${numHitsR254.map((l) => l.trim()).join(' / ')}`
        : undefined
  );

  // (c) 見出し存続軸: 数字を消すついでに見出しごと消していないこと。
  //     BARE_BUNDLE_HEAD(定数)と「そのほか」(直書き)が、どちらも見出しを組む式の中に
  //     依然として実在すること。文言そのものは定数を書き写さず実ファイルから取り出す。
  const bareHeadLineR254 = appLinesR254.find((l) => /^\s*var\s+BARE_BUNDLE_HEAD\s*=/.test(l)) || '';
  const bareHeadMatchR254 = bareHeadLineR254.match(/=\s*'([^']*)'/);
  const bareHeadTextR254 = bareHeadMatchR254 ? bareHeadMatchR254[1] : '';
  const hasBareHeadR254 = bareHeadTextR254.length > 0
    && headLinesR254.some((l) => /BARE_BUNDLE_HEAD/.test(l));
  const hasRestHeadR254 = headLinesR254.some((l) => /そのほか/.test(l));
  report(
    `束見出しの存続: 「${bareHeadTextR254}」と「そのほか」が見出しとして残っている`,
    hasBareHeadR254 && hasRestHeadR254,
    bareHeadTextR254.length === 0
      ? 'BARE_BUNDLE_HEAD が assets/app.js から取り出せない(定義が消えたか形が変わった)'
      : !hasBareHeadR254
        ? 'BARE_BUNDLE_HEAD を出している見出しが moreBundledHtml() に無い(見出しごと消えた)'
        : !hasRestHeadR254
          ? '「そのほか」の見出しが moreBundledHtml() に無い(見出しごと消えた)'
          : undefined
  );
}
// --- ここまで R254 ---

// --- R255: カードの分数(徒歩・車)の出どころを画面が断っていることの検査 ---
// 発端: 全カードのメタ行に出ている「徒歩◯分 · 車◯分」は、engine.js が地図の上を
// まっすぐ結んだ長さを固定の速さで割っているだけなのに、すぐ隣の距離には R228 で起点の
// 断りが付いたのに、分数だけは画面に1文字も説明が無かった。TIMES_ORIGIN_TEXT を
// #feed-origin に足したが、「足しただけ」では R250 と同じ2通りに壊れる:
//   (1) 出す条件を state.cards の件数や定数から決めると、分数が画面に無い場面でも名乗る。
//   (2) 文言に数字(速さ)や評価の語・専門用語が混じる。
// 軸は3本。母数は実ファイルから取り、件数の定数は書かない(R240・R250 の教訓)。
{
  // (a) 母数軸: assets/app.js を実ファイルから読めていて、renderFeedOrigin() の中に
  //     行を足す分岐(TextNode を足す行)が3本以上実在すること。
  //     ここが0のとき、下の (b)(c) は「探す対象が無い」ので素通りして偽の緑になる。
  const appLinesR255 = (() => {
    try {
      return readFileSync(join(REPO_ROOT, 'assets', 'app.js'), 'utf8').split('\n');
    } catch {
      return [];
    }
  })();
  // renderFeedOrigin() の本体を実ファイルから切り出す(次の function 宣言の手前まで)。
  const startR255 = appLinesR255.findIndex((l) => /function\s+renderFeedOrigin\s*\(/.test(l));
  const bodyR255 = startR255 >= 0
    ? appLinesR255.slice(startR255).slice(0, (() => {
        const after = appLinesR255.slice(startR255 + 1);
        const end = after.findIndex((l) => /^\s*function\s+\w+\s*\(/.test(l));
        return end < 0 ? after.length + 1 : end + 1;
      })())
    : [];
  // 文言を足している分岐(コメント行は数えない)。定数名を出す行と TextNode を足す行の
  // どちらも数える(R255 の分数の断りは4行目にせず1行目の続きにしたため、
  // appendChild だけを数えると母数が落ちる)。
  const originLinesR255 = bodyR255.filter(
    (l) => !/^\s*\/\//.test(l)
      && (/appendChild\(document\.createTextNode\(/.test(l) || /_ORIGIN_TEXT/.test(l))
  );
  report(
    `分数の出どころ: renderFeedOrigin() の文言を足す分岐を実ファイルから数えた(${originLinesR255.length}本)`,
    originLinesR255.length >= 3,
    originLinesR255.length >= 3
      ? undefined
      : `renderFeedOrigin() の中に文言を足す分岐が ${originLinesR255.length} 本しか無い。`
        + '下の文言軸・条件軸が母数0で素通りする'
  );

  // 文言の定数(TIMES_ORIGIN_TEXT = '…')を実ファイルから取り出す。定数は書き写さない。
  const timesTextLineR255 = appLinesR255.find((l) => /^\s*var\s+TIMES_ORIGIN_TEXT\s*=/.test(l)) || '';
  const timesTextMatchR255 = timesTextLineR255.match(/=\s*'([^']*)'/);
  const timesTextR255 = timesTextMatchR255 ? timesTextMatchR255[1] : '';

  // (b) 文言軸: 新しい文言に数字と評価の語・専門用語が1文字も無いこと。
  //     基準は R250 の SUBPIN_BANNED_WORDS と同じ考え方(向こうは「・」ピン用なので流用せず、
  //     分数の行に起きやすい言い方(直線距離・時速・謝罪)をここに足して置く)。
  const TIMES_BANNED_WORDS = ['おすすめ', 'お勧め', '人気', '必見', '最高', 'ベスト', 'No.1',
    'ランキング', '話題', '絶対', '一番', '評価', '穴場', '定番',
    '直線距離', '直線', 'ハーバサイン', '時速', '分速', '大圏距離',
    'ご了承', '正確では', 'すみません', '分', 'km', 'm/'];
  const hasDigitR255 = /[0-9０-９]/.test(timesTextR255);
  const hitWordsR255 = TIMES_BANNED_WORDS.filter((w) => timesTextR255.indexOf(w) >= 0);
  report(
    `分数の出どころ: 文言に数字と評価の語・専門用語が無い(「${timesTextR255}」)`,
    originLinesR255.length >= 3 && timesTextR255.length > 0 && !hasDigitR255 && hitWordsR255.length === 0,
    originLinesR255.length < 3
      ? '母数が足りないので照合できていない(上の母数軸を先に直す)'
      : timesTextR255.length === 0
        ? 'TIMES_ORIGIN_TEXT が assets/app.js から取り出せない(定義が消えたか形が変わった)'
        : hasDigitR255
          ? `文言に数字が入っている: 「${timesTextR255}」`
          : hitWordsR255.length > 0
            ? `文言に評価の語・専門用語が入っている: ${hitWordsR255.join('・')}`
            : undefined
  );

  // (c) 条件軸: 分数の行を出すかどうかの判定が、**カードの DOM から .feedcard__times を
  //     数える形**であること。state.cards の件数や数値定数から決めていないこと。
  const condLinesR255 = appLinesR255.filter(
    (l) => !/^\s*\/\//.test(l) && /\.feedcard__times/.test(l) && /querySelectorAll/.test(l)
  );
  // 判定が DOM ではなく state.cards・数値・真偽値リテラルから決められていたら落とす。
  // (DOM から数えた結果を `.length > 0` で真偽にするのは正しい形なので、ここでは咎めない)
  const badCondLinesR255 = appLinesR255.filter(
    (l) =>
      !/^\s*\/\//.test(l) &&
      /timesOnScreen\s*=/.test(l) &&
      !/querySelectorAll/.test(l) &&
      /(state\.cards|=\s*\d|=\s*true|=\s*false|\.length\s*[><]=?\s*\d)/.test(l)
  );
  report(
    `分数の出どころ: 出す条件をカードのDOM(.feedcard__times)から数えている(${condLinesR255.length}行)`,
    originLinesR255.length >= 3 && condLinesR255.length > 0 && badCondLinesR255.length === 0,
    originLinesR255.length < 3
      ? '母数が足りないので照合できていない(上の母数軸を先に直す)'
      : condLinesR255.length === 0
        ? '.feedcard__times を querySelectorAll で数えている行が assets/app.js に無い。'
          + '件数や state.cards から決めると、分数が画面に無い場面でも名乗ってしまう'
        : badCondLinesR255.length > 0
          ? `出す条件が state.cards や数値定数から決められている: ${badCondLinesR255.join(' / ')}`
          : undefined
  );
}
// --- ここまで R255 ---

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
