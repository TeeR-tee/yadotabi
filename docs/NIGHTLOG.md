# 夜間ログ(みのるんが朝に読む)

## 2026-09-16 未明 開始
- 本番URL: https://teer-tee.github.io/yadotabi/ を公開(GitHub Pages・無料)。
- 自動ループ開始。規約は docs/AUTOPILOT.md、バックログは docs/ROADMAP.md。

## サイクル記録

### 2026-09-16 R9 別エリア fixture(箱根)追加
- やったこと: `scripts/make-fixture.mjs` を引数化(`AREAS` 座標テーブル+`process.argv[2]`、app.js と同じ `/^[a-z0-9_-]+$/` で名前検証)。`node scripts/make-fixture.mjs hakone` を1回実行し、収集半径30kmで `fixtures/hakone.json`(overpass elements 4186件・wiki pages 50件)を生成。app.js の固定ヘッダー名 `'草津温泉(固定データ)'` を `json.meta.label` 参照に修正し、kusatsu.json の meta にも `"label":"草津温泉"` を1キー追加。
- 見た目の確認結果: `?fixture=hakone` mobile/desktop ともヘッダーが「箱根湯本(固定データ)」でカード30件・番号ピンが谷沿いでも判読可能、リンクチップ・徒歩/車行の折り返し崩れなし。`?fixture=hakone&demo=far` をDOM検査したところ「もっと遠く(車1時間以上)10件」が実データで出ており(施設名と🚗分の泣き別れなし)、R2-3 の未確認だった実データ far を確認できた。`?fixture=kusatsu` mobile はカード30枚のままでデグレなし。
- 次: R2-1(候補ドロップダウンの重なり・朝の相談待ち)・R2-2(0件カード説明文の3行目落ち)が ROADMAP に残っている。

### 2026-09-16 R2 視覚QA第1回(未撮影5画面の網羅撮影と崩れ修正)
- 撮った画面一覧: 撮影専用パラメータ `?simulate=empty`(提案0件)・`?demo=suggest`(検索候補)・`?demo=recent`(最近見た宿)・`?demo=far`(もっと遠くを開いた状態)・`?demo=zoomout`(ズーム不足バナー)を app.js に追加し、mobile/desktop で計10枚+far節を開いた2枚+デグレ確認を撮影。状態Aのデモ中は宿ピンを取りに行かない `demoStateA` 分岐を入れたので、全撮影が外部API 0回で完結した。
- 見つけた崩れと直した内容: (1)候補の絵文字が ♨ だけ文字扱いで幅18px・他は25pxとなり、宿名の左端が行ごとに 93px/100px と波打っていた → `.suggest__icon` を幅24px固定+中央寄せ+絵文字フォント優先にして全行 99px に揃えた(目視でも ♨ が他と同じカラー絵文字になった)。(2)「もっと遠く」の長い施設名で `🚗85分` が「85」と「分」に泣き別れ → `.far__time` を `white-space: nowrap` に。(3)ズーム不足バナーが Leaflet の帰属表示に重なっていた → `.mapnote` の bottom に 20px 足して逃がした。(4)0件カードの見出しが mobile で「でした」だけ2行目に落ちていた → `text-wrap: balance` で2行を均等割りに。(5)カードの「徒歩10分 · 車2分」が折り返し得た → `white-space: nowrap`。パラメータ無しの `?fixture=kusatsu` と素の状態Aはデグレなし(カード30枚・far 0件のまま)。
- 次: 直せなかった3件を ROADMAP 先頭に R2-1(候補ドロップダウンがエリアチップに重なる。どちらを見せるかデザイン判断が要るので朝の相談向き)・R2-2(0件カードの説明文の3行目落ち)・R2-3(fixture の収集半径15kmでは far が構造上必ず0件。実データの far は未確認、R9 の fixture 追加とあわせて)として起票済み。

### 2026-09-16 F1 埋め込みモード `?embed=1`
- やったこと: app.js に `isEmbedFromUrl` / `setEmbed` を新設し、`?embed=1` が `?hotel=` か `?fixture=` と併用されたときだけ `state.embed` と `body.is-embed` を立てる。render() で状態A(検索・チップ・地図)を常に隠し、戻るボタンも `hidden` にする(DOM と goBack は残す)。init() では埋め込み時に `ensureMap()` を呼ばず状態Aの地図を作らない。fixture の読み込みに失敗して通常動作へ落ちる経路では embed を解除し `ensureMap()` し直すので空白画面にならない。style.css 末尾に埋め込み節を追加し、確認用に `demo/embed-check.html` を新規作成。
- 見た目の確認結果: `?fixture=kusatsu&embed=1` の mobile/desktop とも検索欄・チップ・戻るボタンの残骸ゼロで、タイトル+小地図+カードだけが余白なく並ぶ。番号ピンは判読可能、リンクチップの折り返しも欠けなし。`demo/embed-check.html` では 420x720 の iframe 内にきれいに収まり、内容が iframe の縁で切れている(=親ページが二重スクロールしない)ことを確認。`?fixture=kusatsu`(embed無し)は戻るボタンも含め従来どおりでデグレなし。`?embed=1` 単独では通常の状態Aが出るフォールバックも実機確認。
- 次: 計画書08 v3.1 の F2(営業デモページ)。F1 が土台になったので繋げやすい。なお NEXT.md 指定の `body.is-embed .view--feed { max-width: none }` は PC全幅で写真が巨大化したため `720px` に変更した(埋め込み枠が狭いときに中央寄せ余白が出ない目的は満たす)。

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

### 2026-09-16 F2 営業用デモ `demo/hotel-page.html`
- やったこと: 架空の予約サイト「やどたび予約(サンプル)」風の宿ページを新規1ファイルで作成。サンプル注意書き帯・ダミー宿名/評価/写真枠(CSSグラデーションのみ、外部画像なし)/料金表/ダミーCTAボタンに続けて「このお宿のまわり(やどたび)」見出し+`../index.html?fixture=kusatsu&embed=1` の iframe を設置。設置タグ例と営業向け補足3行も追加。assets/・index.html は無変更。
- 見た目の確認結果: mobile(375相当)・desktop・mobileフルページの3枚を撮影して目視。注意書き・宿名・料金表・CTAとも文字崩れなし、写真枠はmobileで横スクロール(潰れなし)、iframe内に草津の小地図・カードが正しく表示され親幅からのはみ出しなし、mobileフルページで横スクロールが出ていないことを確認。
- 次: ROADMAP の次タスク(R2 視覚QAやF3以降)へ。
- 見た目の確認結果: 混雑モード(`?fixture=kusatsu&simulate=overpass504`)の mobile/desktop で番号1〜28がすべて判読可能(修正前は中央に全ピンが積み上がっていた)。宿ピン♨も番号ピンに潜っていない。上下左右の端で切れているピンなし。通常固定モード(`?fixture=kusatsu`)もカード30枚・ピン1〜30判読可でデグレなし。`node --check assets/app.js` 通過、コンソールエラーなし。
- 次: ROADMAP の残タスク(R2 通しQA / R3 公開確認)へ。

### 2026-09-16 R3+R6 本番URL(サブパス)の入口確認と死活チェックスクリプト
- やったこと: `docs/check.mjs` を新規作成(Node標準fetchのみ)。index.html/assets/app.js/geo.js/engine.js/style.css/tokens.css/ui.css/fixtures/kusatsu.jsonの8点をGETし、200・title・kusatsu.jsonのmeta.lat・JS各1000バイト以上を判定して1行1項目でOK/NG出力、失敗時exitCode=1にした。本番URLの `?fixture=`/`?hotel=`/`?q=`/素の状態Aを mobile(+fixtureのみdesktop)で撮影。
- 見た目の確認結果: 5枚ともCSS正常・404由来の崩れなし。素の状態Aは宿ピン取得がOverpass混雑(504)でフォールバックトースト表示のみ(想定内)。fixtureはカード30枚+番号ピン判読可(mobile/desktop共)。hotelはヘッダーが「ちょうしゅくの宿」に変わりサブパスでの`?hotel=`読み取りを確認。qは検索欄に「草津温泉」が入り地図が飛び宿アイコンが表示された。相対パス修正は不要だった。`node docs/check.mjs` は全項目OK・終了コード0。
- 次: ROADMAPの残タスク(R2 通しQA / R5 読み込み体感など)へ。

## 朝の相談(判断が要るもの)

- **検索候補を開いたとき、エリアチップをどうするか(R2-1)**: 候補のドロップダウンは検索欄の真下に出るので、その下にあるエリアチップ行に必ず重なる。いまはチップが候補の背後から半分はみ出して見えていて雑な印象。(a)候補が開いている間はチップを隠す、(b)チップを薄くする、(c)このままでよい、のどれがよいか。実装はどれも数行だが「入力中にチップが消えるのは親切か」という好みの話なので判断を仰ぎたい。

- **小地図のピン位置の「ずらし」をどこまで許すか(R8の設計判断)**: 小地図は密集時にピンを最大96pxまで表示位置だけずらして番号を読めるようにした(R8)。実際の位置との差が出るが、180pxの概観図なので「正確さより見やすさ」を優先した。厳密な位置は Googleマップリンク側に任せる方針でよいか。
