# NEXT: R104 README の英語段落を実装に合わせて更新する

- **タスクID**: R104
- **難易度**: sonnet(文書のみ・コード変更なし)
- **所要目安**: 20〜30分(うち検証 `check-all` に約4分)

## 目的

本番URL(https://teer-tee.github.io/yadotabi/)のリポジトリを海外から見た人が最初に読むのが
`README.md:3` の英語1段落(R21 で追加)。ここが実装より古く、**fixture が1エリアしか無いように読め、
`?embed=1`(営業上いちばん重要な機能)にも `?debug=1` にも一切触れていない**。
日本語が読めない人にとっては「試せる入口」がこの3文だけなので、実態と揃える。

## 実測で判明した前提(2026-09-16 計画役が確認)

1. `README.md:3` の英語段落は**3文**で、全文は以下(1行で書かれている):
   - `**What this is**: ... no user input required.`
   - `**How to try**: open \`https://teer-tee.github.io/yadotabi/\`, or add \`?fixture=kusatsu\` to see a demo with no external API calls.`
   - `**No API keys needed**: it only uses free public APIs (OpenStreetMap / Overpass / Wikipedia), at zero cost.`
   → 挙がっている fixture は **`kusatsu` の1件のみ**。
2. 日本語側は既に4エリア+random を列挙している:
   - `README.md:29`(使い方3)に `?fixture=hakone`(または `kusatsu` / `dogo` / `beppu`)
   - `README.md:113`(パラメータ表)に `kusatsu` / `hakone` / `dogo` / `beppu` / `random`
   → **英語側だけが1エリアのまま**という非対称。
3. 英語段落には `?embed=1` が無い。日本語側は `README.md:37`(埋め込み節)・`README.md:40`(iframe タグ例)・
   `README.md:115`(表)の3箇所で説明済み。`?debug=1` も `README.md:114` にあるが英語側に無い。
4. `README.md` は全 **232行**。英語段落の直後 `README.md:4` は空行で、`README.md:5` からスクリーンショットの
   `<table>` が始まる。**英語段落は独立した1行なので、その行だけを差し替えれば他に影響しない**。
5. 外部依存は `index.html:25`(leaflet.css)と `index.html:74`(leaflet.js)の cdnjs 2本のみ。
   英語段落の "no API keys" の主張は現在も事実(未確認の懸念なし)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` — **これ1ファイルのみ**

## 実装方針

`README.md:3` の1行を、**4〜5文**に書き直す。足すのは次の3点のみ:

- (a) fixture が `kusatsu` / `hakone` / `dogo` / `beppu` の**4エリア**と、実行時に1つ選ぶ `random` であること
- (b) `?embed=1` を `?hotel=` と併用すると iframe で宿の予約ページに貼れること(高さは自動で伸びる)
- (c) 「この下の日本語の表に全パラメータの一覧がある」と案内する1文
  (任意で `?debug=1` を「`?fixture=` 併用時だけ rank の内訳が見える」と1句添えてよい)

制約:
- **用語・パラメータ名は翻訳しない**(`fixture` / `?embed=1` / `?fixture=` / `?debug=1` / `random` はそのまま)。R73 と同じ方針。
- **日本語の本文・表・見出しは1行も変えない**。差分は `README.md:3` の1行だけになるのが理想
  (段落が長くなって改行する場合も、`README.md:4` の空行より前に収めること)。
- 既存の3つの太字ラベル(`**What this is**` / `**How to try**` / `**No API keys needed**`)の形式は踏襲する。
  足す文にもラベルを付けるかは実装者の判断でよいが、日本語側の見出し構造とは独立させること。
- 事実でないことを書かない(例: 「4 areas covering all of Japan」は誤り。fixture は撮影用の固定データ4件)。

## 完了条件

1. `README.md:3` の英語段落が4文以上あり、4エリア名(kusatsu/hakone/dogo/beppu)と `random` と `?embed=1` が全て登場する。
2. `git diff README.md` の変更が**英語段落の行のみ**(日本語行の差分が0)。
3. `node scripts/check-all.mjs` が **27本全緑**。
4. `node docs/check.mjs` が OK(README の画像リンク検査 R34 を壊していないこと)。

## 検証手順

```
cd "C:\workspace\claude\旅行先用サイト\yadotabi"
git diff README.md                 # 日本語行に差分が無いことを目視
node docs/check.mjs                # README 画像3本を含む全件 OK
node scripts/check-all.mjs         # 27本全緑(必須)
```

撮影(画面は変わらないのでデグレ確認1枚のみ):
```
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --mobile
```
- URL: `https://teer-tee.github.io/yadotabi/?fixture=kusatsu`、幅: mobile(375px)
- push 後に撮り、カード30枚・番号ピン判読可・コンソールエラー0件を目で確認する。
- 外部API 0回(fixture のため Overpass/Wikipedia は叩かない)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**
- rank の重み・閾値・カテゴリ減点は**変更不可**
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- 外部API呼び出し **0回**(本番URLへの GET は `docs/check.mjs` の従来分のみ)
- 日本語の本文・表・`docs/` 配下の他ファイルは触らない

## 終わったら

1. `docs/ROADMAP.md` の R104 の行を `- [x] 2026-09-16 R104 ...` に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記
   (やったこと / 見た目の確認結果 / 次)。**ファイル先頭に新しい節を作らない**
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
