# NEXT: R139 情報が何も無い35枚の「196pxの空箱」を詰める

- タスクID: **R139**
- 難易度: **sonnet**(CSS + app.js の分岐1箇所。判断の重い設計はこの指示書で済ませてある)
- 所要目安: 40〜60分(うち check-all 29本が約5分)

## 目的

R136(営業時間18枚)・R137(公式ドメイン31枚)で「取得済みなのに使っていなかったデータ」は出し切った。
その**後**を実測すると、**要約も営業時間も公式サイトも1つも持たないカードが 35枚(120枚中29%)**残っている。
この35枚は**出し方が悪いのではなく、本当に出すものが無い**。にもかかわらず、**1枚あたり196px(カード高さ371pxの53%)を、
中身がゼロの灰色の箱に使っている**。今回はこの**面積だけ**を詰めて、宿の客が同じスクロール量でより多くの提案を読めるようにする。

## 実測で判明した前提(作業役はこれを鵜呑みにせず、自分でも測り直して NIGHTLOG に自分の数字を書くこと)

計画役が mobile 375x812 (`isMobile:true`/`hasTouch:true`/DPR2) で4エリアの `?fixture=<area>` を開き、DOM を実測した値:

- **完全に空のカード = 35枚**(`.feedcard__summary--none` かつ `.feedcard__hours` 無し かつ `.feedcard__official` 無し、かつ Wikipedia リンクも無い):
  **kusatsu 6 / hakone 10 / dogo 11 / beppu 8**
- 対照(触ってはいけない側) = 85枚。うち **「Wikipediaに記事はあります」+リンク側が26枚**(kusatsu 2 / hakone 6 / dogo 8 / beppu 10)。**この26枚は R123/R124 の別経路で、今回の対象外**
- 35枚の高さは**全て 371px**、うち `.feedcard__ph` が **196px**(= `.feedcard__media` の `aspect-ratio:16/9` × 375px幅)
- 4エリアの `document.documentElement.scrollHeight` = kusatsu 12500 / hakone 12390 / dogo 12302 / beppu 12572 px
  → 35枚×196px = **6860px** が中身ゼロ。1エリア平均 約1700px(画面2.1枚ぶん)
- 固定要素は `.topbar` 61px + `.feedmap` 220px = **card0Top 293px**(4エリアとも同値)
- **なぜ空なのか**: fixtures の OSM タグを1件ずつ数えた結果、35枚が持つタグは
  `name`(45/45)・`tourism`(12)・`natural`(11)・`historic`(11)・`leisure`(8)・`amenity`(5)・`man_made`(1) だけで、
  **`description`・`opening_hours`・`website` は1件も無い**。実例:
  - 湯畑(kusatsu #22) `{"leisure":"hot_spring","name":"湯畑","tourism":"attraction"}`
  - かっぱ天国(hakone #16) `{"amenity":"public_bath","name":"かっぱ天国"}`
  - 商店街(dogo #16) `{"name":"商店街","tourism":"attraction"}`
  - グローバルタワー(beppu #17) `{"name":"グローバルタワー","name:ja":"グローバルタワー","tourism":"viewpoint"}`
- 撮影 `screenshots/planner-r139-dogo-empty_mobile.png`(mobile 375x812、dogo #16 を画面上端に置いた状態):
  **1画面(812px)に空カードが 2枚しか入らず**、画面の過半が灰色の箱。
  しかも**箱の絵文字は `.feedcard__meta` のカテゴリ行と同じ絵文字**(♨ 共同浴場 / 📷 観光名所)で、196px 使って情報を1ビットも足していない。
- 対照として `screenshots/2026-09-18T10-00-27_127.0.0.1_3000_fixture_dogo_mobile.png`(dogo #1 伊佐爾波神社)を目視済み。
  **R136 の `⏰ 月〜日 9:00-17:00` と R137 の `⧉ isaniwa.official.jp` は1行ずつ収まり、リンクチップ5個も1行のまま。R136/R137 による読みづらさは発生していない**(縦に伸びた影響の確認は済んでおり、今回この2機能には一切触らない)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(`cardHtml()` — 1015行付近のカード組み立て)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(`.feedcard__media` 416行 / `.feedcard__ph` 426行 付近)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`((r139) 節を追加。既存ケースは1つも削らない)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針

1. `cardHtml()` の中で、既に組み立て済みの4つの変数(`media` が `placeholderHtml` に倒れたか / `summary` が `--none` か / `hoursText` / `domainText`)から
   **「この1枚は完全に空か」を判定する真偽値を1つ作る**。Wikipedia リンク側(`hasArticle === true`)は**空に含めない**(26枚は対象外)。
2. 空のときだけ `<article>` に修飾クラス **`feedcard--bare`** を足す(既存のクラス・DOM構造・番号バッジ・リンク行は一切変えない)。
3. `style.css` に `.feedcard--bare .feedcard__media { aspect-ratio: auto; height: <N>px; }` を1ブロック追加する。
   **`N` は作業役が実測して決める**: `.feedcard__no`(番号バッジ)のタップ領域が **44px を下回らない**ことが下限。
   目安は 56〜72px だが、**バッジが帯からはみ出さず・上下の余白が詰まりすぎない値を撮影で選び、選んだ理由を NIGHTLOG に書く**。
   絵文字は `.feedcard--bare .feedcard__ph { font-size: … }` で帯に収まる大きさへ落とす(**消さない** — 消すと帯が真っ白な線になり、
   カードの切れ目が分からなくなることを撮影で確認すること)。
4. `.feedcard--bare` 以外のセレクタは**一切書かない**。85枚の CSS に影響が出る書き方(`.feedcard__media` の既定値の変更など)は禁止。

## 却下した案とその理由

- **35枚をカードに出さない(除外候補にする)** — 却下。実測の顔ぶれを見ると、**湯畑**(草津の象徴・徒歩1分)・**グローバルタワー**・**道後ハイカラ通り**・
  **油屋熊八の像**・**振鷺閣** など、**データが薄いだけで行き先としては一級品**が多数含まれる。消すと提案の質が下がる。「情報が無い」は「行く価値が無い」ではない。
- **OSM の別タグから説明文を作って埋める** — 却下。**そのタグが存在しない**ことを実測済み(`description`/`opening_hours`/`website` は35枚で0件)。
  カテゴリ名から「温泉です」等の文を生成するのは**推測を書くこと**であり、このプロジェクトの正直さ方針に反する。
- **Wikipedia を追加で叩いて要約を取る** — 却下。外部API 0回の制約。かつ35枚は記事自体が無い(記事がある候補は既に R123/R124 の別経路)。
- **rank を下げて後ろに追いやる** — 却下。**rank の重み・閾値は変更禁止**。かつ順位の問題ではなく面積の問題。
- **絵文字プレースホルダごと `display:none` にする** — 却下(の公算が高いが、作業役が撮影で最終判断してよい)。
  番号バッジ `.feedcard__no` が乗っている場所であり、地図のピン番号と行き来する導線なので**消せない**。
  また箱が完全に消えるとカード同士の切れ目が弱くなる。よって「潰す」ではなく「低い帯に詰める」を採る。
- **カードを横並び・2カラムにする** — 却下。85枚と35枚でレイアウトが割れて一覧の視線移動が壊れる。今回の変更範囲を超える。

## 完了条件

1. 4エリアで **35枚**(自分の実測値。計画役と違ったら自分の数字を採り、差異を NIGHTLOG に書く)の `.feedcard__media` 高さが 196px から下がっている
2. **残り85枚のカード高さが変更前と完全一致**(変更前後で全120枚の `getBoundingClientRect().height` を突き合わせて差分0を数値で示す)
3. mobile 375x812 の1画面に入る空カードが **2枚 → 3枚以上**になっている
4. 全120枚で `.feedcard__no` が表示されていて、タップ領域が **44px 以上**(`check-a11y.mjs` が引き続き全OK)
5. `?fixture=kusatsu&embed=1` でも同じく詰まっている
6. `scripts/check-nosummary.mjs` に **(r139) 節**を追加(空カードに `feedcard--bare` が付く / 要約のあるカード・「記事はあります」側26枚には付かない、を1枚ずつ)。**既存ケースの削除はゼロ**
7. `node scripts/check-all.mjs` が **29本全緑(exit 0)**
8. 順位・カードの枚数・リンク先が1つも変わっていない(`node scripts/dump-rank.mjs <area>` を4エリアで変更前後に取り、**差分0**)

## 検証手順

1. `node --check assets/app.js`
2. 変更前に `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` を4回取って控える → 変更後に取り直して差分0を確認
3. 撮影(すべて `?fixture=` 経由・**外部API 0回**):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile`(幅375)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile`(幅375)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=beppu" --mobile`(幅375)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1" --mobile`(幅375)
   - PC幅1枚: `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo"`(幅1280)
   - **dogo #16 を画面上端に置いた1枚**を Playwright で撮り、`planner-r139-dogo-empty_mobile.png`(変更前)と並べて見比べる
4. 撮影画像をすべて **Read で開いて目視**(文字崩れ・重なり・はみ出し・番号バッジの欠け・帰属表示の欠落・空白の異常)
5. `node scripts/check-all.mjs` → **29本全緑(exit 0)**

## 変更禁止範囲

- **rank の重み・閾値**(`assets/engine.js` の rank 系)— 順位を1つも動かさない
- **`assets/geo.js`** と **`fixtures/*.json`** — 一切触らない
- **入力UIの追加禁止**(入力欄・設定・チュートリアルを増やさない)
- **外部API 0回**(撮影は全て `?fixture=` 経由)
- **R136 の `.feedcard__hours` と R137 の `.feedcard__official`** — 文言・表示条件を変えない
- **SNS3種のラベル文字列**(`Instagram`/`TikTok`/`YouTube`)— `check-passive.mjs:94` が依存
- **数値は作業役が自分で実測して書くこと**。この指示書の数字(35枚・196px・371px・6860px・エリア別内訳)は計画役の実測値だが、
  **鵜呑みにせず自分で測り直し、自分の数字を NIGHTLOG に書く**。食い違ったら自分の実測値を採用し、その旨を明記する

## 終わったら

1. `docs/ROADMAP.md` の R139 を **`[x] 2026-09-18`** に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に、
   `### 2026-09-18 R139 <一言>` の見出しを付けて **3行**(やったこと / 見た目の確認結果 / 次)を追記する
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
