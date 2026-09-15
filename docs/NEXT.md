# NEXT: R38 カードの「Googleマップ」を宿→スポットの経路リンクにする

**判断理由**: 残候補(R11/R14/R19/R28残/R37〜R41)の中で、ユーザーの体験が一番変わるのに追加入力もAPIキーも要らない(既に持っている座標2組だけで「宿からの行き方」が1タップで出る)ため。R37/R39は小さく、R14/R19は調査が重い。

- **難易度**: sonnet
- **所要目安**: 40〜60分(実装15分 + check-all 約54秒 + 撮影・目視)

---

## 対象ファイル(絶対パス)

1. `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` — 本命
2. `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — ラベル(任意)・far節の確認のみ
3. `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs` — テスト追加

---

## 実装方針(実物を読んだ結果)

### 現状(確認済み)

- `assets/engine.js:313` `function buildLinks(item)` が `links` を組み立てている。
  - `engine.js:315` `var coords = encodeURIComponent(item.lat + ',' + item.lon);`
  - `engine.js:317` `gmap: 'https://www.google.com/maps/search/?api=1&query=' + coords,`
- `buildLinks` の**唯一の呼び出し元**は `engine.js:820`、`function toCard(item, hotel)`(`engine.js:805`)の中の `links: buildLinks(item),`。
  - → **`toCard` は既に第2引数で `hotel` を受け取っている**ので、`buildLinks(item, hotel)` と渡すだけでよい。`present()`(`engine.js:833`)や `rank()` の署名変更は不要。
- `assets/app.js:696` `function linkRowHtml(card)` は `links.gmap` を `safeUrl()` に通して `{url, label:'Googleマップ'}` を push するだけ(`app.js:699-700`)。**URLの形は見ていない**ので app.js 側の変更は必須ではない。
- `assets/app.js:776` の far 節(`farHtml`)も `c.links.gmap` をそのまま使う → 自動で経路リンクになる(これは望ましい。「車1時間以上」の項目こそ経路が要る)。

### やること

**(A) engine.js `buildLinks` を `buildLinks(item, hotel)` にする**

```
gmap = hotel の lat/lon が有限
  ? 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(hotel.lat + ',' + hotel.lon)
      + '&destination=' + encodeURIComponent(item.lat + ',' + item.lon)
      + '&travelmode=walking'
  : 従来の 'https://www.google.com/maps/search/?api=1&query=' + coords   // ← フォールバック
```

- **座標の順序を間違えない**: `origin` が宿、`destination` がスポット。
- `encodeURIComponent` は origin/destination それぞれに掛ける(既存 `coords` と同じ作法)。カンマは `%2C` になるが Google は受け付ける。
- `travelmode=walking` を既定にする。徒歩/車の切替は Google 側の画面で1タップなので、こちらでは判定しない(**入力ゼロ原則**)。
- `hotel` が未指定・lat/lon が非有限のときは**必ず従来の検索URLにフォールバック**(`engine.js` の既存 `isFinite` チェックと同じ書き方で)。
- `toCard`(`engine.js:820`)の呼び出しを `buildLinks(item, hotel)` に変更。`toCard` 内で既に `hotel.lat/lon` を使っているので追加の防御は最小で済む。

**(B) ラベル(任意・やるなら小さく)**

`app.js:700` の `'Googleマップ'` を `'行き方'` にしてもよいが、**チップ幅が変わる**ので `node scripts/check-a11y.mjs`(リンクチップ44px)が緑であることを必ず確認する。迷ったら**ラベルは変えずに `Googleマップ` のまま**でよい(本タスクの本質はURL)。変えた場合は check-a11y の結果を NIGHTLOG に書く。

**(C) デモ用スタブの整合(小)**

`app.js:609` の `?demo=far` 用ダミーが `links: { gmap: '.../maps/search/?api=1&query=' + lat + ',' + lon }` を直書きしている。ここは撮影用スタブなので**そのままでも壊れない**。触るなら宿座標が手元にある場合のみ dir 形式にする。無理はしない。

---

## 完了条件(検証可能)

1. `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs` に gmap のケースを追加し全 pass。既存の `check-engine.mjs:166`(`eq(saino.links.gmap, ...search/?api=1&query=...)`)は**新しい期待値に書き換える**。追加する観点:
   - 宿座標ありのとき URL が `https://www.google.com/maps/dir/?api=1` で始まる
   - `origin=` に**宿**の `lat,lon` が `encodeURIComponent` 済みで入る
   - `destination=` に**スポット**の `lat,lon` が入る(origin と取り違えていない)
   - `travelmode=walking` を含む
   - 宿の lat/lon が `undefined`/`NaN` のとき従来の `maps/search/?api=1&query=` に落ちる
   - far 側のカード(`present()` の `far`)の `links.gmap` も dir 形式になっている
2. `node scripts/check-all.mjs` が **13本すべて PASS・exit 0**。
3. `node scripts/dump-rank.mjs kusatsu` と `hakone` の出力差分が **links の URL だけ**(順位・名前・カテゴリ・距離・件数は完全一致)。差分確認は変更前の出力を scratchpad に保存してから比較する。

---

## 検証手順

1. 変更前に `node scripts/dump-rank.mjs kusatsu > <scratchpad>/before-kusatsu.md`、`hakone` も同様。
2. 実装 → `node --check assets/engine.js` / `assets/app.js`。
3. `node scripts/check-all.mjs`(約54秒)が全緑。
4. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` で撮影し、**画像を Read で目視**。確認点: カード30枚・番号ピン1〜30判読可・リンクチップの折り返し崩れなし・チップの高さが変わっていない。
5. 生成されたURLを1本だけ目視(コンソールか dump 出力)して、実際にブラウザで開いたとき「宿→光泉寺」の経路が出る形になっているかを文字列で確認する(実際に Google を開く必要はない)。
6. `node scripts/dump-rank.mjs` の差分を before と比較。

---

## 変更禁止範囲

- `rank()` の重み・閾値・カテゴリ多様性の減点(`engine.js`)
- `assets/geo.js` 全体
- `fixtures/*.json`
- 外部APIを叩く撮影(本タスクは fixture のみで完結する。Overpass/Wikipedia を叩く必要は**ゼロ**)
- Google Maps **API キー**の利用(`/maps/dir/?api=1` はキー不要の公開URLスキームなのでコスト0円の原則を満たす)
