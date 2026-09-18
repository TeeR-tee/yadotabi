/**
 * fixtures/*.json の軽量化スクリプト — 実行方法: `node scripts/slim-fixtures.mjs [area]`
 * (area 省略時は kusatsu/hakone/dogo/beppu/kinosaki の5エリア全部)
 *
 * Overpass は `out center tags;` で全タグを返すため、生の fixture JSON には
 * アプリ(assets/geo.js)が読まないタグキーが大量に含まれている。
 * geo.js を全部読んで確定した「消費されるタグキー」だけを keep-list として残し、
 * それ以外を各要素の tags から削除する(既存 JSON の加工のみ・Overpass は叩かない)。
 *
 * json.meta / json.wiki / 要素の type/id/lat/lon/center には一切触らない。
 * 書き戻しは JSON.stringify(json) のみ(第2・第3引数なし。pretty print は逆にサイズが増える)。
 *
 * make-fixture.mjs も同じ KEEP_TAG_KEYS を import して保存直前に同じ処理を通す
 * (keep-list を二重管理しない)。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// geo.js を全部読んで確定した、消費されるタグキー(docs/NEXT.md の表と同一)。
export const KEEP_TAG_KEYS = new Set([
  'name',
  'name:ja',
  'tourism',
  'historic',
  'leisure',
  'amenity',
  'natural',
  'man_made',
  'wikidata',
  'wikipedia',
  'wikipedia:ja',
  'website',
  'contact:website',
  'opening_hours'
]);

/** タグキーを残すかどうかを判定する。'wikipedia' で始まるキーは前方一致で残す(geo.js の detectWikipedia と同じ判定)。 */
export function shouldKeepTagKey(key) {
  return KEEP_TAG_KEYS.has(key) || key.indexOf('wikipedia') === 0;
}

/** overpass.elements[].tags を keep-list でその場で絞り込む(json.meta / json.wiki には触れない)。 */
export function slimOverpassElements(elements) {
  let droppedKeys = 0;
  (elements || []).forEach((el) => {
    if (!el || !el.tags) return;
    Object.keys(el.tags).forEach((k) => {
      if (!shouldKeepTagKey(k)) {
        delete el.tags[k];
        droppedKeys++;
      }
    });
  });
  return droppedKeys;
}

const AREAS = ['kusatsu', 'hakone', 'dogo', 'beppu', 'kinosaki'];

function slimOne(area) {
  const path = join(ROOT, 'fixtures', area + '.json');
  const before = readFileSync(path, 'utf8');
  const beforeKB = Buffer.byteLength(before, 'utf8') / 1024;

  const json = JSON.parse(before);
  const elements = (json.overpass && json.overpass.elements) || [];
  const droppedKeys = slimOverpassElements(elements);

  const after = JSON.stringify(json);
  writeFileSync(path, after, 'utf8');
  const afterKB = Buffer.byteLength(after, 'utf8') / 1024;

  console.log(
    `${area}: ${beforeKB.toFixed(1)}KB -> ${afterKB.toFixed(1)}KB` +
      `(-${(beforeKB - afterKB).toFixed(1)}KB) / 削除タグ数 ${droppedKeys}`
  );
}

function main() {
  const arg = process.argv[2];
  const targets = arg ? [arg] : AREAS;
  for (const area of targets) {
    if (!AREAS.includes(area)) {
      console.error('不正なエリア名です: ' + area);
      console.error('使えるエリア名: ' + AREAS.join(', '));
      process.exit(1);
    }
  }
  targets.forEach(slimOne);
}

// このファイルを直接実行したときだけ main() を走らせる。
// make-fixture.mjs のように import で KEEP_TAG_KEYS 等だけ使いたい呼び出し元では
// main() が勝手に走らないようにする(Node 標準のエントリポイント判定。
// pathToFileURL を使うことで日本語パス等のエンコード差異を吸収する)。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
