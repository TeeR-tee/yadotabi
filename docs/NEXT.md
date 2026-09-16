# NEXT: R43 状態Aの宿ピンに宿名ツールチップ

難易度: **sonnet** / 所要目安: **20〜30分**(実装10分・check 作成10分・撮影と目視10分)

## なぜこれを選んだか(1行)
残り候補(R14/R19/R40/R45/R46)のうち R14・R19・R40 は fixture 再生成や Overpass 呼び出しを伴い「無料APIのマナー」で夜に回しにくく、R45・R46 は表示/ログの微修正で効果が薄いのに対し、R43 は**外部API 0回**で完結し「♨が誰なのか押すまで分からない」という状態Aで一番大きい体験の穴を埋められるため。

## 目的
状態A(地図)の宿ピンは現在 ♨/🏨 の絵文字だけで、**タップして状態Bへ飛ぶまでどの宿か分からない**。Leaflet 標準の `bindTooltip`(ライブラリ追加なし)で宿名を出し、押す前に分かるようにする。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (主)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (ツールチップの見た目)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hoteltip.mjs` (新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` (1行追加、15本→16本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` (記録)

## 実装方針(実物の行番号つき)

### 1. ツールチップの付与(app.js:450-462 `renderHotelPins()`)
現物は以下(app.js:450-462)。`marker.on('click', ...)` の**直前**に1行足すだけ。

```
450  function renderHotelPins(hotels) {
451    hotelLayer.clearLayers();
452    hotels.forEach(function (h) {
453      var icon = L.divIcon({ className: 'pin pin--hotel', html: '<span role="img" aria-label="…">' … });
459      var marker = L.marker([h.lat, h.lon], { icon: icon, title: h.name }).addTo(hotelLayer);
460      marker.on('click', function () { selectHotel(h); });   ← ここは絶対に変えない
461    });
462  }
```

追加するのは `marker.bindTooltip(h.name, { direction: 'top', offset: [0, -14], className: 'hoteltip', permanent: false })` の1行。

**重要 —— ROADMAP の R43 本文は「タップで開く」と書いてあるが、それは採用しない。**
理由: app.js:460 の click ハンドラが `selectHotel(h)` で即座に状態Bへ遷移するため、タップで開く設定にするとツールチップは一瞬も見えないまま画面が変わる(=無意味)。よって **Leaflet 既定の hover(mouseover)で開く挙動をそのまま使う**。
- PC: マウスを乗せると宿名が出る(改善が効く)
- スマホ: タップ即遷移という現状の挙動は**一切変わらない**(入力ゼロ原則を守る)
`title: h.name` が既に app.js:459 にあるのでブラウザ標準ツールチップと二重に出る。`bindTooltip` を付けたら `L.marker` の options から **`title: h.name` を外す**こと(残すと PC で2枚重なる)。`aria-label`(app.js:455)は支援技術用なので**そのまま残す**。

### 2. 見た目(style.css)
`.hoteltip` に `font-size: 12px` / `padding: 2px 8px` / `max-width: 180px` / `white-space: nowrap` + `text-overflow: ellipsis` + `overflow: hidden` 程度を当てる。長い旅館名で地図幅を割らないことが目的。Leaflet 既定の `.leaflet-tooltip` は白背景+影があるので上書きは最小限でよい。

### 3. 撮影用フラグ `?demo=hoteltip`(新規・必須)
**実物確認の結果: 宿ピンが複数出る撮影用フラグは存在しない。** `?demo=zoomout|suggest|recent|nohotels` は app.js:391-399 の `demoStateA` 分岐で `hotelLayer.clearLayers()` して即 return するのでピンが0件、`?demo=autozoom`(app.js:1209-1223)は2回目の fetch でダミー1件を返すだけ。よって密集時の重なり確認ができない。

app.js:1204 の隣に、**`?demo=autozoom` と全く同じ手口**(`YadoGeo.fetchHotelsInBbox` を差し替える。`demoStateA` は立てない)で `demo === 'hoteltip'` を追加する:
- 地図の bbox 中心付近に**近接した宿を5〜6件**返す(うち1件は「◯◯温泉 ホテル△△△△△△」のような長い名前、2件は 30〜40px 相当しか離れていない密集ペア)。
- 外部APIは1回も叩かない。`?fixture=` とは無関係(fixture は状態B直行なので併用しない)。

### 4. 変更禁止範囲(触ったら差し戻し)
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` —— **1文字も触らない**
- app.js:460 の `marker.on('click', function () { selectHotel(h); })` —— タップ即遷移は維持
- app.js:1036-1049 の**状態Bの小地図**の宿ピン/番号ピン —— 今回は状態Aのみ
- rank の重み・閾値・除外ルール

## 完了条件(すべて機械検査できること)
`scripts/check-hoteltip.mjs`(Playwright。`scripts/check-autozoom.mjs` の作りを踏襲)で以下が全て PASS:
1. `?demo=hoteltip` で宿ピンが5件以上描画される(`.pin--hotel` の数)
2. 宿ピンに `mouse.move()` で hover → `.leaflet-tooltip` が1枚表示され、その `textContent` が**その宿の name と完全一致**する
3. hover を外す → `.leaflet-tooltip` が 0 枚に戻る
4. 宿ピンを `click` → **状態Bへ遷移**(`.view--feed` が可視 / ヘッダーがその宿名)—— 従来どおりであること(最重要の非デグレ条件)
5. ツールチップ表示中も `.leaflet-tooltip` の box が地図コンテナの外へはみ出さない(長い名前で右端を割らない)
6. `.pin--hotel` の `L.marker` に `title` 属性が**残っていない**(二重表示の防止)
7. `?demo=zoomout` と `?demo=autozoom` が従来どおり(ピン0件/自動ズーム)—— 既存の check-autozoom.mjs が緑のままであることで代替可

## 検証手順
1. `node --check assets/app.js`
2. `node scripts/check-hoteltip.mjs` が全項目 OK
3. `node scripts/check-all.mjs` が **16本全 PASS・exit 0**(check-hoteltip を登録したうえで)
4. 撮影(外部API 0回): `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=hoteltip" --mobile` と desktop。**Read で画像を目視**し、(a)密集ペアでツールチップ同士が重ならないか (b)長い宿名が地図の右端で切れていないか (c)ピン絵文字がツールチップに隠れていないか を確認する。崩れていたら `offset` か `direction: 'auto'` で同サイクル中に直す。
5. デグレ確認撮影: `?fixture=kusatsu` mobile でカード30枚・番号ピン判読可・コンソールエラー0件。
6. `docs/ROADMAP.md` の R43 を `[x] 2026-09-16` に、`docs/NIGHTLOG.md` に3行(やったこと/見た目の確認結果/次)。
7. コミット → `git push`(1行の日本語メッセージ)。

## 補足
- `check-a11y.mjs` の対象外(ツールチップは hover 依存でタップ領域を持たないため)。`aria-label` は既に app.js:455 にあるので a11y の後退は無い。
- 実装が終わったら**まず先にコミット**し、報告は簡潔に(長文の報告書を書かない)。
