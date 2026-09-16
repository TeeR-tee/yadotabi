# NEXT: R113 同じエリアチップを連続で押すと毎回 Overpass の再取得が走る

- タスクID: **R113**
- 難易度: **sonnet**(変更は `assets/app.js` の十数行 + 検査1本の新設)
- 所要目安: 20〜30分
- 選定理由: 残りの未完了(R92/R102/R103/R111/R113)のうち、**本番で実際に無料APIのレートを消費している唯一の実害**。R111 は検査の追加のみで画面もレートも1ミリも変わらない、R92/R102 はローカルディスクの話、R103 はログの見やすさ。ユーザー影響(=無料APIのマナー・AUTOPILOT 絶対ルール4)で R113 が最上位。

## 目的
エリアチップ・検索候補の地名を**同じ場所で連続で押したとき**に、Overpass への宿取得が毎回走るのを止める。押した手応え(チップ強調)は従来どおり残す。

## 実測で判明した前提(このサイクルで実際にコードを読んで確認)
1. `assets/app.js:516-525 flyTo(lat, lon, zoom)` は**無条件**に `map.setView()`(:518)→ `saveMapView()`(:519)→ `autoZoomArmed = true`(:522)→ `loadHotelsInView()`(:524)を実行する。現在地との一致判定は1行も無い。
2. `flyTo()` の呼び出し元は**4箇所**(grep 実測):
   - `app.js:1620` … `?demo=autozoom`(`DEFAULT_VIEW` へ flyTo)
   - `app.js:1708` … `?q=` ジャンプ(検索結果の1件目)
   - `app.js:1825` … 検索候補の「地名」行(`row.act === 'jump'`)
   - `app.js:1837` … エリアチップ clickハンドラ
3. **最大の罠(必ず対処すること)**: `app.js:1616-1621` の `?demo=autozoom` は「Nominatim を叩かずに 0件合流を再現する」ために、**わざと初期位置と同じ `DEFAULT_VIEW` へ flyTo している**。素直に一致ガードを入れると `loadHotelsInView()` が走らなくなり `scripts/check-autozoom.mjs` が落ちる。→ `flyTo()` に**第4引数 `force`(既定 false)** を足し、`app.js:1620` だけ `flyTo(..., true)` で従来どおり必ず走らせる。
4. `DEFAULT_VIEW = { lat: 36.6226, lon: 138.5960, zoom: 14 }`(`app.js:20`)。チップ・候補・`?q=` はすべて `DEFAULT_VIEW.zoom` を渡すので、**ズームは一致しやすく緯度経度だけが判定の主役**。
5. チップ強調 `setCurrentChip()` は `app.js:1836`(チップ)・`app.js:1824`(候補)で **`flyTo()` より前**に呼ばれている。よって `flyTo()` 内で早期 return してもチップ強調は消えない。
6. `scripts/check-chipcurrent.mjs` を grep した結果 `flyTo` / `getCenter` / `getZoom` は**0件**。チップ強調の DOM だけを見ているので今回の変更で壊れない(ただし実装後に必ず回すこと)。
7. `scripts/check-all.mjs` の登録は現在 **28本**(`check-firstcard.mjs` が `scripts/check-all.mjs:24`)。
8. 未確認: 実際に本番で何回 fetch が飛ぶかは計測していない(本番を叩かない方針のため)。検査は fixture + `page.route()` のカウントで行うこと。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(変更)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-chipreclick.mjs`(新設)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(29本目として登録・本数コメント更新)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(表に1行追加・本数表記を28→29に)

## 実装方針(行番号つき)
1. `app.js:516` のシグネチャを `function flyTo(lat, lon, zoom, force)` に変える。
2. `app.js:517` の `ensureMap();` の**直後**に一致ガードを足す:
   - `var z = zoom || DEFAULT_VIEW.zoom;`
   - `force` が真でなく、かつ `map.getZoom() === z` かつ `Math.abs(map.getCenter().lat - lat) < 1e-6` かつ `Math.abs(map.getCenter().lng - lon) < 1e-6` なら **`return;`**(`setView` も `saveMapView` も `autoZoomArmed` も `loadHotelsInView` も呼ばない)。
   - `map.getCenter()` は1回だけ変数に受けること。`lng` であって `lon` ではない点に注意(Leaflet の LatLng)。
   - なぜ 1e-6 か・なぜ force が要るか(=`?demo=autozoom`)をコメント2行で残す。
3. `app.js:1620` の `?demo=autozoom` の呼び出しだけ `flyTo(DEFAULT_VIEW.lat, DEFAULT_VIEW.lon, DEFAULT_VIEW.zoom, true)` に変える。**他3箇所(:1708 / :1825 / :1837)は引数を足さない**(ガードを効かせたいのがまさにこの3つ)。
4. `scripts/check-chipreclick.mjs` を新設(既存 `scripts/check-autozoom.mjs` の作りを雛形にしてよい):
   - `?fixture=kusatsu` を使わず、**通常モード**で `page.route()` により Overpass(`overpass`)・Nominatim・Wikipedia のリクエストを**全てダミー応答に差し替えつつ回数をカウント**する(外部には1回も出さない)。
   - 同じエリアチップを**3回**押し、Overpass へのリクエスト数が **1回目のみ**で増えないこと。
   - 別のエリアチップを押したら**増える**こと(ガードが効きすぎていないことの裏取り)。
   - `?demo=autozoom` で従来どおり取得が走ること(force 経路の回帰)。
5. `scripts/check-all.mjs` に 29本目として登録し、ファイル冒頭等の本数コメントを更新。

## 完了条件
- 同じチップ3連打で Overpass 相当のリクエストが1回だけ(機械検査で確認)。
- 別チップへの移動・`?q=` ジャンプ・`?demo=autozoom` は従来どおり取得が走る。
- チップ強調(`aria-current`)は3連打でも従来どおり付く。
- `node scripts/check-all.mjs` が **29本全緑**。

## 検証手順
1. `node --check assets/app.js`
2. `node scripts/check-chipreclick.mjs`(新設分の単体)
3. `node scripts/check-chipcurrent.mjs` / `node scripts/check-autozoom.mjs`(壊していないことの確認)
4. 撮影(fixture のみ・外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`(幅375・デグレ確認1枚)
   - 状態Aのチップ連打後の見た目を mobile で1枚(チップ強調が残っていること)
   - 撮った画像は **Read で開いて目視**すること。
5. `node scripts/check-all.mjs` → **28本ではなく29本全緑**であることを確認。

## 変更禁止範囲
- `assets/geo.js` / `fixtures/*.json` は変更不可。engine.js も変更不可。
- rank の重み・閾値は変更不可。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API呼び出しは **0回**(Overpass/Nominatim/Wikipedia は `page.route()` で遮断)。
- 既存 check 本の検査内容を減らさないこと(速くするために削らない)。
- `setCurrentChip()` の挙動・`.mapnote` の文言は触らない。

## 終わったら
1. `docs/ROADMAP.md` の R113 の行を `- [x] 2026-09-16 R113 …` に書き換える。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に**3行**追記(やったこと / 見た目の確認結果 / 次)。**ファイル先頭に新しい節を作らない**。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
