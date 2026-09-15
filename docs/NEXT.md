# NEXT: R44 `?q=` ジャンプ後に宿0件なら1回だけ自動ズームアウト

**選定理由**: R43(ツールチップ)は見た目の追加だが、R44 は「エリア名で飛んだのに何も出ない」という入口の行き止まりを塞ぐ機能改善で、入力ゼロ原則(ユーザーにピンチアウトさせない)に最も合致するため。難易度 sonnet / 所要目安 25〜40分。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(本体)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-autozoom.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(新規1本をリストに追加 → 14本→15本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実物の確認結果(計画役が読んだ現状・行番号は 2026-09-16 時点)
- `app.js:20` `DEFAULT_VIEW = { lat:36.6226, lon:138.5960, zoom:14 }` / `app.js:47` `MIN_HOTEL_ZOOM = 13`
  → **ジャンプ直後は必ず zoom 14。1段引くと 13 で下限ちょうど。つまり自動ズームは常に1回だけ可能で、2段目は下限違反になる**(仕様と噛み合っている)。
- `app.js:375 loadHotelsInView()` … `map.getZoom() < MIN_HOTEL_ZOOM` で早期 return、成功時 `app.js:402` で `setMapNote(hotels.length ? '' : 'この範囲には宿が見つかりませんでした')`。**0件はここが唯一の合流点**。
- `app.js:433 flyTo(lat, lon, zoom)` … `setView` → `saveMapView()` → `loadHotelsInView()`。呼び元は3か所だけ:
  - `app.js:1296` `?q=` 入口(`applyNormalEntryPoint`)
  - `app.js:1382` 検索候補の `act === 'jump'`(地名を選んだとき)
  - `app.js:1394` エリアチップのタップ
  いずれも「エリアへ飛んだ」ケースなので **3か所すべてを対象にしてよい**。通常のドラッグは `onMapMoved`(`app.js:369`)経由で `flyTo` を通らないため、自動的に発動しない。
- **重要(撮影方法の訂正)**: `?demo=nohotels` は `app.js:1170` で `demoStateA = true` も立て、`loadHotelsInView` は `app.js:378` の分岐で **fetch する前に return** する。よって **既存の `?demo=nohotels` だけでは再取得ロジックを通せない**。下記「実装方針」の (3) を採ること。

## 実装方針(app.js)
1. **フラグを1つ追加**(無限ループ防止の要)。`demoNoHotels` 等の宣言が並ぶ `app.js:132-137` 付近ではなく、地図関連の近くに:
   `var autoZoomArmed = false;`(「次の0件で1回だけ引いてよい」券)+ `var autoZoomUsed = false;` は不要 —— **券は使ったら必ず false に戻す方式**にする(これで多重発火が構造的に起きない)。
2. `flyTo()`(`app.js:433`)の `loadHotelsInView()` を呼ぶ**直前**で `autoZoomArmed = true;` を立てる。`flyTo` 以外の経路(ドラッグ・`onMapMoved`)では絶対に立てない。
3. `loadHotelsInView()` の成功ハンドラ(`app.js:398-403`)の 0件分岐を次の形にする:
   ```
   if (hotels.length) { autoZoomArmed = false; setMapNote(''); return; }
   if (autoZoomArmed && map.getZoom() - 1 >= MIN_HOTEL_ZOOM) {
     autoZoomArmed = false;            // ★先に落とす(再入しても2回目は発動しない)
     map.setZoom(map.getZoom() - 1, { animate: false });
     saveMapView();
     setMapNote('もう少し広い範囲で探しています…');
     loadHotelsInView();               // Overpass 追加1回・キャッシュがあれば0回
     return;
   }
   autoZoomArmed = false;
   setMapNote('この範囲には宿が見つかりませんでした');
   ```
   - ズーム下限13を割らない条件は `map.getZoom() - 1 >= MIN_HOTEL_ZOOM`。
   - `setZoom` は `animate:false`(`app.js:1277` の `demo=zoomout` と同じ作法)。moveend の debounce と競合しないよう、その場で `loadHotelsInView()` を直接呼ぶ(`flyTo` と同じ考え方)。
4. **混雑時は再取得しない**: `catch` 分岐(`app.js:404-416`)では自動ズームを一切行わず、`autoZoomArmed = false;` にして現行のバナー文言のままにする(`err.overpassBusy` / `err.tooWide` とも同じ)。AUTOPILOT 規約4(無料APIのマナー)の要請。
5. **撮影用フラグを新設**: `?demo=autozoom` を `app.js:1170` 付近の demo 判定に追加する。これは `demoStateA` を**立てず**、代わりに「fetchHotelsInBbox の1回目だけ空配列を返す」差し替えを行う(2回目以降は fixture/通常経路)。外部APIを叩かずに「0件→自動で1段引く→2回目で宿が出る」の全経路を再現できる。既存 `?demo=nohotels`(常に0件)は触らない。

## 完了条件(検証可能)
- `node scripts/check-autozoom.mjs`(新規・Playwright、`scripts/check-nohotels.mjs` の作りを踏襲)が全 PASS:
  1. `?demo=autozoom` で、初期 zoom 14 → 最終 zoom が **13** になる(1段だけ引けている)
  2. 2回目の取得で宿ピンが1個以上描かれ、`.mapnote` が空(hidden)になる
  3. `?demo=nohotels`(常に0件)では zoom が **13 で止まり 12 にならない**(下限を割らない・2回引かない)
  4. **地図ドラッグ起点の0件では自動ズームが起きない**(`autoZoomArmed` が立たない経路の確認。`map.panBy` 後に zoom 不変)
  5. `simulate=overpass504` 相当の混雑時に zoom が変わらず、文言が「宿ピンの取得が混雑中です。…」のままである
  6. コンソールエラー0件・外部ドメインへの fetch 0回
- `node scripts/check-all.mjs` が **15本全 PASS**(新規1本を追加登録すること)。
- `node --check assets/app.js` 通過。

## 検証手順(撮影+目視)
1. `node scripts/check-autozoom.mjs` → 全 PASS。
2. `node scripts/check-all.mjs` → 15本全 PASS・exit 0。
3. 撮影(すべて外部APIなし):
   - `?demo=autozoom` mobile … 自動ズーム後に宿ピンが出ている画面
   - `?demo=nohotels` mobile … 従来どおりバナーが出て止まっている画面(デグレなし)
   - `?fixture=kusatsu` mobile … 状態Bのデグレなし(カード30枚・番号ピン1〜30判読可)
4. 3枚を Read で目視し、文字崩れ・重なり・はみ出し・バナーと Leaflet 帰属表示の重なりが無いことを確認する。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**一切触らない**(rank の重み・閾値・除外ルール・Overpass クエリも同様)。
- `MIN_HOTEL_ZOOM`(13)と `DEFAULT_VIEW.zoom`(14)の値は変更しない。
- 既存 `check-*.mjs` の中身は編集しない(`check-all.mjs` のリストへの1行追加のみ可)。
- Overpass への実呼び出しは、本番動作確認をするとしても1サイクル1回まで(原則ゼロでよい)。
