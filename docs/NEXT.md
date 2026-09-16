# NEXT: R80 OSM候補のタグ・ホワイトリスト化を「調査で否定 → wiki単独候補の構造化判定」へ振り替え(最優先)

## 計画役の事前調査(作業役は必ず読むこと。仮説が1つ潰れています)

R79 の作業役は「本命は OSM タグでのホワイトリスト化」と 09_研究ノート(191〜193行)に書きました。
計画役が **fixture の生データで実測したところ、この案は既に実装済みで、やることが残っていません**。

確認した事実(作業役も再現すること):
1. `fixtures/*.json` は `overpass.elements` に **生タグを完全に保持**している(4エリアとも全要素に `tags` あり。beppu 667要素すべて)。fixture 再生成は不要 — この点は R79 の想定どおり。
2. しかし `assets/geo.js:527 buildOverpassQuery()` の6つの clause が **既にホワイトリストそのもの**です:
   `tourism~^(attraction|museum|viewpoint|zoo|aquarium|theme_park|gallery|picnic_site)$` /
   `historic~^(castle|monument|memorial|ruins)$` / `leisure~^(park|garden)$` /
   `amenity~^(place_of_worship|public_bath)$` / `natural~^(waterfall|spring|hot_spring|cave_entrance|peak)$` /
   `man_made=lighthouse`。
   `amenity=school|hospital|townhall`・`office=*`・`building=*` 単独の要素は **Overpass の応答にそもそも入ってきません**。
3. 実測: 4 fixture の全要素のうち `CATEGORY_RULES`(geo.js:242)にどれも当たらない「名前付き候補」は
   **kusatsu 0件 / hakone 0件 / dogo 0件 / beppu 0件**。`detectCategory` が `'other'` を返す OSM 候補は存在しません。
   → ホワイトリストを engine.js に書き足しても **落ちる候補は0件**で、差分が出ません。
4. R79 で落ちた13件を source 別に見ると、**全件が wiki 由来**(`別府市総合体育館`『ビーコンプラザ』等)。
   `dump-rank beppu` の現在の上位30件でも OSM 単独(source=osm)は6件で、すべて観光対象です
   (グローバルタワー・油屋熊八の像・ワンダーラクテンチ動物園 等)。

**結論: R79 の推奨どおりにやると空振りします。** 09_研究ノートの当該段落も事実誤認(「fixture はタグを保持していないので着手できない」→ 保持している。「OSM候補にホワイトリストを入れれば除外語が不要になる」→ Overpass が既にやっている)を含むので、R80 の一部として訂正してください。

## 振り替え後のタスク: wiki 単独候補を Wikidata の構造化データで判定する

語ベースの天井(R79 で指摘された本物の問題)は **wiki 単独候補にだけ残っています**。
`assets/engine.js:730` の `isExcludedArticle(article.title, article.extract)` が唯一の門で、名前と冒頭文の語しか見ていません。
一方 OSM 候補は `geo.js` の Overpass 段で構造化判定が済んでいます。つまり **非対称を埋めるべきは wiki 側**です。

ただし Wikidata API を新規に叩くのはコスト0円原則は満たすものの外部API呼び出しが増え、fixture にデータがないため検証できません。
**今回は API を増やさず、fixture 内にある情報だけでできる範囲に絞ります。**

### 実装方針(対象ファイルは絶対パス)

対象: `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` のみ。
**`assets/geo.js` は変更しない**(調査の結果、変更する理由が無くなったため)。

1. **`isExcludedArticle`(engine.js:427)に「OSM に同名・近接の観光タグ付き要素があるなら除外しない」救済を足す**のが本命。
   現状 wiki 記事は OSM とのマージ(engine.js:745 付近の `isSamePlace` / `mergeIntoOsm`)より **前**に落とされるため、
   「OSM に `tourism=attraction` として実在するのに、名前の語で wiki 側が落ちる」ケースを救えません。
   → `buildOsmItems` の結果(`osmItems`)が確定した後に wiki のフィルタを回す順序へ変更し、
     除外語に当たった記事でも `osmItems` の中に `isSamePlace` で一致するものがあれば **通す**(タグという構造化証拠を語より優先する)。
   `osmItems` は engine.js:695/720 で既に確定済みなので、wiki の forEach(engine.js:728〜738)の中から参照できます。段階描画(`sendOsmStage`)の順序は変えないこと。

2. 逆向きの強化として、**wiki 単独候補(OSM に対応要素が無いもの)についてだけ**、
   `EXTRACT_KEYWORD_NG`(engine.js:197)に R79 の残件で効く語を足すかを検討する。
   ただし **語を増やすのは最終手段**とし、増やすなら4エリアの before/after を全件目視して誤爆0を確認すること。増やさない判断でも可(その場合は理由を NIGHTLOG に書く)。

3. `docs/09_研究ノート`(実体は `C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md` の 191〜193行)の R79 段落に、
   上記の事実誤認の訂正を **追記**する(元の文は消さず、「2026-09-16 計画役の実測による訂正」として段落を足す)。

### 完了条件(検証可能)

- `node scripts/dump-rank.mjs <area>` を kusatsu / hakone / dogo / beppu の4エリアで before/after 実行し、
  **cards + more + far の差分を全件目視**。救済で戻ってきた候補が観光対象であること、新たに落ちた候補があれば誤爆0であること。
- 差分が0件だった場合も「0件だった」ことを NIGHTLOG に事実として書く(空振りを隠さない)。
- `scripts/check-engine.mjs` に「除外語に当たるが OSM に一致要素があるので通る」ケースを最低2件追加。
- `node scripts/check-all.mjs` 25本が全緑(約4分)。

### 検証手順(撮影)

`node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=<area>" --mobile` を
kusatsu / hakone / dogo / beppu の4エリアで撮り、**画像を Read で目視**。
カード30枚・番号ピン30個が判読でき、文字崩れ/重なり/はみ出し/コンソールエラーが無いこと。外部API 0回。

### 変更禁止範囲

- rank の重み・閾値(スコア計算には一切触らない)
- `fixtures/*.json` の再生成(生タグは既に保持されている。触る理由が無い)
- `assets/geo.js` の Overpass クエリ(`buildOverpassQuery`)。本番の取得件数と応答時間が変わるため今回は不可
- `NAME_PROTECT_SUFFIX` / `TITLE_SUFFIX_NG` / `TITLE_KEYWORD_NG` の削除(追加は上記2の条件下でのみ可)

### 難易度・所要目安

opus / 40〜60分(実装20分 + dump-rank 4エリア before/after 目視20分 + check-all 4分 + 撮影・記録)。

**もし 1 の救済でも4エリアで差分が0件だったら**、実装を revert せずコミットしたうえで
「語ベース除外の残件は fixture 4エリアの範囲では観測できない」ことを研究ノートに記録し、次サイクルへ渡すこと。
