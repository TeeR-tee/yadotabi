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

if (hasFailure) {
  process.exitCode = 1;
}
