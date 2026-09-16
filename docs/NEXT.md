# NEXT — R109 `docs/check.mjs` に iframe の `sandbox` / `referrerpolicy` 一貫性検査を足す

- **タスクID**: R109
- **難易度**: sonnet
- **所要目安**: 20〜30分

## 目的

R98 で `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` と
`referrerpolicy="no-referrer"` を**3箇所に手書き**したが、どれか1箇所だけ直しても誰も気づけない。
営業資料としてコピーされるタグなので、ズレたまま配られると実害がある。
R106 で `docs/CHECKS.md` の幽霊行を潰したのと同じ「文書と実体の腐り」を機械検査で止める。

## 実測で判明した前提(すべて本サイクルで grep / sed 実行済み)

1. `grep -n "sandbox\|referrerpolicy" docs/check.mjs` → **0件**。属性は一切見ていない。
2. 属性の実体は次の3箇所(いずれも同一の4トークン + `referrerpolicy="no-referrer"`):
   - `demo/hotel-page.html:215-217` 実 iframe(`src="../index.html?fixture=kusatsu&embed=1&bg=fff7e6"`、`loading="lazy"` 付き)
   - `demo/hotel-page.html:230` `<pre class="tag-example">` のコピー用タグ(HTMLエスケープ済み: `&lt;iframe ... &gt;`)
   - `README.md:42` のタグ例
3. `docs/check.mjs` は293行。構造は以下(実測の行番号):
   - `docs/check.mjs:12` `TARGETS`(11ファイル)、`:29` `hasFailure`、`:37` `timings`
   - `:39` `timedFetch(label, url, options)` → `{ res, ms }` を返す
   - `:59` `report(label, ok, detail)` — `ok=false` で `hasFailure = true`(`:62`)
   - `:113` `HTML_PAGES = ['index.html', 'demo/embed-check.html', 'demo/hotel-page.html']`
   - `:115` `collectLinks(page)` が `BASE + page` を GET し `res.text()` で本文を取っている(**同じ本文を再利用できる構造にはなっていない。R109 は自前でもう1回 GET してよい**)
   - `:197-203` `for (const page of HTML_PAGES)` のリンク検査ループ
   - `:209` `collectMarkdownLinks`、`:255` `MARKDOWN_PAGES = ['README.md']`
   - `:265` 以降が R33/R46 の集計行、`:291` `if (hasFailure) process.exitCode = 1`
4. R93 の実測記録どおり、`demo/hotel-page.html` は本番URL(`BASE + 'demo/hotel-page.html'`)から 200 で取得できる。
   README.md も R34 で本番から GET できることが確認済み(`:255` の `MARKDOWN_PAGES` がその実績)。
5. **未確認**: README.md 本文中のタグ例が `<` そのままか HTML エスケープされているかは、本番配信の生テキストで確認すること(ローカルの `README.md:42` は生の `<iframe ...>`)。
   実装時に本番の本文を1回 console.log して目で確かめてから正規表現を確定する。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs`(本タスクの唯一のコード変更先)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(1行追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針

1. `docs/check.mjs:253`(R34 節の直前、リンク検査ループ `:203` の後ろ)に新しい節
   `// --- R109: iframe の sandbox / referrerpolicy の一貫性検査 ---` を追加する。
2. 期待値を定数で1箇所に持つ:
   ```js
   const EXPECTED_SANDBOX = new Set(['allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox']);
   const EXPECTED_REFERRERPOLICY = 'no-referrer';
   ```
3. 検査対象3箇所を、本番URLから GET した本文に対して抽出する:
   - `demo/hotel-page.html` の本文から `<iframe` で始まるタグ(生HTML)を全部拾う → 実 iframe 1件
   - 同じ本文の `<pre class="tag-example">` 内を `&lt;iframe` で拾い、`&quot;`/`&amp;`/`&lt;`/`&gt;` をデコードしてから同じ抽出をかける
   - `README.md` の本文から `sandbox="..."` と `referrerpolicy="..."` を拾う
4. 各箇所について `sandbox` の値を空白で split して Set 化し、`EXPECTED_SANDBOX` と
   **集合として一致**(順序は問わない・過不足なし)することと、`referrerpolicy` が `no-referrer` であることを
   `report()` で1行ずつ出す。ラベル例: `iframe属性 demo/hotel-page.html(実iframe)`。
5. **`hasFailure` 経路はそのまま使ってよい**(`report(label, false, ...)` を呼べば自動で赤くなる)。
   これは応答時間と違って揺らがない構造検査なので、ズレたら赤くするのが正しい(R33/R46/R103 の
   「閾値で赤くしない」方針は**時間の測定値に限った話**)。`docs/check.mjs:291` 自体は変更しない。
6. 3箇所のどれかで iframe タグ自体が見つからない場合も NG にする(タグを消して検査が素通りするのを防ぐ)。
7. `docs/CHECKS.md` の `docs/check.mjs` の行に「R109: 埋め込みタグの sandbox/referrerpolicy が3箇所で一致しているか」を1行追記する。

## 完了条件

- `node docs/check.mjs` が全 OK・exit 0 で、出力に iframe 属性検査の**3行**が新たに出ている。
- わざと `README.md:42` の `allow-popups` を1つ消して `node docs/check.mjs` を流すと **NG になり exit 1**、
  戻すと緑に戻ることを実際に確かめる(戻し忘れ厳禁。`git diff README.md` が空であることを最後に確認)。
- `node scripts/check-all.mjs` が **28本全緑**。
- `git diff --stat -- assets index.html fixtures demo` が**空**(やどたび本体・demo は無変更)。

## 検証手順

```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node --check docs/check.mjs
node docs/check.mjs                 # 本番URLへのGETのみ。新3行がOKで出ること
node scripts/check-all.mjs          # 28本全緑(必須)
git diff --stat -- assets index.html fixtures demo   # 空であること
```

画面は変わらないので撮影はデグレ確認1枚のみ:

```
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile
```
(幅375。撮った画像は Read で開いて文字崩れ・重なりが無いことを目視する)

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**不可**。
- rank の重み・閾値は**不可**。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)呼び出しは **0回**。本番URL(GitHub Pages)への GET は従来どおり可。
- `docs/check.mjs:291` の `hasFailure` 判定ブロック自体は書き換えない(`report()` 経由で赤くする)。

## 終わったら

1. `docs/ROADMAP.md` の R109 行を `- [x] 2026-09-16 R109 ...` にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行(やったこと / 見た目の確認結果 / 次)を追記する。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
