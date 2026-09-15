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

## 朝の相談(判断が要るもの)
