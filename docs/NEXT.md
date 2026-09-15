# NEXT: R31 小地図の OSM attribution を復活させ、ピンと重ならない位置に置く

## なぜこのタスクか(判断理由1行)
計画役が実物を読んだ結果、状態Bの小地図は `attributionControl: false` で**帰属表示が存在しない**ことが判明し、「位置確認」ではなく **OSM タイル利用規約違反の是正**という実害のあるタスクに格上げされたため(R28残作業より優先)。

## 事前調査で判明している事実(作業役はここから始めてよい)
- `assets/app.js:900` `ensureFeedMap()` の Leaflet 初期化オプションが
  `{ zoomControl: false, attributionControl: false, scrollWheelZoom: false }`。
  → **`attributionControl: false` のせいで `.leaflet-control-attribution` が DOM に生成されていない。**
- `assets/app.js:908` `L.tileLayer(TILE_URL, { maxZoom: 19 })` に **`attribution` が渡されていない**(状態A の `ensureMap()` は `app.js:350` で `attribution: TILE_ATTR` を渡しており正しい)。
- `TILE_ATTR` は `assets/app.js:59` に定義済み: `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'`。
- 最新スクリーンショット2枚を目視:
  - `screenshots/2026-09-15T22-52-21_..._fixture_kusatsu_mobile.png`(状態B 180px 小地図) → **帰属表示なし**。番号ピン 1〜30 は判読可、崩れなし。
  - `screenshots/2026-09-15T22-52-14_..._demo_recent_mobile.png`(状態A 全画面地図) → 右下に「Leaflet | © OpenStreetMap」が正しく出ている。
- 小地図の高さは `assets/style.css:273` `.feedmap { height: 180px; }`。
- ピンのずらし処理 `nudgeOverlaps()` は `assets/app.js:928` の `MARGIN = 20` で**地図コンテナの縁から20px内側にクランプ**している。帰属表示は高さ約14〜16pxなので、右下に置くと最下段のピンと接触しうる。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(`ensureFeedMap()` 900行付近のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(小地図用の `.leaflet-control-attribution` 節を追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-attrib.mjs`(**新規**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(検査リストに1行追加。12本→13本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針
1. **`app.js:904`** `attributionControl: false` を削除(または `true`)し、**`app.js:908`** の tileLayer に `attribution: TILE_ATTR` を渡す。状態A(`app.js:350`)と同じ書き方に揃える。
2. 重なり回避は**まず CSS だけ**で試す。`style.css` の `.feedmap` 節の直後に、小地図配下に限定したセレクタを追加する:
   - `.feedmap .leaflet-control-attribution { font-size: 10px; padding: 1px 4px; background: rgba(255,255,255,0.85); }`
   - ピンとの接触を確実に避けるため、**`nudgeOverlaps` の `MARGIN`(app.js:928)は触らずに**、帰属表示側を右下の最小面積に収める方向で調整する。
   - それでも `check-attrib.mjs` が重なりを検出する場合のみ、`ensureFeedMap()` の初期化後に
     `feedMap.attributionControl.setPosition('topright')` を1行足す(Leaflet 標準API。ライブラリ追加なし)。
   - `MARGIN` を広げる案は、番号ピンの分離(R8)を壊す恐れがあるため**最後の手段**。採る場合は 3 fixture 全部でピン1〜30の判読可を撮り直すこと。
3. **埋め込みモード**でも読めることを確認する(`body.is-embed` 配下で帰属表示を隠す CSS を**書かない**。既存 CSS が隠していないかも grep で確認する)。
4. **新規 `scripts/check-attrib.mjs`**: 既存 `scripts/check-pinflash.mjs` / `check-more.mjs` の作り(Playwright + ローカル3000番サーバを自前で立てて finally で落とす)をそのまま踏襲する。検査内容:
   - `?fixture=kusatsu` / `hakone` / `dogo` / `?fixture=kusatsu&embed=1` の4URLについて
   - (a) `#feed-map .leaflet-control-attribution` が**存在する**
   - (b) そのテキストに `OpenStreetMap` を含む
   - (c) `getComputedStyle` で `display!=='none'`、`visibility!=='hidden'`、`opacity>0.5`(=非表示化されていない)
   - (d) その `getBoundingClientRect()` が、`#feed-map` 内の**全 `.pin`** の rect と**1つも交差しない**
   - (e) コンソールエラー0件
5. `scripts/check-all.mjs` の実行リストに `check-attrib.mjs` を追加する。

## 完了条件(検証可能)
- [ ] `node scripts/check-attrib.mjs` が 4URL 全てで PASS(exit 0)
- [ ] `node scripts/check-all.mjs` が **13本全PASS**(exit 0)
- [ ] 3 fixture + embed の4枚を撮影し Read で目視、帰属表示が読めて番号ピン1〜30も判読可・カード30枚・崩れなし
- [ ] `git diff --stat -- assets/engine.js assets/geo.js fixtures` が**空**

## 検証手順
```
node --check assets/app.js
node scripts/check-attrib.mjs
node scripts/check-all.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1" --mobile
```
撮影は全て fixture なので**外部API 0回**。撮った4枚は必ず Read で開いて目視すること。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は一切触らない(rank の重み・閾値も同様)
- **帰属表示の非表示化は禁止**(`display:none` / `visibility:hidden` / `opacity:0` / `font-size:0` / 幅0 / DOM削除、いずれも不可)。OSM タイル利用規約の必須要件。
- 状態A の地図(`ensureMap()` `app.js:344`)は無変更
- `nudgeOverlaps()` のロジック本体(MARGIN 以外)は無変更

## 難易度 / 所要目安
- **sonnet**(builder-sonnet)
- 30〜45分(実装10分・新規テスト15分・撮影と目視10分・記録とコミット10分)
