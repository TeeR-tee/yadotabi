# NEXT: R73 + R71(README の文書2本・コード変更なし)

## 判断理由
残候補のうち R14(fixture 軽量化)・R19(far 分布)・R40(別府追加)は Overpass を叩く必要があり無料APIのマナー上リスクが高い。R64(GitHub Actions)は課金の確認が要る=みのるんの判断待ち。R70(`?fixture=random`)はコード変更あり。よって**外部API 0回・コード変更 0行・検証が完全に機械化できる** R73+R71 を1サイクルで束ねて実施する(どちらも README のみ・既に dump-rank に「画像有」列が実装済みで計測が即可能)。

## 前提(計画役が実測済み)
- `scripts/dump-rank.mjs` は既に **「画像有」列(`c.imageUrl ? '○' : '×'`)** を出力する(scripts/dump-rank.mjs:50 付近)。新規スクリプトは不要、既存出力を数えるだけ。
- README は 177行・見出しは `## 起動方法 / 使い方 / 仕組み(かんたん解説) / 判断待ちの設計課題 / URLパラメータ一覧 / ファイル構成 / 無料APIのマナー / GitHub Pages 公開手順 / 開発者向け / v1からの変更点 / 今後`。
- 最新スクリーンショット2枚(`screenshots/r69-degrade-kusatsu_mobile.png` / `r69-degrade-imgfail_mobile.png`)を目視。ヘッダーバッジ「固定データ 2026-09-16 取得」は1行に収まり、番号ピン1〜30判読可、カード・リンクチップ5個の折り返しなし、崩れゼロ。**今サイクルは画面を変更しないので撮影は不要**。

## 対象ファイル(この2つ以外は触らない)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(唯一の編集対象)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R73・R71 を `[x] 2026-09-16` にする)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行追記)

## 実装方針

### R73 用語の初心者向け補足
1. **README を最初から最後まで通読する**(177行。grep だけで済ませない)。
2. `## 仕組み(かんたん解説)` の**直前**に `## 用語ミニ辞典` 節を新設し、表(用語 / 読み方・意味 / このアプリでの役割)で 8〜12語を説明する。候補: `fixture(固定データ)` / `Overpass` / `geosearch` / `OSM(OpenStreetMap)` / `bbox` / `embed(埋め込み)` / `rank` / `attribution(帰属表示)` / `デグレ` / `fitBounds` など、**README 本文に実際に出てくる語だけ**を採る(grep で確認。出てこない語を書かない)。
3. あわせて**初出箇所に短い括弧補足**を足す(例:「Overpass API(OpenStreetMap のデータを検索できる無料サービス)」)。既に括弧補足がある行は二重に足さない(README:50 の Overpass、README:52 の geosearch は既に補足あり → その行は触らず用語ミニ辞典から参照)。
4. **用語そのものは置き換えない**。`fixture` を「固定データ」に書き換えるとパラメータ名 `?fixture=` と対応が取れなくなるため、必ず「補足を足すだけ」。
5. 見出し番号・既存のリンク(`docs/FIXTURES.md` 等)を壊さない。

### R71 写真が無いカードの割合
1. 3エリアそれぞれ計測する(**外部API 0回**。fixture 経由のみ):
   ```
   cd C:\workspace\claude\旅行先用サイト\yadotabi
   node scripts/dump-rank.mjs kusatsu > %TEMP%\rank-kusatsu.md
   node scripts/dump-rank.mjs hakone  > %TEMP%\rank-hakone.md
   node scripts/dump-rank.mjs dogo    > %TEMP%\rank-dogo.md
   ```
   (スクラッチ領域 `C:\Users\rt774\AppData\Local\Temp\claude\...\scratchpad` を使ってよい。**リポジトリ内に中間ファイルを残さないこと**)
2. 各ファイルの **cards 表(上位30件)**の行で「画像有」列が `○` の行数を数える。far 表(10件)は別集計なので**混ぜない**。表のどこからどこまでが cards かは出力の見出しで判別すること。数え方は `grep` の列位置依存でよいが、**合計行数が 30 になることを必ず確認**してから割合を出す(30 にならなければ数え方が間違い)。
3. 「上位60件」は `?demo=` 無しの dump-rank では取れない可能性がある。**取れるなら載せ、取れないなら上位30件だけにして「60件は dump-rank が出力しないため未計測」と正直に1行書く**(無理に実装を足さない=コード変更なしの原則を優先)。
4. README の `## 判断待ちの設計課題` 節の**直後**に、小さな表を置く:
   ```
   ### 写真があるカードの割合(fixture 上位30件・2026-09-16 時点)
   | エリア | 上位30件中 写真あり | 割合 |
   |---|---|---|
   | 草津 | ◯件 | ◯% |
   ...
   ```
   下に1〜2行、「写真が無いカードはカテゴリ絵文字のプレースホルダになる(R23)。ライトボックス(R66)が効くのは写真ありのカードのみ」という意味づけを添える。
5. **数字は実測値のみ**。推測で書かない。

## 完了条件(すべて機械検証可能)
1. `node docs/check.mjs` が全項目 OK・exit 0(README 内の画像リンク検査を含む)。
2. `node scripts/check-all.mjs` が **全本 PASS・exit 0**。
3. `git diff --stat -- assets fixtures scripts index.html demo .github` が**空**(コードを1行も触っていない証明)。
4. `git diff --stat -- README.md` が空でない(=実際に書いた)。
5. README の用語ミニ辞典に書いた語が**すべて README 本文に実在する**ことを grep で確認した記録が NIGHTLOG にある。
6. R71 の各エリアの数値の分母が 30 であることを確認済み。

## 検証手順
```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node scripts/dump-rank.mjs kusatsu   # 計測(3エリア分)
node docs/check.mjs                  # 全OK・exit 0
node scripts/check-all.mjs           # 全本PASS・exit 0(約3分半)
git diff --stat -- assets fixtures scripts index.html demo .github   # 空であること
```
画面の変更が無いため**撮影は省略してよい**(NIGHTLOG に「画面変更なしのため撮影省略」と明記すること)。

## 変更禁止範囲
- `assets/`(app.js / engine.js / geo.js / style.css / tokens.css / ui.css)— 1行も触らない
- `fixtures/`・`scripts/`・`index.html`・`demo/`・`.github/`
- rank の重み・閾値・除外ルール
- 用語そのもの(パラメータ名・ファイル名・`fixture`/`embed` 等の英語表記)の置換
- git stash / reset --hard / checkout でのファイル復元(AUTOPILOT 規約7)

## 難易度・所要目安
- 難易度: **sonnet**(文書のみ・判断要素なし)
- 所要目安: **20分**(計測5分 + README執筆10分 + check-all 3分半)

## 完了後
1. `docs/ROADMAP.md` の R73 と R71 を `[x] 2026-09-16` にする。
2. `docs/NIGHTLOG.md` に3行(やったこと / 確認結果(数値を含む) / 次)。
3. **先にコミット**してから報告。コミットメッセージは1行の日本語。その後 `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
