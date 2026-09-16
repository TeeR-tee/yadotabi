// scripts/check-all.mjs
// check-*.mjs 28本 + docs/check.mjs の計29本を直列実行し、pass/fail と所要時間を表で出す。
// 1本でも失敗なら exit 1。
// R130: 共有サーバ方式。ここで ensureServer() を1回だけ呼び、空きポートのサーバを立てて
// 各子プロセスに環境変数 YADOTABI_BASE で渡す。子は自分でサーバを起動しないので、
// 以前のようにポート3000を奪い合って毎回違う1本が ERR_CONNECTION_REFUSED で落ちることがなくなる。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 明示リスト(自動 glob にしない。新しい検査を足すときは人が1行足す)
const SCRIPTS = [
  'scripts/check-a11y.mjs',
  'scripts/check-attrib.mjs',
  'scripts/check-autozoom.mjs',
  'scripts/check-chipcurrent.mjs',
  'scripts/check-debugflag.mjs',
  'scripts/check-distance.mjs',
  'scripts/check-embedbg.mjs',
  'scripts/check-embedheight.mjs',
  'scripts/check-engine.mjs',
  'scripts/check-feednote.mjs',
  'scripts/check-firstcard.mjs',
  'scripts/check-geo.mjs',
  'scripts/check-history.mjs',
  'scripts/check-hotelparam.mjs',
  'scripts/check-hoteltip.mjs',
  'scripts/check-imgfail.mjs',
  'scripts/check-initpos.mjs',
  'scripts/check-keyboard.mjs',
  'scripts/check-links-target.mjs',
  'scripts/check-lightbox.mjs',
  'scripts/check-more.mjs',
  'scripts/check-nohotels.mjs',
  'scripts/check-nosummary.mjs',
  'scripts/check-passive.mjs',
  'scripts/check-pinflash.mjs',
  'scripts/check-r5.mjs',
  'scripts/check-recent.mjs',
  'scripts/check-sample.mjs',
  'docs/check.mjs',
];

const TAIL_LINES = 40;

function tail(text, n) {
  if (!text) return '(なし)';
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function saveFailLog(script, res, ms) {
  try {
    const base = path.basename(script, '.mjs');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(ROOT, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `fail-${base}-${stamp}.txt`);
    const body = [
      `node ${script}`,
      `exit code: ${res.status}, ${ms}ms`,
      '',
      `--- stdout (末尾${TAIL_LINES}行) ---`,
      tail(res.stdout, TAIL_LINES),
      '',
      `--- stderr (末尾${TAIL_LINES}行) ---`,
      tail(res.stderr, TAIL_LINES),
      '',
    ].join('\n');
    fs.writeFileSync(outPath, body, 'utf8');
    return outPath;
  } catch (err) {
    console.warn(`失敗ログの保存に失敗: ${err.message}`);
    return null;
  }
}

const results = [];

// 親サーバを1本だけ立て、全29本に YADOTABI_BASE で渡す(読まない4本は無視するだけ)
const { base, stop } = await ensureServer();
console.log(`共有サーバ: ${base}`);
try {
  for (const script of SCRIPTS) {
    const scriptPath = path.join(ROOT, script);
    const start = Date.now();
    const res = spawnSync(process.execPath, [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, YADOTABI_BASE: base },
    });
    const ms = Date.now() - start;
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    const pass = res.status === 0;
    let failLog = null;
    if (!pass) failLog = saveFailLog(script, res, ms);
    results.push({ script, pass, ms, failLog });
  }
} finally {
  await stop();
}

const anyFail = results.some((r) => !r.pass);

console.log('');
console.log('# / script / result / ms');
results.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)} | ${r.script.padEnd(28)} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.ms}ms`
  );
});

const passCount = results.filter((r) => r.pass).length;
const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
const slowest = results.reduce((a, b) => (b.ms > a.ms ? b : a), results[0]);

console.log('');
console.log(
  `${results.length}本中 ${passCount}本 PASS / 合計 ${(totalMs / 1000).toFixed(1)}s / 最遅: ${slowest.script} (${(slowest.ms / 1000).toFixed(1)}s)`
);

if (anyFail) {
  console.log('');
  results
    .filter((r) => !r.pass && r.failLog)
    .forEach((r) => {
      console.log(`失敗ログ: ${path.relative(ROOT, r.failLog)}`);
    });
}

process.exitCode = anyFail ? 1 : 0;
