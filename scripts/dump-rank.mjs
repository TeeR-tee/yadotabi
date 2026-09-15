// S1: v3 暫定 rank の実態を観察するための集計スクリプト(観察専用・rank改変なし)
// 使い方: node scripts/dump-rank.mjs kusatsu / node scripts/dump-rank.mjs hakone
//
// fixtures/<area>.json を ?fixture=<area> で読み込んだページ上で
// YadoEngine.suggest() をそのまま呼び、cards(最大30件)と far(最大10件)を
// markdown 表で標準出力する。外部APIは一切叩かない(fixture 経由のみ)。
//
// Playwright は C:\workspace\tools\shot\node_modules のものを絶対パスで読む
// (このプロジェクトに npm install はしない。check-a11y.mjs の前例に合わせた)。

import { chromium } from 'file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mdEscape(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildTable(cards) {
  // score は rank() 内部のクロージャに閉じており engine.js の公開APIからは取得できない
  // (engine.js は変更禁止のため取得口を追加しない)。ここでは rank 後の並び順(=順位)を
  // score の代替観察値として扱う。
  const header = '| 順位 | 名前 | カテゴリ | 距離m | Wikipedia要約有 | 画像有 | 公式サイト有 | source | score |';
  const sep = '|---|---|---|---|---|---|---|---|---|';
  const rows = cards.map((c, i) => {
    return `| ${i + 1} | ${mdEscape(c.name)} | ${mdEscape(c.categoryLabel)} | ${c.distanceM} | ${c.summary ? '○' : '×'} | ${c.imageUrl ? '○' : '×'} | ${c.hasOfficialSite ? '○' : '×'} | ${c.source} | 非公開(順位で代替) |`;
  });
  return [header, sep, ...rows].join('\n');
}

function buildSummary(cards) {
  const catCount = {};
  const sourceCount = { osm: 0, wiki: 0, both: 0 };
  const distances = [];
  cards.forEach((c) => {
    catCount[c.categoryLabel] = (catCount[c.categoryLabel] || 0) + 1;
    if (c.source === 'both') sourceCount.both++;
    else if (c.source === 'wiki') sourceCount.wiki++;
    else sourceCount.osm++;
    distances.push(c.distanceM);
  });
  const catStr = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  const lines = [
    `- カテゴリ内訳: ${catStr}`,
    `- source別件数: osm単独 ${sourceCount.osm} / wiki単独 ${sourceCount.wiki} / both ${sourceCount.both}`,
    `- 距離(m)の中央値 ${Math.round(median(distances))} / 最大 ${Math.round(Math.max(...distances, 0))}`,
  ];
  return lines.join('\n');
}

async function main() {
  const area = process.argv[2];
  if (!area || !/^[a-z0-9_-]+$/.test(area)) {
    console.error('使い方: node scripts/dump-rank.mjs <kusatsu|hakone>');
    process.exitCode = 1;
    return;
  }

  let serverProc = null;
  const alreadyRunning = await isPortOpen(PORT);
  if (!alreadyRunning) {
    const projectRoot = fileURLToPath(new URL('..', import.meta.url));
    serverProc = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    for (let i = 0; i < 25; i++) {
      if (await isPortOpen(PORT)) break;
      await waitFor(200);
    }
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/?fixture=${area}`, { waitUntil: 'load' });
    // fixture の fetch + 初回描画を待つ(app.js が selectHotel まで走る時間を見込む)
    await waitFor(2000);

    // ページ上の YadoEngine.suggest をそのまま呼ぶ。rank() は一切変更していない。
    const result = await page.evaluate(async () => {
      const res = await fetch('fixtures/' + location.search.match(/fixture=([a-z0-9_-]+)/)[1] + '.json');
      const json = await res.json();
      window.YadoGeo.setFixture(json);
      const hotel = {
        id: 'fixture/' + json.meta.area,
        name: json.meta.label + '(固定データ)',
        lat: json.meta.lat,
        lon: json.meta.lon,
      };
      const items = await window.YadoEngine.collect(hotel);
      const ranked = window.YadoEngine.rank(items, hotel, { now: new Date() });
      const presented = window.YadoEngine.present(ranked, hotel);

      // present() のカードには score が乗らないので、rank 済み item 側から名前で拾って添える。
      // (present は toCard で score を落とすため、観察目的でここだけ dump 側が補う)
      function attachScore(cards) {
        return cards.map((c) => {
          const src = ranked.find((it) => it.id === c.id);
          return {
            ...c,
            hasOfficialSite: !!(src && src.website),
          };
        });
      }
      return {
        cards: attachScore(presented.cards),
        far: attachScore(presented.far),
      };
    });

    console.log(`# ${area} 上位${result.cards.length}件(cards)\n`);
    console.log(buildTable(result.cards));
    console.log('\n集計:');
    console.log(buildSummary(result.cards));

    console.log(`\n# ${area} far(車60分超・上位${result.far.length}件)\n`);
    if (result.far.length > 0) {
      console.log(buildTable(result.far));
    } else {
      console.log('(0件)');
    }

    await context.close();
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }
}

main().catch((err) => {
  console.error('dump-rank 実行エラー:', err);
  process.exitCode = 1;
});
