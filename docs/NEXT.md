# NEXT — 次の1タスク(作業役はこれだけをやる)

## タスクID: R1 固定データモード `?fixture=kusatsu`

## 目的
撮影・検証のたびに Overpass / Wikipedia を叩かなくて済むようにする。
草津の実データを1度だけ取って `fixtures/kusatsu.json` に保存し、`?fixture=kusatsu` が付いていたら geo.js が API を呼ばずにそれを返す。以降のサイクルの撮影は全て固定モードで行う(AUTOPILOT 絶対ルール4の要)。

## 対象ファイル(絶対パス)
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js`
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs`
- 新規(生成物・コミットする): `C:\workspace\claude\旅行先用サイト\yadotabi\fixtures\kusatsu.json`
- 更新: `docs\ROADMAP.md`(R1 を `[x] 2026-09-16` に)、`docs\NIGHTLOG.md`(3行)

## 実装方針(実物を読んだ上での具体指示)

### 1) `scripts/make-fixture.mjs`(本物APIから1回だけ生成)
Node 18+ の素の `fetch` のみ。npm install 禁止。引数なしで走り、草津(lat=36.6226, lon=138.5960)について次の3つを取って1つの JSON に書く。

- `spots`: `https://overpass-api.de/api/interpreter` に POST。クエリは **geo.js の `buildOverpassQuery(lat, lon, radiusM)`(assets/geo.js 490行付近)と同じ文字列**を使うこと。手で書き直さず、`make-fixture.mjs` 内に同じクエリ文字列をコピーし、コメントに「geo.js の buildOverpassQuery と同期させること」と明記する。半径は engine.js の `OSM_RADIUS_M` と揃える(engine.js 先頭の定数を確認して同じ値を使う)。
- `wikiNearby`: `https://ja.wikipedia.org/w/api.php` の geosearch。geo.js の `fetchWikiNearby`(821行付近)の `baseParams()` と同じパラメータ(generator=geosearch / prop=coordinates|pageimages|extracts / exintro / explaintext / exsentences=2 / exlimit=max / pithumbsize=480 / origin=* など)。continue も geo.js と同じく最大3回追う。半径は engine.js の `WIKI_RADIUS_M`。
- 保存形式は **geo.js の各関数が返す“加工後の形”ではなく、加工後の形にする**。理由: 差し込み口を各 fetch 関数の先頭(戻り値の位置)にするため。具体的には、make-fixture.mjs は生レスポンスを取ったあと、geo.js と同じ整形をせずに済むよう **ブラウザを使わずに済む簡易ルート**を取る。つまり `make-fixture.mjs` は生JSONだけ保存し、geo.js 側の fixture 分岐は「生JSONを渡して既存の整形コードを通す」形にする(下記2を参照)。JSON の形:

```json
{
  "meta": { "area": "kusatsu", "lat": 36.6226, "lon": 138.5960,
            "osmRadiusM": 5000, "wikiRadiusM": 5000, "generatedAt": "2026-09-16T..." },
  "overpass": { "elements": [ ... ] },
  "wiki": { "query": { "pages": { ... } } }
}
```
`wiki` は continue を追って `query.pages` をマージ済みの1オブジェクトにする。

実行方法をファイル冒頭のコメントに1行で書く: `node scripts/make-fixture.mjs`(草津固定)。

### 2) `assets/geo.js` — fixture 分岐
IIFE の先頭付近(定数群のすぐ後)に fixture 保持用の変数とローダを足す:

```
var fixtureData = null;              // 読み込み済みの fixture(生レスポンス形)
function setFixture(data) { fixtureData = data; }
```
そして **`fetchSpots` と `fetchWikiNearby` の中の「fetch を呼ぶ直前」**に、fetch をスキップして `fixtureData` の生レスポンスを `data` に代入する分岐を入れる。ポイントは **整形・キャッシュ・エラー処理の既存コードをそのまま通す**こと(重複実装しない)。

- `fetchSpots`(595行付近): `var res = await fetchWithTimeout(OVERPASS_URL, ...)` の直前で
  `if (fixtureData && fixtureData.overpass) { data = fixtureData.overpass; }` となるように、`data` の宣言を前に出して `if (!data) { ...既存の fetch と res.ok 判定と res.json()... }` で包む。以降の `var elements = (data && data.elements) || []` からは一切変えない。**キャッシュ読み(`cacheGet`)は fixture 時はスキップ**する(localStorage の本物データと混ざらないよう、fixture 時は `cacheSet` もしない)。
- `fetchWikiNearby`(821行付近): 同様に、continue ループごと飛ばして `fixtureData.wiki` をそのまま整形部に流す。continue を追う処理は fixture 時は1回で終わらせる。
- `geocodeHotel` / `suggestHotels` / `fetchHotelsInBbox` は **今回は触らない**(固定モードの入口は `?hotel=` 直行を想定するため)。ただし `fetchHotelsInBbox` は fixture 時に呼ばれると Overpass を叩いてしまうので、**fixture 時は空配列を即返す** 1行ガードだけ入れる。

公開APIに追加: `global.YadoGeo.setFixture = setFixture;` と `global.YadoGeo.isFixture = function () { return !!fixtureData; };`

### 3) `assets/app.js` — 検出とロード
`applyEntryPoint()`(655行付近)の**冒頭**で `params.get('fixture')` を見る。値があれば:

1. `fetch('fixtures/' + name + '.json')` を**相対パス**で読む(GitHub Pages のサブパス `/yadotabi/` で動かすため絶対パス `/fixtures/...` は禁止)。名前は `/^[a-z0-9_-]+$/` でバリデートし、外れたら無視して通常動作に戻す。
2. 取れたら `YadoGeo.setFixture(json)` を呼び、続けて `selectHotel({ id:'fixture/'+name, name:'草津温泉(固定データ)', lat: json.meta.lat, lon: json.meta.lon })` で状態Bへ直行する。
3. `?hotel=` が同時にある場合は `?hotel=` の座標を優先する(fixture はデータ源だけ差し替える扱い)。
4. fetch に失敗したら黙って通常動作(既存の `?hotel=` / `?q=` / `loadHotelsInView()` の分岐)へフォールバックする。画面は絶対に空白にしない。
5. `applyEntryPoint` は現状同期関数なので、fixture 分岐だけ非同期になる。`return` で早期脱出して、`.then` の中で `selectHotel` を呼ぶ形にすること(既存の同期分岐は構造を変えない)。

`enrichFame`(Wikidata/pageviews)は fixture に含めない。fixture 時は外部を叩かないよう、**engine.js ではなく geo.js の `enrichFame` の先頭で `if (fixtureData) return spots;`** と1行で止める(engine.js は今回触らない)。

## 完了条件(検証可能)
1. `node --check assets/geo.js` と `node --check assets/app.js` が通る。
2. `node scripts/make-fixture.mjs` が成功し、`fixtures/kusatsu.json` が生成され、`overpass.elements` が50件以上・`wiki.query.pages` が10件以上ある(件数を NIGHTLOG に書く)。
3. ローカルサーバで `http://127.0.0.1:3000/?fixture=kusatsu` を開くと、**ネットワークタブに overpass-api.de / ja.wikipedia.org /w/api.php / wikidata.org / wikimedia.org へのリクエストが1本も出ない**(Wikipedia の画像URL `upload.wikimedia.org` は fixture 内の thumbnail なので出てよい)。確認は `read_console_messages` ではなく、撮影前に localStorage を空にした状態で開いて、カードが出ることをもって代える。
4. カードが10枚以上描画され、状態Bのフィードが本物API時の見た目と同じ。
5. `?fixture=kusatsu` を外した通常起動(`/` と `/?hotel=36.6226,138.5960,テスト旅館`)が従来どおり動く(デグレしていない)。

## 検証手順(撮影は固定モードで)
`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅(オプション無し)で撮る。撮る URL は3本:
1. `http://127.0.0.1:3000/?fixture=kusatsu` — mobile
2. `http://127.0.0.1:3000/?fixture=kusatsu` — desktop
3. `http://127.0.0.1:3000/` — mobile(通常モードのデグレ確認。**この1本だけ本物APIを叩く**。ルール4の「1サイクル最大2回」内に収める)

撮った画像を必ず `Read` で開いて目視する。観点:
- カードのタイトル・カテゴリ行・要約2行が崩れず、リンクチップ(Googleマップ/公式/Instagram/TikTok/YouTube)が折り返しても重ならないか。
- 上部の `feed-map` のピン番号が地図の上端で切れていないか(前回の desktop 撮影で番号ピンが上端に接していた。切れていたら feedmap の `padding` か `fitBounds` の padding を足して直す)。
- mobile の `mapnote`(混雑トーストなど)が**右端で文字が切れていないか**。前回 `?select` の mobile 撮影で「1分ほど待ってからもう…」と欠けていた。fixture 時には出ないはずだが、通常モードの撮影で再現したらこのサイクル内で `white-space` / `overflow` を直してよい(`assets/style.css` の `.mapnote`)。
- 画像なしカードの空白が不自然に大きくないか。

## 変更禁止範囲
- `assets/engine.js` は触らない(ランキング・提示ロジックは今回対象外)。
- `assets/style.css` は上記 `.mapnote` の文字切れ修正を除いて触らない。
- `index.html` の DOM 構造は変えない。
- ユーザー入力(泊数・移動手段・○△×)の復活は禁止。
- `git stash` / `reset --hard` / `checkout -- ` でファイルを戻す操作は禁止。
- `fixtures/` を `.gitignore` に入れないこと(コミットして本番でも固定モードが動くようにする)。

## 難易度 / 所要目安
- **opus**(既存の非同期フローへの差し込みで、壊すと全機能が死ぬため)
- 所要目安: 25〜40分(fixture 生成の API 待ちを含む)

## 終わったら
`docs/ROADMAP.md` の R1 を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)追記 → コミット → `git push`。報告は簡潔に。
