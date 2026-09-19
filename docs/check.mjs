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
