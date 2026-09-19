// scripts/check-all.mjs
// check-*.mjs 33本 + docs/check.mjs の計34本を直列実行し、pass/fail と所要時間を表で出す。
// 1本でも FAIL(2回走らせて2回とも落ちた)なら exit 1。
// R130: 共有サーバ方式。ここで ensureServer() を1回だけ呼び、空きポートのサーバを立てて
// 各子プロセスに環境変数 YADOTABI_BASE で渡す。子は自分でサーバを起動しないので、
// 以前のようにポート3000を奪い合って毎回違う1本が ERR_CONNECTION_REFUSED で落ちることがなくなる。
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// R223: それでもなお ERR_NO_BUFFER_SPACE 系のフレークが 09-16〜09-20 の4日間で5回・9種類の
// 検査にまたがって起きていた(Windows の一時ポート枯渇が疑われる。ブラウザを立てる検査が29本、
// 一時ポートは49152から16384個)。原因のさらなる追及ではなく「落ちたら1回だけやり直す」で受け止める。
// ただし自動再実行は本物の不具合を隠す道具になりうるため、次の歯止めを必ず守る:
//   1. 再実行は1本につき最大1回(合計2回)まで。2回目も落ちたら必ず FAIL・exit 1。
//   2. 結果は PASS / FLAKY / FAIL の3値。FLAKY(1回目FAIL・2回目PASS)は exit 0 扱いだが、
//      表と最終行の両方に必ず数字で出す(「なかったこと」にしない)。
//   3. 1回目の失敗ログは2回目が通っても必ず残す(後から原因を追えるように)。
const RETRY_WAIT_MS = 5000;

// R172: 「毎回違う検査が落ちる」現象を調べたところ、主因は検査コード自体ではなく
// 過去に手動起動して放置された python -m http.server が port 3000 に居座り続け、
// ポート競合・ソケット枯渇を起こしていたことだった(別作業役が特定)。
// ensureServer() は R130 で空きポートを実測してから起動する方式に変わっているため
// 新規の3000固定競合は起きないが、「放置サーバーがまだ残っている」ことに気付かず
// 検査してしまう事故を防ぐため、開始時に一度だけ検出して警告する(kill はしない)。
function warnIfPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

// 明示リスト(自動 glob にしない。新しい検査を足すときは人が1行足す)
const SCRIPTS = [
  'scripts/check-a11y.mjs',
  'scripts/check-attrib.mjs',
  'scripts/check-bundle.mjs',
  'scripts/check-autozoom.mjs',
  'scripts/check-chipcurrent.mjs',
  'scripts/check-debugflag.mjs',
  'scripts/check-demo.mjs',
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
  'scripts/check-noscript.mjs',
  'scripts/check-nosummary.mjs',
  'scripts/check-osmfallback.mjs',
  'scripts/check-passive.mjs',
  'scripts/check-pinflash.mjs',
  'scripts/check-r5.mjs',
  'scripts/check-reason.mjs',
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

function saveFailLog(script, res, ms, attempt) {
  try {
    const base = path.basename(script, '.mjs');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(ROOT, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    // R223: 1回目・2回目でファイル名が衝突しないよう試行回数を入れる(1回目の記録を残すため)
    const outPath = path.join(dir, `fail-${base}-${stamp}-try${attempt}.txt`);
    const body = [
      `node ${script}`,
      `${attempt}回目の実行`,
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

// 開始前に旧来のポート3000が塞がっていないか確認する(検出のみ・killはしない)。
// ensureServer() 自体は空きポートを使うので動作には影響しないが、居座っている
// プロセスがあるなら人が気付いて片付けられるよう警告だけ出す。
if (await warnIfPortBusy(3000)) {
  console.warn('警告: ポート3000が既に使用中です(過去に手動起動した python -m http.server の残存が疑われます)。');
  console.warn('       netstat -ano | findstr :3000 でPIDを確認し、不要なら手動で終了してください。');
}

// 親サーバを1本だけ立て、全31本に YADOTABI_BASE で渡す(読まない4本は無視するだけ)
const { base, stop } = await ensureServer();
console.log(`共有サーバ: ${base}`);
try {
  const runOnce = (scriptPath) => {
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
    return { res, ms };
  };

  for (const script of SCRIPTS) {
    const scriptPath = path.join(ROOT, script);
    const failLogs = [];

    const first = runOnce(scriptPath);
    if (first.res.status === 0) {
      results.push({ script, state: 'PASS', ms: first.ms, failLogs });
      continue;
    }

    // R223: 1回目が落ちた。1回だけやり直す(2回目も落ちたら FAIL 確定)。
    const firstLog = saveFailLog(script, first.res, first.ms, 1);
    if (firstLog) failLogs.push(firstLog);
    console.warn(
      `再実行: ${script} が1回目で失敗しました(exit ${first.res.status})。${RETRY_WAIT_MS}ms 待って1回だけやり直します(R223)。`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));

    const second = runOnce(scriptPath);
    if (second.res.status === 0) {
      // FLAKY: 緑扱い(exit 0)だが、表と最終行に必ず出す。1回目のログは消さない。
      console.warn(`FLAKY: ${script} は2回目で通りました。1回目の失敗ログを残しています(R223)。`);
      results.push({ script, state: 'FLAKY', ms: first.ms + second.ms, failLogs });
      continue;
    }
    const secondLog = saveFailLog(script, second.res, second.ms, 2);
    if (secondLog) failLogs.push(secondLog);
    results.push({ script, state: 'FAIL', ms: first.ms + second.ms, failLogs });
  }
} finally {
  await stop();
}

// R223: 結果は PASS / FLAKY / FAIL の3値。緑(exit 0)は PASS と FLAKY、赤は FAIL のみ。
const anyFail = results.some((r) => r.state === 'FAIL');
const flaky = results.filter((r) => r.state === 'FLAKY');

console.log('');
console.log('# / script / result / ms');
results.forEach((r, i) => {
  // FLAKY は目立つように印を付ける(PASS と同じ見た目にすると数えられなくなる)
  const label = r.state === 'FLAKY' ? '★FLAKY(2回目で通った)' : r.state;
  console.log(`${String(i + 1).padStart(2)} | ${r.script.padEnd(28)} | ${label} | ${r.ms}ms`);
});

const greenCount = results.filter((r) => r.state !== 'FAIL').length;
const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
const slowest = results.reduce((a, b) => (b.ms > a.ms ? b : a), results[0]);

console.log('');
console.log(
  `${results.length}本中 ${greenCount}本 PASS(うちFLAKY ${flaky.length}本) / 合計 ${(totalMs / 1000).toFixed(1)}s / 最遅: ${slowest.script} (${(slowest.ms / 1000).toFixed(1)}s)`
);

if (flaky.length > 0) {
  console.log('');
  console.log(
    `★FLAKY ${flaky.length}本(1回目は落ちたが2回目で通った。緑扱いだが本物の不具合の芽かもしれないので1回目のログを見ること):`
  );
  flaky.forEach((r) => {
    console.log(`  ${r.script}`);
  });
}

if (anyFail || flaky.length > 0) {
  console.log('');
  results
    .filter((r) => r.failLogs.length > 0)
    .forEach((r) => {
      r.failLogs.forEach((log) => {
        console.log(`失敗ログ: ${path.relative(ROOT, log)}`);
      });
    });
}

process.exitCode = anyFail ? 1 : 0;
