#!/usr/bin/env node
// archive-shots.mjs — screenshots/ 直下の古い撮影ファイルを screenshots/archive/ へ「移動」する。
//
// 重要: このスクリプトは削除を一切行わない。fs.readdirSync / statSync / mkdirSync / renameSync のみを使う。
// unlinkSync / rmSync / rmdirSync などの削除系APIは絶対に書かないこと(レビューで落とす対象)。
//
// 使い方:
//   node scripts/archive-shots.mjs            # ドライラン(対象件数・容量を表示するだけ。1ファイルも動かさない)
//   node scripts/archive-shots.mjs --apply    # 実際に移動する
//   node scripts/archive-shots.mjs --days=2   # しきい値を変える(既定2日。「今日からN日より古い」の相対指定)
//
// 移動条件: screenshots/ 直下のファイルのうち、mtime が「今日から --days 日より前」のもの。
// 同名衝突時は上書きせずスキップして警告する(消失防止)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');
const ARCHIVE_DIR = path.join(SHOTS_DIR, 'archive');

// 除外リスト(対象日より古くても screenshots/ 直下に残すファイル名)。
// 理由をここに書く。
const EXCLUDE_NAMES = new Set([
  // docs/ROADMAP.md から参照されている
  'fail-check-links-target-2026-09-16T15-52-35.txt',
  '2026-09-17_r128-forward-stuck_mobile.png',
  '2026-09-17_r129-landscape-fold_land812.png',
  // scripts/check-keyboard.mjs が固定名で上書き保存する先
  'r69-focus-img_mobile.png',
  'r69-focus-more_mobile.png',
  // scripts/check-hotelparam.mjs が固定名で上書き保存する先
  'r105-q-nohit-mobile.png',
]);

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  let days = 2;
  for (const arg of argv) {
    const m = arg.match(/^--days=(\d+)$/);
    if (m) days = Number(m[1]);
  }
  return { apply, days };
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function main() {
  const { apply, days } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(SHOTS_DIR)) {
    console.log(`screenshots/ が見つかりません: ${SHOTS_DIR}`);
    return;
  }

  const thresholdMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const entries = fs.readdirSync(SHOTS_DIR, { withFileTypes: true });
  const targets = [];
  let excludedCount = 0;
  let keptRecentCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) continue; // archive/ 自体や tmp/ はスキップ
    const name = entry.name;
    const fullPath = path.join(SHOTS_DIR, name);
    const stat = fs.statSync(fullPath);

    if (EXCLUDE_NAMES.has(name)) {
      excludedCount += 1;
      continue;
    }
    if (stat.mtimeMs >= thresholdMs) {
      keptRecentCount += 1;
      continue;
    }
    targets.push({ name, fullPath, size: stat.size });
  }

  const totalSize = targets.reduce((sum, t) => sum + t.size, 0);

  console.log(`対象日: 今日から${days}日より前(mtime基準)`);
  console.log(`対象 ${targets.length}枚 / ${formatMB(totalSize)} MB`);
  console.log(`除外リストにより据え置き: ${excludedCount}件`);
  console.log(`直近${days}日以内で据え置き: ${keptRecentCount}件`);

  if (!apply) {
    console.log('ドライランのため、1ファイルも移動していません。実際に移動するには --apply を付けてください。');
    return;
  }

  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  let movedCount = 0;
  let movedSize = 0;
  let skippedCount = 0;

  for (const target of targets) {
    const destPath = path.join(ARCHIVE_DIR, target.name);
    if (fs.existsSync(destPath)) {
      console.warn(`警告: 移動先に同名ファイルが既に存在するためスキップ: ${target.name}`);
      skippedCount += 1;
      continue;
    }
    fs.renameSync(target.fullPath, destPath);
    movedCount += 1;
    movedSize += target.size;
  }

  console.log(`移動完了: ${movedCount}枚 / ${formatMB(movedSize)} MB を screenshots/archive/ へ移動しました。`);
  if (skippedCount > 0) {
    console.log(`同名衝突でスキップ: ${skippedCount}件(元の場所に残っています)`);
  }
}

main();
