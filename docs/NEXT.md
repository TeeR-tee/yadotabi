# NEXT — R8 混雑モードで番号ピンが完全に隠れる問題(R7の再発)を潰す

**選定理由(1行)**: r4-busy mobile を目視したところ、Wikipedia単独の混雑モードでは候補が温泉街中心に集中し番号1〜9が宿ピン(♨)や互いの裏に完全に隠れていた。R7で解決したはずの「フィード1番が地図のどこか分からない」の再発なので、R3(公開確認)やR2(通しQA)より先にここを直す。

- **タスクID**: R8
- **難易度**: opus(座標計算とレイアウトの調整、目視ループが要る)
- **所要目安**: 25〜40分(実装15分 + 撮影・目視・微調整)

## 目的
状態Bの小地図で、上位の番号ピン(少なくとも1〜5番)が **どんな密集度でも必ず判読できる** ようにする。混雑モード(`&simulate=overpass504`)は候補がWikipedia単独で温泉街に密集する最悪ケースなので、これを合格ラインとする。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (主)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (従・ピンの見た目のみ)

## 現状のコードと不具合の原因(実物を読んだ結果)

`app.js` L608-636 `nudgeOverlaps(markerPoints, fixedPoints)`:
```
L609  var MIN_DIST = 28;
L610  var NUDGE = 16;
L617-630  if (isTooClose(best)) { 8方向 x 3リング(16/32/48px)を探索 }
L631  if (best !== mp.point) { setLatLng }
L634  placed.push(best);
```
原因は3つ。優先度順に:

1. **【最重要】空き枠が見つからないと元の位置のまま置いてしまう**(L617-634)。3リング×8方向=24候補が全部埋まると `best` は `mp.point` のまま。しかもそれを `placed` に push するので、以降のピンから見て「そこは埋まっている」ことにもならず、密集地では複数ピンが同一座標に積み上がって完全に隠れる。→ **最後まで空きが無かった場合のフォールバック**(最も遠い候補を採る／リング数を増やす)が必要。
2. **探索半径が足りない**。最大48pxしか動かせない。混雑モードは20個以上が半径50px圏内に入るので原理的に足りない。
3. **宿ピンとの距離が近すぎる**。宿ピン(`iconSize: [30,30]`, L649)と番号ピン(`iconSize: [24,24]`, L661)の半径合計は27px。`MIN_DIST = 28` ではピンの縁が接するだけで、`.pin--top` の `transform: scale(1.12)`(style.css L178)を考えると実質重なる。

## 実装方針(この順で)

### 方針A: nudgeOverlaps を「必ず分離する」ように作り替える(L608-636)
1. `MIN_DIST` を **34** に引き上げる(24pxピン同士で10pxの隙間、宿ピン30pxとも縁が離れる)。宿ピンだけは別枠で `HOTEL_DIST = 36` を使い、`fixedPoints` との判定に使う定数を分ける(`isTooClose` を `placed` の要素に `minDist` を持たせる形にするのが素直: `placed.push({ p: best, d: 34 })`)。
2. リング数を **3 → 6**、`NUDGE` は 16 のまま(最大96pxまで退避できる)。方向は8方向のままでよいが、リングごとに `angle` を `(Math.PI/8) * ring` だけ回転させると格子状の詰まりが解けて成功率が上がる。
3. **フォールバック**: 全候補が埋まっていた場合、`best` を「`placed` 内の最近傍までの距離が最大になる候補」にする。探索ループ内で `dist = min(placed への距離)` を記録し続け、成功しなかったら最大 `dist` の候補を採用する。**元の位置のまま返してはいけない**。
4. 地図コンテナの外へ飛び出さないようクランプする。`feedMap.getSize()` で得た幅高から、layerPoint をピクセル境界(12px マージン)に収める。`feedMap.getPixelOrigin()` / `containerPointToLayerPoint` の変換に注意 — 簡単なのは `feedMap.latLngToContainerPoint` / `containerPointToLatLng` で **containerPoint 基準に統一する**こと。L680-683 の `latLngToLayerPoint` も合わせて `latLngToContainerPoint` に変えると境界判定が素直になる(L632 の `layerPointToLatLng` も `containerPointToLatLng` へ)。
5. 処理順は現状どおり「宿ピンを固定 → 番号の若い順」でよい(L681 の `spotMarkers` は既に順番どおり)。

### 方針B: 下位ピンを退かせて上位を目立たせる(style.css L168-179 と app.js L658-664)
- 6番以降(`i >= 5`)に `pin--sub` クラスを付け、CSS で `iconSize` 相当を小さく見せる(`transform: scale(0.72)`、`font-size` を `var(--fs-2xs)` 相当に、`opacity: .9`)。数字は消さない(消すと「何番か分からない」問題が別の形で出る)。
- `nudgeOverlaps` では下位ピンの `minDist` を小さく(例: 24)して、上位ピンの居場所を優先的に確保する。

方針A だけで合格するなら B は入れなくてよい。**まず A を入れて撮影 → 1〜5番が読めなければ B を足す**、の順で進めること。

## 変更禁止範囲
- `assets/geo.js` / `assets/engine.js` は触らない(データ取得とランキングは今回の対象外)。
- `state.cards` の緯度経度は絶対に書き換えない。ずらすのは **marker の見た目位置のみ**(L606 のコメントの原則を守る)。`fitBounds` に渡す `points`(L655/L667)も元の座標のまま。
- カードの HTML 構造・文言・`?fixture` / `?simulate` の挙動は変えない。
- 外部ライブラリ(クラスタリングプラグイン等)の追加は禁止。Leaflet 標準APIのみ。
- `fitBounds` の `maxZoom: 14`(L671)は最後の手段。上げると地図が寄りすぎて「宿の周り全体」が見えなくなるので、A/B で解決できなかった場合のみ 15 まで、かつ混雑モードに限らず全モードで撮って崩れが無いか確認すること。

## 完了条件(検証可能)
1. `?fixture=kusatsu&simulate=overpass504` の mobile 撮影で、**1〜5番の数字がすべて読める**(他のピンや宿ピンに数字が欠けて隠れていない)。
2. 同上で、6番以降も **完全に消えているピンが無い**(縁が重なるのは可)。
3. 宿ピン(♨)が番号ピンの下に潜っていない。
4. どのピンも小地図の枠外にはみ出していない・上下端で切れていない。
5. `?fixture=kusatsu`(通常の固定モード)でデグレが無い。カード30枚、ピン1〜5判読可、以前の r4-fixture 撮影と比べて悪化していない。
6. `node --check assets/app.js` が通る。

## 検証手順
撮影コマンド(ローカルサーバ `start-server.bat` → 127.0.0.1:3000):
```
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&simulate=overpass504" --mobile   # 最重要
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&simulate=overpass504"           # desktop
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile                       # デグレ確認
```
撮った PNG を **必ず Read で開いて目視**する。見る観点:
- 小地図の中央(♨の周囲)に注目し、番号 1・2・3・4・5 の数字が1つも欠けずに読めるか。
- 数字が半分だけ見えている(=別のピンが上に乗っている)ものは **不合格**。R7 と同じ失敗。
- ピンが地図の上端・下端・左右端で切れていないか。
- 告知の帯(「周辺の宿情報だけ混雑中。…」)とカードに崩れ・重なりが無いか。
- 通常モードの方は、カード見出し・カテゴリ行・リンクチップの折り返しが以前と同じか。

合格したら `docs/ROADMAP.md` の R8 行を `[x] 2026-09-16` に、`docs/NIGHTLOG.md` に3行(やったこと/見た目の確認結果/次)追記し、コミット→push。

**まず実装が終わったらコミットすること。報告は簡潔に(長文の報告書を書かない)。**
