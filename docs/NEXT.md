# NEXT(次の1タスク) — 作業役はこれだけをやる

## タスクID: R7 状態Bの小地図で番号ピンが重なって見えない問題を解消する

## 目的
固定モード(`?fixture=kusatsu`)の撮影で、feed-map の中心部(草津町中心)に
ピン `3 / 7 / 21 / 24 / 10 / 11` が団子状に重なり、**1・2・4・5 など上位の番号が
完全に他のピンの下に隠れて見えない**ことを目視で確認した。
フィードの1番目が地図のどこかが分からないのは、このアプリの主目的(宿の周りに何があるか)を壊している。
**ライブラリ追加なし**(Leaflet.markercluster 等は使わない)で、上位のピンが必ず見えるようにする。

## 対象ファイル(絶対パス)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css

参照のみ(編集しない): index.html, assets/geo.js, fixtures/kusatsu.json

## 現状のコード(読んだ実物)
- `assets/app.js` L581-618 `renderFeedMap()`
  - L589-596: 宿ピン。`L.divIcon({className:'pin pin--hotel', iconSize:[30,30], iconAnchor:[15,15]})`
  - L599-609: `state.cards.forEach(function (c, i) {...})` でスポットピンを生成。
    `L.divIcon({className:'pin pin--spot', html:'<span>'+(i+1)+'</span>', iconSize:[24,24], iconAnchor:[12,12]})`
    → **zIndexOffset を一切指定していないので、Leaflet 既定の「緯度が南のものほど手前」順**になり、
      番号の若さと前後関係が無関係。これが「1 が隠れる」直接原因。
  - L611-612: `feedMap.fitBounds(..., { padding:[24,24], maxZoom:14 })`
    (R1 で padding 28 を試したら逆にズームが引けて悪化したため 24 のまま。**ここは触らない**)
- `assets/style.css` L154-173 `.pin` / `.pin span` / `.pin--spot span`
  - `.pin--spot span` は `background: var(--c-primary)` のベタ塗り、`font-size: var(--fs-xs)`、`font-weight:700`。
  - 白い縁が無いので、隣のピンと接したとき境界が溶けて「1つの大きな塊」に見える。
- `.feedmap { height: 180px }`(style.css L214)。高さは変えない。

## 実装方針(この3点のみ。欲張らない)
1. **番号順の重なり順を固定する**(app.js L599-609)
   マーカー生成時に `zIndexOffset` を渡し、**番号が小さいほど手前**にする。
   例: `L.marker([c.lat, c.lon], { icon: icon, title: c.name, zIndexOffset: 1000 - i })`
   さらに宿ピン(L595)は全スポットより手前に来るよう `zIndexOffset: 2000` を付ける。
   ※ Leaflet の divIcon マーカーは `zIndexOffset` で前後を制御できる。CSS の z-index を直接いじらない。
2. **上位ピンを一目で分かる見た目にする**(app.js のクラス付与 + style.css)
   - app.js: `className` を `'pin pin--spot' + (i < 5 ? ' pin--top' : '')` のように組み立てる。
   - style.css: `.pin--spot span` に **白い外枠**(`box-shadow` に `0 0 0 2px #fff` を重ねる等、
     既存の `--shadow-md` を消さずに追加)を足し、密集しても粒が分離して見えるようにする。
   - `.pin--top span` は少し大きく(例 `transform: scale(1.12)`)+ 枠を濃くして、1〜5番を目立たせる。
     ※ `iconSize` を変えると `iconAnchor` とずれるので、**サイズ変更は CSS の transform で行い**、
       `transform-origin: center` を明示すること。
3. **重なりを機械的にほどく(必要なら)**
   1+2 で上位5件が視認できれば **ここまでで完了**。まだ団子なら、
   `renderFeedMap()` 内で、既に置いたピンとの画面上の距離を
   `feedMap.latLngToLayerPoint()` で測り、**22px 未満なら角度を変えて 14px ずらす**(簡単なスパイラル配置)
   小ヘルパー `nudgeOverlaps(points)` を `renderFeedMap()` の直前に新設する。
   ずらすのは**表示位置だけ**で、`points`(fitBounds 用)と `state.cards` の緯度経度は絶対に書き換えない。

## 完了条件(検証可能)
- [ ] 固定モードの mobile 撮影で、**1〜5 番のピンがすべて判読できる**(他のピンに完全に隠れたものが0個)。
- [ ] desktop 撮影でも同様に 1〜5 が判読できる。
- [ ] ピン同士が接しても、白枠によって**個々の円の輪郭が分かる**。
- [ ] 宿ピン(絵文字)がスポットピンの下に潜っていない。
- [ ] 地図の高さ(180px)、fitBounds の padding/maxZoom、カード一覧の見た目は**変化していない**。
- [ ] `node --check assets/app.js` が通る。
- [ ] 通常モード(`http://127.0.0.1:3000/`)でデグレなし(状態Aの宿ピンが従来どおり)。

## 検証手順
1. ローカルサーバを 3000 で起動(前サイクルと同じ手順)。
2. 撮影(**外部APIを叩かない固定モードを使う**):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile --name r7-fixture`
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --name r7-fixture-desktop`
3. 撮った PNG を **Read で開いて目視**。見る観点:
   - 地図中心の団子地帯で、1〜5 の数字が読めるか(隠れているものを数える)
   - ピンの円が欠けていないか、数字が円からはみ出していないか
   - ピンが地図の上端・下端で切れていないか
   - カードの見出し・カテゴリ行・リンクチップに重なりや折り返し崩れが出ていないか(デグレ確認)
4. 通常モードは **最後に1回だけ**:
   `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/" --mobile --name r7-normal`
   → 状態Aの宿ピンが出ていれば OK。Overpass が 429/504 を返したら**待たずに諦めて固定モードの結果で判断する**。
5. ROADMAP の R7 を `[x] 2026-09-16` に、NIGHTLOG に3行追記 → コミット → `git push`。

## 変更禁止範囲
- `assets/geo.js`、`fixtures/kusatsu.json`、`index.html` を編集しない。
- `fitBounds` の `padding` / `maxZoom`、`.feedmap` の `height` を変えない(R1 で調整済み)。
- Leaflet プラグイン(markercluster 等)や新しい npm/CDN 依存を追加しない。**コスト0円・依存追加なし**。
- カードのHTML構造・並び順・ランキングロジックに手を入れない(それは R2 以降)。
- git stash / reset --hard / checkout でファイルを戻す操作は禁止。
- ROADMAP と NIGHTLOG 以外のドキュメントを書き換えない。

## 難易度: sonnet
Leaflet の zIndexOffset と CSS 調整が中心で、設計判断はほぼ不要。方針3(ずらし)まで必要になった場合も
30行程度の素直なループで書ける。

## 所要目安: 15〜25分(実装10分 / 撮影・目視10分 / 記録・コミット5分)
