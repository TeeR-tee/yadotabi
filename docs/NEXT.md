# NEXT — R37(主) + R11(従・採否判断つき)

作成: 2026-09-16 計画役。難易度 **sonnet**。所要目安 **35〜50分**(R37 約20分 + R11 約20分)。

## なぜこの2つか(1行)
R37 は「宿ピンを押しても無反応」という、番号ピン(R10で解決済)と対になる最後の取りこぼしで、
既存の `panTo` パターンをそのまま流用できる最小変更であり、同サイクルに収まる R11 は
撮影3枚で採否を決められる「調査兼実装」なので、ユーザー判断を必要とせずバックログを2件消化できるため。

---

## タスク1(必須): R37 状態Bの小地図で宿ピンをタップすると宿の位置へ panTo

### 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-pinflash.mjs`

### 現状(実物を読んだ結果)
- `renderFeedMap()` は **app.js:992** から。宿マーカーの生成は **app.js:1001〜1008**:
  - `hotelIcon` を `L.divIcon({ className:'pin pin--hotel', html:'<span role="img" aria-label="宿 …">…' })` で作り、
  - `var hm = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon, zIndexOffset: 2000 }).addTo(feedMap);`
  - `feedMarkers.push(hm);` で終わっており、**click ハンドラが無い**(番号ピン側 1012〜1024 にも無いが、そちらは
    カード側バッジ(app.js:1410〜1429)からの導線で解決済み)。
- panTo の既存パターンは **app.js:1426**(番号バッジ)と **app.js:1463**(カード本体)で
  `feedMap.panTo([card.lat, card.lon]);` + `els.feedMap.scrollIntoView({behavior:'smooth', block:'nearest'})`。

### 実装方針
1. app.js:1007 の `var hm = L.marker(...)` の直後、`feedMarkers.push(hm);`(1008行)の前後に1つだけ追加する:
   ```
   hm.on('click', function () { feedMap.panTo([hotel.lat, hotel.lon]); });
   ```
   - **ズームは変えない**(`panTo` のみ。`setView`/`flyTo` は使わない)。
   - `els.feedMap.scrollIntoView` は**呼ばない**(地図自体をタップしている=既に見えているため。
     カード側の導線とは事情が違う)。
   - `hotel` はこの関数スコープの `var hotel = state.hotel;`(app.js:993)をそのまま使ってよい。
2. 受動ログ(`passivePush`)は**足さない**。F3 の記録対象は「カードのタップ/リンク/スクロール到達」で、
   地図の再センタリングはナビゲーション操作であり記録仕様外。docs/passive-log.md を書き換えないこと。
3. `nudgeOverlaps` で宿ピンは `fixedPoints`(動かさない基準点)なので、宿ピンの表示位置=実座標であり
   panTo 先とずれない。ここは触らない。

### 完了条件(検証可能)
- `?fixture=kusatsu` で小地図の宿ピン(♨)をクリックすると、宿の緯度経度が地図の中心になる
  (`feedMap.getCenter()` が hotel.lat/lon と誤差 0.0005 度以内)。
- クリック前後で `feedMap.getZoom()` が**変化しない**。
- 番号ピンをクリックしても何も起きない(従来どおり。ここに click を足さない)。
- `node scripts/check-all.mjs` が 14本すべて PASS・exit 0。

### check-pinflash.mjs へのケース追加
既存 `main()` の「連打対策」の後(scripts/check-pinflash.mjs:110 付近)に、同じ `ok(...)` の形で追記:
- 事前に `const before = await page.evaluate(() => ({ c: window.__feedMapCenter ?? null }))` のような
  グローバル追加は**しない**。代わりに Leaflet のコンテナ中心ピクセルではなく、
  `.pin--hotel` を `page.locator('.pin--hotel').click()` し、
  クリック前後の宿ピンの `getBoundingClientRect()` と `#feed-map` の矩形中心を比べて、
  **クリック後に宿ピンが地図の中心付近(中心から 20px 以内)に来ている**ことを検証する
  (Leaflet の内部APIに依存せず DOM だけで確認できる)。
- ズーム不変の確認は `.leaflet-tile-container` の `transform` ではなく、
  クリック前後で `document.querySelector('.leaflet-map-pane')` に付く
  `data-*` ではなくタイルの `src` に含まれる **ズーム段(z)** が同じであることで判定する
  (`img.leaflet-tile` の src を1枚拾って `/(\d+)\/\d+\/\d+\.png/` で取る)。
- 追加ケースは3件程度(宿ピンが1個存在する / クリック後に中心に寄る / ズーム段が不変)。
  既存ケースの文言・順序は変えない。

---

## タスク2(任意・採否判断つき): R11 小地図の高さ

### 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(**283行目** `.feedmap { height: 180px; width: 100%; ... }`)
- 採用する場合のみ `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(高さ切替クラスの付与)

### 検討する案
- 密集時(`state.cards.length >= 25`)だけ `.feedmap` を **220px** にする。
  実装するなら CSS 側に `.feedmap--tall { height: 220px; }` を足し、
  `renderFeedMap()`(app.js:992)の冒頭で `els.feedMap.classList.toggle('feedmap--tall', state.cards.length >= 25)` の1行。
  **`invalidateSize()` は既に setTimeout 内(app.js:1029)で呼ばれている**ので、
  クラス付与はその setTimeout より**前**に行えば追加対応は不要。
- `@media (min-width: 720px)`(style.css:525)配下で PC 幅の見え方が変わらないことも確認する。

### 判断手順(これが本体)
1. 現行 180px のまま `?fixture=kusatsu` / `?fixture=hakone` / `?fixture=dogo` を mobile で撮影(3枚)。
2. 220px 版に変えて同じ3枚を撮影。
3. 6枚を Read で目視し、**番号ピン 1〜30 の判読性**と**カード1枚目が画面内にどれだけ残るか**を比較する。
4. 220px にして判読性がはっきり良くなるなら採用。
   **良くならない/カード1枚目が押し出されて第一印象が悪くなるなら不採用**にしてよい。
   その場合は style.css を元に戻し、**不採用の理由(比較した具体的な見え方)を NIGHTLOG に書く**。
   不採用でも ROADMAP の R11 は `[x] 2026-09-16 R11 …(検討の結果、現行180pxを維持)` として消化する。

---

## 変更禁止範囲(厳守)
- `assets/engine.js`(rank の重み・閾値・カテゴリ多様性・除外ルールを含め一切)
- `assets/geo.js`
- `fixtures/*.json`(再生成しない。Overpass を叩かない)
- `nudgeOverlaps()` の `MARGIN`(app.js:936)および `NUDGE`/`RINGS`/`DIRS`/`TOP_DIST`/`SUB_DIST`/`HOTEL_DIST`
- 既存 check スクリプトの本体ロジック(check-pinflash.mjs への**ケース追加**のみ可)

## 検証手順
1. `node --check assets/app.js`
2. `node scripts/check-all.mjs` が 14本 PASS・exit 0
3. 撮影(すべて fixture=外部API 0回):
   - `?fixture=kusatsu` mobile — 宿ピンのクリック前/後 2枚
   - R11 の比較 6枚(採用しなくても撮る)
   - `?fixture=hakone` mobile 1枚(デグレ確認)
4. 画像を Read で目視し、文字崩れ・重なり・はみ出し・ピンの切れが無いことを確認
5. `docs/ROADMAP.md` を `[x] 2026-09-16` に、`docs/NIGHTLOG.md` に3行(やったこと/見た目/次)
6. コミット(1行の日本語)→ `git push`
