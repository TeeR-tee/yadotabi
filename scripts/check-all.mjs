// scripts/check-all.mjs
// check-*.mjs 14本 + docs/check.mjs の計15本を直列実行し、pass/fail と所要時間を表で出す。
// 1本でも失敗なら exit 1。共有サーバ化はしない(各テストが自前でポート3000を spawn/kill するため)。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 明示リスト(自動 glob にしない。新しい検査を足すときは人が1行足す)
const SCRIPTS = [
  'scripts/check-a11y.mjs',
  'scripts/check-attrib.mjs',
  'scripts/check-autozoom.mjs',
  'scripts/check-chipcurrent.mjs',
  'scripts/check-engine.mjs',
  'scripts/check-geo.mjs',
  'scripts/check-hotelparam.mjs',
  'scripts/check-imgfail.mjs',
  'scripts/check-more.mjs',
  'scripts/check-nohotels.mjs',
  'scripts/check-passive.mjs',
  'scripts/check-pinflash.mjs',
  'scripts/check-r5.mjs',
  'scripts/check-recent.mjs',
  'docs/check.mjs',
];

const results = [];

for (const script of SCRIPTS) {
  const scriptPath = path.join(ROOT, script);
  const start = Date.now();
  const res = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit', cwd: ROOT });
  const ms = Date.now() - start;
  const pass = res.status === 0;
  results.push({ script, pass, ms });
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

process.exitCode = anyFail ? 1 : 0;
