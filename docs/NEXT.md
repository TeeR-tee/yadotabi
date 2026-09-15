# NEXT: R20 Wikipedia geosearch の50件上限を同心円分割で回避

**判断理由**: R17/S1 で「箱根の geosearch 50件は最遠 3.7km で頭打ち、そのため大涌谷(7.6km)・彫刻の森(5.2km)の記事が取れない」ことが実測済みで、これが取りこぼしの唯一残った根本原因だから(R19/R14/R15/R16 は見た目・軽量化の改善で、データ欠損ほどの実害はない)。

- 難易度: **opus**
- 所要目安: 60〜90分
- 選ばなかったもの: R2-1(朝の相談待ち)、R19(far 分布の是正。R20 で候補母集団が変わると再調整が要るので R20 の後にやるのが正しい順序)

---

## 背景(事実)

- `assets/engine.js:22` `var WIKI_RADIUS_M = 10000;` を `engine.js:535` で `geo.fetchWikiNearby(h.lat, h.lon, WIKI_RADIUS_M)` に渡している。
- `assets/geo.js:861` `fetchWikiNearby(lat, lon, radiusM)` は **1組の中心・半径で geosearch を1回だけ**発行し、`continue` を最大3回追う(`geo.js:896` の `for (var i = 0; i <= WIKI_NEARBY_MAX_CONTINUE; i++)`)。
- ただし `continue` が埋めるのは **extracts(要約)だけ**。`ggslimit: '50'`(`geo.js:881`)が効いて **ページ集合そのものは50件で固定**される。だから半径10kmを指定しても、記事が密な箱根では近い順に50件で打ち切られ 3.7km で頭打ちになる。
- `WIKI_NEARBY_MAX_RADIUS_M = 10000`(`geo.js:58`)、`WIKI_NEARBY_MAX_CONTINUE = 3`(`geo.js:57`)。

## 対象ファイル(絶対パス)

- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js`
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-geo.mjs`
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(`[x] 2026-09-16` に)、`docs\NIGHTLOG.md`(3行)

## 実装方針

`geo.js` の `fetchWikiNearby`(861行〜)を、同心円の複数中心で geosearch し pageid で重複排除する形に組み替える。

1. **定数を追加**(`geo.js:57` の隣、既存定数は変えない)
   - `WIKI_NEARBY_RING_RADII_M = [3000, 6000, 10000]` — 同心円の半径3段。
   - `WIKI_NEARBY_MAX_CALLS = 4` — 1回の `fetchWikiNearby` が発行する外部リクエストの総上限(無料APIマナー。continue 分もこの数に含めて数える)。
2. **`baseParams()`(875行)を `baseParams(r)` に**し、`ggsradius: String(r)` を引数から取る。他のキー(`ggscoord`/`ggslimit:'50'`/`prop`/`exintro` など)は**一切変更しない**(exlimit/extracts の挙動に依存しているため)。
3. **収集ループの再構成**(893〜916行を置き換え)
   - `pages`(pageid → ページ情報のマージ先)は**今のまま1つに保つ**。これがそのまま重複排除になる(同じ pageid は上書きマージされるだけ)。
   - 外側ループ: `WIKI_NEARBY_RING_RADII_M` のうち **`radius` 以下のもの + `radius` 自身**を昇順・重複なしで回す(呼び出し側が `radiusM=5000` を渡す既定経路も壊さない)。
   - 内側ループ: 従来どおり `continue` を追う。ただし `callWikipediaApi` を呼ぶ直前に呼び出し回数カウンタを見て、`WIKI_NEARBY_MAX_CALLS` に達していたら**その時点で全ループを打ち切る**(例外にしない。取れた分を返す)。
   - 1つの半径で例外が出たら**その半径だけ諦めて次へ**進み、**全部の半径が失敗したときだけ** throw する(現状の「1回失敗=全体失敗」より堅い。engine 側の `Promise.allSettled` 経路は変わらない)。
4. **fixture 分岐を絶対に壊さない**(903行・914行)
   - `fixtureData` が真のときは **半径ループも continue ループも1周で終え、`fixtureData.wiki` を1回流すだけ**にする(現状と完全に同じ挙動。外部fetch 0回)。実装は半径ループに入る前で `if (fixtureData)` に分岐させ、従来の1回処理をそのまま通すのが安全。
   - `cacheGet`/`cacheSet`(870・941行)の `!fixtureData` ガードもそのまま維持。キャッシュキー(868行)は**変更しない**(同じ中心・同じ radius なら結果の意味は「より網羅的になった」だけで、既存キャッシュが混ざっても壊れない)。TTL も従来どおり。
5. `articles` の組み立て・距離ソート(918〜942行)は**一切変更しない**。
6. `scripts/check-geo.mjs` を新規作成。`scripts/check-engine.mjs:28` の `loadEngine` と同じ **vm サンドボックス方式**で `assets/geo.js` を読み込み、サンドボックスに `fetch` のモック(および `localStorage` 無し = `window.YadoCache` がメモリ動作するか、cacheGet が黙って null を返す状態)を差す。`ok()`/`eq()` のヘルパは check-engine.mjs と同じ書き方を踏襲する。

## 完了条件(検証可能)

1. `node scripts/check-geo.mjs` が全 PASS・exit 0。最低限この5ケース:
   - **50件で頭打ちのケース**: モックが「どの半径でも50件返す」が、3km は pageid 1..50、6km は 26..75、10km は 51..100 を返すよう作る。→ `fetchWikiNearby(lat, lon, 10000)` の結果が **重複排除後 100件**(50件ではない)であること、外部呼び出しが **3回**(各半径1回・continue 無し)であること。
   - **上限の遵守**: 各半径が `continue` を返し続けるモックで、外部呼び出しが `WIKI_NEARBY_MAX_CALLS`(=4)を**超えない**こと。
   - **重複排除**: 全半径が同じ pageid 50件を返すモックで、結果が 50件・`id` が一意であること。
   - **一部失敗の許容**: 6km だけ 500 を返すモックで、3km と 10km の分が返り throw しないこと。全半径が失敗したときは throw すること。
   - **fixture モード不変**: `setFixture({wiki: <保存済み形の1レスポンス>})` した状態で `fetchWikiNearby` を呼び、**外部 fetch が0回**、結果が従来と同じ件数・同じ先頭要素であること。
2. `node scripts/check-engine.mjs` が **103件全 pass**(件数維持。engine.js は無変更なので減らないこと)。
3. `node scripts/check-r5.mjs` 15件 pass、`node scripts/check-passive.mjs` 全 OK、`node scripts/check-a11y.mjs` 全 OK、`node docs/check.mjs` 全 OK。
4. `node --check assets/geo.js` 通過。
5. `node scripts/dump-rank.mjs kusatsu` と `... hakone` が**従来と同じ出力**(fixture は再生成しないので本番のみ効く変更＝ここは差分ゼロが正解。差分が出たら fixture 分岐を壊している)。

## 検証手順(撮影)

- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile`
- 2枚を Read で目視し、カード30枚・番号ピン1〜30判読可・リンクチップの折り返し崩れなし・コンソールエラー0件を確認(fixture 経路なので**見た目は完全に不変であるべき**)。
- 本物APIでの確認は **1回まで**(素の状態Aで宿を1件選ぶ程度)。Overpass が混雑したら待たずに諦めてよい。実API確認で「箱根の彫刻の森・大涌谷が Wikipedia 側に入るか」を見られたら NIGHTLOG に書く(取れなくてもカテゴリ減点が別要因なので R20 の失敗ではない)。

## 変更禁止範囲

- `assets/engine.js` の `rank()` / `baseScore()` / 重み・閾値・カテゴリ多様性 — 触らない。
- `fixtures/kusatsu.json` / `fixtures/hakone.json` — **再生成しない**(Overpass を叩かない)。
- `geo.js` の `fetchSpots` / `fetchHotelsInBbox` / `enrichFame` / `geocodeHotel` / `suggestHotels` / キャッシュ機構 — 触らない。
- `assets/app.js` / `assets/style.css` — 触らない。
- git stash / reset --hard / checkout でファイルを戻す操作は禁止。

## 終わったら

実装が終わったら**まず先にコミット**し、ROADMAP の R20 を `[x] 2026-09-16` に、NIGHTLOG に3行(やったこと/見た目の確認結果/次)を追記して push。報告は簡潔に(長文の報告書を書かない)。
