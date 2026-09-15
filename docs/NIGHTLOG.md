# 夜間ログ(みのるんが朝に読む)

## 2026-09-16 未明 開始
- 本番URL: https://teer-tee.github.io/yadotabi/ を公開(GitHub Pages・無料)。
- 自動ループ開始。規約は docs/AUTOPILOT.md、バックログは docs/ROADMAP.md。

## サイクル記録

### 2026-09-16 R1 固定データモード `?fixture=kusatsu`
- やったこと: `scripts/make-fixture.mjs` で草津の生レスポンスを1回だけ取って `fixtures/kusatsu.json` に保存(Overpass elements 189件 / Wikipedia pages 50件)。geo.js の fetchSpots・fetchWikiNearby・fetchHotelsInBbox・enrichFame に fixture 分岐を入れ、固定モード中は外部APIもキャッシュも一切触らないようにした。app.js は `?fixture=` を読んで状態Bへ直行する(不正な名前・読み込み失敗は黙って通常動作にフォールバック)。
- 見た目の確認結果: mobile/desktop とも固定モードでカードが30枚描画され、タイトル・カテゴリ行・要約2行・リンクチップ(5個)の折り返しに重なりや欠けなし。画像なしカードの不自然な空白もなし。feed-map のピン番号は上端では切れておらず、密集地点でピン同士が重なって隠れるだけ(fitBounds の padding を 28 に広げたら逆にズームが引けて重なりが増えたので 24 に戻した)。通常モードのデグレなし(宿ピンが正常に出た)。ついでに `.mapnote` の `white-space: nowrap` が長文を右端で切っていた既知バグを折り返しに直した。
- 次: ROADMAP の次タスクへ。以降の撮影は全て `?fixture=kusatsu` で行える。

### 2026-09-16 R7 状態Bの小地図で番号ピンが重なって見えない問題を解消
- やったこと: app.js の renderFeedMap で各スポットマーカーに `zIndexOffset`(番号が若いほど手前、宿ピンは最前面)を付与し、上位5件に `pin--top` クラスで白枠+拡大の強調表示を追加(style.css)。さらに `nudgeOverlaps()` を新設し、fitBounds確定後に画面上で28px未満に接近しているピンを8方向×最大3リングでずらして分離(緯度経度そのものは書き換えず見た目位置のみ)。
- 見た目の確認結果: 固定モード(`?fixture=kusatsu`)の mobile/desktop 撮影で1〜5番すべてが判読可能になった(修正前は1・3・4・5が完全に隠れていた)。宿ピンも他ピンの下に潜っていない。カードの見出し・カテゴリ行・リンクチップに崩れなし。通常モードは Overpass が混雑トースト(504)を返したため待たずに諦め、状態A自体の表示は正常なことのみ確認。
- 次: 通常モード撮影で混雑トーストが出ていたので、次は R4(Overpass 429/504 のリトライ)を繰り上げる価値あり。

### 2026-09-16 R4 Overpass 混雑時の自動リトライと「Wikipediaだけで提案」
- やったこと: geo.js に `requestOverpass()` を切り出し、混雑(429/504)は `overpassBusy` 付き Error にした。`fetchSpots` はそれを受けて3秒待って1回だけ再試行(タイムアウトは再試行しない)、`fetchHotelsInBbox` は地図移動のたびに呼ばれるのでフラグを立てるだけでリトライしない。engine.js は collect/suggest の第3引数 meta で `osmFailed` を上まで運び、app.js は読み込み完了後に「周辺の宿情報だけ混雑中。Wikipediaの情報で提案しています。」を1行出す(状態Aのトーストも「宿ピンの取得が混雑中です。検索やエリアチップから選べます。」に変更)。撮影用に `?simulate=overpass504` を追加し、fixture 分岐より先に失敗させて「Overpassだけ死んでWikipediaは生きている」を外部APIなしで再現できるようにした。
- 見た目の確認結果: `?fixture=kusatsu&simulate=overpass504` の mobile/desktop で、カードは空にならず Wikipedia 由来(光泉寺など)が並び、告知の1行が薄い帯で表示された。mobile は2行に折り返して右端で切れておらず、カードや小地図とも重なっていない。desktop は1行に収まる。`?fixture=kusatsu` 単独のデグレなし(従来どおりカード30枚・ピン判読可)。状態Aのトーストも3行に折り返して全文読める。再試行回数は Node 上の実測で fetchSpots=2回(間隔3.0秒)・bbox=1回、無限リトライなし。
- 次: ROADMAP の残タスク(R2/R3 など)へ。

### 2026-09-16 R8 密集時に番号ピンが完全に隠れる問題の根本修正
- やったこと: app.js の `nudgeOverlaps()` を作り替えた。(1)ピンごとに最小距離を持たせ(上位34px / 6番以降26px / 宿ピン36px)、(2)探索を8方向×6リング(最大96px)に広げてリングごとに角度を回し、(3)最後まで空きが無くても「既存ピンからの余裕が最大の候補」へ必ず逃がす(元位置に積まない)、(4)座標を containerPoint 基準に統一して地図の縁から20px内側にクランプ、の4点。加えて `fitBounds` を `invalidateSize()` の後に移し `animate: false` にした(アニメ完了時に元の投影へ戻されてズラしが無効化されていた既存バグ)。style.css は変更なし・方針Bは不要だった。
- 見た目の確認結果: 混雑モード(`?fixture=kusatsu&simulate=overpass504`)の mobile/desktop で番号1〜28がすべて判読可能(修正前は中央に全ピンが積み上がっていた)。宿ピン♨も番号ピンに潜っていない。上下左右の端で切れているピンなし。通常固定モード(`?fixture=kusatsu`)もカード30枚・ピン1〜30判読可でデグレなし。`node --check assets/app.js` 通過、コンソールエラーなし。
- 次: ROADMAP の残タスク(R2 通しQA / R3 公開確認)へ。

## 朝の相談(判断が要るもの)
