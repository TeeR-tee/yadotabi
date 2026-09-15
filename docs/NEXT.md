# NEXT: R17 候補収集の取りこぼし調査と修正

難易度: opus / 所要目安: 40〜60分

## なぜこれを選んだか(1行)
09ノートの観察は rank の偏りに見えるが、事前調査で大涌谷・彫刻の森は座標も半径条件も満たしており「rank で負けている」のではなく collect 段階で落ちているバグ寄りの問題なので、研究課題(R2-1等)より先に潰す価値がある。

## 前提(計画役が実測済み・ここから始めてよい)
`node -e` で fixtures を直接読んで確認した事実。**NIGHTLOG の「大涌谷は座標欠落」は誤りなので信じないこと。**

- `fixtures/hakone.json` の `overpass.elements`
  - 大涌谷 = `way/727045804`。`lat`/`lon` は `undefined` だが **`center: {lat:35.2467581, lon:139.0250167}` を持つ**。宿(35.2324,139.1069)から **7.6km**。tags に `natural=valley` `tourism=attraction` `wikipedia=ja:大涌谷` `wikidata=Q1134429`。
  - 彫刻の森美術館 = `node/5182750902`。`lat=35.2442838 lon=139.0520834` と**正常な座標を持つ**。**5.2km**。
  - どちらも `engine.js` の `OSM_RADIUS_M = 15000`(21行目)の内側。
  - `geo.js` の 703〜706 行は既に `el.center` フォールバックを実装済み。つまり **座標は落ちていない**。
- `fixtures/hakone.json` の `wiki.query.pages` は 50件。座標つき40件の距離は **最小6m〜最大3,720m**。`WIKI_RADIUS_M = 10000` を指定しているのに 50件上限で **3.7km で頭打ち**。大涌谷・彫刻の森の記事は 50件に入っていない。
- `fixtures/kusatsu.json` も Wikipedia 50件で、**「湯畑」の記事は含まれない**。湯畑の OSM 要素は `relation/12852884`(`leisure=hot_spring` `tourism=attraction` `name=湯畑`、`wikipedia`/`wikidata` タグ**なし**)。

→ 仮説は3本立て。(a)(b) は OSM 側のどこかの絞り込み、(c) は Wikipedia geosearch の 50件上限。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(記録)
- `C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md`(原因の追記、「6. 実験ログ」の 2026-09-16 節)

## 実装方針(必ず実物を読んでから)
### 手順1: どこで消えるかを特定する(コードを書く前)
scratchpad に使い捨ての Node スクリプトを置き、fixture を読んで `geo.js` / `engine.js` の各段の通過数を数える。以下の順に大涌谷・彫刻の森が生き残っているかを1段ずつ確認すること。

1. `geo.js` `buildOverpassQuery()`(510行) — **最有力候補**。`around` 句に続くタグフィルタの列挙に `natural=valley` や `tourism=museum` が入っているか。fixture は `make-fixture.mjs` が別のクエリで取った生データなので、**fixture には在るがアプリのクエリでは取らない**という食い違いがあり得る。ただし fixture モードでは Overpass を叩かないのでクエリは効かない → その場合は下の 2〜4 が原因。
2. `geo.js` `pickName(tags)`(603行) — `name` を拾えているか。
3. `geo.js` `detectCategory(tags)`(532行) — `natural=valley` が分類不能で除外されていないか。**分類できないものを捨てているなら、それが取りこぼしの本体**。
4. `geo.js` `fetchSpots()` の dedupeKey(708行) — `name + '@' + lat.toFixed(3) + ',' + lon.toFixed(3)`。同名の別要素が先に `seen` に入って後勝ちで消えていないか(湯畑・大涌谷は node と relation の両方があり得る)。
5. `engine.js` `buildOsmItems()`(400行)の `isFinite(spot.lat)` — ここまで来ていれば通るはず。
6. `engine.js` `isExcludedArticle()`(226行) / `isHotelItself()`(322行) / `isSamePlace()`+`mergeIntoOsm()`(343・357行)の dedupe — `normalizeName()`(141行)の正規化で別物が同一視されて片方消えていないか。

**先に `grep` で fixture の生JSONを確認すること**(上の「前提」は計画役が実施済みなので再確認は任意)。特定できた行番号と理由を NIGHTLOG に必ず書く。

### 手順2: 取りこぼしの解消だけを直す
許される修正は「本来拾えるはずのものを拾えるようにする」ものに限る。想定される修正:
- `detectCategory` に `natural=valley`(景勝)・`tourism=museum`(美術館博物館) など**取りこぼしているタグの追加**、および分類不能時に除外せず `other` に落とす方針への変更。
- `buildOverpassQuery` に不足タグを追加(実APIでも取れるようにする。fixture 再生成はしない)。
- dedupe の名前正規化の改善(`normalizeName`)。同名異所を潰さないよう座標も見る等。
- Wikipedia geosearch の 50件上限回避: `fetchWikiNearby()`(861行)で**半径を分割して複数回問い合わせる**(例: 0-3km / 3-6km / 6-10km)かリスト分割。**fixture モードでは外部APIを叩かないので、fixture に無い記事は取れない。その場合は「fixture の Wikipedia 50件に湯畑・大涌谷の記事が無い」ことを結論として 09 に追記し、コードは実APIで効く形に直すだけでよい。**

## 変更禁止範囲(厳守)
- `engine.js` の `rank()` / `baseScore()` / `seasonBonus()` の**重み・係数・閾値を一切変えない**。
- `fixtures/*.json` を**再生成しない・編集しない**(Overpass を叩かない)。
- `OSM_RADIUS_M` / `WIKI_RADIUS_M` の値変更は原則しない(必要と判断したら NIGHTLOG に理由を書いて相談に回す)。
- UI/CSS は触らない。

## 完了条件(検証可能)
1. `node scripts/dump-rank.mjs hakone` で **大涌谷と彫刻の森美術館が候補30件(または far)に現れる**。順位は問わない。現れない場合は「fixture に無い/クエリで取れない」原因を特定し 09 に書けば可とする。
2. `node scripts/dump-rank.mjs kusatsu` で **湯畑が上位10位以内かつ source=both**。
   - ただし kusatsu.json の Wikipedia 50件に湯畑の記事が無いことは実測済みなので、fixture モードでは source=both は原理的に達成できない可能性が高い。その場合は **(a)順位が26位より上がったこと (b)both にできない理由(geosearch 50件上限)** の2点を 09 と NIGHTLOG に書けば完了とみなす。無理に rank をいじって順位を上げてはいけない。
3. 既存テスト `check-engine.mjs`(scratchpad) が**全 pass**。
4. `node --check assets/geo.js` と `node --check assets/engine.js` が通る。

## 検証手順
1. 修正**前**に `node scripts/dump-rank.mjs kusatsu` と `... hakone` の出力を scratchpad に保存(before)。
2. 修正後に同じ2コマンドを実行(after)。**before/after の差分(順位が動いた件名と順位)を NIGHTLOG に表で残す。**
3. 撮影: `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` と `?fixture=hakone` の mobile 2枚。画像を Read で開き、カード枚数・番号ピンの判読性・リンクチップの折り返しにデグレが無いことを目視。
4. `node docs/check.mjs`(push 後)。
5. NIGHTLOG に3行 + 差分表、09 の「6. 実験ログ」に原因を追記。

## 完了したら
ROADMAP の R17 を `[x] 2026-09-16` に。**まずコミットしてから、報告は簡潔に(長文の報告書を書かない)。**
