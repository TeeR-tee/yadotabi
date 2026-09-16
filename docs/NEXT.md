# NEXT: R114 道後の上位30件に同じ城が2枚出ている(英語名の重複が潰れない)

- タスクID: **R114**
- 難易度: **opus**(除外・統合ロジックの改修。誤爆が出ると全エリアのカードが壊れるため慎重に)
- 所要目安: 40〜60分

## 目的

ユーザーが `?fixture=dogo` を開くと、上位30件のカードに **同じ松山城が2枚**並んでいる。
10位「松山城」(写真・要約あり)と27位「Matsuyama Castle」(写真なし)で、同じ城の
カードを2回スクロールすることになる。提案の枚数は30枚と決まっているので、
重複1枚ぶん **本来31位だった別のスポットが締め出されている**のも実害。

## 実測で判明した前提(すべて計画役がこのサイクルで確認済み)

### 1. 重複の実体(`fixtures/dogo.json` の生タグ)

```
node/611661255      historic=castle  name=松山城
                    contact:website=https://www.matsuyamajo.jp/
                    wikipedia=ja:松山城 (伊予国)   wikidata=Q981357
                    lat 33.845651  lon 132.7657463

node/12827570072    historic=castle  name=Matsuyama Castle
                    website=https://matsuyamajo.jp
                    (wikipedia タグ無し・wikidata タグ無し)
                    lat 33.844972  lon 132.7659941
```

2点間の距離は **79m**。主タグは `historic=castle` で完全一致。
公式サイトのホスト名は `www.` を剥がすと **どちらも `matsuyamajo.jp`**。

`node/6868555317`(`historic=memorial` / `name=松山城跡`)も同じ城を指すが、
主タグが違い公式サイトも無いので **今回の対象外**(more の5位に残ってよい)。

### 2. なぜ現状のロジックで潰れないか

`assets/engine.js:593 isSamePlace(a, b)` の判定経路は3つだけ:

- `engine.js:597-600` … 一方の `wikipediaTitle` が他方の `name` と正規化一致するか
- `engine.js:605` … 正規化名の完全一致
- `engine.js:606-613` … 150m 以内かつ **一方の名前が他方を含む**(差分が施設語でない)

日本語名「松山城」と英語名「Matsuyama Castle」は **文字が1つも共通しない**ため、
3番目の包含判定に絶対に落ちない。1番目も、英語側に `wikipedia` タグが無いので効かない。

`wikidataId` は `engine.js:517` で items に載っており `engine.js:639`・`:657` で
マージ時に引き継がれているのに、**`isSamePlace` は一度も読んでいない**。
ただし wikidata 経路を足しても今回は解決しない —— 英語側に `wikidata` タグが無いため。
念のため4エリア全件で「同じ wikidata を持つが名前が違う OSM 要素のペア」を数えたところ
**kusatsu 0 / hakone 0 / dogo 0 / beppu 0 件**で、wikidata 追加の差分はゼロと確定した。

### 3. 使ってよい判定条件は1通りしかない(誤爆の実測つき)

4エリア全 OSM 要素に対して総当たりでペアを作り、条件を段階的に絞って実測した:

| 条件 | kusatsu | hakone | dogo | beppu | 判定 |
|---|---|---|---|---|---|
| 公式サイトのホスト一致 + 150m以内 | 2 | 9 | 1 | 7 | **不可**(誤爆多数) |
| ↑ + 主タグ一致 | 1 | 2 | 1 | 4 | **不可**(8件中5件が誤爆) |
| ↑ + 片方が純ASCII名・片方が日本語名 | **0** | **0** | **1** | **0** | **採用**(適合1・誤爆0) |

中段で出た誤爆の実例(**これらを併合してはいけない**):

- hakone 「宮永岳彦記念美術館」↔「弘法の里湯」(42m・同じ `city.hadano.kanagawa.jp`)
- hakone 「箱根関所資料館」↔「箱根関所」(145m・資料館と関所は別の見どころ)
- beppu 「あそびーち」↔「パフォーマンスエリア・イルカプール」↔「セイウチ水槽」
  ↔「大分マリーンパレス水族館「うみたまご」」(うみたまごの館内施設が全部1件に潰れる)
- beppu 「湯都ピア浜脇」↔「浜脇温泉」(21m・同じ `city.beppu.oita.jp` だが別の浴場)
- kusatsu 「地蔵の湯まえ足湯」↔「湯けむり亭」(140m・同じ `kusatsu-onsen.ne.jp`)

最下段の条件で4エリアを通したときに一致したのは **松山城ペアの1件だけ**。
**「片方が純ASCII名・片方が日本語名」という条件を絶対に外さないこと。**

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(`isSamePlace` 周辺のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(ケース追加)

## 実装方針

1. `engine.js` に小さなヘルパを2つ足す(`isSamePlace` の直前あたり)。
   - `websiteHost(url)` … `new URL()` で `hostname` を取り、先頭の `www.` を剥がして返す。
     不正なURLは `try/catch` で `null`(例外を投げないこと)。
   - `looksAscii(name)` … `/^[\x20-\x7E]+$/` で判定。
2. `isSamePlace` の**末尾**(既存の包含判定がすべて false を返した後)に、
   最後の救済経路として次を足す。**既存の3経路には一切手を入れない**。
   - 両方に `website`(または `contact:website` 由来の `website`)があり、
     `websiteHost` が一致し、
   - 主タグが一致し(items が主タグ文字列を持っていない場合は `category` の一致で代用してよい。
     どちらを使うかは実装時に items の中身を読んで決め、理由を NIGHTLOG に書くこと)、
   - `looksAscii(a.name) !== looksAscii(b.name)` で、
   - 距離が `DEDUPE_NEAR_M`(`engine.js:45` = 150)以内
   なら `true`。
3. 代表名は既存の `mergeOsmDuplicates`(`engine.js:630`)の「短い名前を残す」規則に
   そのまま乗る。「松山城」(3字)が「Matsuyama Castle」(16字)より短いので**日本語名が残る**
   —— これは日本語ユーザーにとって望ましい挙動なので、規則を変えない。
   写真・要約・公式サイト・wikipedia 紐づけは `engine.js:637-639` が両方から拾うので失われない。

## 完了条件

- `node scripts/dump-rank.mjs dogo` の上位30件から「Matsuyama Castle」が消え、
  「松山城」1枚だけになる。空いた1枠に **31位だった候補が繰り上がる**ことを確認する。
- `node scripts/dump-rank.mjs kusatsu|hakone|beppu` の上位30件が **before と完全に同一**
  (この3エリアは適合0件のはずなので、1件でも動いたら条件が緩すぎる。全件目視すること)。
- `scripts/check-engine.mjs` に、松山城ペアが併合されるケースと、
  上の「誤爆の実例」から**最低2件**(「宮永岳彦記念美術館↔弘法の里湯」と
  「あそびーち↔うみたまご」を推奨)が**併合されない**ケースを足す。

## 検証手順

```
node --check assets/engine.js
node scripts/dump-rank.mjs dogo      # before/after を保存して差分を全件目視
node scripts/dump-rank.mjs kusatsu
node scripts/dump-rank.mjs hakone
node scripts/dump-rank.mjs beppu
node scripts/check-engine.mjs
node scripts/check-all.mjs           # 29本すべて緑であることが必須
```

撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅):

- `http://127.0.0.1:3000/?fixture=dogo` を **mobile(375px)** と **desktop(1280px)**
  → 画像を Read で開き、松山城のカードが1枚だけであること・
    カード30枚・文字崩れ/重なり/はみ出しが無いことを目視する。
- `http://127.0.0.1:3000/?fixture=kusatsu` を **mobile** 1枚(デグレ確認)。

外部APIは **0回**(すべて fixture で完結する)。

## 変更禁止範囲

- `engine.js` の **rank の重み・閾値は変更不可**。
- `assets/geo.js` と `fixtures/*.json` は **変更不可**(再生成もしない)。
- Overpass クエリ・`buildOverpassQuery()` は触らない。
- `mergeOsmDuplicates` の「短い名前を残す」規則は変えない。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API呼び出し **0回**。

## 終わったら

1. `docs/ROADMAP.md` の R114 を `[x] 2026-09-16` に。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の**末尾**に3行追記
   (やったこと / 見た目の確認結果 / 次)。先頭に新しい節を作らないこと。
3. **先にコミット** → `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
