# 夜間ログ(みのるんが朝に読む)

## サイクル記録
- R42 カード要約の `truncate()` を、上限(120字)手前で最後の「。」があればそこで完結させる方式に変更(句点が上限の60%より手前/無いときだけ従来どおり120字+「…」)。engine.js:289付近と定数SUMMARY_SENTENCE_MIN_RATIOを追加、check-engine.mjsに9ケース追加、既存の120字+…ケースは句点なしテキストのため変化なしと確認。
- kusatsu/hakone/dogoをmobileで目視。1位カード(光泉寺「山号は草津山。」/早雲寺「山号は金湯山。」/伊佐爾波神社「旧社格は県社。」)がすべて句点で終わり文の途中切れ無し、地図ピン30個判読可、コンソールエラー0件。
- 次: R2-1(朝の相談待ち)またはfixture再生成不要な軽量タスクを計画役が選定。
- R43 状態Aの宿ピンに宿名ツールチップを追加。app.js:459付近の`renderHotelPins()`で`marker.on('click',...)`直前に`marker.bindTooltip(h.name,{direction:'top',offset:[0,-14],className:'hoteltip'})`を追加し、二重表示を避けるため`L.marker`の`title`オプションを削除(`aria-label`は維持)。タップ即遷移するため開閉はLeaflet既定のhoverのまま(ROADMAP本文の「タップで開く」は不採用、理由をNEXT.mdに明記済み)。撮影用に`?demo=hoteltip`(app.js:1204付近、外部API0回・密集宿6件+長い宿名1件)とscripts/check-hoteltip.mjs(10項目)を新設、check-all.mjsに登録(16本目)。
- `?demo=hoteltip`をmobile/desktopで目視。長い宿名「草津温泉 ホテル紅葉亭」も地図右端で切れず、密集ペアのツールチップも重ならずピン絵文字も隠れていない。check-all.mjsは16本中16本PASS、`?fixture=kusatsu`のカード30枚・番号ピン判読可・コンソールエラー0件でデグレなしを確認。
- 次: R2-1(朝の相談待ち)または残候補(R14/R19/R40/R45/R46)から計画役が選定。
- R45 固定データバッジに生成日付を追加(app.jsにformatFixtureDate()を新設しローカルYYYY-MM-DDで表示、index.htmlに#feed-badge-date、style.cssに.topbar__badge__date)。R46 docs/check.mjsに実バイト数のKB列を追加(content-lengthはgzip圧縮後のためcheckTargetで読んだ本文実体のバイト数で上書き)、末尾に合計サイズ行を追加。
- kusatsu/embed/hakoneをmobileで目視、「固定データ 2026-09-16 取得」が1行に収まり見出しと重ならない・カード30枚判読可・コンソールエラー0件。docs/check.mjsのKB上位3件: fixtures/hakone.json 900.1KB / fixtures/dogo.json 117.1KB / fixtures/kusatsu.json 65.3KB。check-all.mjs 16本全PASS。
- 次: R2-1(朝の相談待ち)または残候補(R14/R19/R40)から計画役が選定。
- R49+R50 文書2本を追加(コード変更なし)。README に「## 判断待ちの設計課題」節(4件・結論なし・NIGHTLOGへの参照付き)と `docs/FIXTURES.md`(新規)を追加。`docs/FIXTURES.md` はエリア表3行・実行コマンド・meta一覧・Overpassのマナー・再生成しない方針・buildOverpassQuery同期注意を記載、README の `fixtures/` 行から相対リンクを追加。
- 画面変更が無いため撮影は省略。`ls docs/FIXTURES.md` で実在確認、`node docs/check.mjs` OK(README画像3本含む既存検査もPASS)、`node scripts/check-all.mjs` 17本中17本PASS・exit 0、`git diff --stat -- assets fixtures scripts index.html demo` は空を確認。
- 次: ROADMAP残りはR14/R19/R23/R28/R31/R32/R33/R34/R40/R42/R43/R51。R49で公開した4件の判断待ちのうち検索候補とチップの重なり(R2-1)含め依然未決。

## 朝のまとめ(2026-09-16 06:10 司令塔が記入)

**朝まで54サイクル・77コミット(11:25時点、ループ継続中)。すべて本番 https://teer-tee.github.io/yadotabi/ に反映済み。コスト0円。**

### 触ってみるURL(スマホでOK)
- 通常: https://teer-tee.github.io/yadotabi/ (地図の宿ピンをタップ、または検索欄に「箱根 ホテル」)
- 固定データ(APIを叩かない確認用): https://teer-tee.github.io/yadotabi/?fixture=kusatsu / ?fixture=hakone
- 埋め込みモード: https://teer-tee.github.io/yadotabi/?fixture=kusatsu&embed=1
- 営業用デモ(予約サイト風の宿ページに埋めた1枚): https://teer-tee.github.io/yadotabi/demo/hotel-page.html

### 夜にやったこと(上から順)
1. R1 固定データモード(撮影・検証を外部APIなしで回せる土台)
2. R7/R8 小地図の番号ピンが重なって隠れる問題を2段階で解消
3. R4 Overpass混雑時に3秒後1回だけ再試行→ダメならWikipediaだけで提案、正直な1行表示
4. R3/R6 本番URLのサブパス動作確認と死活チェックスクリプト
5. F1 埋め込みモード、F2 営業用デモページ(予約サイトに売るための部品)
6. R2 視覚QA: 未撮影5画面を撮れるようにして崩れ5件を修正
7. R9 箱根の固定データ追加(草津以外でも崩れないことを確認)
8. R5 段階描画が実は機能していなかった(両APIを待ってから描いていた)のを修正、最初のカード表示 1.5秒→0.8秒(実API相当)。要約先頭の座標文字列混入も除去
9. F4 エリアチップ20件、R12 OGP(共有時のタイトル・画像)、R13 タップ領域44px等のアクセシビリティ
10. S1 研究ノート09に暫定ランキングの実態を記録 → 有名どころが候補にすら入っていない事実が判明
11. R17 候補収集の取りこぼし修正(OSMのwikipediaタグ活用+重複マージ): 大涌谷171位→79位、彫刻の森137位→87位、光泉寺1位
12. R18 誤併合バグ修正(「天成園足湯」がホテル「天成園」の写真を借りていた等、16組→0組)。テスト103件をリポジトリに取り込み
13. F3 受動ログ(タップ・スクロール到達を端末内に記録、送信なし)
14. R20 Wikipedia周辺検索の50件上限を同心円3段で回避(本番のみ効く)
15. R16 「もっと見る」で31〜60件目を展開
16. R22 リンク切れ検査、R10 番号バッジで小地図のピンが光る、R15 段階描画を撮影で確認できる遅延パラメータ、R23 画像失敗時のフォールバック、R27 地図ライブラリをcdnjsへ、R24 名前なし宿の見出し、R21 README英語
17. R25 GitHub Actionsで本番を毎日死活確認、R26 READMEにスクリーンショット、R29 エリアチップの強調、R30 道後温泉の固定データ、R35 学校・公共施設の除外をOSM側にも適用+神社のカテゴリ誤判定を修正
18. R33+R34 死活チェックに応答時間とREADME画像の検査、R36 全検査を1コマンド化(check-all)、R32 検索候補に「最近見た宿」を統合、R31 小地図にOSMの帰属表示が欠けていた問題を是正(利用規約上の必須事項)
19. R38 Googleマップを「宿からの行き方」リンクに、R41 READMEの現状反映、R39 固定データバッジ、R28 宿0件時の案内、R37 宿ピンタップで中心へ、R11 密集時は小地図を220pxに、R42 要約を句点で切る、R44 宿0件なら自動で1段ズームアウト
20. R43 宿ピンに宿名ツールチップ、R45 固定データに取得日、R46 死活チェックに容量列、R47 「提案の作り方」の正直な注記、R49 READMEに判断待ちの設計課題、R50 固定データ再生成手順の文書、R48 埋め込み時の高さ自動調整
21. R51+R56 リンクチップを「行き方」に短縮し5個を1行に、R52+R53 READMEのパラメータ表修正と埋め込み手順、R54 カードに距離表記、R58 ブラウザの戻るで地図へ
22. R57 画像alt、R59 検索欄の×ボタン、R60 「もっと見る」展開時の注記、R63 状態Aにサンプル導線、R62 縦長写真の見切れを上寄せで解消

### 朝の相談(判断が要るもの、下の節に詳細)
- 検索候補を開いたときエリアチップをどうするか(隠す/薄くする/そのまま)
- **カテゴリ多様性の減点が青天井で、有名どころ(大涌谷・彫刻の森)ほど不利になる逆転が起きている**。rankの設計思想なので夜は触らなかった。上限を設ける/Wikipedia紐づけは免除/このまま
- 実APIと固定データでWikipedia件数が食い違う(50件 vs 34件)。深追いするか
- 小地図のピンを見やすさ優先で最大96pxずらしている方針でよいか

### 正直に書いておくこと
- 自動ループの監視役は独立AIではなく司令塔セッション内の監視機構(cron登録が安全判定で止められたため)。セッションを閉じると止まる
- 作業役が「撮影して目視した」と報告したのに画像が保存されていないケースが2回あり、司令塔が撮り直して確認した
- 計画役・作業役が前サイクルの記録の誤り(「座標欠落」等)を実測で訂正したケースが3回。記録は事実ベースに直してある


## R33+R34 check.mjs に応答時間の記録とREADME画像のリンク検査を追加(2026-09-16)
- やったこと: 3か所のfetch(index等の死活チェック・HTMLリンク検査・README.md用に新設したcollectMarkdownLinks)を`timedFetch`ヘルパ経由に統一し各成功行にmsを併記、末尾に「合計件数/総計ms/平均ms/最遅項目」を出すようにした。README.mdは本番URLで実際にGET 200が返ることを確認できたのでローカルfsではなく本番URLからGETして`<img src="...">`と`![](...)`を抽出しcheckLinkに流す方式にした。閾値判定は追加していない(hasFailureはreport()のok=falseのときのみ)。
- 見た目の確認結果: 画面変更なしのため撮影省略。`node docs/check.mjs`で全28件OK・exit 0を確認、README.md → state-a.jpg/state-b.jpg/embed.jpgの3行もOK。壊れたパスへのHEADが404になりNG分岐に入ることを別途確認済み(check.mjs本体は壊していない)。
- 次: 残候補(R11/R14/R19/R31/R32)から次サイクルで選定。

## R35 観光対象でない候補の除外をOSM側にも適用 + 社寺カテゴリ誤判定の修正(2026-09-16)
- やったこと: 根本原因の確認 —— `isExcludedArticle` は wiki 側(engine.js)でしか呼ばれておらず **OSM 側 `buildOsmItems` は名前チェックだけで素通し**だった(計画役の見立てどおり)。判定を `isExcludedName(name)`(名前のみ・OSM/wiki 共通)と `isExcludedArticle(title, extract)` に分け、OSM 側にも適用。除外語を拡充(停留場・信号場・学校・幼稚園・保育園・病院・医院・診療所・市役所/町役場/県庁・気象台・保健所・工場・変電所・浄水場・銀行/支店・団地・墓地・特別支援学校・青少年センター 等)、誤爆防止に**末尾一致の保護リスト**(記念館・資料館・美術館・博物館・ミュージアム・道の駅・公園・庭園・動物園・水族館・神社・神宮・大社・寺・城・温泉・滝・展望台・史跡・遺跡・記念碑)を**除外より先に**評価。あわせて `geo.js` の `detectCategory` に名前を渡し、名前が社寺で終わるものはタグの評価順より優先して `place_of_worship` にした。rank の重み・閾値・Overpass クエリ・fixtures は一切触っていない。
- 見た目の確認結果: `?fixture=dogo` mobile で **1位「伊佐爾波神社」のカテゴリ行が「記念碑」→「神社・寺院」**に修正(2位「湯神社」も同様)。`?fixture=kusatsu`(1位 光泉寺)・`?fixture=hakone`(1位 早雲寺)mobile ともデグレなし。3枚とも番号ピン1〜30判読可・カード30枚・文字崩れ/重なり/はみ出しなし・コンソールエラー0件。hakone の石垣山は「山頂」のまま、各寺社も「神社・寺院」のままで壊れていない。テストは10本全緑(check-engine 153 pass / check-geo 50 pass、うち R35 の新規ケースは engine 62件・geo 6件)。
- 次: 落ちた候補は3エリア合計10件で、**全件を目視して観光対象の誤爆ゼロ**を確認(下表)。残候補(R28/R31/R32/R33/R34)から次サイクルで選定。

### R35 で落ちた候補の全件(before→after の差分・3エリア計10件)
| エリア | 落ちた候補 | source | 落とした理由 | 判断 |
|---|---|---|---|---|
| kusatsu | ジェイアールバス関東長野原支店 | wiki | 末尾「支店」 | 妥当(バス営業所) |
| hakone | 出山信号場 | wiki | 末尾「信号場」 | 妥当(旅客扱いのない鉄道設備) |
| hakone | 上大平台信号場 | wiki | 末尾「信号場」 | 妥当(同上) |
| hakone | 仙人台信号場 | wiki | 末尾「信号場」 | 妥当(同上) |
| dogo | 愛媛大学教育学部附属特別支援学校 | wiki | 「特別支援学校」を含む | 妥当(本タスクの発端) |
| dogo | 松山地方気象台 | wiki | 末尾「気象台」 | 妥当(官署) |
| dogo | 松山市青少年センター | wiki | 「青少年センター」を含む | 妥当(社会教育施設) |
| dogo | 道後公園停留場 | wiki | 末尾「停留場」 | 妥当(路面電車の電停。道後公園そのものは9位に残っている) |
| dogo | 南町停留場 | wiki | 末尾「停留場」 | 妥当(同上) |
| dogo | 平和通一丁目停留場 | wiki | 末尾「停留場」 | 妥当(同上) |

- 保護した誤爆例: **「愛媛大学ミュージアム」は残した**(末尾が保護語「ミュージアム」)。大学の研究展示施設だが一般観覧できる観光対象であり、NEXT.md の推奨どおり残す判断。**「箱根湯寮」**は最初 `寮` を除外語に入れたため落ちてしまったので、目視で誤爆と判断して `寮` を除外語から外した(日帰り温泉施設。この1件のために末尾「寮」は使わない)。
- 副作用が1件: dogo の「義安寺」が cards+more(60件)の枠から外れた(rank 61位→66位)。除外されたのではなく、伊佐爾波神社・湯神社が正しく「神社・寺院」に変わったぶん社寺カテゴリの多様性減点が増えて順位が下がったため。rank の重みは触っていないので、これは既存の多様性ルールが正しく働いた結果。

## R30 fixture 3エリア目「道後温泉」追加(2026-09-16)
- やったこと: `scripts/make-fixture.mjs` の `AREAS` に `dogo`(lat 33.8520, lon 132.7860, osmRadiusM既定15000)を追加し `node scripts/make-fixture.mjs dogo` で1回だけ生成(Overpass 463件・Wikipedia 50件、429/504なし)。`docs/check.mjs` の TARGETS に `fixtures/dogo.json` を追加し、fixture判定条件を `path.startsWith('fixtures/')` に一般化。
- 見た目の確認結果: `?fixture=dogo` mobile/desktopとも文字崩れ・重なり・はみ出しなし、番号ピン1〜30判読可、ヘッダー「道後温泉(固定データ)」表示OK。`?fixture=kusatsu` mobileにデグレなし。カードは30枚描画(上位: 伊佐爾波神社・湯神社・子規記念博物館)。市街地特有の問題として愛媛大学附属特別支援学校など教育・公共施設が上位30件に混入、farは0件(草津と同傾向)。09研究ノートに観察を追記済み。
- 次: R28(0件時案内バナー)/R31(attribution重なり)/R32(検索候補統合)/R33(応答時間記録)/R34(README画像リンク検査)から選定。

## R25 GitHub Actions 毎日死活チェック(2026-09-16)
- やったこと: `.github/workflows/check.yml` を新規作成。`schedule`(UTC21:30=JST翌朝6:30頃)・`workflow_dispatch`・`push(main)` の3トリガーで `node docs/check.mjs` を実行。依存インストール不要のため setup-node のみ、`permissions: contents: read`・`timeout-minutes: 5` で最小権限。
- 見た目の確認結果: 画面変更なしのため撮影省略。ローカルで `node docs/check.mjs` は全項目OK・exit 0、YAML はタブなし・パース成功を確認。
- Actions実行結果: push トリガー(run 35028019952)・workflow_dispatch 手動実行(run 35028055000)ともに `completed success`(緑)。赤い実行なし。
- 次: 残候補(R11/R14/R19/R21/R26/R27)から次サイクルで選定。

## R23 カード画像フォールバック(2026-09-16)
- やったこと: Wikipediaサムネ画像が404等で読めないとき、`error`イベント委譲(capture=true)で画像なしカードと同じカテゴリ絵文字プレースホルダに差し替えるよう実装。`?demo=imgfail`で先頭3枚を強制失敗させて撮影確認できるようにした。
- 見た目の確認結果: `?fixture=kusatsu&demo=imgfail`で先頭3枚が淡いグラデーション+絵文字(鳥居等)になり番号バッジ1・2・3も健在、4枚目以降は写真のまま。フラグ無しはデグレなし(30枚・写真そのまま)。check-imgfail.mjs 13項目全PASS、既存テスト(check-more/pinflash/passive/a11y/engine)も全緑。
- 次: 残候補(R11/R14/R19/R21/R24〜R27)から次サイクルで選定。

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

### 2026-09-16 R5 読み込み体感の計測と短縮(+F5・要約先頭の座標除去)
- やったこと: app.js に `?perf=1` 専用の計測(`stage:osm`/`stage:wiki`/`stage:done`/`first-card-painted` を console と画面最下部の固定行に出す。パラメータが無ければ即returnで通常動作は不変)を追加。engine.js の `collect()` が `Promise.allSettled` で OSM と Wikipedia の**両方**を待ってから "osm" 段を呼んでいた(=段階描画が名前だけで機能していなかった)ので、OSM の Promise に個別に `.then()` を付け、OSM が解決した時点で "osm" 段を先に1回だけ発火する形に組み替えた(allSettled 側のエラー処理・osmFailed 判定はそのまま)。あわせて Wikipedia extract 先頭の座標表記(「北緯35度13分48.3秒 東経139度6分13.2秒 …」)を落とす `stripCoordPrefix()` を truncate の前に挟んだ(除去後に空になる記事は元のまま返す安全側)。
- 見た目の確認結果(計測値): 実API相当の遅延(OSM 800ms / Wiki 1500ms)を入れた A/B で、最初のカードが **before 1535ms → after 834ms(−701ms、46%短縮)**、osm段とdone段の差は **104ms → 768ms** となり段階描画が実際に効くようになった(Overpass 側が遅い場合は原理的に短縮不可で 2521→2527ms と変化なし、これは正しい挙動)。fixture 計測は kusatsu が first-card-painted 14ms、hakone が 66ms でいずれも目標1000msを大きく下回る。箱根カード1枚目(早雲寺)の要約が「早雲寺（そううんじ）は、神奈川県足柄下郡箱根町湯本にある、臨済宗大徳寺派の寺院。山号は金湯山。」から始まることを撮影画像で目視確認(座標表記が消え120字が本文で埋まった)。kusatsu/hakone の mobile・hakone の desktop・混雑フォールバック(`simulate=overpass504`)の4枚でカード30枚・番号ピン1〜30・リンクチップにデグレなし、コンソールエラー0件。既存テスト(check-engine.mjs)80件 + 今回追加の段階発火/座標除去テスト15件が全て緑。半径15kmは far の件数が痩せるため変更していない。
- 次: ROADMAP の残り(F3 受動ログ / F4 エリアチップ拡充 / R10・R11 の小改善)へ。R2-1 と R2-2 は朝の相談待ち。

### 2026-09-16 F4 エリアチップ20件拡充+右端フェード / R2-2 0件カード文言短縮
- やったこと: `AREAS` を8件→20件(登別・定山渓・銀山・鬼怒川・日光・草津・伊香保・軽井沢・箱根・熱海・修善寺・下呂・有馬・城崎・白浜・道後・別府・由布院・黒川・指宿。座標は直書き、既存8件のラベル・座標は無変更)に拡充し北から南の地理順に並べた。`.chips` に `mask-image` で右端24pxのフェードを追加(構造は無変更、既存の横スクロールに乗せるだけ)。0件カードの説明文を「データが少ないエリアのようです。地図で直接探してみてください。」→「この辺りはデータが少なめです。地図で直接探せます。」に短縮した。
- 見た目の確認結果: `?demo=zoomout` の mobile/desktop でチップ全20件が横1行に並び、文字切れ・改行なし、右端にフェードが見える(desktopは`.chips{max-width:560px}`配下でも同様に機能)。`?fixture=kusatsu&simulate=empty` の mobile で説明文が2行に収まった。`?fixture=kusatsu`/`?fixture=hakone` の mobile はカード30枚・番号ピン判読可でデグレなし。`node --check assets/app.js` 通過、コンソールエラー0件。
- 次: ROADMAP の残り(F3 受動ログ / R10・R11 の小改善)へ。R2-1 は朝の相談待ち。

### 2026-09-16 R36 `scripts/check-all.mjs`(全検査を1コマンドで直列実行)
- やったこと: 新規 `scripts/check-all.mjs` を作成。`node:child_process` の `spawnSync` のみで既存 `check-*.mjs` 10本 + `docs/check.mjs` を明示リストの順に直列実行し、各本の PASS/FAIL と所要msを表で出力、1本でも FAIL なら `process.exitCode=1` にした(既存 check 本体は無編集)。README に「開発者向け」節、`docs/AUTOPILOT.md` のサイクル手順に検証項目を1行ずつ追記。
- 見た目の確認結果: 画面変更なしのため撮影省略。11本全PASSの表を目視、意図的に1本を存在しないパスへ差し替えて FAIL+exit 1 を確認後、元に戻して再度全PASS+exit 0 を確認した。
- 次: `node scripts/check-all.mjs`(合計約54秒)を以後の全サイクルの完了条件にする。ROADMAP残りはR11/R14/R19/R23/R28/R31/R32/R33/R34。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R37 小地図の宿ピンをタップでpanTo / R11 小地図高さ180→220px(採用)
- やったこと: `renderFeedMap()` の宿マーカーに `hm.on('click', ...)` を足し `feedMap.panTo([hotel.lat, hotel.lon])`(ズーム不変・scrollIntoViewなし)。`check-pinflash.mjs` に宿ピン存在/中心寄り20px以内/ズーム段不変の3ケースを追加。R11 は `.feedmap`(180px)を kusatsu/hakone/dogo(いずれも cards=30)で 180px/220px 撮り比べ、220px の方が番号ピンの重なりが緩和(特に箱根)しカード1枚目の視認性低下も無いため**採用**。`.feedmap--tall{height:220px}` を追加し `renderFeedMap()` 冒頭で `cards.length>=25` の時のみ付与。
- 見た目の確認結果: kusatsu/hakone/dogo mobile の180px/220px計6枚をRead目視、文字崩れ・重なり悪化なし。R37は宿ピンクリック前後の中心移動を機械検査で確認済み。`node scripts/check-all.mjs` 14本全PASS(exit 0)。
- 次: ROADMAP残りはR14/R19/R23/R28/R31/R32/R33/R34/R40/R42/R43/R44。

### 2026-09-16 R44 `?q=`等ジャンプ後に宿0件なら1回だけ自動ズームアウト
- やったこと: `flyTo()` 直前に「1回だけ引いてよい」券(`autoZoomArmed`)を立て、`loadHotelsInView()` の0件分岐で券があれば下限13を割らない範囲で1段引いて再取得(使ったら即falseに戻す・ドラッグ由来では立てない・混雑時は発動しない)。`setZoom` が発火させる `moveend` の二重取得を防ぐ `suppressNextMoveEnd` も追加。`?demo=autozoom`(外部APIなしで1回目0件→自動ズーム→2回目宿1件を再現)を新設し `scripts/check-autozoom.mjs`(16項目)を追加、`check-all.mjs` に登録(15本)。
- 見た目の確認結果: `?demo=autozoom` mobileは自動ズーム後の地図に宿アイコンが中心に表示されバナー消灯、`?demo=zoomout` mobileは従来どおりバナー表示のままでデグレなし。文字崩れ・重なりなし。
- 次: ROADMAP残りはR14/R19/R23/R28/R31/R32/R33/R34/R40/R42/R43。

### 2026-09-16 R51 リンクチップのラベル短縮「Googleマップ」→「行き方」
- やったこと: `?fixture=kusatsu` mobile で1位カード「光泉寺」を A(現状)/B(ラベル短縮のみ)/C(Bに加え公式を先頭)の3案で撮り比べ。A/B/Cいずれも「4個+YouTube1個だけ2行目」のままで、ラベル短縮・順序変更だけでは5個は1行に収まらなかった(チップの合計幅が主因)。`Googleマップ`→`行き方` はR38の経路リンク化とラベルの意味が一致するため、折り返し解消が無くてもB(順序は現状維持・ラベルのみ短縮)を採用した。Cは公式優先の仮説検証だが折り返し改善が無く、NEXT.mdの方針どおり不採用。
- 見た目の確認結果: r51-A/B/C全3枚と、デグレ確認のhakone mobile(4個で1行収容)・kusatsu embed=1 mobileをRead目視。文字崩れ・チップはみ出し・タップ領域の重なりなし。`node scripts/check-a11y.mjs` 全件OK、`node scripts/check-all.mjs` 18本中18本PASS。
- 次: 折り返し自体を解消したい場合はチップのフォントサイズ縮小かpaddingの見直しが必要(今回はラベル文言変更のみに留めた)。ROADMAP残りはR14/R19/R23/R28/R31/R32/R33/R34/R40/R42/R43/R52〜R55。

### 2026-09-16 R54 フィードカードの times に距離(m/km)を追加
- やったこと: `app.js`に純粋関数`distanceText(m)`を新設(1000m未満は整数m、1000m以上10000m未満は小数第1位km・整数kmなら小数点省略、10000m以上は整数km)。`cardHtml()`の`.feedcard__times`末尾に`card.distanceM`から生成した距離を` · `区切りで追加(空文字なら区切りごと非表示)。`engine.js`は未変更。
- テストと目視: 新規`scripts/check-distance.mjs`(10項目、m/km切替と375pxはみ出し0件を確認)を`check-all.mjs`に登録、19本中19本PASS。`node --check assets/app.js`OK。`?fixture=kusatsu`(1位「光泉寺」108m)/`hakone`(1位「早雲寺」383m)/`hakone&demo=far`をmobileでRead目視し、1行に収まり文字崩れ・重なりなし。
- コミットとpush: これから実施。
- 懸念: なし。

- **検索候補を開いたとき、エリアチップをどうするか(R2-1)**: 候補のドロップダウンは検索欄の真下に出るので、その下にあるエリアチップ行に必ず重なる。いまはチップが候補の背後から半分はみ出して見えていて雑な印象。(a)候補が開いている間はチップを隠す、(b)チップを薄くする、(c)このままでよい、のどれがよいか。実装はどれも数行だが「入力中にチップが消えるのは親切か」という好みの話なので判断を仰ぎたい。

- **カテゴリ多様性の減点が「その土地の代表的な名所」を締め出している(R17で判明・要判断)**: 箱根では attraction 118件・museum 109件が競合し、減点 `18×(n-2)` が上限なく積み上がる。その結果 大涌谷(−72)・彫刻の森美術館(−108)が、距離加点や2ソース一致(+20)を全て打ち消されて30枚に入らない。近場の無名スポットが先にカテゴリ枠を占めるため、**有名どころほど不利になる**という逆転が起きている。(a)減点に上限を設ける (b)Wikipedia紐づけのあるものは減点を免除する (c)このままでよい(「認知外を出す」狙い通りとみなす)、のどれか。rank の設計思想そのものに関わるため R17 では触っていない。

- **実APIとfixtureのWikipedia件数が食い違う(R20で判明・要判断)**: 同じ中心(箱根湯本 35.2323,139.1069)・同じ半径10kmで、`fixtures/hakone.json` は **wiki 50件・最遠3,720m**を持つのに、R20 修正後の実API実測は **34件・最遠3,574m** だった。実APIの10kmリング単独応答が ggslimit=50 に届いていないので、**「50件上限で打ち切られている」という R17/S1 の前提が現在は再現しない**(=R20 の同心円分割は正しく動くが、この中心では増える余地が無い)。大涌谷(7.6km)・彫刻の森(5.2km)が geosearch に出てこない真因は半径ではなく別にある。(a)fixture を再生成して実APIに合わせる(Overpass も叩き直すことになる) (b)真因調査(座標の持ち方・geosearch のインデックス)に1サイクル使う (c)R18 の「OSMの wikipedia タグ直接利用」で both 化できているので深追いしない、のどれか。個人的には (c) で実害が小さいと見ている。

- **小地図のピン位置の「ずらし」をどこまで許すか(R8の設計判断)**: 小地図は密集時にピンを最大96pxまで表示位置だけずらして番号を読めるようにした(R8)。実際の位置との差が出るが、180pxの概観図なので「正確さより見やすさ」を優先した。厳密な位置は Googleマップリンク側に任せる方針でよいか。

### 2026-09-16 R12 OGPメタタグ追加
- やったこと: index.html の head に og:title/description/type/url/image(+width/height/alt)/site_name と twitter:card(summary_large_image) + canonical を追加。og:image は `?fixture=kusatsu` を1200x630のビューポートで撮影しJPEG品質78で書き出した `docs/og.jpg`(約75KB、絶対URL)。
- 見た目の確認結果: `?fixture=kusatsu` の mobile 撮影でヘッダー「草津温泉(固定データ)」・地図ピン30件・カード表示に変化なし、コンソールエラー0件(head追記のみで見た目は不変)。
- 次: push後の本番curl確認をこのあと追記。R2-1(検索候補とチップの重なり)は朝の相談で保留中。
- 本番確認: push後、`curl https://teer-tee.github.io/yadotabi/ | grep og:` で og:type/site_name/title/description/url/image/image:width/height/altの9行がヒット。`curl -w "%{http_code} %{size_download}"` で og.jpg は `200 76741`(75KB、200KB以下)。`node docs/check.mjs` は全項目 [OK]、exit code 0。

### 2026-09-16 R13 アクセシビリティ最低限(タップ44px/aria/フォーカス/reduced-motion)
- やったこと: `.topbar__back` を36→44px、`.chip` に `min-height:44px`(padding不変)、`.feedcard__link` は見た目を太らせたくないので `::after` 疑似要素で当たり判定だけ44pxに広げる方式を選択(理由: リンクチップの視覚サイズを保ちR2の版組を崩さないため)、`gap` を `10px 8px` に。`.far__item a` は `min-height:44px` の inline-flex。番号ピン/宿ピンに `role="img" aria-label`、`#map`/`#feed-map` に `role="region" aria-label`、`#feed-status` に `role="status" aria-live="polite"` を追加。フォーカスリングを `.chip`等6セレクタで `outline:2px solid` に強調、`prefers-reduced-motion` でアニメ/トランジションを全体無効化。地図ピンは24px維持(密集分離への影響回避、方針通り)。
- check-a11y結果(before→after、375px幅・Playwright実測): 戻るボタン 36→44px OK、エリアチップ 31〜32→44px OK、リンクチップ(判定領域) 28〜29→44px OK、検索候補71.9px OK(無変更)、もっと遠くの開閉46.1px OK(無変更)、もっと遠くの各行 22→44px OK。4画面×6セレクタで全件OK、exitCode 0。コントラストは再計算し表の数値と一致、4.5:1未満の色は増やしていない(faintは対象外のまま)。
- 見た目の確認結果: `?fixture=kusatsu`/`?demo=zoomout`/`?fixture=hakone&demo=far`/`?fixture=kusatsu&embed=1` のmobile撮影を目視、カード30枚・番号ピン1〜30判読可・リンクチップ折り返し崩れなし・チップ行と検索欄の間延びなし・「もっと遠く」10件の間延びも許容範囲、コンソールエラー0件。
- 次: R2-1(検索候補とチップの重なり)は朝の相談で保留中。ROADMAP残りはR10/R11/R14/R15/R16。

### 2026-09-16 S1 v3暫定rankの実測(草津/箱根)
- やったこと: `scripts/dump-rank.mjs` を新規作成(Playwrightで`?fixture=<area>`を開き`YadoEngine.collect→rank→present`をそのまま呼ぶ方式、check-a11y.mjsの前例に合わせた)。草津・箱根それぞれ上位30件+far10件をmarkdown表で出力し、09_研究ノートに生データと観察を追記。engine.js/geo.jsは無変更。
- 観察できた事実: 草津・箱根とも上位10件はWikipedia要約ありが10件中10件。草津の「湯畑」は26位(要約・画像なし)。箱根fixtureに「大涌谷」のOSM要素はあるが座標(lat/lon)が欠落しておりcollect段階で除外され候補にすら入らない。彫刻の森美術館(距離5.1km)もWikipedia記事なしで圏外。
- 次: ROADMAP残りのR10/R11/R14/R15/R16(コード改修系)。R2-1(検索候補とチップの重なり)は朝の相談で保留中。

### 2026-09-16 R17 候補収集の取りこぼし調査と修正
- やったこと: 3件が collect のどこで落ちるかを scratchpad の使い捨てスクリプトで1段ずつ追跡した結果、**3件とも collect を生き残っており「落ちていない」ことが判明**(NEXT.md の分類漏れ・タグ列挙不足の仮説はいずれも否定。現行の Overpass クエリでも `tourism=attraction`/`museum` で3件とも取得可能)。真の取りこぼしは別で、(1) OSM 要素が持つ `wikipedia`/`wikidata` タグを engine.js が一切使っておらず、geosearch 50件(箱根は 3.7km で頭打ち)の外にある大涌谷・彫刻の森が `source=osm` 単独に留まっていた → `fromOsmSpot` でタグを運び、突き合わせ失敗時も `both` として扱うようにした。(2) 同一地点が表記違いの別要素に割れていた(湯畑 relation と湯畑源泉 node が 20m 差、光泉寺と草津山 光泉寺 など) → `mergeOsmDuplicates()` を新設し `isSamePlace` で寄せ、代表名は短い方(=一般に通る呼び名)を残す方式にした。`rank()`/`baseScore()`/重み・閾値・カテゴリ多様性ルールは一切変更していない。geo.js も変更なし。
- 見た目の確認結果: `?fixture=kusatsu`/`?fixture=hakone` の mobile 2枚を目視。カード30枚・番号ピン1〜30判読可・リンクチップの折り返し崩れなし・コンソールエラー0件でデグレなし。草津は重複マージにより「光泉寺」が写真+要約+公式サイト付きで1位に浮上、箱根は both が 8→13件に増えた。既存テスト check-engine.mjs 80件全 pass、`node --check assets/engine.js`/`assets/geo.js` 通過。
- 次: 大涌谷(#171→#79)・彫刻の森(#137→#87)は both 化で大きく改善したが30枚には届かず。原因は**カテゴリ多様性減点**(箱根は attraction 118件・museum 109件が競合し、減点が大涌谷 −72/彫刻の森 −108 と距離減衰や加点を圧倒する)で、これは rank 側の設計判断のため R17 の変更禁止範囲。朝の相談に起票した。

#### R17 before→after 順位差分
| 対象 | before | after | source | 備考 |
|---|---|---|---|---|
| 湯畑(草津) | 26位 osm | 26位 osm | 変化なし | wikipedia/wikidata タグ無し+geosearch 50件に記事無しで both 化不可(下記) |
| 大涌谷(箱根) | 圏外(全体171位) | 圏外(全体79位) | osm→**both** | 92位上昇。30枚到達はカテゴリ減点により不可 |
| 彫刻の森美術館(箱根) | 圏外(全体137位) | 圏外(全体87位) | osm→**both** | 50位上昇。同上 |
| 光泉寺(草津) | 20位 osm | **1位 both** | osm→both | 「草津山 光泉寺」との重複マージで写真・要約・公式サイトが1枚に集約 |
| 石垣山(箱根) | 6位 both | 6位 both | 変化なし | 石垣山城/石垣山一夜城/史跡 石垣山 を1件に集約(カード枠の節約) |

- source別件数の変化: 草津 both 7→9件 / 箱根 both 8→13件、osm単独 箱根 9→5件。

### 2026-09-16 R18 誤併合の修正(名前の包含だけで別施設を同一視しない)
- やったこと: fixture 全ペアを洗い出す使い捨てスクリプトで「一方が他方を包含かつ150m以内」の組を全列挙した結果、**草津4件+箱根160件=164組**が併合対象で、うち**16組(草津2・箱根14)が誤併合**だった。`engine.js` に `FACILITY_DIFF_WORDS`(差分が敷地内の別施設=別物)と `FACILITY_TAIL_WORDS`(後片の末尾に来たときだけ効く語)を定数として追加し、`isSamePlace()` の最終判定を「包含が成立しても差分が施設語なら別物」に厳格化した(`diffLooksLikeFacility()`)。差分は `normalizeName` 済み(長音「ー」が落ちる)なので語リストも同じ正規化を通してから比較している。`rank()`/重み・閾値・カテゴリ多様性・fixture・geo.js は一切変更していない。**なお NEXT.md が挙げた「草津温泉バスターミナルが草津温泉の写真を継承」は事実誤認**で、実際はバスターミナル自身の Wikipedia 記事(専用の写真・要約あり)だった。真の実害は箱根の「天成園足湯 (天の足湯)」が温泉ホテル「天成園」の記事・写真を継承して2位に居座っていた件。加えて `scripts/check-engine.mjs` と `scripts/check-r5.mjs` を scratchpad からリポジトリに取り込んだ(パスをリポジトリ相対に変更)。
- 見た目の確認結果: 誤併合 **16組 → 0組**(妥当な併合は 148組すべて維持: 湯畑源泉→湯畑、草津山 光泉寺→光泉寺、石垣山城/一夜城/史跡→石垣山、寺社の本堂・庫裡・社殿、小田原市郷土文化館分館 松永記念館)。dump-rank は**草津は差分ゼロ**、箱根は「天成園足湯」が圏外に落ち、代わりに正しい記事「天成園」が9位に出現(残りはその玉突きで1つずつ繰り上がり+かっぱ天国25位・小田原フラワーガーデン圏外)。`?fixture=kusatsu`/`?fixture=hakone` の mobile を目視、カード30枚・番号ピン1〜30判読可・チップ折り返し崩れなし・コンソールエラー0件。`node scripts/check-engine.mjs` は誤併合テスト23件を追加して **103件全 pass**(80→103)、`check-r5.mjs` 15件 pass、`node --check assets/engine.js` 通過。
- 次: ROADMAP 残りの見た目改善 R10/R11/R14/R15/R16。朝の相談に「カテゴリ多様性減点(大涌谷・彫刻の森が30枚に届かない)」が未決で溜まっている。

### 2026-09-16 F3 受動ログ(localStorage yado.passive.v1・送信なし)
- やったこと: `passivePush(type, data)` を新設し(既存 `lsGet`/`lsSet` 経由・上限200件でローテーション)、`view`(表示した宿+上位10カードID、`done` の1回だけ)・`tap`(カード本体タップ)・`link`(カード内リンクタップ、`.far` 側は対象外)・`seen`(IntersectionObserver+1秒debounceでスクロール最大到達位置)の4種を記録。`?demo=passive` で画面下部に直近10件のログボックスを表示する専用UIを追加(通常時は一切生成されない)。`docs/passive-log.md` に形式・目的・収集しないものを明記。`scripts/check-passive.mjs` を新設し check-a11y.mjs の作りを踏襲。
- 見た目の確認結果: `?fixture=kusatsu&demo=passive` mobile を目視、ログボックスに `view`/`seen` レコードが読め、カード・小地図・番号ピンの崩れなし。`?fixture=kusatsu`(フラグ無し)mobile はログボックスが一切出ずカード30枚のままでデグレなし。`node scripts/check-passive.mjs` 9項目全OK(view1件・topIds10件・seen到達・linkのcardId一致・上限200件・localStorage封じでもカード30枚&コンソールエラー0件)。`node scripts/check-engine.mjs` 103件、`check-r5.mjs` 15件、`check-a11y.mjs` 全OK、`node --check assets/app.js` 通過。
- 次: F3はデータを溜めるだけで学習ロジックは未着手。ROADMAP 残りの R10/R11/R14/R15/R16(見た目の小改善)が次候補。

### 2026-09-16 R20 Wikipedia geosearch の50件上限を同心円3段で回避
- やったこと: `geo.js` の `fetchWikiNearby` を「同じ中心・半径 3/6/10km で geosearch を引き、pageid をキーにした1つの器(`pages`)へマージして重複排除する」形に組み替えた(`WIKI_NEARBY_RING_RADII_M`・`WIKI_NEARBY_MAX_CALLS=4` を追加、`baseParams(r)` 化)。**実API1回で退行を検知**: 素直に「半径ごとに continue を追い切る」構造にすると、近い半径の continue だけで4回の上限を使い切り、10km リングが一度も引かれず箱根で**32件・最遠2971m**しか取れなかった。そこで**1周目は全リングを1回ずつ引き(continue より優先)、余った回数で2周目に continue を追う**2段構成に直した。fixture 分岐は半径ループの手前で従来の1回処理へ逃がし、キャッシュキー・TTL・`articles` の組み立て・距離ソート・`engine.js`・fixtures は無変更。
- 見た目の確認結果: `?fixture=kusatsu`/`?fixture=hakone` の mobile を目視、カード30枚・番号ピン1〜30判読可・リンクチップの折り返し崩れなし・コンソールエラー0件で変更前と同一。`node scripts/dump-rank.mjs kusatsu`/`hakone` は**どちらも差分ゼロ**(fixture 経路が無傷である証明)。新設した `node scripts/check-geo.mjs` は vm サンドボックス+fetch モックで **28件全 pass**(100件への重複排除・呼び出し4回上限・全リング1回優先・重複排除・一部失敗の許容と全滅時 throw・fixture で外部fetch 0回・radius=5000 の既定経路)。`check-engine.mjs` 103件、`check-r5.mjs` 15件、`check-passive.mjs`/`check-a11y.mjs`/`docs/check.mjs` 全OK、`node --check assets/geo.js` 通過。
- **修正後実測**(司令塔の許可で実API 1回追加、`WIKI_NEARBY_MAX_CALLS` を 4→**6** に引き上げ後): 箱根 35.2323,139.1069 で **34件・最遠3,574m「早川駅」・extract充足率 34/34 = 100%(上位30件も30/30)・実fetch 6回**。**大涌谷・彫刻の森は入らなかった**。ただし**これは50件上限による打ち切りではない**: 10kmリング単独の応答が ggslimit=50 に届かず34件で終わっているため、今日の ja.wikipedia にはこの中心から10km以内に座標付き記事が34件しか無い、という意味になる。同心円の仕組み自体は正しく動いており(3リングへ ggsradius=3000/6000/10000 が別々に飛ぶことを確認済み)、**取れるものは取り切った**状態。
- **要注意の発見**: 同じ中心・同じ10kmで作った `fixtures/hakone.json` は **wiki 50件・最遠3,720m** を持っている(生成 2026-09-15)。実APIの34件と食い違うので、**50件上限が原因という R17/S1 の前提自体が現在は再現しない**。大涌谷(7.6km)・彫刻の森(5.2km)が入らない理由は「半径の打ち切り」ではなく別要因(記事の座標がこの中心から10km圏外、もしくは geosearch のインデックス差)である可能性が高い。R18 で入れた「OSMの wikipedia タグを直接使う」経路がこの2件を both 化する本命のままなので、実害は小さい。
- 次: R19(far 分布の是正)。**朝の相談**に「実APIとfixtureのwiki件数が50 vs 34で食い違う。fixture再生成の要否と、大涌谷/彫刻の森が10km geosearch に出てこない真因の調査をどこまでやるか」を追加したい。

### 2026-09-16 R16 カードの「もっと見る」(31〜60件目の展開)
- やったこと: `engine.js` の `present()` に `MAX_MORE=30` を追加し、戻り値へ `more: cards.slice(30, 60)` を足した(既存の `cards`/`far` の計算式は無変更、diffは追加行のみで `rank()`/重み/閾値/カテゴリ多様性は無傷)。`app.js` に `state.more`/`state.moreOpen` を追加し、`moreHtml()` 新設(未展開時のみ `#more-btn` を出す)、`renderFeed()` で展開時に `state.more` を通し番号(31〜)で連結、`els.feedMore` へのクリック委譲で `moreOpen=true` にして再描画するだけ(外部API呼び出し無し)。`index.html` に `#feed-more` を feed-list と feed-far の間に追加、`style.css` に `.morebtn`(min-height 44px、既存トークン流用)を追加。
- 見た目の確認結果: `?fixture=kusatsu` mobile を展開前(カード30枚+「もっと見る（残り30件）」がfarの上に1行、崩れなし)/展開後(31〜60件目が続き番号バッジ31,32…と連番、ボタン消滅、崩れなし)の両方をReadで目視しOK。`?fixture=hakone` mobile はデグレなし(カード30枚・ピン1〜30)、`?fixture=kusatsu&embed=1` も破綻なし。
- テスト: `node scripts/check-engine.mjs` 111件全pass(moreケース7件追加)、新設`node scripts/check-more.mjs` 6件全pass(Playwrightでclick→31枚目バッジ確認・ボタン消滅・コンソールエラー0件)、`check-a11y.mjs`(.morebtn追加)全OK46px、`check-r5.mjs`15件・`check-passive.mjs`9項目・`check-geo.mjs`34件すべてpass、`node --check`全通過。engine.jsのdiffが追加行のみのためrank順は不変(dump-rankの出力も正常)。
- 次: ROADMAP残りのR10/R11/R14/R15/R21/R22。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R22 `docs/check.mjs` にリンク切れ検査を追加
- やったこと: 既存の`report()`/`hasFailure`/`BASE`を再利用し末尾に追記。`index.html`/`demo/embed-check.html`/`demo/hotel-page.html`から`src`/`href`属性と`og:image`/`twitter:image`のmeta contentを正規表現抽出し、`#`/`javascript:`/`mailto:`/空文字を除外、外部ドメインはfetchせず件数だけ計上、相対パスは`new URL(value, BASE+page)`でページ位置基準に解決してクエリを除去し本番URLをHEAD確認(非200ならGETで再確認)する処理を追加(index.html等は無変更)。
- 見た目の確認結果: 画面変更なしのため撮影は省略。`node docs/check.mjs`実行で計21項目中21件OK・exit 0(内訳: 既存9項目+外部リンク検知1件+リンク検査11件、demo/embed-check.htmlの`../index.html`→`index.html`解決も確認、unpkg等の外部fetchなし)。既存9項目・`check-engine.mjs`111件・`check-a11y.mjs`にデグレなし。
- 次: ROADMAP残りはR10/R11/R14/R15/R19/R21。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R10 番号バッジをタップすると小地図の該当ピンが光る
- やったこと: `app.js`に`feedSpotMarkers`(モジュールスコープ、番号→marker引き当て用)と`flashTimer`を追加、`renderFeedMap()`で`spotMarkers`と並行して積む。カードの番号spanを`<button class="feedcard__no" data-no>`に変更(見た目は既存CSS流用+`border:0`等を追加)。`feedList`のクリック委譲冒頭に`.feedcard__no`分岐を追加し、`panTo`+`scrollIntoView`後に`flashPin(i)`(`feedSpotMarkers[i].getElement()`へ`pin--flash`クラスを1.2秒付与、連打時は前回分を即除去)を呼ぶ新設。`style.css`に`.feedcard__no::after`(44px当たり判定)と`.pin--flash span`+`@keyframes pin-flash`(白+オレンジ系リングが広がる1秒アニメ、reduced-motion用の`animation:none`も明記)を追加。engine.js/geo.js/fixturesは無変更(`git diff --stat`で確認)。
- テスト結果: 新設`node scripts/check-pinflash.mjs`8件全pass(200ms後に1個だけ光る・1400ms後に消える・連打しても1個以下・reduced-motionでもクラスは付くがアニメしない・コンソールエラー0件)。`check-a11y.mjs`に`.feedcard__no`を追加し全OK(44px)。`check-engine.mjs`111件・`check-more.mjs`6件・`check-passive.mjs`9件・`check-geo.mjs`34件・`docs/check.mjs`全pass、`node --check assets/app.js`通過。`dump-rank.mjs`は環境の権限制御でコマンド自体が拒否され実行不可だったため未実施(engine/geo/fixtures無変更を`git diff`で代替確認)。
- 目視結果: `?fixture=kusatsu`地図部分を切り出して撮影し、3番ピンだけがオレンジのリングで光っているのを判別できた(初版は白リングで既存の枠と見分けにくく、色をオレンジ系に強化して撮り直した)。`?fixture=hakone`/`?fixture=kusatsu&embed=1`はカード30枚・番号ピン崩れなしでデグレなし。`?fixture=kusatsu&demo=passive`でバッジタップ時も`tap`レコード(index一致)が従来通り1件記録されることを確認。
- 次: ROADMAP残りはR11/R14/R15/R19/R21。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R15 撮影用の遅延パラメータ `?slow=osm800,wiki1500`
- やったこと: `geo.js`に`slowDelays`(既存`simulateBusy`と同じ形のモジュール変数)と`setSlowDelays(d)`を追加し、`fetchSpots`(キャッシュ参照より後)と`fetchWikiNearby`(fixture分岐の直前、fixture/実API両経路にかかる位置)にそれぞれ1行`await delay(...)`を注入。公開APIに`setSlowDelays`を追加。`app.js`に`slowDelaysFromUrl(params)`を新設し`osm800,wiki1500`形式をパース(不正値は黙って無視、上限10000msでクランプ)、`applyEntryPoint()`から呼び出し。engine.js/fixturesは無変更。
- テスト結果: `node scripts/check-geo.mjs`に3ケース追加し44件全pass(遅延100ms以上かかる/fixture経路でも外部fetch0回/パラメータ無しなら50ms未満で件数・先頭要素とも従来どおり不変)。`check-engine.mjs`111件・`check-r5.mjs`15件・`check-passive.mjs`・`check-more.mjs`6件・`check-pinflash.mjs`8件・`check-a11y.mjs`・`node --check`全通過。`dump-rank.mjs kusatsu`もengine/fixture無傷を確認。
- 目視結果: `?fixture=kusatsu&slow=osm300,wiki3000`をwait1500msで撮ると「周辺を集めています…」表示でカードは写真なし・要約なしのプレースホルダのみ、wait5000msで撮ると写真・タイトル・要約入りの完成カードに切り替わっており、**段階描画(OSM先出し→Wikipedia後乗せ)が2段ではっきり確認できた**。`?fixture=kusatsu`(slowなし)mobileはカード30枚・ピン1〜30・崩れなしでデグレなし。
- 次: ROADMAP残りはR11/R14/R19/R21/R23〜R27。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R27 Leaflet の配信元を unpkg から cdnjs へ
- やったこと: index.htmlの`<link>`(leaflet.css)と`<script>`(leaflet.js)のURLをunpkgからcdnjsに差し替え、SRIをcdnjs公式API(`api.cdnjs.com/libraries/leaflet/1.9.4?fields=sri`)から取得したsha512値に更新(`referrerpolicy="no-referrer"`も付与)。差し替え後に自分でも`curl -s <url> | openssl dgst -sha512`で再計算し、index.htmlのintegrity値と完全一致することを確認。
- 見た目の確認結果: `?fixture=kusatsu`/`?demo=zoomout`mobileともに地図タイル・ピンが正常描画、コンソールエラー0件。
- テスト結果: `node docs/check.mjs`(外部リンク2件のまま変化なし・全項目OK)、`node scripts/check-a11y.mjs`(全OK)、`node scripts/check-more.mjs`(6 pass/0 fail)すべて緑。
- 次: ROADMAP残りはR11/R14/R19/R21/R23〜R26。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R24+R21 `?hotel=`名前なし見出し「この宿の周辺」化 + README英語1段落
- やったこと: `app.js`の`hotelFromUrl`で既定名を`'この宿'`→`'この宿の周辺'`に変更(ロジック無変更、文言のみ)。新設`scripts/check-hotelparam.mjs`で名前なし/末尾カンマ/embed併用/名前あり/fixtureのみデグレなしの5パターンを機械検査。README.md冒頭にWhat this is/How to try/No API keys neededの英語1段落を追加(日本語部分は無変更)。
- テスト結果: `node --check assets/app.js`通過、`check-hotelparam.mjs`10 pass/0 fail、`check-more.mjs`6 pass/0 fail、`check-a11y.mjs`全OK、`check-passive.mjs`全OK。engine.js/geo.js/fixturesは無変更。
- 目視結果: `?fixture=kusatsu&hotel=36.6226,138.5960`mobileで見出し「この宿の周辺」が1行で折り返しなく表示、`?fixture=kusatsu`(hotelなし)mobileは従来通り「草津温泉(固定データ)」でデグレなし。
- 次: ROADMAP残りはR11/R14/R19/R23/R25/R26。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R26 README にスクリーンショット3枚を貼る
- やったこと: `scripts/make-readme-shots.mjs`を新規作成しPlaywright(375x780/jpeg品質75)で`docs/shots/state-a.jpg`(?q=草津温泉・宿ピン実写)`state-b.jpg`(?fixture=kusatsu)`embed.jpg`(demo/hotel-page.htmlの埋め込み見出しへスクロール)の3枚を撮影。全て1回の試行で宿ピンが写り成功(51KB/62KB/56KB、全て150KB以下)。README.mdの英語段落直下にHTML tableで3枚を横並び追加(既存本文は無変更)。
- 見た目の確認結果: 3枚をReadで目視、文字崩れ・はみ出し・真っ白地図なし。state-aには♨の宿ピンが多数(67件)写っている。
- テスト結果: `node docs/check.mjs`全項目OK・exit0、`node scripts/check-a11y.mjs`全件OK、`git diff --stat -- assets fixtures index.html`は空(コード無変更)。
- 次: ROADMAP残りはR11/R14/R19/R23/R28/R30〜R34。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R29 `?q=`/エリアチップ選択時にチップを強調
- やったこと: `app.js`に`currentAreaIndex`(ラベル前方一致判定)と`setCurrentChip`(強調クラス切替+`scrollIntoView`)を新設し、チップclick・`?q=`・検索候補の地名ジャンプの3経路から呼ぶよう配線。`style.css`に`.chip--current`を追加(min-height/padding不変)。新設`scripts/check-chipcurrent.mjs`はNominatimをfulfillでモックし外部APIを叩かずに検証。
- テスト結果: `check-chipcurrent.mjs`10 pass/0 fail、`check-a11y.mjs`全OK、`check-more.mjs`6 pass/0 fail、`check-passive.mjs`全OK、`check-hotelparam.mjs`10 pass/0 fail、`check-engine.mjs`111 pass、`docs/check.mjs`exit0、`git diff --stat -- engine.js/geo.js/fixtures`空。
- 目視結果: `?q=草津温泉`(実API1回)mobileで草津チップが紫枠で強調され横スクロールして画面内、他チップと高さ揃い。`?fixture=kusatsu`/`?demo=zoomout`mobileはデグレなし。
- 次: ROADMAP残りはR11/R14/R19/R23/R28/R30〜R34。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R32 検索候補に「最近見た宿」を見出し付きで統合
- やったこと: `app.js`に`recentRows(limit)`(履歴→候補行の純粋関数)と`mergeWithRecent(rows,q)`を新設し、`runSuggest`の2文字以上の分岐で候補一致分の最近(最大3件)を`{act:'head'}`見出し付きで先頭に連結(一致0件なら見出しなし)。`renderSuggest`は`act==='head'`の行をdata-index無しの非ボタン`.suggest__head`として描画しクリック委譲の添字を壊さない。撮影用`?demo=recentmix`を新設。
- テスト結果: 新設`check-recent.mjs`11 pass/0 fail、`check-all.mjs`12本全PASS、`node --check assets/app.js`OK、`dump-rank.mjs kusatsu`はengine/geo/fixtures無変更のため差分なしを確認。
- 目視結果: `?demo=recentmix`/`?demo=recent`/`?fixture=kusatsu`mobileを確認、見出し・最近行・候補行の見分けがつき文字崩れ/重なり/はみ出しなし。行数が増えチップとの隙間はやや狭いがR2-1(候補とチップの重なり)は朝の相談待ちのため今回は手を付けず。
- 次: ROADMAP残りはR11/R14/R19/R23/R28/R30/R31/R33/R34。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R31 小地図にOSM attributionが欠落していた不具合の是正
- やったこと: 事前調査の通り、状態Bの小地図(`ensureFeedMap()`)は`attributionControl: false`かつtileLayerに`attribution`未指定で、**帰属表示がDOMに存在しない状態が本番に出ていた**(OSM利用規約違反)。`app.js:904`の`attributionControl: false`を削除し、tileLayerに`attribution: TILE_ATTR`を渡すよう状態Aと同じ書き方に統一。CSSだけでは右下のピンと重なったため(`check-attrib.mjs`で検出)、`feedMap.attributionControl.setPosition('topright')`を1行追加して回避(`nudgeOverlaps`のMARGINは無変更)。
- テストと目視: 新設`scripts/check-attrib.mjs`(4URL×8項目=32 pass/0 fail)、`check-all.mjs`13本全PASS。`?fixture=kusatsu`/`hakone`/`dogo`/`kusatsu&embed=1`のmobile4枚をRead目視し、右上に帰属表示が判読可・番号ピン1〜30と重ならず・カード30枚崩れなしを確認。
- コミットとpush: 完了後にコミット・push・`docs/check.mjs`実行予定(このログ追記と同一コミットにまとめる)。

### 2026-09-16 R38 カードの「Googleマップ」を宿→スポットの経路リンクにする
- やったこと: `engine.js`の`buildLinks(item, hotel)`が、宿座標が有限なら`https://www.google.com/maps/dir/?api=1&origin=<宿>&destination=<スポット>&travelmode=walking`を返すよう変更(`toCard`から`hotel`を渡すだけ)。宿座標が非有限なら従来の検索URLへフォールバック。`check-engine.mjs`にdir形式・origin/destination/travelmode・フォールバック・far側の4観点を追加。
- テストと目視: `check-engine.mjs`159 pass/0 fail、`check-all.mjs`13本全PASS。`dump-rank.mjs kusatsu/hakone`は変更前後で完全に差分ゼロ(順位・名前・カテゴリ・距離は不変、このツールはlinksを出力しないため差分なしが期待通り)。`?fixture=kusatsu`mobileをRead目視しカード30枚・番号ピン判読可・リンクチップ崩れなしを確認。Playwrightで光泉寺の実リンクを1件取得: `https://www.google.com/maps/dir/?api=1&origin=36.6226%2C138.596&destination=36.6218107%2C138.5952868&travelmode=walking`(叩いていない)。
- 次: ROADMAP残りはR11/R14/R19/R23/R28/R30/R33/R34。朝の相談は前回分(wiki件数50vs34の食い違い)が引き続き未決。

### 2026-09-16 R41 README「仕組み」節を現状に合わせて更新(文書のみ)
- やったこと: README.mdの「仕組み(かんたん解説)」節に段階描画・重複マージ・除外ルール・Wikipedia同心円3段geosearch・受動ログの説明を追記し、URLパラメータ一覧(hotel/q/fixture/embed/slow/perf/simulate/demoの8種、app.js実装とgrepで照合)を新設。「自動リトライはしません」の誤記(R4実装後は誤り)と「10本」の誤記(実際は12本+docs/check.mjsで計13本)を修正、ファイル構成にscripts/fixtures/demo/docsの説明を追加。「今後」節の実装済み項目(埋め込み・受動ログ)を削除。docs/ROADMAP.mdは完了済み[x]を「## 完了(2026-09-16)」節に集約(未完了8件はR2-1/R11/R14/R19/R28/R37/R39/R40のまま元の文面で残置)。
- 確認結果: `node docs/check.mjs`全OK、`node scripts/check-all.mjs`13本全PASS、`git diff --stat -- assets fixtures index.html demo scripts`は空(コード無変更)。画面変更なしのため撮影は省略。
- 次: ROADMAP残りはR2-1(朝の相談向き)/R11/R14/R19/R28/R37/R39/R40。

### 2026-09-16 R39 固定データバッジ + R28 残作業(`?demo=nohotels`)
- やったこと: `.topbar__title`直後に`#feed-badge`(淡色バッジ)を追加し、fixture読み込み成功時のみ`isFixtureMode`フラグで可視化、見出しの`(固定データ)`括弧書きは削除。`?demo=nohotels`で`demoStateA`+`demoNoHotels`を立て、`loadHotelsInView()`の状態A分岐先頭で本番と同一文言「この範囲には宿が見つかりませんでした」を外部APIなしで再現。`check-hotelparam.mjs`にバッジ4ケース追加、`check-nohotels.mjs`を新設し`check-all.mjs`に追加(14本)。
- 見た目の確認結果: `?fixture=kusatsu`/`&embed=1`/`?demo=nohotels`のmobile3枚をRead目視。見出し・バッジ・戻るボタンが1行に収まりバッジ文字のはみ出しなし、0件バナーはLeaflet帰属表示と重ならず判読可。`check-all.mjs`14本全PASS、`node --check assets/app.js`OK。engine/geo/fixturesは無変更のためdump-rank差分なし。
- 次: `?demo=nohotels`と`?simulate=overpass504`併用時は混雑トースト側が勝つ(catchが後に上書きするため)現状のまま据え置き。ROADMAP残りはR2-1/R11/R14/R19/R37/R40。

### 2026-09-16 R47 フィード末尾に「提案の作り方」の正直な注記を追加
- やったこと: `farHtml()`直後に`noteHtml(cardCount)`を新設し、`#feed-far`の直後の`#feed-note`に「この提案は、周辺の地図情報（OpenStreetMap）とWikipediaから、宿からの距離と種類の多様性で並べた暫定版です。有名な場所が下に来ることがあります。」+「くわしい仕組み」リンクを描画。0件時・読み込み中・error時は出さない。`docs/09_研究ノート`はリポジトリに存在しないため、README.md:48の「仕組み(かんたん解説)」節(rankが暫定であることを正直に書いた既存段落)へのGitHubアンカーリンクに差し替えた。embedでも隠すCSSは書かず表示する判断とした(埋め込み先の宿ページにとっても「暫定」と明示される方が誠実で、やどたび側の免責にもなるため。高さ増分は1〜2行のみ)。
- テストと目視: 新設`scripts/check-feednote.mjs`(11 pass/0 fail)を`check-all.mjs`に追加し17本全PASS、`node --check assets/app.js`OK。`?fixture=kusatsu`/`&embed=1`mobile --fullをRead目視し、注記がフィード最下部に3行で収まりカード・もっと見るボタンと重ならず、375px幅で文字切れ・「くわしい仕組み」の途中折り返しなし、リンクは下線で識別できるが目立ちすぎず、embed版も同じ見え方でカード30枚のデグレなしを確認。
- コミットとpush: 完了。次はROADMAP残り(R2-1/R11/R14/R19/R28/R37/R40/R48/R51等)。

### 2026-09-16 R48 `?embed=1` で高さを親にpostMessage通知
- やったこと: `app.js`の`setEmbed(on)`直後に`postHeightToParent()`(rAF丸め+前回同値なら送らない)と`startHeightObserver()`(`document.body`をResizeObserver監視、embed時のみ張り非embedでdisconnect)を新設し、`renderFeed()`末尾と「もっと見る」クリック後にも保険で1回呼ぶ。`demo/hotel-page.html`に`message`受信スクリプトを追加(origin検証: 本番`https://teer-tee.github.io`と`location.origin`のみ許可、`height`は100〜100000の有限数のみ反映)。60枚展開後の実測が22309pxと想定より大きく、NEXT.md指定の上限20000だと正規の伸長まで弾いてしまうため上限を100000に引き上げた。
- テストと目視: 新設`check-embedheight.mjs`(8 pass/0 fail)を`check-all.mjs`に追加し18本全PASS、`node --check assets/app.js`OK。`demo/hotel-page.html`mobile`--full`をRead目視しiframeが内容に合わせて伸び二重スクロールなし、`?fixture=kusatsu`(非embed)/`&embed=1`(単体)mobileもデグレなし(カード30枚・番号ピン判読可・文字崩れなし)。
- 次: ROADMAP残りはR2-1/R11/R14/R19/R28/R37/R40/R51。上限値100000は暫定なので気になれば朝の相談へ。

### 2026-09-16 R56 リンクチップを1段小さくして5個を1行に収める
- やったこと: 案A(padding 5px10px→4px8px, gap横8px→6px)、案B(案A+font-size 11px)、案C(gap横8→5,padding横10→8のみ)の3案を`?fixture=kusatsu`mobileで撮影・Playwrightのoffsetでも実測。案A・Cは実測でYouTubeが2行目に落ち、NEXT.mdの指示通り案Bをさらに`padding:3px 7px`まで詰めて再撮影したところ、全5個の`offsetTop`が620pxで一致(1行化成功)。最終値: `.feedcard__link { padding:3px 7px; font-size:11px }` / `.feedcard__links { gap:10px 6px }`。
- 見た目の確認結果: `check-a11y.mjs`全OK(`.feedcard__link::after`は44px維持)、`check-all.mjs`18本全PASS。`?fixture=kusatsu`(5個)/`hakone`(4個・長い名前「早雲寺」)/`dogo`(5個・長い名前「伊佐爾波神社」)/`kusatsu&embed=1`のmobile4枚をRead目視し、全て1行・文字読める・チップ接触なし・コンソールエラー0件を確認。
- 次: ROADMAP残りはR2-1/R11/R14/R19/R28/R37/R40/R51。撮り比べの申し送り: paddingか font-size 単独の1段縮小では不足で、両方の複合縮小が必要だった。

### 2026-09-16 R52 + R53 文書2本(パラメータ一覧表の是正 + 埋め込み手順の明文化)
- やったこと: README の `?demo=` が7値→10値に是正された(`nohotels`/`autozoom`/`hoteltip`が未記載だった)。`assets/app.js`を再grepし、URLパラメータ一覧を4列(パラメータ/値の例/何が起きるか/外部APIを叩くか)に作り直し、`?demo=`は値が10個あるため専用の小見出し+別表に切り出した。README↔`docs/FIXTURES.md`の相互リンクを追加。`demo/hotel-page.html`の`.sales-notes`に高さ自動調整・URLエンコード必須・受信スクリプトの所在の3点を追記し、受信スクリプトの実物も`<pre class="tag-example">`で可視化した。
- 見た目の確認結果: `demo/hotel-page.html`をローカルサーバー(port 3000)でmobile撮影しRead目視。追記した説明文は折り返しで読め、追加した`pre.tag-example`もmobile幅で横はみ出しなし(既存のoverflow-x:auto/word-break:break-allが適用)。既存のiframe埋め込み表示・上部の宿情報も従来どおりでデグレなし。
- 次: `node docs/check.mjs`・`scripts/check-all.mjs`18本全PASS・`git diff --stat -- assets fixtures scripts index.html`空を確認済み。次候補はR14/R19/R40/R54/R55。

### 2026-09-16 R58 ブラウザの戻るで状態Aに戻る(history.pushState)
- やったこと: `selectHotel()`で状態Bに入る際`historyPushed`フラグ付きで`history.pushState`(embed時・二重push時はスキップ)、`goBack()`末尾でフラグを戻し、`goBackFromUi()`(戻るボタン用)と`popstate`購読(`bindEvents()`末尾)を追加。`?hotel=`/`?fixture=`直行でもpushStateが1回走るためこの分の戻るで状態Aに出られる仕様を採用(URLは書き換えない)。新規`scripts/check-history.mjs`(18項目)を`check-all.mjs`に追加、20本全PASS。
- 見た目の確認結果: `?fixture=kusatsu`mobileでカード30枚・番号ピン判読可・デグレなし。check-history内で撮影したgoBack後の状態A(検索欄・エリアチップ・地図)も崩れなし。コンソールエラー0件。
- 次: R14/R19/R40/R55/R57/R59が残候補。

### 2026-09-16 R57 + R59 カード画像のalt改善 + 検索欄クリアボタン(×)
- やったこと: `cardHtml()`の`<img>`の`alt`を`escapeHtml(card.name)+'の写真'`に変更(クラス・data属性・loading順は維持)。`index.html`の検索入力直後に`#search-clear`ボタンを追加し、`app.js`に`syncSearchClear()`を新設して`input`ハンドラ・`applyDemoStateA()`の`suggest`/`recent`/`recentmix`各分岐・`?q=`反映箇所すべてから呼び出し、クリックで値クリア+候補閉じ+フォーカス復帰する処理を実装。`style.css`に`.pickbar__clear`(44px・absolute)と`.pickbar__input`の`padding-right`を追加。
- 見た目の確認結果: `check-imgfail.mjs`にalt検査、`check-a11y.mjs`に`.pickbar__clear`の44px検査、`check-recent.mjs`に×の表示/クリック/フォーカス復帰ケースを追加し`check-all.mjs`20本全PASS。`?demo=suggest`mobileで×が検索欄右端に見え候補リストと重ならず、`?fixture=kusatsu`mobileはカード30枚・番号ピン判読可でデグレなし、`?demo=recent`mobileでは×が出ないことをRead目視で確認、コンソールエラー0件。
- 次: R14/R19/R40/R55が残候補。

### 2026-09-16 R60 + R55 「もっと見る」展開後の地図注記 + check-all所要時間の記録
- やったこと: `moreHtml(more, open, startNo)`に第3引数を追加し、展開時は空文字ではなく`<p class="morenote">31番以降は地図に表示していません。</p>`(番号は`state.cards.length + 1`で算出)を返すよう変更、`style.css`に`.morebtn`踏襲の`.morenote`を追加、`check-more.mjs`に展開前0件・展開後1件+テキスト検査を追加(20本全PASS)。R55は表がすでに実装済みだったため記録のみ。
- 見た目の確認結果: `?fixture=kusatsu`mobileで展開後クロップ撮影し、注記が30番カードと31番カードの間(feednoteの直前)に1行で収まり折り返し崩れなし、展開前は`.morenote`が0件でデグレなしをRead目視、コンソールエラー0件。
- R55の数字: `check-all.mjs`合計162.8s・20本全PASS、最遅`scripts/check-hotelparam.mjs`27.9s、次点`scripts/check-feednote.mjs`12.3s・`scripts/check-attrib.mjs`12.1s。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R62 縦長写真の見切れ確認と object-position の採用
- やったこと: `?demo=portrait`(app.js、先頭3枚を400x800のdata: URI SVGに差し替え・上部60pxに「▲ここが頭」の目印)を追加。safeUrl()はhttps?のみ許可のままdata:は通さず、cardHtml内でportrait専用の分岐からimg要素を直接組んでスキーム許可は広げていない。`?fixture=kusatsu&demo=portrait`mobile撮影で目印が完全に見切れていたため、`.feedcard__img`に`object-position: center 30%;`を追加して再撮影し、目印が全部見えることを確認して採用。
- 見た目の確認結果: kusatsu/hakone/dogoのmobile撮影で横長写真(建物・鳥居等)の構図デグレなし(頭部・屋根が切れていない)。fixturesの縦長比率はkusatsu 3/46・hakone 1/39・dogo 1/47(計5/132)で稀だが実在。check-imgfail.mjsにportraitの13項目(縦長判定・表示高さ一致・object-fit・4枚目以降の非対象・デグレ無し)を追加、check-all.mjs 21本全PASS。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R63 状態Aに「サンプル: 草津/箱根/道後」のデモ導線を追加
- やったこと: 配置A(`.chips`の下に新規1行)/B(チップ行内末尾)/C案の3案のうちA・Bを実装して`?demo=zoomout`mobileで撮り比べ、Bは横スクロールの奥に隠れて画面に出ないため不採用、Aは地図が窮屈にならず文字も読めたため採用。`<a href="?fixture=kusatsu|hakone|dogo">`の素のリンク(JSイベント追加なし)を`renderSampleLinks()`で描画し、`state.embed`または`fixtureNameFromUrl()`が非nullなら`hidden`。新規`scripts/check-sample.mjs`(15項目)を`check-all.mjs`に追加、`check-a11y.mjs`に`.samples a`を追加。
- 見た目の確認結果: `?demo=zoomout`mobile/desktopとも「サンプル: 草津の例 箱根の例 道後の例」が1行に収まり横スクロールなし、地図は潰れず十分な高さ。`?fixture=kusatsu`mobileでは状態Bに遷移し導線は不可視(テストでも確認)。コンソールエラー0件、`check-all.mjs`21本全PASS。
- 次: R14/R19/R40が残候補。
