# NEXT: R35 観光対象でない候補(学校・病院・公共施設)の除外ルール拡充

難易度: **opus** / 所要目安: 60〜90分 / 1サイクル=1タスク

## 背景(なぜ最優先か)
R30 の道後温泉 fixture の観察(09_研究ノート L177〜)で、上位30件に
**「愛媛大学教育学部附属特別支援学校」(13位)・「愛媛大学ミュージアム」(18位)・
「松山地方気象台」(15位)・「松山市青少年センター」(17位)** など、観光対象とは
言えない教育・公共施設が複数混入していることが判明した。
これは rank(並び順)の問題ではなく**除外ルールの取りこぼし**であり、
ユーザーに「特別支援学校」を観光地として提示する実害がある。市街地隣接の
温泉地では必ず起きる構造的な穴なので、他エリア展開の前に塞ぐ。

## 先に確認させたい事実(計画役の事前調査。実物を読んで裏取りすること)
- `assets/engine.js:128` `TITLE_SUFFIX_NG` / `:137` `TITLE_KEYWORD_NG` / `:143` `EXTRACT_KEYWORD_NG`
  の3定数があり、適用は `:303 isExcludedArticle(title, extract)` の1箇所のみ。
- **`isExcludedArticle` の呼び出しは `assets/engine.js:608`(wiki 側のループ内)だけ。**
  OSM 側の `buildOsmItems`(`assets/engine.js:544` 付近)は
  「lat/lon がある」「name が空でない」「宿自身でない」しか見ておらず、
  **除外ルールが一切かかっていない**。これが本命の原因と考えられる。
  → まず `node scripts/dump-rank.mjs dogo` の全候補(cards+more+far)を出し、
    混入している各件が `source=osm` / `wiki` / `both` のどれかを確認し、
    **どちらの経路で入ったかを特定してから**修正方針を決めること。
- OSM 側で拾われる理由の推定: `assets/geo.js:531` 付近の Overpass クエリは
  `tourism=attraction` / `tourism=museum` / `historic=monument` 等を引いており、
  大学附属施設・公共施設にこれらのタグが付いていると素通しになる。

## やること
1. **調査**: `node scripts/dump-rank.mjs dogo` の全候補から観光対象でないものを列挙する。
   対象語の例: 学校・大学・学院・学園・幼稚園・保育園・こども園・病院・医院・診療所・
   クリニック・役所・市役所・町役場・県庁・合同庁舎・気象台・センター(※後述)・
   銀行・信用金庫・郵便局・警察・交番・消防・工場・変電所・浄水場・下水・清掃工場・
   団地・マンション・アパート・住宅・寮・刑務所・自衛隊・駐屯地 など。
2. **除外ルールの拡充**(語ベース、`engine.js` の既存3定数に追記する形)。
   - `TITLE_SUFFIX_NG` に末尾一致で安全なもの(例: 学校・大学・幼稚園・保育園・
     病院・診療所・市役所・町役場・気象台・工場・変電所・浄水場・団地 など)。
   - `TITLE_KEYWORD_NG` に部分一致で安全なもの(例: 特別支援・附属・付属 など。
     **誤爆しやすい語は入れない**)。
   - `EXTRACT_KEYWORD_NG` に「にある学校」「に設置された」等、記事冒頭文で
     判別できるものがあれば追加。
3. **OSM 側にも除外を適用する**。`buildOsmItems` の中で
   `isExcludedArticle(item.name, '')` 相当を通す(extract は無いので title のみ判定)。
   関数名が実態と合わなくなるなら、判定本体を `isExcludedName(title)` と
   `isExcludedArticle(title, extract)` に分けてよい(挙動は既存を保つこと)。
4. **保護リスト**(誤爆防止)。次を含む名前は上の語に当たっても**落とさない**:
   `記念館・資料館・美術館・博物館・道の駅・公園・神社・神宮・大社・寺・院・城・
   ミュージアム`。保護は除外より先に評価する(保護 → 除外の順)。
   ※「愛媛大学ミュージアム」は保護語(ミュージアム)を含むため、この設計だと残る。
   残すか落とすかは**作業役の判断で決めてよい**が、決めた理由を NIGHTLOG に書くこと
   (推奨: 大学の研究展示施設は一般観覧可なので残す。「附属特別支援学校」は落とす)。
5. **`?demo=`/`?fixture=` の挙動は不変**。fixtures/*.json は再生成しない。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` (除外定数と適用箇所)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js` (※下の「小修正」でのみ、カテゴリ判定順)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs` (ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` / `docs\ROADMAP.md` (記録)

## 同サイクルの小修正(司令塔からの指示・必須)
dogo の 1位「伊佐爾波神社」のカテゴリ行が **「記念碑」** になっている(神社なのに)。
原因は `assets/geo.js:243-264` の `CATEGORY_RULES` が上から順に評価され、
`historic=monument`(:252) が `amenity=place_of_worship`(:257) **より先**にあるため、
両方のタグを持つ神社が monument と判定されること(`detectCategory` は `geo.js:552` 付近)。
- 修正: 名前に `神社 / 神宮 / 大社 / 寺 / 院 / 八幡宮 / 天満宮` を含む候補は
  `place_of_worship` を優先する。実装場所は `geo.js` の `detectCategory`(タグと
  合わせて name も見られるようにする)が素直。**実物を読んで正しい場所を選ぶこと**。
  `engine.js:167` の `WIKI_CATEGORY_HINTS` は wiki 単独候補用なので既に神社を扱えている。
- 影響確認: kusatsu/hakone で光泉寺・石垣山等のカテゴリ表示が壊れていないこと。

## 完了条件(検証可能)
- [ ] `node scripts/dump-rank.mjs dogo` の **cards + more** に、学校・特別支援学校・
      幼稚園・保育園・病院・役所・気象台・青少年センター等が **0件**。
- [ ] `node scripts/dump-rank.mjs kusatsu` / `hakone` を before/after で比較し、
      **落ちた候補の一覧を目視**して、観光対象が1件も落ちていないことを確認。
      (差分が出た場合は全件を NIGHTLOG に列挙する)
- [ ] dogo の **1位カードのカテゴリ表示が「神社・寺院」**(現状「記念碑」)。
- [ ] `node scripts/check-engine.mjs` 全 pass(除外の新ケース+保護リストのケースを追加。
      最低でも「〇〇小学校が落ちる」「〇〇記念館が残る」「OSM 由来の学校が落ちる」の3件)。
- [ ] `node --check assets/engine.js` / `assets/geo.js` 通過。
- [ ] `node scripts/check-geo.mjs` / `check-more.mjs` / `check-a11y.mjs` / `docs/check.mjs` が緑。

## 検証手順
1. `node scripts/dump-rank.mjs dogo|kusatsu|hakone` を**変更前に**取って保存(before)。
2. 実装 → 同じ3本を取り直し(after) → 差分を目視。
3. 撮影: `?fixture=dogo` mobile、`?fixture=kusatsu` mobile の2枚。
   `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile`
4. 画像を Read で開き、カード30枚・番号ピン1〜30判読可・文字崩れ無し・
   dogo 1位のカテゴリ行が「神社・寺院」であることを目視。
5. NIGHTLOG に3行+落ちた候補一覧 → ROADMAP を `[x] 2026-09-16` に → コミット → push。

## 変更禁止範囲
- `rank()` の重み(`WEIGHT`)・閾値・`CATEGORY_PENALTY`・`CATEGORY_FREE_SLOTS`・
  `SEASON_HINTS`・far 判定の分数 — **一切触らない**。
- `assets/geo.js` は**カテゴリ判定順の小修正のみ**。Overpass クエリ・半径・
  `fetchWikiNearby` の同心円ロジックは触らない。
- `fixtures/*.json` の再生成・編集は禁止(外部API を叩かない)。
- git stash / reset --hard / checkout でのファイル巻き戻しは禁止。
