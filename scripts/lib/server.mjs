// scripts/lib/server.mjs
// 検査(check-*.mjs)が使うローカルサーバの共通ヘルパ。R130 で新設。
//
// 背景: 25本の検査がそれぞれ自前でポート3000の python -m http.server を spawn/kill していた。
// 起動待ちはあったが「終了待ち」が無く、前の検査の kill() 直後はポートがまだ開いて見えるため
// 次の検査が「もう起動している」と誤判定して自分では起動せず、直後に python が死んで
// ERR_CONNECTION_REFUSED になっていた(29本中1本が毎回入れ替わりで落ちる原因)。
//
// 対策:
//   - ポート固定をやめ、空きポートを実測してから起動する(奪い合いが構造的に起きない)。
//   - stop() でプロセスの終了イベントを待ち、ポートが閉じるまで確認する。
//   - 環境変数 YADOTABI_BASE があれば起動せずそれを使う(check-all.mjs が親サーバを1本だけ立てる)。
//     単体実行時は環境変数が無いので、従来どおり自分で起動して自分で落とす。

import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

// 空きポートを1つ実測する(listen(0) で OS に選ばせて、閉じてから番号を返す)
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// コマンドが実際に存在して実行できるか確認する(`--version` を叩いて確認する)。
// Windows は `python` はあるが `python3` が無いことが多く、Linux/Mac はその逆が多いため、
// spawn してから失敗を待つのではなく事前にどちらが使えるか調べてから起動する。
function commandExists(cmd) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ['--version'], { stdio: 'ignore' });
    let done = false;
    proc.once('error', () => { if (!done) { done = true; resolve(false); } });
    proc.once('exit', (code) => { if (!done) { done = true; resolve(code === 0); } });
  });
}

// Windows は python、Linux/Mac は python3 が一般的なので、環境に存在する方を選ぶ。
// python が優先(現状維持)で、無ければ python3 にフォールバックする。
async function resolvePythonCommand() {
  if (await commandExists('python')) return 'python';
  if (await commandExists('python3')) return 'python3';
  throw new Error('python も python3 も見つかりませんでした。PATH を確認してください。');
}

/**
 * 検査用のローカルサーバを用意する。
 * @returns {Promise<{ base: string, stop: () => Promise<void> }>}
 *   base … `http://127.0.0.1:<port>`(末尾スラッシュなし)
 *   stop … サーバを落としてポートが閉じるまで待つ。親から渡された場合は何もしない。
 */
export async function ensureServer() {
  const inherited = process.env.YADOTABI_BASE;
  if (inherited) {
    return { base: inherited.replace(/\/+$/, ''), stop: async () => {} };
  }

  const port = await findFreePort();
  const pythonCmd = await resolvePythonCommand();
  const proc = spawn(pythonCmd, ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
  });

  // 起動待ち(150ms × 60回 = 最大9秒)。開かなければ黙って続行せず throw する。
  let up = false;
  for (let i = 0; i < 60; i++) {
    if (await isPortOpen(port)) { up = true; break; }
    await waitFor(150);
  }
  if (!up) {
    proc.kill();
    throw new Error(`ローカルサーバが起動しませんでした (port ${port})。${pythonCmd} が正しく動くか確認してください。`);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise((resolve) => {
        proc.once('exit', resolve);
        proc.once('close', resolve);
      });
      proc.kill();
      // プロセスの終了イベントを待つ(最大5秒)
      await Promise.race([exited, waitFor(5000)]);
    }
    // ポートが実際に閉じるまで待つ(100ms × 30回 = 最大3秒)
    for (let i = 0; i < 30; i++) {
      if (!(await isPortOpen(port))) break;
      await waitFor(100);
    }
  };

  return { base: `http://127.0.0.1:${port}`, stop };
}
