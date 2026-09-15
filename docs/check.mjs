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
];

const JS_FILES = new Set(['assets/app.js', 'assets/geo.js', 'assets/engine.js']);
const MIN_JS_BYTES = 1000;

let hasFailure = false;

function report(label, ok, detail) {
  const mark = ok ? 'OK' : 'NG';
  console.log(`[${mark}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!ok) hasFailure = true;
}

async function checkTarget(path) {
  const url = BASE + path;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    report(path, false, `fetch失敗: ${err.message}`);
    return;
  }

  if (res.status !== 200) {
    report(path, false, `HTTP ${res.status}`);
    return;
  }
  report(`${path} (HTTP 200)`, true);

  const body = await res.text();

  if (path === 'index.html') {
    const hasTitle = body.includes('<title>やどたび');
    report(`${path} に <title>やどたび が含まれる`, hasTitle);
  }

  if (path === 'fixtures/kusatsu.json' || path === 'fixtures/hakone.json') {
    try {
      const json = JSON.parse(body);
      const hasLat = typeof json?.meta?.lat !== 'undefined';
      report(`${path} が JSON として妥当で meta.lat を持つ`, hasLat);
    } catch (err) {
      report(`${path} が JSON として妥当`, false, err.message);
    }
  }

  if (JS_FILES.has(path)) {
    const byteLength = Buffer.byteLength(body, 'utf8');
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

const HTML_PAGES = ['index.html', 'demo/embed-check.html', 'demo/hotel-page.html'];

async function collectLinks(page) {
  const url = BASE + page;
  let res;
  try {
    res = await fetch(url);
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
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch (err) {
    report(`リンク ${page} → ${path}`, false, `fetch失敗: ${err.message}`);
    return;
  }
  if (res.status !== 200) {
    // GitHub Pages が HEAD に非200を返す場合に備え、GETで1回だけ確認し直す
    try {
      res = await fetch(url, { method: 'GET' });
    } catch (err) {
      report(`リンク ${page} → ${path}`, false, `fetch失敗: ${err.message}`);
      return;
    }
  }
  report(`リンク ${page} → ${path}`, res.status === 200, `HTTP ${res.status}`);
}

for (const page of HTML_PAGES) {
  const links = await collectLinks(page);
  for (const path of links) {
    await checkLink(page, path || 'index.html');
  }
}
// --- ここまで R22 ---

if (hasFailure) {
  process.exitCode = 1;
}
