# NEXT — R101 地図タイルが読めないときに理由を1行出す

- **タスクID**: R101
- **難易度**: sonnet
- **所要目安**: 25〜35分

## 目的
OSM タイルサーバが落ちている・社内プロキシで弾かれている・オフライン等のとき、状態Aの地図は
**灰色の矩形とピンだけ**になり、ユーザーには「壊れた」としか見えない。実際にはピンも提案も
座標だけで動くので、「背景画像が読めないだけで機能は使える」ことを1行伝える。
ROADMAP の未完了のうち、**実ユーザーが壊れた画面を見る**唯一の項目なので最優先で選定した。

## 実測で判明した前提(2026-09-16 計画役が grep/Read で確認)
1. `grep -rn "tileerror" assets/ scripts/` → **0件**。Leaflet の `tileerror` は一切購読していない。
2. `assets/app.js:372`(状態A `ensureMap()` 内、367行目から始まる関数)
   `L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);`
   — 戻り値を変数に受けていないので、イベントを付けるには一旦変数へ受ける必要がある。
3. `assets/app.js:1149` が状態Bの小地図の同じ行。**今回は対象外**(理由は下記)。
4. `assets/app.js:65-66` に `TILE_URL` / `TILE_ATTR` の定義。
5. `setMapNote()` は `assets/app.js:379-387`。`els.mapNote`(`index.html:49` の
   `<div class="mapnote" id="map-note" hidden>`、CSS は `assets/style.css:224`)の
   `hidden` と `textContent` を差し替えるだけの単純な関数。**空文字を渡すと消える**。
6. `setMapNote()` の既存呼び出しは `app.js:410 / 413 / 419 / 424 / 433 / 442 / 447 / 456 / 459 / 461` の10箇所。
   うち `app.js:402` の `NO_HOTEL_TEXT`(= 「この範囲には宿のデータがありません。エリアチップか検索から選べます。」)は
   R94 で「状況。次にできること。」の2文形式に揃え済み。**今回の文言もこの粒度に合わせる**。
7. 状態Bの小地図は `.mapnote` に相当する要素を持たない(`grep -n "mapnote" index.html` は49行目の1件のみ)。
   → 対象外とし、理由を NIGHTLOG に残す。
8. `scripts/` に `check-tileerror.mjs` は無い。既存27本は `scripts/check-all.mjs:14-39` に列挙。
   **今回は新規本を作らず `scripts/check-nohotels.mjs` に追記する**(同ファイルは既に
   `.mapnote` の可視性と本文一致を検査しており、`?demo=nohotels` でサーバ・Playwright 一式を
   起動済みなので追記コストが最小)。
9. `page.route(...)` によるリクエスト遮断は既に4本で使用実績あり
   (`check-chipcurrent.mjs:62` / `check-debugflag.mjs:119` / `check-initpos.mjs:54,59` / `check-recent.mjs:57`)。
   タイル遮断もこの方式で外部API 0回のまま再現できる。
10. **未確認**: `tileerror` が「1画面で十数回」発火する正確な回数は未計測。
    連打防止フラグは実測ではなく設計上の安全策として入れる。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nohotels.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`

## 実装方針
1. `app.js:402` の `NO_HOTEL_TEXT` の近くに定数を1つ足す:
   `var TILE_ERROR_TEXT = '地図の背景画像を読み込めませんでした。ピンと提案はそのまま使えます。';`
   (R94 の「状況。次にできること。」2文形式)
2. `ensureMap()`(`app.js:367-377`)の内側にセッション1回だけのフラグを持たせる。
   関数外のモジュールスコープに `var tileErrorNoticed = false;` を置く(`suppressNextMoveEnd`
   が `app.js:392` で同様に置かれているので、その付近に並べる)。
3. `app.js:372` を次のように書き換える:
   ```js
   var tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
   tiles.on('tileerror', function () {
     if (tileErrorNoticed) return;
     tileErrorNoticed = true;
     setMapNote(TILE_ERROR_TEXT);
   });
   ```
4. **他の `setMapNote()` 呼び出しには手を入れない**。宿の取得が進むと `app.js:433` の
   `setMapNote('')` 等でこの文言は上書きされて消えるが、それで構わない
   (タイルが復帰しなくても宿の案内の方が新しい情報なので)。この挙動を NIGHTLOG に1行残すこと。
5. `app.js:1149`(状態Bの小地図)は**触らない**。
6. `scripts/check-nohotels.mjs` の末尾の検査群に、既存の `ok()` ヘルパを使って4項目を追記する
   (既存の `?demo=nohotels` の検査ブロックは1行も変えない。新しい page を1つ開いて行う):
   - `page.route('**://*.tile.openstreetmap.org/**', r => r.abort())` を設定した新ページで
     `?fixture=kusatsu` ではなく**状態Aが出るURL**(`?demo=nohotels` を流用してよい)を開く
   - `.mapnote` が可視で `textContent` が `TILE_ERROR_TEXT` と一致すること
   - タイルを遮断しない通常ページでは `.mapnote` にこの文言が出ないこと
   - コンソールエラー0件
   - 遮断ページで overpass / wikipedia ドメインへの fetch が0回であること

## 完了条件
- [ ] タイルを遮断した状態Aで `.mapnote` に上記1行が出る(撮影で目視)
- [ ] 同じ画面で**ピンと提案が従来どおり動く**(宿ピンをタップして状態Bに入れる)
- [ ] 通常時(タイル正常)にはこの文言が一切出ない
- [ ] `node --check assets/app.js` が通る
- [ ] `node scripts/check-nohotels.mjs` が既存項目+追記4項目すべて PASS
- [ ] **`node scripts/check-all.mjs` が 27本全緑**

## 検証手順
```
node --check assets/app.js
node scripts/check-nohotels.mjs
node scripts/check-all.mjs      # 27本全緑(必須)
```
撮影(サーバは `python -m http.server 3000 --bind 127.0.0.1` をプロジェクトルートで起動):
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` (375幅・デグレ確認)
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --width 1280` (desktop・デグレ確認)
- タイル遮断時の画面は shot.mjs では再現できないので、**Playwright の一時スクリプトで
  `route.abort()` を掛けたうえで `page.screenshot()` を `screenshots/` に保存**し、Read で目視する。
  ファイル名は `<ISO日時>_r101-tileerror_mobile.png` の既存命名に合わせる。
撮影した画像は必ず Read で開いて「文字崩れ・重なり・はみ出し・灰色地の上で文字が読めるか」を確認する。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**
- rank の重み・閾値・カテゴリ減点は**変更不可**
- `assets/app.js:1149`(状態Bの小地図)は今回対象外
- 既存の `setMapNote()` 呼び出し10箇所と `NO_HOTEL_TEXT` の文言は変更しない
- **新しい `scripts/check-*.mjs` を作らない**(既存 `check-nohotels.mjs` への追記に収める)
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- **外部API 0回**(タイルは Playwright の `route.abort()` で遮断して再現。Overpass / Wikipedia / Nominatim を叩かない)

## 終わったら
1. `docs/ROADMAP.md` の R101 の行頭を `- [x] 2026-09-16 R101 …` にする
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」の末尾に3行追記
   (やったこと / 見た目の確認結果 / 次)。**ファイル先頭に新しい節を作らない**
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
