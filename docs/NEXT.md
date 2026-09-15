# NEXT: R33 + R34 — check.mjs に応答時間の記録を追加し、README の画像もリンク検査に含める

**判断理由**: 残る未完了のうち R11/R14/R19 は rank・fixture 再生成や地図レイアウトの検討を伴い1サイクルに収まらず、R31/R32 は撮影と目視判断が主。R33 と R34 はどちらも `docs/check.mjs` 1ファイルの改修で閉じ、既に毎日 GitHub Actions が回っている足回りに「数字」と「検査範囲」を足すだけなので、まとめて1タスクにするのが最も安全かつ効果的。

- 難易度: **sonnet**
- 所要目安: **20分**
- 画面の変更: **なし**(撮影は不要。ただし後述の通り `node docs/check.mjs` の出力を貼ること)

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs` — **この1本だけ**を編集する
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` — R33・R34 を `[x] 2026-09-16` にする
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` — 3行追記(**「## 朝のまとめ」節の直後**、R35 節の上に新しい節を置く。朝のまとめは常に最上部)

## 実装方針(check.mjs の実物に即して)

### (A) R33: 応答時間(ms)の記録

現状 `report(label, ok, detail)` が `[OK] ラベル - 詳細` の1行を出している(30〜34行目)。fetch は3か所ある: `checkTarget`(40行目)、`collectLinks`(89行目)、`checkLink`(150行目・HEAD失敗時のGET再試行158行目)。

1. 計測用の小さなヘルパを1つ足す。例:
   ```js
   const timings = []; // { label, ms }
   async function timedFetch(label, url, options) {
     const t0 = performance.now();
     const res = await fetch(url, options);
     const ms = Math.round(performance.now() - t0);
     timings.push({ label, ms });
     return { res, ms };
   }
   ```
   `performance` は Node 18+ でグローバルに使える(`require`/`import` 不要)。
2. 上記3か所の `fetch` をこのヘルパ経由に置き換え、**成功行の detail に `123ms` を併記**する。既存の detail がある行(JSサイズ等)は書式を壊さない範囲で併記してよいが、**HTTP 200 の行(50行目 `report(\`${path} (HTTP 200)\`, true)`)に ms を出すのが最低要件**。リンク検査の行(164行目)にも同様に併記する。
3. fetch が例外を投げた場合は timings に積まない(計測不能なので)。
4. **スクリプト末尾**(現状175行目の `if (hasFailure)` の直前)に集計を出す:
   - `合計 N件 / 総計 XXXXms / 平均 XXXms`
   - `最遅: <ラベル> XXXms`
   これは `console.log` で素直に出す。`report()` を使わない(OK/NG の判定対象ではないため)。
5. **閾値による失敗判定は絶対に付けない**。遅くても `hasFailure` を立てない(GitHub Pages の揺らぎで Actions を赤くしないため)。

### (B) R34: README.md の画像もリンク検査に含める

現状 `HTML_PAGES`(84行目)は3つのHTMLのみ。README.md は Markdown なので `collectLinks` の HTML 用正規表現とは別扱いにする。

1. `collectMarkdownLinks(page)` を新設し、`BASE + 'README.md'` を GET する。
   - **注意**: GitHub Pages は README.md をそのまま配信する(Jekyll の有無で挙動が変わる可能性がある)。もし本番で README.md が 404 になる場合は、**リポジトリ内のローカルファイル `README.md` を `node:fs` で読んで参照先だけ本番URLで検査する**方式に切り替えてよい。どちらを採ったか NIGHTLOG に1行書くこと。
2. 抽出する2形式:
   - `<img src="docs/shots/state-a.jpg" ...>` — HTML タグ形式(現状 README にある3件はこれ)
   - `![alt](docs/xxx.jpg)` — Markdown 記法(将来のため対応しておく)
     正規表現例: `/!\[[^\]]*\]\(([^)\s]+)/g`
3. 抽出したパスは既存の `checkLink(page, path)` にそのまま流す。ラベルは `リンク README.md → docs/shots/state-a.jpg` の形になる。
4. **外部ドメイン(`https?://` で始まり BASE 以外)は従来どおり fetch しない**。件数だけ `(検査対象外)` として1行 OK 表示するのは既存 `collectLinks` と同じ扱いでよい。
5. アンカー(`#...`)、`mailto:`、`javascript:` は既存同様スキップ。

### やらないこと

- 既存の OK/NG 判定ロジック・TARGETS の中身は変えない。
- README.md 自体を書き換えない(画像を足したり減らしたりしない)。
- 外部ドメインへの fetch を増やさない。

## 完了条件(検証可能)

1. `node docs/check.mjs` が **exit 0**(全項目 OK)で終わる。
2. 出力の各成功行に応答時間 `NNNms` が併記されている。
3. 末尾に「合計件数 / 総計ms / 平均ms / 最遅項目」の集計行が出ている。
4. 出力に `リンク README.md → docs/shots/state-a.jpg`(および state-b.jpg / embed.jpg)の3行があり、いずれも OK。
5. わざと壊した場合に NG になることを1回だけ確認する: 一時的に README の画像パスを存在しない名前に差し替えた文字列でテストするか、`checkLink` に存在しないパスを1回渡して NG 行が出ることを確かめ、**確認後は必ず元に戻す**(コミット前に `git diff` で check.mjs 以外に差分が無いことを見る)。
6. 遅い応答でも `hasFailure` が立たない(= exit 0 のまま)ことをコード上で確認する。

## 検証手順

```
node --check docs/check.mjs
node docs/check.mjs            # 出力全文を NIGHTLOG に貼らず、要点(件数・最遅・README3行)だけ書く
echo $LASTEXITCODE             # PowerShell の場合。0 であること
node scripts/check-engine.mjs  # デグレ確認(engine/geo は触っていないが念のため)
node scripts/check-geo.mjs
```

撮影は不要(画面に変更がないため)。ただし NIGHTLOG の「見た目の確認結果」には「画面変更なしのため撮影省略。`node docs/check.mjs` の全項目OK・exit 0 を確認」と正直に書くこと。

## 変更禁止範囲

- `assets/` 配下(app.js / geo.js / engine.js / style.css / tokens.css / ui.css)— **一切触らない**
- `fixtures/` 配下の JSON — **一切触らない**(再生成もしない)
- `index.html`、`demo/*.html`、`README.md` — 今回は読むだけ
- `scripts/check-*.mjs`(10本)— 今回は実行するだけで編集しない
- rank の重み・閾値 — 無関係なので触らない
- git stash / reset --hard / checkout でのファイル復元は禁止(AUTOPILOT 規約7)

## 最後にやること

1. `docs/ROADMAP.md` の R33・R34 を `- [x] 2026-09-16 ...` にする
2. `docs/NIGHTLOG.md` の **朝のまとめ節の直後**に3行(やったこと / 見た目の確認結果 / 次)を追記
3. **まず先にコミット**して `git push`。コミットメッセージは1行の日本語で簡潔に
4. 報告は簡潔に(長文の報告書を書かない)
