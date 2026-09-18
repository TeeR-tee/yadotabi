# 夜間ログ(みのるんが朝に読む)

## 朝のまとめ(2026-09-16 06:10 司令塔が記入)

**朝まで131サイクル・187コミット(2026-09-18 23:45時点、ループ継続中)。すべて本番 https://teer-tee.github.io/yadotabi/ に反映済み。コスト0円。**

### 触ってみるURL(スマホでOK)
- 通常: https://teer-tee.github.io/yadotabi/ (地図の宿ピンをタップ、または検索欄に「箱根 ホテル」)
- 固定データ(APIを叩かない確認用): https://teer-tee.github.io/yadotabi/?fixture=kusatsu / ?fixture=hakone / ?fixture=kinosaki
- 埋め込みモード: https://teer-tee.github.io/yadotabi/?fixture=kusatsu&embed=1
- 営業用デモ(予約サイト風の宿ページに埋めた1枚): https://teer-tee.github.io/yadotabi/demo/hotel-page.html

### 直近10サイクルで何が良くなったか(提案の中身)

- 潰れたスキー場・遊園地・閉園した動物園・廃止された鉱山など、もう行けない場所が「見どころ」カードから消えた(R115/R119/R120)。地名や記事タイトルだけでなく、Wikipedia記事の書き出し文が「かつて」「〜であった」と過去形で書いているかまで見て判定するよう改善。
- 今も入所者が生活している国立療養所を「宿の周りの見どころ」として行き方つきで出していたのをやめた(R121)。学びの場である重監房資料館(ハンセン病の歴史を伝える資料館)は誤って一緒に消えないよう確認済みで、そのまま残っている。
- 提案カードに他社の宿(ホテル・旅館・民宿など)が紛れ込んでいたのを止めた(R117)。うちのサイトが競合の宿を「見どころ」として無料で紹介してしまっていた状態を解消。
- 「Wikipediaに記事がありません」と表示されていたのに、実は記事がある場所が4エリア合計26件あった。この誤表示をなくし、記事があるものは正しくリンクを出すようにした(R123)。
- 「記事はあります」と表示されているのに押せるリンクが1本も無い、行き止まりのカードが13件あった。これを0件にした(R124)。
- 小地図の右下に必ず出す著作権表示(地図データの出典・法律上の必須表示)と番号ピンが重なって読めなくなる問題を、場当たり的な調整でなく、重ならないことを保証する仕組みに作り直した(R118)。
- 確かめる例: https://teer-tee.github.io/yadotabi/?fixture=dogo (道後温泉。松山城のリンクや「重監房資料館」を含む療養所まわりの表示が変わっている)

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
23. R61 地図の初期位置を最近見た宿に、R67 検査失敗時のログ保存、R68 埋め込みの背景色指定、R65 ドラッグ直後の位置保存、R66 写真タップで拡大表示
24. R69 キーボード操作の検査と写真のボタン化、R73+R71 READMEの用語辞典と写真あり割合、R70 おまかせ(ランダム)固定データ、R40 別府の固定データ、R79 公共施設(体育館・病院管理棟等)の除外語を再拡充(4エリアで13件除外・誤爆0)
25. R80 Wikipedia単独候補の救済判定(誤爆3件を発見して厳格化)、R74 サンプル導線を横スクロール化、R76+R19 「もっと遠く」が3エリアで0件になる原因(収集半径15km vs 閾値30km)を実測し是正3案を朝の相談に起票
26. R14 固定データの軽量化(箱根900KB→588KB、提案結果は不変)、R75+R78+R72 文書整備(サイズ表・履歴方針・検査の解説)、R83 Wikipedia記事が無いカードに正直な代替文
27. R84 `?debug=1`でスコア内訳を表示、R94 宿0件時の文言統一、R98 埋め込みiframeのセキュリティ属性(sandbox)追加、R96 写真拡大表示のキーボード操作(Tabで外に抜けない)を修正
28. R91 README のデモ用パラメータ表を実装と一致させ12個に修正、R88 埋め込みの高さ上限を実測ベースに変更、R42 カード要約の文字数カットを句点区切りに改善
29. R43 宿ピンに宿名の吹き出し(ツールチップ)追加、R45 固定データバッジに生成日を表示、R49+R50 判断待ちの設計課題と固定データ運用手順を文書化
30. R82 「地図に戻る」ボタンの読み上げラベル検査を追加、R77 「上位30件表示中」の注記は情報の二重化と判断し不採用、R87 読み込み中のスケルトン表示を撮影確認
31. R89 検査スクリプトの待ち時間を条件待ちに変更して高速化、R101 地図タイル読み込み失敗時に1行で案内、R97 印刷用のレイアウトを新設
32. R104 READMEの英語説明を拡充、R105 検索で見つからない語句を入力したとき無言で草津のまま止まっていたのを案内表示に変更、R106 検査項目一覧の文書を実体と一致させ
33. R107 最初のカード表示速度の検査を追加、R108 検索欄の入力値表示を20字で区切り、R110 タップ・スクロール記録(送信なし)に90日で自動削除する期限を追加
34. R109 埋め込みタグのセキュリティ属性の一貫性検査を追加、R112 埋め込み時の背景色指定に見やすさ(輝度)判定を追加、R113 地図を同じ場所へ何度も飛ばす無駄な再読み込みを防止
35. R111 外部リンクの安全属性(target/rel)を機械検査、R114 日本語表記と英語表記で同じ城が2枚出る重複を解消(例: 「小田原城」と「Odawara Castle」の統合)
36. R115/R119/R120 廃止・消滅した施設(スキー場・ロープウェイ・動物園・鉱山など)をカードから除外、R121 現存する療養所を観光提案から除外(重監房資料館は無傷)、R117 他社の宿が候補に混ざる問題を解消
37. R123 「Wikipediaに記事がありません」の誤表示26件を是正、R124 「記事はあります」なのにリンクが無い行き止まり13件を解消、R118 小地図の著作権表示とピンの重なりを構造的に解消

### 朝の相談(判断が要るもの、下の節に詳細)
**現状認識(2026-09-18 R141 計画役評価)**: 判断待ちを解かないと、あと4〜6サイクルで改善余地が小さくなる見込み。以下はどれも「みのるんの一存で1分で決められる」規模の判断で、実装自体はコード側で準備済みか見積もり済み。

- **記事本文(要約)を増やす改修 — R125+R138。どちらも `geo.js` の変更と固定データ(fixtures)の再生成が要る、承認必須の案件**。
  - R125: 要約が無いカード32件は、地図データ(OSM)の`wikipedia`タグで記事名がすでに判明しているのに取りに行っていない。
  - R138: 座標を持たないため要約・写真ごと捨てられている記事が4エリアで40件ある(実害は今のところ1枚)。
  - 選択肢: (A)R125を先に実装(効果32件・実装コスト中) / (B)R138も含めて一括対応(効果+1件・coordinatesの代替取得ロジックが要り実装コスト大) / (C)今回はやらない
  - 推奨: (A)まずR125単独。効果件数がR138の32倍あり、`geo.js`変更・fixtures再生成・Wikipedia呼び出し増の3点セットを一度で消化できる。R138は費用対効果が低いため様子見でよい。
- **カテゴリ多様性の減点に上限を設けるか — rankの重み変更そのものなので承認必須**。有名どころ(大涌谷・彫刻の森)ほど不利になる逆転が起きている。
  - 選択肢: (A)減点に上限を設ける / (B)Wikipediaに記事がある候補は減点を免除する / (C)このまま
  - 推奨: (A)上限を設ける案が影響範囲を見積もりやすい。
- **R64 GitHub Actions でロジック検査20本(Playwright)も回すか — 無料枠に収まるか確認が先**。
  - 選択肢: (A)無料枠を確認してから実装に進める / (B)`docs/check.mjs`(本番URLへのGETのみ)の現状維持
  - 推奨: (A)まず確認。publicリポジトリなら Actions は無制限枠のはずだが、実際の設定(組織のプラン等)はみのるんしか把握していないため先に確認してもらう。
- **R19 far(車60分超)の遠い候補の閾値、3案のどれを採るか(2026-09-16 R76実測で判断材料は出揃った)**。
  - 選択肢: 案A: `FAR_DRIVE_MIN`を収集半径の80%相当に下げる(far は出るがcardsが痩せる)。案B: fixtureの`osmRadiusM`を4エリアとも30000に揃える(hakoneと同条件になるがhakone.json 900KBの肥大がR14と衝突)。案C: farの定義を距離の絶対値でなく候補距離分布の上位X%にする(土地によらず出るがrank側への実装が必要)。
  - 推奨: 案C(土地の広さに左右されない)が筋は良いが実装コストが最も高い。まず案Aで様子を見て不足なら案Cへ、が現実的。詳細は09研究ノート「R76+R19 far の4エリア実測」節。

以下は判断待ちだが上記4件より優先度が低い小粒な確認事項(参考として残す):
- 実APIと固定データでWikipedia件数が食い違う(50件 vs 34件)。深追いするか
  - 選択肢: (A)原因調査に1サイクル使う / (B)実害(表示崩れ・提案漏れ)が出るまで様子見
  - 推奨: (B)様子見。現状は表示上の不具合として顕在化していない
- 小地図のピンを見やすさ優先で最大96pxずらしている方針でよいか
  - 選択肢: (A)このまま(見やすさ優先) / (B)ずらし幅の上限を縮める(実際の位置に近づける代わりに重なりリスクが増える)
  - 推奨: (A)このまま。R118で重なり自体は構造的に解消済みのため、現状の方針を変える理由がない
- **R122 解決済み(R132)**: 場所ではない候補・観光向けでない施設(hakone 11位「石橋山の戦い」、kusatsu 8位「本白根第3グランド」)は、R132で追加した「そもそも行ける場所か」判定により両方とも `dump-rank` の上位30枚から消えたことを実測済み。正しい行き先「石橋山古戦場の碑」はhakone 20位に残存(R119/R120でも当たらなかった判定の隙間を埋めた)。判断待ちは無し。

**判断を待たずに進められる項目は ROADMAP の通常の未完了項目として扱う(この節から除外)**: R116(一般名詞候補の除外)・R103(応答時間の表示)・R102(撮影一覧スクリプト)・R85(英語版デモページ)。いずれもコスト0円・ユーザー判断不要・入力ゼロ原則を満たすため、計画役が通常どおり選定してよい。

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

### 2026-09-16 R100 カード見出しの折り返し方針統一
- やったこと: `dump-rank.mjs` を4エリアで回して cards+more(上位30〜60件)の最長名を実測(dogo 62字「友情のシンボル ゴールドマイナー像の説明」/hakone 54字「わんぱくらんど 小田原こどもの森公園」/kusatsu 62字「湯けむりに ふすぼりもせぬ 月の貌 小林一茶」/beppu 59字「大分マリーンパレス水族館「うみたまご」」で、いずれも日本語。NEXT.md想定の`MinatoyamaJouato`級ラテン連続は上位に無かった)。予防目的として `assets/style.css:450` の `.feedcard__name` に `overflow-wrap: anywhere` を1行追加(コメント込み3行)。`.suggest__name`/`.topbar__title` は省略方針のままで触っていない(カード見出しは情報を隠さない方針なので折り返しで統一)。
- 見た目の確認結果: 変更前後とも Playwright で `.feedcard__name` の `scrollWidth > clientWidth` は0件(dogo)。変更前の `Matsuyama Castle` 等の英語見出しも枠内に収まっていた。変更後 `?fixture=dogo` mobile/desktop・`?fixture=hakone` mobile を撮影し目視で見出し欠け無し。`?fixture=kusatsu` mobile のデグレ確認でも日本語見出しの折り返し位置に不自然さなし。
- 次: ROADMAP の次点タスクへ。

### 2026-09-16 R99 `?hotel=` の緯度経度の範囲検査
- やったこと: `app.js:1340` の `hotelFromUrl()` に `lat < -90 || lat > 90 || lon < -180 || lon > 180` を追加し、範囲外なら `?hotel=` 無しと同じ null を返して状態Aへ黙ってフォールバックさせた(`?bg=` の厳格検証と同じ方針)。呼び出し5箇所は無改修で経路に乗ることを実測確認済み。`scripts/check-hotelparam.mjs` に i(緯度999)・j(経度999)・k(非数値の回帰)の3ケースを追加(既存41→追加後は全44 PASS)。
- 見た目の確認結果: `?hotel=999,138.59,テスト`(fixtureなし)mobile で検索欄・エリアチップ・地図の状態Aが出て状態Bに遷移せず(504で宿ピン取得が混雑中の表示は正常フォールバック)。`?fixture=kusatsu` mobile/desktopともカード30枚・番号ピン判読可・文字崩れ無しでデグレなし。
- 次: ROADMAP の次点タスクへ。

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

- **R2-1 解決済み(R2-1)**: 検索候補を開いたときエリアチップ行に重なる件は、当時「好みの問題」として判断を仰いでいたが、その後 R2-1 自身が実測で見立てを訂正した。既存の背景・影は不透明で透過は起きておらず、実際は開いている間も裏のチップがクリックを奪う**誤タップの不具合**だった。`.pickbar--suggesting` クラスで候補表示中はチップ等を `visibility: hidden` にし、`elementFromPoint` 実測で誤タップ解消・閉じる全経路で復元することを確認済み。判断待ちは無し。

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

### 2026-09-16 R61 状態Aの地図初期位置を「最近見た宿」にフォールバック
- やったこと: `initialView()`(app.js)を3分岐化(`yado.mapview.v3` > `getRecent()`先頭 > `DEFAULT_VIEW`、ズームは常に既定14)。撮影・検査用に`?demo=initpos`(demoStateA・demoNoSaveView)を追加、localStorage投入はapp.js側で行わずテスト側のaddInitScriptに委ねた。新規`scripts/check-initpos.mjs`(recentのみ/mapview優先/両方無し/recent破損4パターン/URL優先の15項目)を`check-all.mjs`に登録(22本目)。
- 見た目の確認結果: recent投入後の`?demo=initpos`mobileで道後温泉付近が中心に表示され文字崩れなし、`?fixture=kusatsu`mobileでカード30枚・番号ピン判読可、`?demo=zoomout`mobileも注記含めデグレなしをRead目視。`check-all.mjs`22本全PASS、コンソールエラー0件。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R67 check-all.mjs の失敗時にログをファイルへ保存
- やったこと: `check-all.mjs`のspawnSyncを`stdio:'inherit'`から`['ignore','pipe','pipe']`に変更しつつ捕まえた出力をその場で画面にも流し、FAILした本だけ`screenshots/fail-<本名>-<時刻>.txt`に再現コマンド・exit code・stdout/stderr末尾40行を保存する`saveFailLog()`を追加。既存check本体・表の書式・exitCode判定は無変更。
- 見た目の確認結果: 画面出力は従来どおり流れる(見た目に変化なしのため撮影は省略)。1本を存在しないパスに差し替えて実行しFAIL・fail-check-nonexistent-*.txtの生成と中身を目視確認後、元の並びに戻して22本全PASS・fail-*.txt残存0件を確認。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R68 `?embed=1&bg=` で埋め込みの背景色を指定
- やったこと: `bgFromUrl(params)`を新設し`?bg=`の値を`/^[0-9a-fA-F]{6}$/`(先頭`#`は1つだけ剥がす)で厳格検証、`setEmbed(on, bg)`に第2引数を足しembed時のみ`--c-bg`をCSS変数経由でセット(文字列連結でCSSに流すのはここだけ)。ROADMAP本文は3桁も許容と書いてあったが今回は6桁のみとした(3桁許容は`red`等の色名や中途半端な値との区別を複雑にし、営業用途では宿サイトの正確な色コードをそのまま渡す想定のため6桁固定の方が安全と判断、3桁対応は別タスク)。文字色・カード背景は変更していない。
- 見た目の確認結果: `?fixture=kusatsu&embed=1&bg=fff7e6`mobileで地色が淡いクリーム色になりカード(白)・文字・リンクチップの可読性は保たれている、`?fixture=kusatsu&embed=1`(bgなし)mobileは従来どおりの白系でデグレなし、`demo/hotel-page.html`mobileも親子の地色が馴染み二重スクロールなし。新規`scripts/check-embedbg.mjs`(有効値/#付き/無効値4種/embedなし/カード30枚維持の11項目)を追加し`check-all.mjs`23本全PASS。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R65 selectHotel直前の地図位置を明示保存(未保存の初期位置ズレを修正)
- やったこと: 計画役の実測どおり`goBack()`は地図に触れず同一セッション内では既にズレないことを確認、当初仮説(`goBack()`への`setView()`追加)は否定して不採用。真因である「`saveMapView()`が`moveend`のdebounce(250ms)経由でしか呼ばれずドラッグ直後の宿選択で保存が漏れる」点に対処し、`selectHotel()`冒頭に`saveMapView()`を1回追加。回帰テスト`checkMapViewSavedOnSelect`(panBy→40ms→selectHotel→300ms後のlocalStorage一致検査)を`check-history.mjs`に追加し、修正前にFAIL(savedAfterがpanBy前の古い位置)することを確認済み。
- 見た目の確認結果: `?fixture=kusatsu`mobileでカード30枚・番号ピン1〜30判読可・コンソールエラー0件、画面変更なしでデグレなし。`check-history.mjs`21本全PASS、`check-all.mjs`23本全PASS。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R66 カードの写真タップで簡易ライトボックス
- やったこと: `els.feedList`のclick委譲に(a)番号バッジの直後・(b)`a`リンクの前で`.feedcard__img`判定を挿入し、`openLightbox()`/`closeLightbox()`を新設(overlayはJS生成・historyは一切不使用、閉じるはoverlayタップとEscapeキーのみ)。表示画像は元の`<img>`のsrc/altをそのまま使い(Wikipediaの480pxサムネイルのため拡大しても解像度は上がらない、仕様でありバグではない)、CSSは`max-width/height:100%; object-fit:contain`で原寸以下に収める。画像タップでは`passivePush`を呼ばない(既存`tap`は「カード全体→地図pan」の意味なので混ぜると意味が変わるため)、新しいtypeも追加しない判断とした。
- 見た目の確認結果: 新規`scripts/check-lightbox.mjs`(overlay開閉・Escape・番号バッジ/リンクチップ/プレースホルダで非発火・body overflow固定/解除・embed=1・デグレ用kusatsu30枚の21項目)全PASS、`check-all.mjs`24本全PASS。`?fixture=kusatsu`mobile/desktopのoverlay表示中スクリーンショットをRead目視し、暗幕が全面を覆い画像が中央、閉じるボタン(44px)も右上に収まっていることを確認。デグレ用kusatsu mobileもカード30枚・番号ピン判読可・コンソールエラー0件。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R69 キーボード操作の検査(check-keyboard.mjs 新規)
- やったこと: 実欠陥「カード写真がTabで到達不可・ライトボックスを開く手段が無い」を修正。`cardHtml()`の写真`<img>`2箇所を`<button class="feedcard__imgbtn">`で包み(`tabindex`は不使用)、click委譲を`closest('.feedcard__imgbtn')`基準に変更、`openLightbox()`に開いたら閉じるボタンへ・閉じたら元の写真ボタンへ`focus()`する処理を追加。`scripts/check-keyboard.mjs`を新規作成(状態B/Aの到達順・写真ボタンのEnter/Escape/フォーカス復帰・番号バッジのEnter・もっと見るのEnter・focus-visibleのoutlineWidthを検査)し`check-all.mjs`に追加(24→25本)。
- 見た目の確認結果: check-keyboard.mjs 19項目全PASS、check-all.mjs 25本全緑(check-imgfail/check-lightbox/check-a11y/check-passive含めデグレなし)。撮影4枚をRead目視: 写真ボタン・もっと見るボタンともフォーカスリングが枠にはっきり見え、`?fixture=kusatsu`(mobile)はカード30枚・番号ピン判読可・写真16:9のまま、`&demo=imgfail`も先頭3枚のプレースホルダ差し替えが従来どおり。engine.js/geo.js/fixturesの差分は空。
- 次: R14/R19/R40が残候補。

### 2026-09-16 R73+R71 README に用語ミニ辞典と写真あり割合の表を追加
- やったこと: README「仕組み(かんたん解説)」直前に用語ミニ辞典(fixture/Overpass/geosearch/OSM/embed/rank/collect/present/Wikipedia/Nominatimの10語、grepで全語がREADME本文に実在することを確認済み)、「判断待ちの設計課題」直後にfixture上位30件の写真あり割合表を追加。コード変更0行(assets/fixtures/scripts/index.html/demo/.githubのdiffは空)。
- 確認結果: dump-rank.mjsで3エリア計測、分母は各30件で確認済み。草津20/30=67%、箱根18/30=60%、道後12/30=40%。画面変更なしのため撮影省略。node docs/check.mjs全OK、scripts/check-all.mjs 25本全PASS。
- 次: R14/R19/R40が残候補(いずれもOverpass利用または課金確認が必要)。

### 2026-09-16 R70 `?fixture=random` + サンプル導線に「おまかせ」
- やったこと: `fixtureNameFromUrl()`(app.js)に`raw === 'random'`分岐を追加し、`SAMPLE_LINKS`(kusatsu/hakone/dogo)から`Math.random()`で1つ選ぶ。呼び出しごとに結果がぶれないよう`resolvedRandomFixture`にキャッシュ。`renderSampleLinks()`の末尾に`<a href="?fixture=random">おまかせ</a>`を1本追加(`SAMPLE_LINKS`配列自体には入れず自己参照を回避)。`check-sample.mjs`にケースf(random時に3エリアのいずれか・カード30枚・.samples不可視)を追加し、既存ケースaのリンク数を3→4本に修正。
- 見た目の確認結果: `?fixture=random`mobileを3回撮影しRead目視、箱根湯本/道後温泉/草津温泉と3回とも別エリアが出てヘッダー・バッジ・カードが一致(キャッシュ有効)。`?demo=zoomout`のmobile/desktopでサンプル導線が「草津の例 箱根の例 道後の例 おまかせ」4本になり折り返しても文字切れなし、`?fixture=kusatsu`もデグレなし。`node scripts/check-all.mjs`25本全PASS。
- 次: R14/R19/R40が残候補(いずれもOverpass利用または課金確認が必要)。

### 2026-09-16 R40 fixture 4エリア目「別府」の追加
- やったこと: `make-fixture.mjs`のAREASに`beppu`(lat 33.2846/lon 131.4914、osmRadiusM既定15000)を追加し`node scripts/make-fixture.mjs beppu`を1回実行(667要素・176KB)。`docs/check.mjs`のTARGETS、`app.js`のSAMPLE_LINKS、`check-sample.mjs`の件数アサーション(4本→5本、count===5、fixture=beppu検査追加)、`docs/FIXTURES.md`とREADMEの表・説明文を更新。
- 見た目の確認結果: `?fixture=beppu`mobile/desktopともヘッダー「別府温泉」+固定データバッジ・30枚のピン判読可・カード崩れなし。`?demo=zoomout`mobileはサンプルチップが5本(4例+おまかせ)に増えても折り返し崩れなし。`?fixture=kusatsu`mobileはデグレなし。`scripts/check-all.mjs`25本中24本PASS(docs/check.mjsはpush前提のためbeppu.json行のみ404、push後に再実行予定)。
- 次: R14/R19/R64が残候補。

### 2026-09-16 R79 公共施設が除外ルールを通過して観光候補に残る件の是正
- やったこと: 真因は `TITLE_SUFFIX_NG` が末尾一致のみで「野口病院管理棟」「〇〇大学…研究施設」のように語の後ろに何か付くと素通りする点だった。engine.js の `TITLE_KEYWORD_NG`(部分一致)に公共施設の種別語23語(体育館・公会堂・競技場・運動場・庁舎・管理棟・事務所・分室・研究施設・浄化センター 等。`センター`単体は禁止)、`TITLE_SUFFIX_NG` に4語(百貨店・支所・分署・車庫。`店`単体は禁止)、`EXTRACT_KEYWORD_NG` に7語を追加。併せて `stripDisambiguation()` を新設し「別府駅 (大分県)」の曖昧さ回避カッコを判定前に1回だけ剥がす(保護・除外の両方で同じ正規化後の文字列を使う)。誤爆防止として `NAME_PROTECT_SUFFIX` に観光案内センター・ビジターセンター・交流センター・文化ホール・タワー・展望・ロープウェイ・足湯・地獄・砂湯 等11語を先に追加。check-engine.mjs に落とす側10件・保護される側9件・extract判定3件を追加し 209 pass / 0 fail。dump-rank.mjs に `more`(31〜60位)の表を追加(表示のみ・ロジック無変更)。rank の重み・閾値・geo.js・fixtures は無変更。
- 見た目の確認結果: `?fixture=beppu` / `?fixture=kusatsu` を mobile で撮影し Read 目視。両エリアともカード30枚・地図ピン30個が判読でき、文字崩れ/重なり/はみ出し無し、コンソールエラー0件。別府の1位は別府市美術館・2位は別府タワー(いずれも保護語で守られた側)で、上位30件から公共施設9件が消えた。4エリアとも cards は30枚のまま減っていない(候補が枯れていない)。check-all.mjs 25本中25本PASS。
- 次: 語ベースの除外は「ビーコンプラザ」のように種別語を名前に持たない施設を名前だけでは落とせず、冒頭文頼みになる限界がある(09_研究ノートに OSM タグ側での除外案を記載)。残候補は R14/R19/R64。

#### R79 落ちた候補の全件表(4エリア・cards+more+far の before/after 差分)

| エリア | 落ちた候補名 | 判定に当たった語 | 観光対象か |
|---|---|---|---|
| kusatsu | 六合村 (群馬県) | `村`(末尾一致・カッコ剥がし後に到達) | × 行政区画 |
| hakone | 山崎インターチェンジ (神奈川県) | `インターチェンジ`(末尾一致・カッコ剥がし後に到達) | × 道路施設 |
| hakone | 湯本町 (神奈川県) | `町`(末尾一致・カッコ剥がし後に到達) | × 行政区画 |
| dogo | 愛媛県県民文化会館 | `県民会館`ではなく`文化会館`(部分一致) | × 公共ホール |
| beppu | 別府駅 (大分県) | `駅`(末尾一致・カッコ剥がし後に到達) | × 鉄道駅 |
| beppu | ビーコンプラザ | extract の`コンベンション` | × コンベンション施設 |
| beppu | 別府市野口原総合運動場陸上競技場 | `運動場`/`競技場`(部分一致) | × スポーツ施設 |
| beppu | 京都大学大学院理学研究科附属地球熱学研究施設 | `研究施設`(部分一致) | × 大学研究施設 |
| beppu | 別府市総合体育館 | `体育館`(部分一致) | × スポーツ施設 |
| beppu | 別府市公会堂 | `公会堂`(部分一致) | × 公共ホール |
| beppu | トキハ別府店 | extract の`の百貨店` | × 百貨店 |
| beppu | 別府郵便電話局電話分室 | `分室`(部分一致) | × 通信事業所 |
| beppu | 野口病院管理棟 | `管理棟`(部分一致) | × 病院施設 |

**観光対象の誤爆は0件**(13件すべて公共施設・行政区画・交通/道路施設)。cards の枚数は4エリアとも30枚で変化なし。
なお「道の駅　草津運動茶屋公園」は `運動` を名前に含むが `運動場` は当たらず、保護語 `公園` もあるため残っている(過剰除外なし)。

- R80 語の除外に当たった Wikipedia 記事でも、確定済みの `osmItems`(= Overpass の観光タグを通ってきた要素)に同一と言えるものがあれば通す救済を engine.js に追加(`hasOsmTagEvidence`、wiki の forEach から呼ぶ)。計画役の実測どおり「OSM タグのホワイトリスト化」は `geo.js` の `buildOverpassQuery` が既に担っていたため geo.js・fixtures・Overpass クエリ・rank の重みは一切触っていない。救済の一致判定は統合用の `isSamePlace` を流用すると誤爆するため、「OSM の wikipedia タグによる名指し」か「正規化名の完全一致+150m以内」の2つに絞った。check-engine.mjs に R80 の7ケース(救済2経路+誤爆防止+件数不変)を追加し 216 pass / 0 fail。
- dump-rank を kusatsu/hakone/dogo/beppu の4エリアで before/after 比較し、**cards+more+far の差分は0件**(空振りを隠さず記録する)。依然除外されている84件を全件目視したが観光対象の取りこぼしは0件。beppu と kusatsu の mobile を撮影して目視、カード30枚・番号ピン30個が判読でき文字崩れ/重なり/はみ出し無し・コンソールエラー0件。`node scripts/check-all.mjs` 25本全緑(初回は check-history が `ERR_NO_BUFFER_SPACE` でフレークしたため単体再実行 21 pass / 0 fail と全体再実行 25/25 で確認)。EXTRACT_KEYWORD_NG への語の追加は見送った(依然除外の84件に観光対象が無く、追加しても救う対象が存在しないため)。
- 次: ROADMAP から計画役が選定。R80 の救済機構は4エリアでは差分0のため、観測できるエリアを増やさないと効果を確認できない旨を 09_研究ノート に記録済み。

#### R80 で救済の一致判定を絞った理由(誤爆した3件)

統合用の `isSamePlace`(名前の包含+150m以内)をそのまま救済に使うと、次の3件が通ってしまった。いずれも記事の側が施設より広い主体で、観光スポットではない。

| エリア | 救済されかけた記事 | 一致した OSM 要素 | 判定 |
|---|---|---|---|
| hakone | 箱根町 | 箱根町立郷土資料館 | × 自治体の記事 |
| hakone | 鈴廣 | 鈴廣かまぼこ博物館 | × 企業の記事 |
| dogo | 愛媛大学 | 愛媛大学ミュージアム | × 大学の記事 |

名前の包含は「施設名に自治体名・企業名・大学名が含まれている」だけで成立する。重複を潰す用途では誤って寄せてもカードが1枚減るだけだが、救済では誤って寄せると**除外すべき記事が候補に入る**ため安全側が逆を向く。完全一致に絞った結果この3件はいずれも救済されず、4エリアの救済は0件になった。

### 2026-09-16 R74 サンプル導線チップの2行折り返しを横スクロール化で解消
- やったこと: `.samples` から `flex-wrap: wrap` を削除し `.chips` と同じ `overflow-x:auto` + 右端24pxフェード(mask-image)構成に変更。`.samples__label` と `.samples a` に `flex:0 0 auto; white-space:nowrap;` を追加、`.samples__label` にも `display:inline-flex; align-items:center; min-height:44px;` を足して6要素のoffsetTopを揃えた。PC幅(720px以上)の560px中央寄せ対象に `.samples` を追加(チップ行と左端が揃うことを撮影で確認)。`min-height:44px` は変更していない。
- 見た目の確認結果: `?demo=zoomout` mobile/desktopとも「サンプル:」〜「おまかせ」が1行に収まり右端がフェード、地図の押し下げなし。`.samples`子要素のoffsetTop実測は修正前 `[129,118,118,118,118,118]`(2行)→修正後は全要素同値(1行)。`?fixture=kusatsu`・`&embed=1` ともデグレなし(カード30枚・番号ピン判読可)。check-sample.mjsにoffsetTop一致+scrollWidth>clientWidthの検査を追加、`node scripts/check-all.mjs` 25本全緑。
- 次: R77(状態Bのカードに「全◯件」表示検討)が候補。

### 2026-09-16 R76+R19 far の4エリア実測(文書のみ)
- やったこと: `scripts/dump-rank.mjs` を4エリア直列実行(外部API0回)。far件数は kusatsu0/dogo0/beppu0・hakoneのみ10件(30003m〜30495mの薄い殻)で、「far は osmRadiusM としきい値30km(=FAR_DRIVE_MIN60分×DRIVE_M_PER_MIN500m/分)の大小関係だけで決まる」仮説が4エリアで成立。表は docs/FIXTURES.md と09研究ノートの両方に同じ値で記録、engine.jsのFAR_DRIVE_MIN直上にコメントを2行追加(値は不変)。
- 見た目の確認結果: `?fixture=kusatsu`・`?fixture=hakone&demo=far` mobileを撮影・目視、コメント追記のみのためデグレなし(カード枚数・far10件とも従来どおり)。`node scripts/check-all.mjs` 25本全緑。
- 次: R19の是正3案は朝の相談に起票済み、判断待ち。ROADMAP残りはR14/R64/R72/R75/R77/R78。

### 2026-09-16 R14 fixtures の不要 OSM タグを keep-list で除去(再生成なし)
- やったこと: `scripts/slim-fixtures.mjs` を新設(`KEEP_TAG_KEYS` 14種+`wikipedia`前方一致をexport)、`make-fixture.mjs` が同じ関数をimportして保存直前に適用する片方管理に統一。既存4 fixture に適用: kusatsu 65.3→55.5KB / hakone 900.1→585.7KB(-35%) / dogo 117.1→93.7KB / beppu 172.7→122.7KB。
- 見た目の確認結果: dump-rank を4エリアで before/after 比較し**差分ゼロ**を確認。`?fixture=hakone`・`?fixture=kusatsu` mobile 撮影して目視、カード・番号ピン・写真・要約・行き方/公式/Instagram等のリンクが従来どおり。`node scripts/check-all.mjs` 25本全緑。
- 次: R75(fixturesサイズ表をREADMEに記録)がR14のafter値を使えるので候補。

### 2026-09-16 R75+R78+R72 文書3件まとめ(コード変更なし)
- やったこと: README にfixturesサイズ表(4エリア×6列、hakoneが大きい理由の説明)を追加しdocs/FIXTURES.mdと相互リンク。`docs/AUTOPILOT.md`に「NEXT.mdの履歴はgit logで追えるためnext-archiveは作らない」旨を追記。`docs/CHECKS.md`を新規作成し25本(サーバを立てる21本/不要な4本)の表・所要目安・並列化不可の理由・必要な改修4点を記載。ROADMAPのR72本文にあった事実誤認(23本→25本、7本以上→21本)も訂正。
- 見た目の確認結果: 文書のみのためデグレ確認1枚(`?fixture=kusatsu` mobile)を撮影・目視、地図ピン30個判読可・カード表示正常・コンソールエラーなし。`git diff --stat -- assets fixtures scripts index.html demo`は空、`node scripts/check-all.mjs`25本全PASS(222.7s)。
- 次: ROADMAP残りはR64/R77/R81/R82/R84/R85。R64はGitHub Actions無料枠確認で判断寄りのため朝の相談向き。

### 2026-09-16 R83 カード要約なしの代替文を淡色1行で表示
- やったこと: `cardHtml()` の `summary` 三項の `: ''` を `NO_SUMMARY_TEXT`(「Wikipediaに記事がありません。地図の情報だけで表示しています。」)に差し替え、既存 `.feedcard__summary` に `.feedcard__summary--none`(色のみ `--c-text-faint`)を2枚がけ。文言は断定を避けたい方(「地図の情報だけで表示しています」)を採用。撮影は実測で要約なしが最多だった dogo(19/30件、ROADMAP本文のbeppuから差し替え)。`scripts/check-nosummary.mjs` を新設し check-all.mjs に登録(26本目)。
- 見た目の確認結果: `?fixture=dogo` mobile --full と `?fixture=kusatsu` mobile を撮影・目視、代替文が本文より明らかに薄いグレーで表示され1行の途中折り返しなし、リンクチップ行の位置も要約ありカードと揃い高さの崩れなし。`node scripts/check-all.mjs` 26本中26本PASS、`node --check assets/app.js` 通過、コンソールエラー0件。
- 次: ROADMAP残りはR64/R77/R81/R82/R84/R85。

### 2026-09-16 R93 iframeのクエリ付きリンク検査は既に対象内と実測確認(コード変更なし)
- やったこと: `docs/check.mjs` の該当行を読み、node で `new URL(raw, url)` を自分で再現(計画役の結論を鵜呑みにせず二重確認)。`demo/hotel-page.html` の相対iframeも `<pre>` 内絶対URLも `pathname` でクエリが落ち `index.html` に解決されることを確認、`docs/CHECKS.md` に新節として記録。
- 見た目の確認結果: `node docs/check.mjs` 実行で `[OK] リンク demo/hotel-page.html → index.html - HTTP 200` を2件確認、exit 0。`?fixture=kusatsu` mobile撮影しカード30枚・番号ピン判読可・文字崩れなしを目視。`node scripts/check-all.mjs` 27本中27本PASS(243.8s)。
- 次: ROADMAP残りはR64/R77/R81/R82/R84/R85。

<!-- 以下は誤ってファイル先頭に積まれていたサイクル記録(R42〜R100)。司令塔が 2026-09-16 17:10 に末尾へ移動 -->
### 2026-09-16 R94 0件文言A/Bを統一
- R94 状態Aの0件文言A/Bを統一。`app.js:401`直前に定数`NO_HOTEL_TEXT`(「この範囲には宿のデータがありません。エリアチップか検索から選べます。」)を新設し、`app.js:407`と`:444`の重複リテラルを`setMapNote(NO_HOTEL_TEXT)`に置換。`?demo=nohotels`と`?demo=autozoom`の撮影2枚を見てA/Bを同一文言のままとした(自動ズームアウト後も違和感なし)。`scripts/check-nohotels.mjs`(コメント+1箇所)・`scripts/check-autozoom.mjs`(2箇所)の期待文字列も同時更新、混雑文言(C)は無変更。
- `node --check assets/app.js`通過、mobileで`?demo=nohotels`・`?demo=autozoom`・desktopで`?demo=nohotels`を目視し新文言「この範囲には宿のデータがありません。エリアチップか検索から選べます。」が3行に収まり地図・チップ行と重ならないことを確認、`?fixture=kusatsu`mobileもカード30枚・番号ピン判読可・コンソールエラー0件でデグレなし。`node scripts/check-nohotels.mjs`5件PASS・`node scripts/check-autozoom.mjs`16件PASS・`node scripts/check-all.mjs`27本中27本PASS(exit 0)。
- 次: R89(check-all.mjs高速化)またはR101(タイルエラー通知)から計画役が選定。
### 2026-09-16 R98 埋め込みiframeにsandbox追加
- R98 埋め込みiframeに`sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`+`referrerpolicy="no-referrer"`を追加。ROADMAP本文の「sandboxは足さない方向」は計画役のPlaywright実測で誤りと判明したため訂正、実iframe・`<pre>`タグ例(`demo/hotel-page.html`)・README埋め込み例の3箇所を同じ属性で揃えた(grep確認済み)。`demo/embed-check.html`はローカル確認用(同一オリジン想定)のため意図的に未変更。
- 属性追加後に自分でPlaywright実測: カード30枚・iframe高さが16312pxまで自動伸長・外部リンク(`.feedcard__link`)クリックで新規タブがGoogleマップ経路URLへOPENED、コンソールエラー0件。`node scripts/check-embedheight.mjs`8件PASS、`node scripts/check-all.mjs`27本中27本PASS(exit 0)。mobile/desktopの撮影も目視、文字崩れ・二重スクロールなし。
- 次: R89(check-all.mjs高速化)またはR92〜R94から計画役が選定。
### 2026-09-16 R96 ライトボックスにフォーカストラップ
- R96 ライトボックスにフォーカストラップを追加。実装前にPlaywrightで現状を再現したところ、開いた直後は`.lightbox__close`だが**Tab 1回目でbody・2回目で背後の`.topbar__back`・3回目以降は地図とピン**へ抜けていた(実測)。`assets/app.js:920`の`lightboxKeyHandler`に`e.key === 'Tab'`分岐を足し、フォーカス可能要素が閉じるボタン1つだけのため`e.preventDefault()`して閉じるボタンに留める形(+11行、将来要素が増えたとき用の理由コメント付き)。`tabindex`・`Escape`・暗幕クリック・`closeLightbox()`の復帰フォーカス(既に実装済みと再確認)は無変更。
- `scripts/check-lightbox.mjs`に5ケース追加(開いた直後のフォーカス位置/Tab×5で留まる/Shift+Tab×3で留まる/Escape後に`.feedcard__imgbtn`へ戻る/embed=1でもTab×5で留まる)し26項目全PASS。Tab連打後のoverlayを撮影して目視、閉じるボタンに白いフォーカスリングが残り背後は暗幕のまま。`?fixture=kusatsu`のmobile/PC幅もデグレなし(カード30枚・番号ピン判読可・文字崩れなし・コンソールエラー0件)、`node scripts/check-all.mjs`は27本全PASS(exit 0)。
- 次: R89(check-all.mjs高速化)またはR92〜R94から計画役が選定。
### 2026-09-16 R95 fixture再取得手順を文書化
- R95 `docs/FIXTURES.md` の「既存 fixture は原則再生成しない方針」節の直前に「鮮度の目安と再取得の手順(R95)」節を新設。(a)半年を目安(統計的根拠は無く運用上の目安と明記)・`buildOverpassQuery()`変更時は期間問わず例外・次の見直しは2027-03頃、(b)Overpassマナー節への相互リンク、(c)dump-rank前後比較→撮影→check-all→NIGHTLOG記録の順序リスト、(d)keep-listはmake-fixture.mjs:14のimportで自動適用済みで手動実行不要、を記載。「保存されるmeta」節からも新節へリンクを追加。
- `git diff --stat -- assets fixtures scripts index.html demo`が空(文書のみ)を確認、`?fixture=kusatsu`をmobileで目視しカード30枚・番号ピン判読可・文字崩れなし・コンソールエラー0件、`node scripts/check-all.mjs`は27本全てPASS(fail語0件)。
- 次: R89(check-all.mjs高速化)またはR92〜R94から計画役が選定。
### 2026-09-16 R91 READMEのdemo値一覧を修正
- R91 README の `?demo=` 値一覧を実装に合わせて修正。app.jsをgrepで再実測し12値(far/zoomout/initpos/suggest/recent/recentmix/passive/imgfail/portrait/nohotels/autozoom/hoteltip)を確認、README.mdの「10個すべて」を「12個すべて」に直し表を3列(値/何が再現されるか/使っている検査)・12行に拡張。portraitの縦長ダミー画像サイズ(400×800)もapp.js:801で実測確認。
- デグレ確認撮影(`?fixture=kusatsu` mobile)でカード30枚・番号ピン判読可・文字崩れなし・コンソールエラー0件を目視。`node docs/check.mjs`(README画像リンク含む)と`node scripts/check-all.mjs`は27本中27本PASS、`git diff --stat -- assets fixtures scripts index.html demo`は空でREADME.md以外への波及なしを確認。
- 次: R89(check-all.mjs高速化・hotelparam分割)または朝の相談待ちのR2-1以外の未着手項目(R92・R93・R94・R95)から計画役が選定。
### 2026-09-16 R88 埋め込み高さ上限を実測値に
- R88 埋め込み高さ通知の受信側上限を暫定100000pxから実測ベースの60000pxへ変更。計画役が4エリア×2幅×2状態(30枚/60枚展開後)を実測し、最大値は kusatsu desktop 60枚展開後の34075px(ROADMAP旧文言「例20000px」は事実誤認・R48当時と同じ罠だった)。実測最大の約1.8倍を採用し `demo/hotel-page.html` の表示用コピーと実スクリプトの2箇所を60000で揃え、根拠コメントを追加。`assets/app.js`(送信側)は無変更(`git diff --stat -- assets` 空)。
- `?fixture=kusatsu&embed=1` のデモページを mobile/desktop で目視、iframe内に二重スクロールなくカードが最後まで表示。`node scripts/check-embedheight.mjs` 8件PASS(「もっと見る」展開後も高さがさらに増える検査が上限60000pxで引き続きPASS)、`node scripts/check-all.mjs` 27本中27本PASS。ついでにR90(`loading="lazy"`)が`demo/hotel-page.html:213`に既に実装済みであることを実測確認しROADMAPを[x]に。
- 次: R89(check-all.mjs高速化・hotelparam分割)または朝の相談待ちのR2-1以外の未着手項目(R91〜R95)から計画役が選定。
### 2026-09-16 R42 要約の句点打ち切り改善
- R42 カード要約の `truncate()` を、上限(120字)手前で最後の「。」があればそこで完結させる方式に変更(句点が上限の60%より手前/無いときだけ従来どおり120字+「…」)。engine.js:289付近と定数SUMMARY_SENTENCE_MIN_RATIOを追加、check-engine.mjsに9ケース追加、既存の120字+…ケースは句点なしテキストのため変化なしと確認。
- kusatsu/hakone/dogoをmobileで目視。1位カード(光泉寺「山号は草津山。」/早雲寺「山号は金湯山。」/伊佐爾波神社「旧社格は県社。」)がすべて句点で終わり文の途中切れ無し、地図ピン30個判読可、コンソールエラー0件。
- 次: R2-1(朝の相談待ち)またはfixture再生成不要な軽量タスクを計画役が選定。
### 2026-09-16 R43 宿ピンにツールチップ追加
- R43 状態Aの宿ピンに宿名ツールチップを追加。app.js:459付近の`renderHotelPins()`で`marker.on('click',...)`直前に`marker.bindTooltip(h.name,{direction:'top',offset:[0,-14],className:'hoteltip'})`を追加し、二重表示を避けるため`L.marker`の`title`オプションを削除(`aria-label`は維持)。タップ即遷移するため開閉はLeaflet既定のhoverのまま(ROADMAP本文の「タップで開く」は不採用、理由をNEXT.mdに明記済み)。撮影用に`?demo=hoteltip`(app.js:1204付近、外部API0回・密集宿6件+長い宿名1件)とscripts/check-hoteltip.mjs(10項目)を新設、check-all.mjsに登録(16本目)。
- `?demo=hoteltip`をmobile/desktopで目視。長い宿名「草津温泉 ホテル紅葉亭」も地図右端で切れず、密集ペアのツールチップも重ならずピン絵文字も隠れていない。check-all.mjsは16本中16本PASS、`?fixture=kusatsu`のカード30枚・番号ピン判読可・コンソールエラー0件でデグレなしを確認。
- 次: R2-1(朝の相談待ち)または残候補(R14/R19/R40/R45/R46)から計画役が選定。
### 2026-09-16 R45 固定データバッジに生成日付
- R45 固定データバッジに生成日付を追加(app.jsにformatFixtureDate()を新設しローカルYYYY-MM-DDで表示、index.htmlに#feed-badge-date、style.cssに.topbar__badge__date)。R46 docs/check.mjsに実バイト数のKB列を追加(content-lengthはgzip圧縮後のためcheckTargetで読んだ本文実体のバイト数で上書き)、末尾に合計サイズ行を追加。
- kusatsu/embed/hakoneをmobileで目視、「固定データ 2026-09-16 取得」が1行に収まり見出しと重ならない・カード30枚判読可・コンソールエラー0件。docs/check.mjsのKB上位3件: fixtures/hakone.json 900.1KB / fixtures/dogo.json 117.1KB / fixtures/kusatsu.json 65.3KB。check-all.mjs 16本全PASS。
- 次: R2-1(朝の相談待ち)または残候補(R14/R19/R40)から計画役が選定。
### 2026-09-16 R49+R50 文書2本追加(判断課題+FIXTURES)
- R49+R50 文書2本を追加(コード変更なし)。README に「## 判断待ちの設計課題」節(4件・結論なし・NIGHTLOGへの参照付き)と `docs/FIXTURES.md`(新規)を追加。`docs/FIXTURES.md` はエリア表3行・実行コマンド・meta一覧・Overpassのマナー・再生成しない方針・buildOverpassQuery同期注意を記載、README の `fixtures/` 行から相対リンクを追加。
- 画面変更が無いため撮影は省略。`ls docs/FIXTURES.md` で実在確認、`node docs/check.mjs` OK(README画像3本含む既存検査もPASS)、`node scripts/check-all.mjs` 17本中17本PASS・exit 0、`git diff --stat -- assets fixtures scripts index.html demo` は空を確認。
- 次: ROADMAP残りはR14/R19/R23/R28/R31/R32/R33/R34/R40/R42/R43/R51。R49で公開した4件の判断待ちのうち検索候補とチップの重なり(R2-1)含め依然未決。
### 2026-09-16 R84 ?debug=1でスコア内訳表示
- R84 `?fixture=` 併用時のみ効く `?debug=1` を追加し、rank のスコア内訳をカード下端に淡色表示。engine.js は baseScore を `scoreBreakdown()`(image/summary/official/both/distance/season/base)に切り出し、加算順を1行も変えずに `rank()` の最後で `entry.item._debug`(rank・source・category・distanceM・total・categoryPenalty・categoryIndex)を後付け、`toCard()` に `_debug` を1行追加。app.js は `fixtureNameFromUrl()` が null なら絶対にフラグを立てず、fixture 読み込み失敗の catch でも `debugRank=false` に戻す。WEIGHT・CATEGORY_FREE_SLOTS は無変更。
- `?fixture=kusatsu&debug=1` mobile を目視: 1位カードに「#1 · both · place_of_worship · 108m · 合計 71.4 写真+25 要約+15 公式+12 両ソース+20 距離-0.6」が375pxで2行に収まり、リンクチップともカード枠とも重ならず本文より確実に淡い。`?fixture=kusatsu`(debug無し)mobile は内訳行が1つも出ずカード30枚のままでデグレなし。埋め込み(`?embed=1`)でも出す判断にした(埋め込みは `?fixture=` 併用時しか有効にならず、一般公開URLに内訳が漏れる経路が無いため。分岐を足すと debugRank の条件が二重になり漏れの検証が難しくなる)。
- 検証: `node scripts/dump-rank.mjs` の kusatsu/hakone/dogo/beppu 4エリアが実装前後で差分ゼロ(計算結果は不変)。check-engine.mjs に (r84) 10ケース追加(_debug を落とせば元の JSON に戻る・2回呼んでも順序同一・total === base + categoryPenalty)で226 pass/0 fail、新規 scripts/check-debugflag.mjs(11項目、`?debug=1` 単独で `.dbg` 0件を含む・外部API 0回)を check-all.mjs に登録し27本中27本PASS。次: R64(GitHub Actions 無料枠・朝の相談寄り)/R77(表示可否の判断)/R81(Overpass を叩く fixture 追加)/R82(aria-label 1行)/R85(英語デモページ)から計画役が選定。
### 2026-09-16 R82 戻るボタンaria-label検査追加
- R82 実測したら `index.html:56` に `aria-label="地図に戻る"` は既に実装済み(ROADMAP本文は事実誤認)だったため、`scripts/check-a11y.mjs` に別立ての `LABEL_TARGETS` ループを追加し戻るボタンの aria-label 検査のみ新設。既存の44px計測ループは無編集。
### 2026-09-16 R77 もっと見るB案は不採用
- R77 `?fixture=kusatsu` mobile で `#feed-note` を撮り比べ。現状(出さない)と「上位30件を表示中（全60件）」を足したB案の2枚を目視した結果、「残り30件」は `moreHtml()` が既に表示しておりB案は情報の二重化かつ行数増で間延びするだけ、かつ正確な総数はengine.js改修なしには出せない(R77はengine不可)ため**不採用**。app.jsは変更なし(撮影用の一時差し込みは撮影後に必ず元へ戻し済み・`git diff --stat -- assets` 空を確認)。
- 次: ROADMAP残りはR64(GitHub Actions無料枠・朝の相談寄り)/R81(Overpass1回・同僚検証前は4エリアで十分)/R85(国内予約サイト想定で優先度低)。すべて判断寄りのため計画役が朝の相談経由で選定。
### 2026-09-16 R87 状態Bスケルトンを撮影確認
- R87 状態Bのスケルトン(読み込み中の骨組み)を`?fixture=kusatsu&slow=osm3000,wiki9000`のmobile/desktopで撮影・目視。(a)骨組み高さ312.3px・実カード高さ370.7px(差約58px、カード間余白で自然に区切られガタつき軽微)(b)灰色グラデーションのスケルトンと白背景の実カードの境目は明確(c)`prefers-reduced-motion: reduce`で`getComputedStyle(el).animationName`が`none`になることを実測、既存のシマー停止実装が機能している。3点とも崩れなしのためstyle.cssは無変更で閉じた。ついでにR86(もっと見るのスクロール位置維持)も計画役の実測により実装不要と判明したため合わせてクローズ。
- 撮影は`screenshots/`に4枚保存(mobile/desktopのスケルトン状態、mobile全体、デグレ確認用の通常状態)。`node scripts/check-all.mjs`は27本中27本PASS(1回目はcheck-nohotels.mjsが環境要因のERR_NO_BUFFER_SPACEで一過性FAIL、単体再実行と2回目の通しで全緑を確認済み)。
- 次: ROADMAP残りはR64(GitHub Actions無料枠・朝の相談寄り)/R81(Overpass1回)/R85(英語デモページ)/R88(埋め込み高さ上限見直し)/R89(check-all高速化)/R90(iframe lazy)から計画役が選定。
### 2026-09-16 R89 check-hotelparamを高速化
- R89 `scripts/check-hotelparam.mjs` の固定待ち(`waitFor(1500)`×17回)を条件待ちに置換。`waitRendered()`共通ヘルパ(#feed-title描画完了、5000msタイムアウト)を新設し、バッジ可視/日付/状態A(#map の leaflet-container 付与待ち)もそれぞれ専用の条件待ちに変更。タイムアウトは例外を投げず既存の`ok()`判定にFAILとして畳み込む方式にした(全体停止を避けるため)。検査項目・ok()呼び出し数・page.goto回数(17件)は無変更。
- 実測: 変更前中央値33553ms→変更後中央値8428ms(約75%短縮)、41 pass/0 fail(変更前後で一致)、連続5回すべてPASS(フレークなし)。`?fixture=kusatsu`mobileを目視し番号ピン判読可・カード30枚・コンソールエラー0件でデグレなし。`check-all.mjs`は27本中27本PASS/合計221.2s(前回約244sから短縮)。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R101 地図タイル失敗を1行通知
- R101 状態Aの地図タイル読み込み失敗を1行で伝える。`L.tileLayer(...)`を変数`tiles`で受け`tileerror`を購読、1枚失敗で即出すとネットワーク一過性ノイズになるため**3秒以内に4枚以上失敗**した時だけ`setMapNote(TILE_ERROR_TEXT)`(「地図の背景画像を読み込めませんでした。ピンと提案はそのまま使えます。」の2文形式)をセッション1回だけ出す方式を採用(NEXT.mdの実測では発火回数は未計測だったため、通常のタイル切替や一瞬の途切れでは反応しない安全側のしきい値として自分で決めた)。宿の取得が進むと既存の`setMapNote('')`等で上書きされて消えるが、タイルが復帰しなくても宿の案内の方が新しい情報なので構わない。状態Bの小地図(`app.js:1149`)は`.mapnote`相当の要素が無いため対象外。
- `page.route()`でtile.openstreetmap.orgを遮断したPlaywrightスクリプトで撮影し、灰色地に白文字で文言が1行に収まり文字崩れ・重なりなしを目視。`scripts/check-nohotels.mjs`に4項目追記(遮断時に文言一致・可視・overpass等fetch0回、通常時は文言が出ないこと)し9 pass/0 fail、`check-all.mjs`は27本中27本PASS。`?fixture=kusatsu`mobileの通常撮影でもデグレなしを確認。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R97 印刷用CSSを新設
- R97 印刷用CSSが0行だった状態を確認後、`assets/style.css`末尾に`@media print`を1ブロック追記(地図非表示・topbar固定解除・戻るボタン非表示・lightbox/passivebox非表示・カード分断防止・チップ枠線を薄く)。地図は紙でタイルが読めない懸念のため**消す方針**にし、`.feedmap`ごと非表示にすることでOSM帰属表示も一緒に消えるが地図が無いので規約上問題なし。また`.feed`は元々`flex-direction:column`の1カラム構成だったため、依頼にあった「カード1カラム化」の追加改修は不要だった。
- 印刷メディア(desktop1280/A4相当794/mobile375)で戻るボタン・地図・passiveboxが消えカードが白背景で幅内に収まることを撮影・目視。通常表示`?fixture=kusatsu`mobileは変更前と同一でデグレなし。`git diff assets/style.css`は`@media print`ブロック25行の追加のみ。`node scripts/check-all.mjs`は27本中27本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R104 README英語段落を拡張
- R104 README.md:3の英語段落(3文)を4文に拡張。fixtureがkusatsu/hakone/dogo/beppuの4エリア+randomであること、`?debug=1`はfixture併用時のみ有効なこと、`?embed=1`を`?hotel=`と併用するとiframe埋め込み(高さ自動)ができることを追記し、日本語表を案内する1文で締めた。用語は翻訳せずそのまま使用。
- `git diff README.md`で日本語行の差分ゼロ・英語段落1行のみの変更を確認。画面変更なしのため撮影省略、`node docs/check.mjs`OK、`node scripts/check-all.mjs`は27本中27本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R105 検索0件時に案内文表示
- R105 `?q=`が0件のとき無言で草津のまま止まる非対称を解消。`app.js:1676`の早期returnを分岐に変え、0件時のみ`setMapNote()`で「『<入力値>』は見つかりませんでした。エリアチップか検索から選べます。」(`NO_HOTEL_TEXT`後半と同一文言・textContent経由のためescapeHtmlは付けず)を表示。検索欄側(`app.js:641`)の文言は表示先が違う(ドロップダウン)ため今回は統一対象外とし変更なし。
- `scripts/check-hotelparam.mjs`にPlaywright `page.route()`でNominatimを`[]`応答に差し替えるケースを1件追加(l.q0件でmapnote表示、5項目)し46 pass/0 fail(既存17件のgotoは無削減)。`?q=そんちょうざいしないちめい`0件時の`.mapnote`表示をスクリーンショットで目視し文字崩れ・はみ出しなし、`?fixture=kusatsu`mobileの通常表示もデグレなし。`node scripts/check-all.mjs`は27本中27本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。本番URLでの`?q=`実API確認1回はpush後に実施予定。
### 2026-09-16 R106 CHECKS.mdを実体と一致させ
- R106 `docs/CHECKS.md`を`scripts/check-all.mjs`の実体(26本+docs/check.mjs=27本)と一対一に合わせた。実測で名前を突き合わせた結果、幽霊行は0本・未掲載は`check-debugflag`と`check-nosummary`の2本のみで、これを表に追加し本数表記(25→27/24→26/21→23/4本→3本+docs/check.mjs)を全箇所訂正。ROADMAP本文の「27行」は数え方の誤認と判明(名前一致では差分0)。
- `docs/CHECKS.md`の表27行=`check-all.mjs`実行結果27本と一致を確認、`?fixture=kusatsu`mobileのデグレ確認撮影も文字崩れなし。`git diff --stat -- scripts docs/check.mjs assets index.html`は空(コード無変更)、`node scripts/check-all.mjs`は27本中27本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R107 初回カード描画msを検査
- R107 `scripts/check-firstcard.mjs`を新設し`?fixture=kusatsu&perf=1`の`first-card-painted`ms(console/`#perf-box`の既存2経路、app.js無変更)を標準出力に記録、しきい値`FIRST_CARD_MAX_MS=200`(実測中央値24msの約8倍、CI揺らぎで赤くしない方針)で判定。`check-all.mjs`に28本目として登録し、`check-all.mjs`本数コメント・`docs/CHECKS.md`表と本数表記・`docs/FIXTURES.md`の「27本全緑」を28本に更新(grep確認済み、AUTOPILOT/README.mdに27本表記なし)。
- 単体連続5回すべてPASS(実測ms: 24/24/108/26/24、中央値24ms、200ms上限に対し十分な余裕を確認)、`node scripts/check-all.mjs`は28本中28本PASS(合計237.5s)。`git diff --stat -- assets index.html fixtures demo`は空(アプリ本体無変更)、画面変更なしのため撮影は省略。
- 次: ROADMAP残りはR64/R81/R85/R88/R90/R108(`?q=`長さ上限)/R109(iframe属性一貫性検査)/R110(受動ログの古いエントリ掃除)から計画役が選定。
### 2026-09-16 R108 検索語の表示を20字に制限
- R108 `noQueryHitText`に`QUERY_ECHO_MAX=20`を追加し入力値を先頭20字+「…」に切り詰め(文言後半・`NO_HOTEL_TEXT`は無変更)。`check-hotelparam.mjs`の`checkQueryNoHit`は期待文字列組み立てにも同じ切り詰めを適用し、100字`q`のケースを1件追加(51文字以内を機械検査)、既存17件のgotoは無削減。
- `?q=`100字をmobile/desktopで撮影し黒帯が2行に収まり草津の地図が読めることを目視、`?fixture=kusatsu`mobileもデグレなし。`check-hotelparam.mjs`は53 pass/0 fail、`node scripts/check-all.mjs`は28本中28本PASS。`git diff --stat -- assets/style.css index.html fixtures demo`は空。
- 次: ROADMAP残りはR64/R81/R85/R88/R90/R109(iframe属性一貫性検査)/R110(受動ログの古いエントリ掃除)から計画役が選定。
### 2026-09-16 R110 受動ログに90日期限追加
- R110 受動ログ`yado.passive.v1`に90日の期限掃除を追加。`app.js:294-295`に`PASSIVE_MAX_AGE_DAYS=90`と`PASSIVE_MAX_AGE_MS`を定数化し、`passivePush()`(`app.js:302`)の書き込み時に`t`が90日より古いレコードのみ落とす1行フィルタを追加(件数上限200件は従来どおり別枠で維持)。90日は旅行検討サイクル(数週間〜2ヶ月)+季節1つ分を残す目安として`docs/passive-log.md`の「rank検証の材料」目的と突き合わせて採用。実測での訂正: ROADMAP本文にあった「R61(`initialView()`)が何ヶ月も前の宿を初期位置に使う」は事実誤認で、R61が読むのは`yado.recent.v3`(受動ログとは別キーで`t`を持たない)であり今回の掃除の対象外。
- `?fixture=kusatsu&demo=passive`で91日前/89日前/`t`なしの3種を仕込んだ機械検査(`scripts/check-passive.mjs`に追加、既存項目は無削減)で91日前のみ消え89日前と`t`なしは残ることを確認、`.passivebox`の総件数表示とも整合。`?fixture=kusatsu`mobileの通常表示もカード30枚・文字崩れなしでデグレ無しを目視。`node scripts/check-all.mjs`は28本中28本PASS、`git diff --stat`で対象外ファイル(style.css/index.html/fixtures/demo/geo.js)は無変更。
- 次: ROADMAP残りはR64/R81/R85/R88/R90/R109(iframe属性一貫性検査)から計画役が選定。
### 2026-09-16 R109 iframe属性の一貫性検査
- R109 `docs/check.mjs`にiframeの`sandbox`/`referrerpolicy`一貫性検査を追加。実iframe(`demo/hotel-page.html`実タグ)・タグ例(同ファイル`<pre class="tag-example">`、HTMLエスケープをデコード)・`README.md`タグ例の3箇所をローカルファイルから直接読み(fs.readFileSync、追加のネットワークアクセス0回)、sandboxトークンをSetにして期待値4トークンと集合一致するか・referrerpolicyが`no-referrer`かを`report()`で3行出す。
- README.md:42の`allow-popups`を一時的に消して`node docs/check.mjs`を実行しNG+exit 1を確認、直後にEditで元に戻し`git diff README.md`が空であることを確認済み。`node docs/check.mjs`は新3行含め全OK・exit 0、`node scripts/check-all.mjs`は28本中28本PASS(合計236.8s)。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R112 ?bg=に輝度判定を追加
- R112 `bgFromUrl()`(`app.js:1428`)の書式検査直後に相対輝度判定を追加。閾値`BG_MIN_LUMINANCE=0.5`は地色に直接乗る`.feednote`/`.morenote`(`--c-text-faint` #9494a3)が黒地でちらつく実測に基づき採用、`#fff7e6`(L≈0.93)は通し`#333333`(L≈0.033)は弾く境界として決定。閾値未満は`null`を返し既定地色にフォールバック(画面へのエラー表示なし)。根拠と挙動はREADME.mdの`?bg=`説明行と`demo/hotel-page.html`の該当箇所に1行ずつ追記。
- `bg=000000`/`bg=fff7e6`をmobileで撮影し目視、暗色は既定のクリーム系地色にフォールバック・明色は従来どおり適用されることを確認(文字崩れ・はみ出しなし)。`scripts/check-embedbg.mjs`に暗色2ケース(`000000`/`333333`が既定色フォールバック)を追加し20 pass/0 fail、`node scripts/check-all.mjs`は28本中28本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90/R113(同一エリアチップ連打でOverpass再取得)から計画役が選定。
### 2026-09-16 R113 flyToに同一view防止ガード
- R113 `flyTo()`(`app.js:516`)に第4引数`force`を追加し、直前と同じ中心座標・同じズームなら`setView`/`saveMapView`/`autoZoomArmed`/`loadHotelsInView`を一切呼ばず`return`するガードを実装。`?demo=autozoom`(`app.js:1620`)だけ`force=true`で従来どおり必ず実行、`?q=`ジャンプ・検索候補・エリアチップの3箇所は無変更(ガードを効かせたい経路のため)。
- `scripts/check-autozoom.mjs`に7・8番として通常モード(page.routeでOverpass/Nominatimをfulfillしカウント)のケースを追加し、同一チップ3連打でリクエストが増えない・別チップで増える・aria-current維持を確認(20 pass/0 fail)。`check-chipcurrent.mjs`(10 pass/0 fail)も回帰なし、`?fixture=kusatsu`mobile撮影も文字崩れ・はみ出しなしを目視。`node scripts/check-all.mjs`は28本中28本PASS。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R111 リンクのtarget/rel検査
- R111 `scripts/check-links-target.mjs`を新設し`?fixture=kusatsu`(embed=1含む)・「もっと見る」展開後の`.feedcard__link`が`target="_blank"`かつ`rel`に`noopener`をトークンとして含むことを機械検査。実測本数は初期表示128本・展開後253本(いずれも0本ではなく全件条件を満たしPASS)、`app.js`側の属性欠落は無かったため`app.js`は無編集。`check-all.mjs`に29本目として登録、`docs/CHECKS.md`表と本数表記・`docs/FIXTURES.md`の「28本全緑」を29本に更新。
- `?fixture=kusatsu`mobileを撮影し光泉寺カードのチップ5本(行き方/公式/Instagram/TikTok/YouTube)が1行に収まり崩れ・はみ出しなしを目視(画面変更なし)、`git diff --stat -- assets index.html fixtures demo`は空。`node scripts/check-all.mjs`は29本中29本PASS(合計252.9s)。
- 次: ROADMAP残りはR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R114 日英表記ゆれの重複を救済
- R114 `engine.js` の `isSamePlace` **末尾**に日英表記ゆれの救済経路を1本追加(既存3経路は無改変)。ヘルパ `websiteHost()`(`new URL()`でhostname取得・先頭`www.`除去・不正URLはtry/catchでnull)と `looksAscii()`(`/^[\x20-\x7E]+$/`)を新設し、**「公式サイトのホスト一致 + カテゴリ一致 + 片方が純ASCII名/片方が日本語名 + 150m以内」の4条件AND**のときだけ同一地点とみなす。主タグ文字列は items が持っておらず `category` しか無いため主タグ一致は `category` 一致で代用した(`historic=castle` どうしは両方 `castle` に落ちるので主タグ一致と同義)。
- 4エリアで `dump-rank` を変更前後で全件比較: **kusatsu/hakone/beppu は完全に無差分**、dogo のみ27位「Matsuyama Castle」が消えて28〜30位が1つずつ繰り上がり「日尾山展望台」が30位に繰り上がる期待どおりの差分(松山城は10位に1枚・source=both・公式サイト○を維持、`松山城跡`(historic=memorial)は別物としてmore 4位に残存)。`check-engine.mjs` に救済が効くケースと誤爆しないケース計8件(宮永岳彦記念美術館↔弘法の里湯、うみたまご館内施設3件、カテゴリ違い・ホスト違い・公式サイト欠落・300m超・不正URL)を追加し234 pass/0 fail。なお道後の並びが1つ繰り上がった結果、22番ピンがOSM帰属表示(右上・必須表示)に重なり `check-attrib` が dogo で落ちたため、`app.js` の `renderFeedMap` で帰属表示の矩形中心を `nudgeOverlaps` の `fixedPoints` に渡してピン側を避けさせる修正を併せて実施(rank の重み・閾値・geo.js・fixtures は無改変)。
- 次: `?fixture=dogo` mobile/desktop と `?fixture=kusatsu` mobile を撮影し目視、松山城1枚・30枚・帰属表示の重なり解消・文字崩れなしを確認。`node scripts/check-all.mjs` は29本中29本PASS。ROADMAP残りはR115(草津の温泉カテゴリ誤判定)/R116(一般名詞のみの候補)ほかR64/R81/R85/R88/R90から計画役が選定。
### 2026-09-16 R115 廃止施設を定義文で除外
- R115 `engine.js` のカテゴリ推定に**記事本文の定義文で否認する経路**を追加(rank の重み・閾値・geo.js・fixtures は無改変)。`WIKI_CATEGORY_HINTS` の hot_spring 行にだけ `deny`(バスターミナル/スキー場/遊園地/球技場/ゴルフ場/競馬場/空港/駅である/山。/山である/岳。/岳である)を持たせ、新ヘルパ `definitionScope()`(extract 先頭120字を**最初の句点まで**で打ち切り title と連結)と `isDenied()` を新設。`guessWikiCategory()` の title 走査・extract 走査の**両方**で否認された hint を飛ばす。否認範囲を一文目に限ったのは、二文目の「万座温泉スキー場に隣接している」で正当な温泉宿(万座プリンスホテル)を落とさないため。
- 9件を1件ずつ確認: **直った4件**=草津温泉バスターミナル(kusatsu 4位 温泉→スポット)・草津温泉スキー場(同22位 温泉→スポット)・冠山 (松山市)(dogo 7位 温泉→スポット)・鶴見園(beppu 10位 温泉→スポット)。**温泉のまま残った5件**=花敷温泉(kusatsu more 3位→cards 23位)・天成園(hakone 9位)・一の湯(hakone 10位)・杉乃井ホテル(beppu 18位)・大江戸温泉物語 別府清風(beppu 30位→19位)。**hakone は完全に無差分**。並び順は kusatsu と beppu で変化あり(カテゴリ多様性減点 `CATEGORY_PENALTY` が温泉枠を空けたため): kusatsu は花敷温泉・白旗源泉が more から cards 23/24位に上がり、横手山・草津聖バルナバ教会・煮川源泉・西の河原源泉が cards から more へ、万座温泉スキー場も温泉→スポットになり more 3位へ。beppu は大江戸温泉物語 別府清風が30位→19位に上がり以降が1つずつ繰り下がった。dogo は7位のラベルのみ変化で並びは不変。`check-engine.mjs` に (r115) 節を新設し実fixture冒頭文ベースで11ケース追加(直す4件・残す5件・deny が hot_spring 行だけであることの対照2件)、245 pass/0 fail。
- `?fixture=kusatsu` mobile で4位カードが♨温泉→📍スポットに変わり文字崩れ・はみ出し無しを目視、`?fixture=hakone` mobile で9位天成園・10位一の湯が♨温泉のままデグレ無しを目視。`node scripts/check-all.mjs` は29本中29本PASS。
- 次: ROADMAP残りは R116(一般名詞のみの候補・誤爆リスク高)ほか R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R117 他社の宿を候補から除外
- R117 `engine.js` に**他社の宿を候補ごと落とす**経路を追加(rank の重み・閾値・geo.js・fixtures は無改変)。新配列 `DEFINITION_LODGING_NG`(ホテル/旅館/温泉宿/ペンション/民宿/ゲストハウス/宿泊施設)を `EXTRACT_KEYWORD_NG` の直後に置き、`isExcludedArticle()` の `EXTRACT_KEYWORD_NG` ループ直後で判定。走査範囲は `EXTRACT_KEYWORD_NG`(extract全体)ではなく R115 の `definitionScope()`(冒頭の一文)に限り、さらに新ヘルパ `definitionPredicate()` で主題部(「〇〇ホテル前（まえ）は、」= 記事名の言い直し)を落として**述部だけ**を見る。二文目の「万座温泉スキー場に隣接している」で観光対象を巻き込まないため、かつ名前だけで落とさないため。
- 12件を1件ずつ確認: **落とした7件**=天成園(hakone 9位)・一の湯(同10位)・ヒルトン小田原リゾート&スパ(同25位)・杉乃井ホテル(beppu 18位)・大江戸温泉物語 別府清風(同19位)・万座プリンスホテル・渋峠ホテル(kusatsu は元々60件外)。**残した側は全件無傷**=日帰り入浴施設(天成園 屋上浴場/天成園足湯/箱根湯寮/かっぱ天国/大滝乃湯/御座之湯/椿の湯/媛彦温泉/やまなみの湯/弥坂湯/姫之湯/不老泉)・本物の温泉記事(竹瓦温泉/浜脇温泉/花敷温泉/尻焼温泉 川風呂)・R115 の4件(草津温泉バスターミナル/草津温泉スキー場/冠山 (松山市)/鶴見園)・峠そのものの記事「渋峠」(kusatsu 29位)。4エリア200記事に対し変更前後で除外判定を全件突き合わせ、**変わったのは上記7件だけ**(誤爆0件)。`dump-rank` 差分は **kusatsu/dogo が完全無差分**、hakone が3件減・beppu が2件減で以降繰り上がり(繰り上がった候補も全件目視、宿・非観光対象なし)。`check-engine.mjs` に (r117) 節を新設し17ケース追加(落とす7件+残す対照6件+日帰り入浴施設4件、既存ケースは1件も削らず R115 の宿4件は期待値を「候補から消える」へ移設)、262 pass/0 fail。
- なお hakone の並びが繰り上がった結果、23番ピンがOSM帰属表示(右上・必須表示)に重なり `check-attrib` が落ちたため(R114 と同種の再発)、`app.js` の帰属表示の `fixedPoints` を**中心1点から箱の幅に沿った等間隔の複数点**に変更して横長の箱全体で押しのけるよう修正。`?fixture=hakone` mobile で宿が消え帰属表示の重なりも解消・30枚のまま文字崩れ無しを目視、`?fixture=kusatsu` mobile でデグレ無しを目視。`node scripts/check-all.mjs` は29本中29本PASS(exit 0)・外部API 0回。次: ROADMAP残りは R116 ほか R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R118 地図の帰属表示を矩形退避
- R118 OSM帰属表示の退避を**点の集まりから矩形**へ作り直した(帰属表示の表示状態・文言・CSSは無改変。ライセンス上の必須表示なので消さない)。`app.js` の `nudgeOverlaps` に第3引数 `obstacles`(矩形配列)を追加し、`renderFeedMap` は `getBoundingClientRect()` で実測した帰属表示の矩形そのものを1個だけ渡す(1行/2行のどちらでも自動追従)。ピンも中心±実寸/2の矩形(番号24px・上位27px)として扱い、`BOX_PAD=4px` を空けた矩形 vs 矩形で判定。帰属表示だけは**絶対制約**にしてベストエフォートの「いちばんマシな候補」の比較対象から外し、リング探索を使い切った場合は「箱の下端+ピン半径+PAD」へ決定的に逃がす。`clamp` で縁に張り付いた後にももう一度同じ制約を通す。ピン同士の距離定数(TOP_DIST/SUB_DIST/HOTEL_DIST)と rank の重み・閾値・engine.js・geo.js・fixtures は1行も触っていない。
- **余裕px(矩形間距離の実測)**: kusatsu 26.6px / hakone 10.0px / dogo 9.1px / beppu 20.0px / kusatsu-embed 26.6px。計画役の「hakone 16px」は点(中心)基準の値で、今回の矩形基準では箱とピン矩形の隙間そのものを測っているため数値が小さく出るが、**4エリアすべてで重なり面積0**(BOX_PAD=4px を必ず確保)。ピン同士の矩形重なりは kusatsu 11ペア/hakone 3/dogo 3/beppu 1 で**悪化なし**(dogo は4→3に改善)。`check-attrib.mjs` は判定を矩形の重なり面積で行うよう直し(既存の a〜c 検査は1本も削っていない)、beppu を対象に追加、全ピンが地図の外に出ていないことの検査を新設、そして**順位非依存の実証**として `YadoApp.reorderCardsForTest`(並べ替えて `renderFeedMap` をやり直すだけの検証用フック。rank は呼ばない)で **正順・逆順・ランダム3通りの計5パターン × 5URL** を回し全て重なり0。125 pass / 0 fail。
- `?fixture=` の4エリア mobile と hakone desktop を撮影して目視、帰属表示「Leaflet | © OpenStreetMap」が5枚とも右上にはっきり読め、ピンが箱に乗らず番号も判読でき、地図外へのはみ出し・文字崩れなし。`node --check assets/app.js` OK、`node scripts/check-all.mjs` は29本中29本PASS(exit 0・合計269.3s)、外部API 0回。次: ROADMAP残りは R116 ほか R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R119 存在しない施設を追加除外
- R119 `engine.js` に**「まだ在るか」を見る経路**を追加(rank の重み・閾値・geo.js・fixtures は無改変)。新定数 `DEFINITION_GONE_MARK`(「かつて」)と `DEFINITION_GONE_PAST`(存在した/存在していた/あった)を `DEFINITION_LODGING_NG` の直後に置き、R117 と同じ `definitionPredicate()`(定義文の述部)で**2語の AND** のときだけ落とす。「あった」単独に緩めると湯築城(dogo 4位の正当な観光対象)・石垣山城・羽根尾城を巻き込むので絶対に緩めない。**NEXT.md の想定と1点違った**: この判定だけは `isProtectedName()`(保護リスト)より**先に**評価する必要があった。保護リストは「名前が観光の種別語で終わるなら守る」という**「何であるか」を守る**仕組みで「まだ在るか」を見ていないため、指示どおり R117 のループ直後に置くと `愛媛県立道後動物園`(`動物園` で保護)・`白根火山ロープウェイ`(`ロープウェイ` で保護)が冒頭文に到達せず生き残った(実測で判明・順序を入れ替えて解決)。
- 4エリア200記事の除外判定を変更前後で全件突き合わせ、**変わったのは6件だけ**(全て kept→EXCLUDED・観光対象の誤爆0件): **落とした6件**=草津シズカ山スキー場(kusatsu cards 13位)・白根火山ロープウェイ(同 more 4位)・愛媛県立道後動物園(dogo cards 12位)・鶴見園(beppu cards 10位)・キャンプ・チッカマウガ・別府鉱山(後2件は既に別ルールで除外済みのため画面は不変)。**残した側は全件1件ずつ確認して無傷**=湯築城・石垣山城・石垣山一夜城歴史公園・羽根尾城・長野原城・別府駅商業施設(beppu 9位・現役の駅ビル)・群馬鉄山(「かつて」が無いので今回は対象外)・石橋山の戦い。`dump-rank` 差分は **hakone が完全無差分**、kusatsu/dogo/beppu は該当1件が消えて以降が1つずつ繰り上がるだけ(繰り上がった横手山・御幸寺山・城島高原パーク・地蔵の湯・子規堂・鶴見岳も全件目視、廃止施設・宿・非観光対象なし・30枚維持)。`check-engine.mjs` に (r119) 節を新設し13ケース追加(落とす6件+残す対照6件+OSM救済1件、既存ケースは1件も削らず R115 の鶴見園は期待値を「候補から消える」へ移設)、275 pass/0 fail。`check-nosummary.mjs` は要約ありの道後動物園が消えて要約なしの御幸寺山が繰り上がったため定数を19→20に更新(検査項目は不減)。
- `?fixture=kusatsu` / `?fixture=dogo` / `?fixture=hakone` の mobile を撮影して目視、3枚とも廃止施設が消えてカード30枚・帰属表示「Leaflet | © OpenStreetMap」が右上にはっきり読め・ピンの重なりや番号の判読不能・文字崩れ・はみ出しなし(hakone は1位早雲寺のままデグレなし)。`node --check assets/engine.js` OK、`node scripts/check-all.mjs` は29本中29本PASS(exit 0)・外部API 0回。次: ROADMAP残りは R116 ほか R64/R81/R85/R88/R90 から計画役が選定。なお `check-distance`/`check-embedbg` が別々の回に1度ずつ落ちたが、いずれも単独実行で全PASS・うち1件は終了コード 3221226505(ブラウザ起動のクラッシュ)で変更前の 11:16 にも同じコードで別スクリプトが落ちており、環境由来のフレークと判断。
### 2026-09-16 R120+R121 現役療養所を観光提案外
- R120+R121 `engine.js` の除外に2本の経路を追加(rank の重み・閾値・geo.js・fixtures は無改変)。**R120**は `DEFINITION_GONE_SOLO = ['存在した','存在していた']` を新設し、R119 の AND 判定より**前**・保護リストより**前**で単独成立させた。「かつて」を書かずに過去形だけで廃止を述べる記事を落とす経路で、`あった` は**絶対に単独へ入れない**(湯築城 dogo 4位・石垣山城・羽根尾城・長野原城を巻き込むため)。**R121**は新しい軸で、`DEFINITION_NOT_VISITABLE = ['療養所','刑務所','拘置所','少年院']` を同じ位置に置いた。R119/R120 が見ているのは「まだ在るか」だが、`国立療養所栗生楽泉園`は**現存する**ため素通りしていた。入所者が今も生活している現役の療養所を「宿の周りの見どころ」として行き方つきで並べるのは配慮を欠くので、「**現存するが観光目的の訪問が適切でない施設**」として落とす。
- **重監房資料館の扱い(R121 の前提条件)**: 判定を**名前ではなく定義文の述部**で行ったため、学びの導線は完全に無傷。実データの重監房資料館は OSM 由来(`tourism=museum`・extract 無し)で走査対象にすらならず、**変更後も kusatsu more に残る**(more 29位→27位に繰り上がっただけ)ことを `dump-rank` で実測確認した。名前に `療養所` を含む候補を落とす設計にしていたら敷地内の公開施設まで塞ぐ恐れがあったが、述部判定ならその危険が構造的に無い。4エリア200記事の除外判定を変更前後で全件突き合わせ、**変わったのは2件だけ**(誤爆0件): 国立療養所栗生楽泉園(kusatsu cards 12位)と群馬鉄山(同 14位)。`存在した/存在していた` の述部ヒット7件は全件が本当に現存せず、残り6件は R119 で既に除外済みなので画面は不変。`療養所` の述部ヒットは栗生楽泉園1件のみで、`刑務所/拘置所/少年院` は述部ヒット0件(名前側の TITLE_SUFFIX_NG と同趣旨の取りこぼし塞ぎで、現状の判定は1件も変えない)。`dump-rank` 差分は **hakone/dogo/beppu が完全無差分**、kusatsu のみ2件消えて以降が2つずつ繰り上がり(繰り上がった草津聖バルナバ教会・万座温泉スキー場・横手山渋峠スキー場・今宮渓谷を全件目視、廃止施設・宿・非観光対象なし・cards 30枚維持)。
- `check-engine.mjs` に (r120) 節(落とす3件+`あった` 系の残す対照5件+OSM救済1件)と (r121) 節(落とす1件+残す3件+**OSM由来の重監房資料館が残ること**の本命ケース)を新設、289 pass/0 fail。既存ケースは削っていないが、R119 節にあった `群馬鉄山`(drop:false)は R120 で期待値が反転するため (r120) 節へ drop:true として移し、空いた枠に同型の残す対照 `長野原城` を足した(検査項目は不減)。`?fixture=kusatsu` mobile で2件が消えてカード30枚・ピン1〜30が判読でき帰属表示「Leaflet | © OpenStreetMap」が右上にはっきり読めること、`?fixture=hakone` mobile でデグレなし(1位早雲寺のまま)を撮影・目視。`node --check assets/engine.js` OK、`node scripts/check-all.mjs` は29本中29本PASS(exit 0・合計272.4s)・外部API 0回。次: ROADMAP残りは R122 ほか R116/R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R123 記事なし誤表示26件を是正
- R123 「Wikipediaに記事がありません」の誤表示を是正。`engine.js` の `toCard()` に `wikipediaTitle`/`wikidataId` を2行追加(rank・除外・geo.js・fixtures は無改変)、`app.js` は要約なしのカードを「記事あり(HAS_ARTICLE_NO_SUMMARY_TEXT)+Wikipediaへのリンク」と「真に記事なし(NO_SUMMARY_TEXT)」の3分岐に分け、リンクは他の外部リンクと同じ target="_blank" rel="noopener"。dogo で --none の内訳が **20件(記事あり0/記事なし20)→20件(記事あり8/記事なし12)** に是正、4エリア合計では誤表示だった26件(kusatsu2/hakone6/dogo8/beppu10)全てが新文言に切り替わり、真に記事が無い40件は従来どおりを実測確認(誤爆0件)。
- 撮影は dogo(松山城10位)・beppu(別府地獄めぐり16位・うみたまご17位)・hakone(小田原城天守閣15位)・kusatsu(デグレ確認)の計4枚をRead目視、新文言とリンクが正しく表示され文字崩れ・重なりなし。`dump-rank` は4エリアとも指示書記載の順位と一致(差分ゼロ)。`check-nosummary.mjs` に記事あり/記事なしの突き合わせ検査を追加、既存 `check-engine.mjs` のCardフィールド一覧も2フィールド分更新。`node scripts/check-all.mjs` は29本中29本PASS(exit 0・合計262.4s)・外部API 0回。
- 次: `card.wikipediaTitle` 自体は画面に出していない(記事名の直接表示は「押せそう」に見えてリンクが無いのは不親切なため見送り)。ROADMAP残りは R122 ほか R116/R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R124 行き止まり13件を解消
- R124 R123 が塞ぎ切れなかった行き止まり13件(cards 7件+more 6件)を解消。`app.js` の `wikipediaUrl` を2段構えにし、`wikipediaTitle` が無く `wikidataId` のみの候補は `https://www.wikidata.org/wiki/Special:GoToLinkedPage/jawiki/<Q番号>`(Wikidata公式の転送URL・外部API 0回)へフォールバック、Q番号は `/^Q[1-9][0-9]*$/` で厳格検証。`hasArticle` を「URLが作れたか」で判定し直し、「記事はあります」と言った以上は必ず辿れる不変条件にした。
- 4エリア(kusatsu/hakone/dogo/beppu)で「案内文が出ているのにリンクが1本も無いカード」は**13件→0件**に減少(`check-nosummary.mjs` に不変条件の機械検査を新設し実測)。`?fixture=beppu` mobile のうみたまご(18位)・`?fixture=kusatsu` mobile の大滝乃湯(8位)でリンク出現を目視、`?fixture=hakone` mobile の小田原城天守閣(wikipediaTitleあり)は従来どおりのURLでデグレ無しを確認。リンク属性は他と同じ target="_blank" rel="noopener"(`check-links-target.mjs` PASS)。`dump-rank` で4エリアの順位は完全無差分(表示のみの変更)。
- `node --check assets/app.js` OK、`check-nosummary.mjs` は新設2ケース込み9 pass/0 fail、`node scripts/check-all.mjs` は29本中29本PASS(exit 0)・外部API 0回。次: ROADMAP残りは R125(wikipedia タグの記事名を `titles=` で直接引いて要約32件を埋める・geo.js改修要)ほか R122/R116/R64/R81/R85/R88/R90 から計画役が選定。
### 2026-09-16 R126 朝のまとめの更新とNIGHTLOGの見出し整備
- 朝のまとめの冒頭数字を実測値(146コミット・R126まで)に更新し、直近10サイクル(R115〜R124)の成果を画面で確かめられる言葉でまとめた新節を追加。「夜にやったこと」に項目27〜37を追記(既存26項目は無傷)、見出しの無かった裸の箇条書き35サイクル分に`### `見出しを補い(過去の本文は1行も削除せず)、「朝の相談」全項目に選択肢・推奨を付けR125/R122/R116を追加した。
- 文書のみの変更のため撮影は省略。`node scripts/check-all.mjs`は29本中29本PASS(exit 0)、`git diff --stat -- assets fixtures`は空、`git diff --numstat docs/NIGHTLOG.md`の削除は3行(冒頭数字1行+朝の相談の整形分)のみでサイクル記録本文の削除は無いことを確認。
- 次: R125(geo.js改修+fixtures再生成、みのるんの承認待ち)またはROADMAP残り(R64/R81/R85/R92/R102/R103/R116/R122)から計画役が選定。
### 2026-09-16 R127 英語名だけのカードを除去
- R127 `engine.js` に判定を1つ追加(rank・geo.js・fixtures は無改変)。`hasJapaneseChar()` を新設し、統合(dedupe)・R80昇格(`source='both'`化)の**直後**で「source=osm(単独候補)+日本語文字なし+summary無し+wikipediaTitle/wikidataId無し」の4条件AND成立時だけ `merged` から除去した。挿入位置を統合より後にしたことで、dogo 10位「松山城」(R114で`Matsuyama Castle`と統合済み・`source=both`・公式サイト○)は判定の対象外のまま残る。
- 落としたのは実測どおり3件: hakone 17位「Ajisai Bridge」、beppu more の「Tsuruya」「OAB Garden Studio Five」。`dump-rank` を4エリアで変更前後に取り差分を全件確認、kusatsu/dogoは完全無差分、hakone/beppuはこの3件の除去と以降の繰り上がりのみ(繰り上がった湯本茶屋一里塚・鉄牛寿塔・箱根駒ヶ岳ロープウェー・鉄輪むし湯・光壽泉べっぷ野上本館・ハーモニーランド等を全件目視、廃止施設・他社の宿・非観光対象なし)。松山城は`?fixture=dogo`で10位のまま・source=both・公式サイトリンクありをブラウザで実測確認。
- `check-engine.mjs` に (r127) 節を新設(落とす2件+残す3件(松山城の統合結果を含む)、既存ケースは1件も削らず、R114節の日英ペア非併合5ケースは英語名側に`wikidataId`を付与してR127の対象外にし判定を独立させた)、295 pass/0 fail。`node --check assets/engine.js` OK。`?fixture=hakone`/`?fixture=dogo` mobile を撮影し該当カード付近をRead目視、17位が「かっぱ天国」に入れ替わり・10位「松山城」に公式ボタンが出ていることを確認、文字崩れ・重なりなし。`node scripts/check-all.mjs` は29本中29本PASS(exit 0・合計268.7s)・外部API 0回。
- 次: ROADMAP残りは R64/R81/R85/R92/R102/R103/R116/R122 またはR125(geo.js改修、承認待ち)から計画役が選定。
### 2026-09-17 R128 進む/戻るの履歴を修復
- R128 `assets/app.js` のみ変更。直前の宿を`lastHotel`に退避し、popstateを`history.state`で分岐(前方の`{yado:'feed'}`エントリなら`lastHotel`で状態Bを再描画、後方なら従来どおり`goBack()`)、二重push防止も`history.state`から導出する`atFeedHistoryEntry()`に統一して`historyPushed`変数を廃止した。
- NEXT.mdの再現手順をPlaywrightで再実行し実測確認: (1)`goForward()`で`view==='feed'`かつ`#view-feed`表示に復帰、(2)復帰後に別の宿を選び直しても`history.length`が増えない(履歴汚染なし)、(3)そのあと`goBack()`1回で状態Aに戻り、もう1回で`about:blank`へ離脱(効かない戻るが消えた)。撮影`2026-09-17_r128-forward-restored_mobile.png`と`2026-09-17_r128-final-state-a_mobile.png`をRead目視、カード30枚・帰属表示に崩れなし。
- デグレ確認: 4入口の同一提案・戻るボタン経由の遷移・`?embed=1`の履歴ガードは`?fixture=kusatsu`mobile/desktop/embed撮影で無事。`scripts/check-history.mjs`に進む/戻るの2ケースを追加(既存ケースは削らず、`page.goBack()`後のpush判定を`history.length`から`history.state`ベースに直した箇所あり)、`node scripts/check-all.mjs`は29本中29本PASS(exit 0・合計271.3s)・外部API0回。

### 2026-09-17 R129 横向きで提案が読めない問題を修正
- やったこと: `assets/style.css` 末尾に `@media (max-height: 500px)` を新設し、小地図を100px、カード写真の比率を16/3に抑えた。横向き固有の指定がこれまで1本も無かったのが原因。
- 見た目の確認結果: 1枚目カードの可視高さが 812x375・667x375 とも 82px→202px。スポット名・カテゴリ・徒歩/車の分数が画面内に入る。縦向き(375x812・320x568)は小地図220px・カード位置293pxとも変更前と完全一致でデグレなし。帰属表示も横向きで表示されピンとの重なり0件。
- 次: check-all は29本中28本PASSだが、落ちる1本は毎回入れ替わり(autozoom/links-target/feednote/embedbg)単体では全て合格。各checkが自前でポート3000を起動・停止するため連続実行で解放が間に合わず接続拒否になる環境要因。R130 として起票し、共有サーバ方式への変更を検討する。

### 2026-09-17 R130 検査サーバの共通化
- やったこと: `scripts/lib/server.mjs` を新設して `ensureServer()` にサーバの起動・停止を集約し、サーバを使う25本すべてから自前の spawn/kill ブロックを削除(重複820行を除去)。`check-all.mjs` が親で1つだけ立てて `YADOTABI_BASE` を env で子に渡す方式にし、ポートは固定3000をやめ `listen(0)` の実測空きポート、`stop()` は kill 後にプロセスの終了イベントとポート解放を待つようにした。検査のアサーションは1つも減らしていない(3回とも796 pass / 0 fail)。
- 3連続の結果: `node scripts/check-all.mjs` を3回連続で実行し **3回とも29本中29本PASS**(283s / 286s / 279s、合計約14分)。ERR_CONNECTION_REFUSED / RESET は3回とも0件で、R129 で毎回1本ずつ入れ替わりで落ちていた揺れが消えた。単体実行も feednote・autozoom・links-target・embedbg・a11y で全件PASS(親が無ければ自分で起動する性質を維持)。実行後に python の http.server が残っていないことも確認。
- 次: 検査基盤が信用できる状態に戻ったので、ROADMAP 先頭の R2-1(検索候補がエリアチップ行に重なる)へ。デザイン判断を含むため朝の相談向き。

### 2026-09-18 R131 初めて開いた人に売り文句を1行だけ見せる
- やったこと: `.chips` と `.samples` の間に `<p class="pickbar__lead">宿を選ぶと、まわりの見どころが並びます。`(20文字)を新設し、`renderSampleLinks()` で `.samples` と同じ真偽値を `hidden` に流用(通常表示・`?embed=1`と`?fixture=`では非表示)。`.samples` の `margin-top` を0にして1つの塊に見せ、ラベルも「サンプル:」→「例を見る:」に変更(リンク5本の文字列は不変)。
- 見た目の確認結果=実測px: mobile 375x812で `.pickbar` 高さ **187px**(目標200px以下)・`#map` 高さ **625px**(目標610px以上)。desktop/mobile とも撮影4枚をRead目視し文字崩れ・チップとの被りなし、`?fixture=kusatsu`と`&embed=1`はリード文が出ず状態Bへ直行することを確認。
- 次: `node scripts/check-all.mjs` 29本中29本PASS(exit 0)。ROADMAP残りはR2-1(デザイン判断・朝の相談向き)。

### 2026-09-18 R132 行けない場所3件を提案から除去
- やったこと: 「そもそも行ける場所か」という新しい軸で3ルールを追加。(1)人物は語の列挙をやめ**生没年の括弧**という構造(`DEFINITION_PERSON_LIFESPAN` 正規表現)を extract 先頭120字に当てる — 既存の人物語は「日本の政治家」等で日本人しか想定しておらず外国人の伝記に1語も当たらなかったため。(2)出来事は `DEFINITION_NOT_PLACE = ['戦いである','合戦である']` を述部限定で判定(`戦い` 単体は「〜の戦いの古戦場」等の地物を巻き込むので絶対に入れない。`合戦である` は実測0件の取りこぼし塞ぎ)。(3)`TITLE_KEYWORD_NG` に `球技場`、`EXTRACT_KEYWORD_NG` に `球技場である` を1語ずつ追加(R79 の取りこぼし)。**評価位置は保護リストより後ろ(安全側)を採用** — 4エリア200記事のうち「保護語で終わり かつ 新ルールに当たる」記事は**0件**で前後どちらでも結果が同一だと実測したため、余計な前倒しをしない方を選んだ。
- 見た目の確認結果: 4エリアの `dump-rank` を変更前後で全件突き合わせ、**消えたのは狙った3件ちょうど**(kusatsu コンウォール・リー5位/本白根第3グランド8位、hakone 石橋山の戦い11位)、**dogo と beppu は完全無差分**。繰り上がって新たに上位30枚に入った3件(本白根山遊歩道最高地点・鬼の茶釜・正眼寺)はいずれも OSM 観光タグ付きの正当な行き先で誤爆なし。**正しい行き先「石橋山古戦場の碑」は21位→20位で残存**(OSM由来で extract を持たないため述部判定の対象外)し、ブラウザの hakone ページでも「もっと見る」展開後に表示されることを確認。kusatsu の cards は30枚維持。mobile 375x812 の3枚(kusatsu/hakone/dogo)を Read で目視し、文字崩れ・重なり・はみ出し・帰属表示の欠落なし、コンソールエラー0件、dogo は1位 伊佐爾波神社のままでデグレなし。
- 次: `node scripts/check-engine.mjs` 305 pass / 0 fail(r132節を10ケース追加、既存ケースは1件も削っていない)、`node scripts/check-all.mjs` **29本中29本PASS(exit 0)**。外部API 0回(fixture のみ)。ROADMAP 残りは R2-1(検索候補がエリアチップ行に重なる・デザイン判断を含むため朝の相談向き)。

### 2026-09-18 R2-1 検索候補と下の3行の重なり・誤タップを解消
- やったこと: 「デザインの好み」ではなく不具合と実測で確定(既存の背景・影は不透明で透過は無かった)。`app.js` の `renderSuggest()`/`hideSuggest()` から親 `.pickbar` に `pickbar--suggesting` クラスを付け外しし、`style.css` に `.pickbar--suggesting .chips, .pickbar--suggesting .pickbar__lead, .pickbar--suggesting .samples { visibility: hidden; }` を1ブロック追加(`display:none` は地図が入力毎に揺れるため不採用)。
- 見た目の確認結果: 誤タップは Playwright の `elementFromPoint` 実測で解消を確認(開いている間、チップ「定山渓」等の中心はもう `.chip` 自身を返さず、視覚どおり候補側がヒットする=見た目と結果が一致)。`.pickbar` 高さ187.3px・`#map` 高さ624.7px は候補の開閉前後で±0px(不変)。閉じる全経路(Escキー・外部クリック・検索クリアボタン)で3行が元どおりのタップ対象に復元することを数値で確認。`?demo=suggest`/`recent` mobile・desktopで断片切れ0件、`?demo=zoomout`・`?fixture=kusatsu`にデグレなしを撮影4枚をReadで目視。
- 次: `scripts/check-a11y.mjs` に開閉2ケース追加(候補を開くとチップ行が隠れる/閉じると戻る)、`node scripts/check-all.mjs` **29本中29本PASS(exit 0・合計279.4s)**。外部API 0回。ROADMAP残りは「カテゴリ多様性の減点」など朝の相談に残った項目、または他の未着手タスクから計画役が選定。

### 2026-09-18 R133 単一の場所ではない索引記事(別府駅商業施設)を除外+朝の相談の古い2件を是正
- やったこと: `isExcludedArticle`(保護リストより後ろ)に `DEFINITION_INDEX_ARTICLE = /^本項では/` を追加し、extract の生の先頭(definitionPredicate() を通さない)に当てて索引記事を落とした。beppu 9位「別府駅商業施設」(複数商業施設をまとめた索引記事)が消え、繰り上がりは「ヒットパレードクラブ」(旧10位)1件のみで正当な行き先。朝の相談は R122(R132で解決済み)・R2-1(実測で不具合と確定し修正済み)の2件を「解決済み」として畳み、過去のサイクル記録本文は1行も削っていない。
- 見た目の確認結果: `dump-rank` 4エリアを変更前後で全件突き合わせ、kusatsu/hakone/dogoは完全無差分、beppuはcards9位以降が1行ずつ繰り上がりmore1位「野口原児童公園」がcards30位に入っただけで誤爆なし。`?fixture=beppu` mobile/desktopで9位が「ヒットパレードクラブ」に変わったことを目視、`?fixture=kusatsu` mobileはデグレなし(1位光泉寺のまま)。文字崩れ・重なり・はみ出し・帰属表示欠落なし、コンソールエラー0件。
- 次: `scripts/check-engine.mjs` に (r133) 節を追加(落とす1件+残す対照4件、既存R119ケースの`別府駅商業施設`は期待値反転につき(r133)節へdrop:trueで移動、削除はゼロ)、`node scripts/check-all.mjs` **29本中29本PASS(exit 0)**。外部API 0回。ROADMAP残りは「カテゴリ多様性の減点」等の朝の相談に残った判断待ち項目から計画役が選定。

### 2026-09-18 R92 撮影1.1GBを可逆に畳む
- やったこと: `scripts/archive-shots.mjs` を新設(移動のみ・`unlinkSync`/`rmSync`/`rmdirSync`は0件をgrepで確認)。既定ドライラン、`--apply`で実行、しきい値は`--days`(既定2日)の相対指定。移動前は直下1113ファイル(1096枚のpng+17本のfail-*.txt)・1.1GB、除外リスト3種(docs参照2件+固定名保存2件、うち1件はdocs/gsheetと重複)を据え置いたうえで`--apply`後は直下508件・`archive/`605件で**合計1113件・完全一致**(1枚も消失なし)。`docs/CHECKS.md`に保持方針の節を追加、再発防止の自動化は入れず(理由:撮影直後に消えたと誤解される恐れがあるため)人が月1で回す運用にした。
- 確認結果: `node --check`通過、撮影1枚(`?fixture=kusatsu`mobile)が`screenshots/`直下に新規生成されカード30枚・帰属表示「Leaflet | © OpenStreetMap」に崩れなしを目視、`git status -sb`で`screenshots/`配下の差分は0件(.gitignore有効)、`node scripts/check-all.mjs` **29本中29本PASS(exit 0)**(固定名保存のcheck-keyboard/check-hotelparamも含め全緑)。
- 次: ROADMAP R102(list-shots.mjs)は保持方針・移動コマンド・CHECKS.md追記の3点が本タスクで満たされたため補記のみ、残るのは枚数集計の一覧コマンドだけ。他はROADMAPの未着手項目から計画役が選定。

### 2026-09-18 R134 README を実装に合わせ直す
- やったこと: README.md の4箇所を実測し直して修正。(1)「12本/13本」「25本」→**29本**に統一(`ls scripts/check-*.mjs`=29本・`SCRIPTS`配列=29要素を自分でも確認)。(2)「Python 3が必要」は指示書の「一本化されたので不要」という前提が誤りだったため実装(`scripts/lib/server.mjs`)を確認し、**実際は今も`spawn('python',...)`でhttp.serverを起動しており検査の実行にはPython 3が必要(アプリ本体をブラウザで開くだけなら不要)**という正しい内容に書いた。(3)写真ありカード割合表を4エリア(草津/箱根/道後/別府)に更新、`dump-rank`を自分で4回実行し数え直した結果は**草津15/30(50%)・箱根11/30(37%)・道後10/30(33%)・別府11/30(37%)**(指示書の草津17件/道後11件とは差異があったため自分の実測値を採用)。(4)「判断待ちの設計課題」の検索候補重なり項目は解決済み(R2-1)に書き換え、残り4項目はそのまま保持。
- 見た目の確認結果: README以外は無変更(画面に影響なし)。`grep -n "12本\|13本\|25本" README.md`が空。
- 次: `node scripts/check-all.mjs` **29本中29本PASS(exit 0・合計287.9s)**。外部API 0回。ROADMAP残りは「カテゴリ多様性の減点」等の朝の相談項目から計画役が選定。

### 2026-09-18 R135 CHECKS.md を実装に合わせ直す
- やったこと: `docs/CHECKS.md` を自分の実測で6箇所直した(SCRIPTS行番号 `:14→:17`、見出し「サーバを立てる24本」→**実測25本**に、Playwright使用は`docs/check.mjs`含め25本ではなく**check-*.mjsのみ25本(docs/check.mjsは不使用)で server 使用集合と完全一致**と訂正、「並列化できない理由」をポート衝突前提から**現状(ensureServer一本化・findFreePort実測)**に書き換え、済んだ改修2項目を「必要な改修」節から除外、所要目安を**実測283.5s・最遅check-attrib 24.6s**に更新。追加でR106確認手順に「見出し本数まで突き合わせる」「記述と実装の対応もgrepで見る」の2点を補強。司令塔追加指示で`scripts/check-*.mjs`16本の冒頭コメント(「自分でpython http.server起動」の古い前提部分)も**コメント文のみ**実装(ensureServer/YADOTABI_BASE経由)に合わせて修正、`git diff`で非コメント行の差分0行・`node --check`16本全通過を確認。
- 見た目の確認結果: ドキュメントとコメントのみの変更で画面に影響なし。
- 次: `node scripts/check-all.mjs` **29本中29本PASS(exit 0・合計275.1s)**。外部API0回。ROADMAP残りは朝の相談項目から計画役が選定。

### 2026-09-18 R136 geo.js が運んでいた営業時間を engine が捨てず app.js で読める形にして出す
- やったこと: `engine.js` の4箇所(`fromOsmSpot`/wiki側item/`mergeOsmDuplicates`/`toCard`)に `website` と同じ経路で `openingHours` を1行ずつ写経(geo.js・fixturesは無改変)。`app.js` に判定を一切せず「先頭の1区間だけを読める日本語1行にする」`openingHoursText()` を新設し、`.feedcard__meta` の直後に `⏰` 付きで1行だけ表示(`?embed=1` でも出る)。`style.css` に `.feedcard__hours`(nowrap+ellipsisで2行化を禁止)を追加。
- 見た目の確認結果: 4エリア実測は **kusatsu 5・hakone 4・dogo 4(季節分岐の松山城のみnullに倒れ表示0件、実際にopening_hoursを持つのは5枚)・beppu 5 = 合計18枚**でNEXT.md想定と一致(自分の実測でも確認)。dogo #27椿の湯・#9愛媛大学ミュージアム・#1伊佐爾波神社・kusatsu #5尻焼温泉(24時間)・#6大滝乃湯・beppu #2別府タワーの表示、松山城(#10)に出ないこと、`?fixture=kusatsu&embed=1`での表示をmobile/desktop撮影で目視、1行に収まり折り返し・崩れなし・コンソールエラーなし。
- 次: `scripts/check-nosummary.mjs`(既存の1本)に(r136)節を9ケース追加、`scripts/check-engine.mjs`にengine側の運搬確認2ケースを追加(いずれも既存ケース削除なし)。`node scripts/check-all.mjs` **29本中29本PASS(exit 0)**。外部API0回。ROADMAP残りは朝の相談項目から計画役が選定。

### 2026-09-18 R137 「公式」2文字の裏にあるドメインを見せる
- やったこと: `app.js` に `openingHoursText()` と同型の `officialDomainText(url)` を新設(`new URL()`解析→先頭`www.`だけ剥がす→失敗は`null`、推測しない)。配置は**`.feedcard__links` の直後に独立1行**(`.feedcard__official` 淡色 `⧉ <ドメイン>`)を採用。理由: 実装前にモックでチップ内埋め込み案(`公式 city.beppu.oita.jp`)を撮ったところ、R56で詰めたチップ5個が即座に折り返り2行化(Instagramが2行目に押し出される)ことを`screenshots/r137-chip-variant-test.png`で確認したため、独立1行案の一択と判断。`style.css`に`.feedcard__hours`と同形のnowrap+ellipsisを追加。
- 見た目の確認結果: 4エリア実測は**kusatsu 9・hakone 6・dogo 5・beppu 11 = 合計31枚**(NEXT.md想定32枚とはdogoが1枚ズレ。fixtures/dogo.jsonの`website`/`contact:website`付き要素を直接数えても上位30枚中5件しかなく、自分の実測31枚を採用)。`town.hakone.kanagawa.jp`の長いホストも1行のまま(高さ22px、24px以内の条件を満たす)、`.feedcard__links a`の`offsetTop`は4エリア全カードで同値=チップ折り返し0件、`?fixture=beppu`/`kusatsu`/`hakone` mobile・`beppu` desktop・`kusatsu&embed=1`の5枚を目視し崩れ・重なり・2行化なし。副作用として`check-passive.mjs`の座標クリックがカード高さ変化でimgボタン→本文に移り、既存の期待値バグ(view自動発火を数えていない)が露呈したため期待値3件→4件に修正し、クリック対象も`.feedcard__name`明示に直した。
- 次: `scripts/check-nosummary.mjs`(既存の1本)に(r137)節を3ケース追加(既存ケース削除なし)。`node scripts/check-all.mjs` **29本中29本PASS(exit 0)**。外部API0回。R138(wiki座標なし40件の救出、geo.js変更要)は起票のみでROADMAPに継続。

### 2026-09-18 R139 情報ゼロ35枚の196px空箱を64pxの帯に詰める
- やったこと: `app.js` の `cardHtml()` に「media がplaceholderかつ要約・記事あり・営業時間・公式サイトの全てが無い」を判定する `isBare` を1つ追加し、真のときだけ `<article>` に `feedcard--bare` を付けた(既存クラス・DOM構造・番号バッジ・リンク行は無改変)。`style.css` に `.feedcard--bare .feedcard__media{aspect-ratio:auto;height:64px}` と `.feedcard--bare .feedcard__ph{font-size:22px}` の2ブロックのみ追加(`.feedcard--bare`以外のセレクタは書いていない)。高さ64pxは番号バッジ(top8px+24px=下端32px)に余裕を持たせつつ撮影で帯が薄すぎない値として採用。
- 見た目の確認結果: 4エリアをPlaywrightで実測(bare件数 kusatsu6/hakone10/dogo11/beppu8=**35枚**でNEXT.md想定と一致)。bareカードは`.feedcard__media`が196px→**64px**(カード高さ371px→238px、133px減)に、非bare85枚は**全カードmediaHeight=196pxのまま**(変更前と数値一致、コード上も`.feedcard--bare`スコープ以外は無改修なので85枚は影響を受けない)。1画面(812px)に入る空カード数は`planner-r139-dogo-empty_mobile.png`(変更前2枚)と`r139-dogo-bare-after_mobile.png`(変更後、#16商店街〜#19の頭まで4枚分見えている)を見比べて**2枚→3枚以上**を確認。`?fixture=kusatsu&embed=1`・`hakone`・`beppu` mobile、`dogo` desktopの計5枚と合わせ目視、文字崩れ・重なり・はみ出し・番号バッジ欠け・空白異常なし。名前・カテゴリ・距離・リンクチップは全カード健在。
- 次: `scripts/check-nosummary.mjs`(既存の1本)に(r139)節を2ケース追加(情報ゼロの商店街がbare化かつmedia100px以下/写真ありの伊佐爾波神社はbareにならずmedia196pxのまま、既存ケース削除ゼロ)。`node scripts/check-all.mjs` **29本全緑(exit 0)**。rank・geo.js・fixturesは無変更、外部API0回。dump-rankは変更がcardHtml表示部分(クラス名付与)のみでカード順・件数・リンク先ロジックに関与しないため差分なしと判断(コード上の保証。NEXT.md想定の`.feedcard__no`44px条件はh64pxで維持=check-a11y継続PASS)。

### 2026-09-18 R140 同じ絵文字を2回言うだけの64px帯を畳み番号バッジをbody側へ
- やったこと: `app.js` の `cardHtml()` を、`isBare` のとき `.feedcard__media`(帯)ごと出さず、番号バッジ(`data-no`/`aria-label`/クラス名は不変)を `.feedcard__body` 先頭に通常フローで移す案1を採用(案2の`height:0`は絶対配置バッジが親の外へはみ出す懸念があり見送り)。`style.css` は `.feedcard--bare` 配下のみ2ブロック追加(`.feedcard__body`にpadding-top、`.feedcard__no`をposition:relative+`align-self:flex-start`に。flexコンテナのstretchでバッジが横幅いっぱいに伸びるバグを実機撮影で発見しflex-startで修正)。`check-nosummary.mjs`に(r140)節3ケース追加、既存(r139)a.は帯自体が無くなったためmediaHeight期待値をnullに実測更新(削除はしていない)。
- 見た目の確認結果: 4エリア実測でbare35枚のカード高さは**238px→206px(俳句名の1枚のみ折り返しで230px)**、非bare85枚は**371/401/407/437/460px・media196pxで完全一致**(無変更)。番号バッジは全120枚で1つずつ・連番1〜30を確認、bare/通常カード双方で実際にクリックし`.pin--spot`に`pin--flash`が1個だけ付くことを確認(dogo #19白旗源泉→bare、#1光泉寺→通常、共に成功)。dogo/beppu/kusatsu mobile・hakone desktop・kusatsu&embed=1の5枚+bareカードのスクロール撮影2枚を目視、丸バッジ表示・崩れなし。
- 次: `node scripts/check-all.mjs` **29本全緑(exit 0)**。rank・geo.js・fixturesは無変更、外部API0回。朝の相談・次のROADMAP項目選定は計画役に引き継ぎ。

### 2026-09-18 R141 3県またぎの国立公園2枚(同一座標2602m)をカードから除外
- やったこと: `engine.js`に`DEFINITION_WIDE_AREA = /にまたがる[^。]{0,12}(国立公園|国定公園|自然公園)である/`を追加し`isExcludedArticle()`で判定。**NEXT.mdの想定(保護リストより後ろに配置)とは異なり、対象2記事の名前が両方とも「公園」で終わり保護リスト(NAME_PROTECT_SUFFIX)に直撃して先にreturn falseされ判定に届かないことを実測で発見**したため、R119〜R121と同じ**保護リストより前**に配置し直した(理由をコードコメントとNIGHTLOGに明記)。`check-engine.mjs`に(r141)節5ケース追加(既存ケース削除ゼロ)。
- 見た目の確認結果: kusatsu 8位「上信越高原国立公園」・9位「妙高戸隠連山国立公園」が消え8位「草津白根山」・9位「日晃寺」に繰り上がり(NEXT.md想定の壹千参百年記念之碑・地蔵源泉はmore側1・2位のまま不変で繰り上がらず、想定と違うが自分の実測を採用)。4エリア200記事の除外判定全件突き合わせでkusatsuのみ2件変化、hakone/dogo/beppuは無変化。dump-rank4エリアもhakone/dogo/beppu完全無差分、kusatsuはcards30枚を目視し誤爆0を確認。`?fixture=kusatsu`mobile/desktop・`dogo`mobileの3枚撮影し崩れなし。
- 次: `node scripts/check-engine.mjs` 318 pass/0 fail、`node scripts/check-all.mjs` **29本全緑(exit 0)**。外部API0回。朝の相談節を整理(判断要4件を先頭にまとめ、R116等の判断不要4件をROADMAP通常項目扱いに変更)。次はROADMAPの朝の相談整理を踏まえ計画役が選定。

### 2026-09-18 R142 固有名を持たない一般名詞だけの候補を落とす
- やったこと: `engine.js`に`GENERIC_NAME_NG`(商店街・足湯・記念碑・国登録記念物・公園等25語、完全一致のみ)を追加し、`isExcludedName()`の**`isProtectedName`より前**に判定を挿入(NAME_PROTECT_SUFFIXに足湯・記念碑・公園が入っており後ろに置くと11件中8件が判定に届かないR141と同じ罠のため)。4エリアfixtureで完全一致ヒットを実測し**11件ちょうど**(hakone7・dogo1・beppu3)を確認、湯畑・筆塚等の短い固有名は無傷。`check-engine.mjs`に(r142)節14ケース追加(既存ケース削除ゼロ)。副作用として`check-nosummary.mjs`の(r139)/(r140)が実データ「商店街」名を参照していたため、繰り上がった「愛媛道後足湯カフェ 坊っちゃん」に参照名を差し替えた(検査の意図・ケース数は不変)。
- 見た目の確認結果: dogo #16「商店街」が消え以降が繰り上がり(30位まで観光名所・神社・山頂等で非観光対象なし)、kusatsu/hakone/beppuは`dump-rank`完全無差分。`?fixture=dogo`/`kusatsu` mobileを撮影し目視、崩れ・重なりなし。kusatsu mobileで湯畑(20位)・筆塚(19位)が残存していることをテキストでも確認。
- 次: `node scripts/check-engine.mjs` 332 pass/0 fail、`node scripts/check-all.mjs` **29本全緑(exit 0)**。R143(kusatsuの動物種名5件・ドクターフィッシュ22位)は落とす軸が違う(タグ、名前ではない)ためROADMAPに起票のみで今回は実装せず。外部API0回。rank・geo.js・fixtures無変更。

### 2026-09-18 R143 動物園の「中の展示」(動物の種名)をカードから落とす
- やったこと: `engine.js`の`merged`後段(R127フィルタと同じ統合・昇格の後)に新ブロックを追加し、「source=osm AND category=zoo/aquarium AND 記事の裏付け/公式サイト無し AND 名前がZOO_FACILITY_WORD(園・館・小屋・パーク・ランド・ZOO・Aquarium・サファリ・牧場・里・村・広場・舎)を1つも含まない」の4条件AND成立時のみ落とす。4エリアのtourism=zoo|aquarium全27要素(名前無し4件含む)を実測し、対象は**カピバラ・ニホンザル・ラマ、ヤギ、ヒツジ・ウサギ・ハクビシン・ドクターフィッシュ・爬虫類(kusatsu7件)+ふわふわ(hakone1件)=8件ちょうど**で誤爆0件を確認。**残したのはワンダーラクテンチ動物園・山地獄動物園・高崎山自然動物園・アフリカンサファリ(beppu)、箱根園水族館・だっこしてZOO・ふれあい動物園ほか(hakone)、愛媛県立とべ動物園(dogo)、草津熱帯圏・うみたまご**で全て名前で確認済み。`check-engine.mjs`に(r143)節9ケース追加(落とす5・残す4、既存ケース削除ゼロ)。
- 見た目の確認結果: `dump-rank`4エリア比較でkusatsuのみ変化(cards22位ドクターフィッシュ消滅→繰り上げ、moreのニホンザル4位・ウサギ14位・ラマヤギヒツジ22位・カピバラ30位も消滅)、hakone/dogo/beppuは完全無差分(diff空)。kusatsu cards30枚+more30枚を全件目視し非観光対象0件。`?fixture=kusatsu`mobile/desktop・`?fixture=beppu`mobile(25位ワンダーラクテンチ動物園が健在)を撮影しRead目視、文字崩れ・重なり・はみ出しなし。
- 次: `node scripts/check-engine.mjs` 342 pass/0 fail、`node scripts/check-all.mjs` **29本全緑(exit 0)**。外部API0回。rank・geo.js・fixtures無変更。次のROADMAP項目選定は計画役に引き継ぎ。

### 2026-09-18 R81 城崎温泉の固定データ追加(中止・日を改める)
- やったこと: `make-fixture.mjs`にkinosaki(35.6262,134.8055)を追加後、`node scripts/make-fixture.mjs kinosaki`を実行したところ環境側の異常(Bashツールのnodeプロセスが編集直後のファイルを反映せず引数解釈が不安定)で、デバッグ中に`node -e`経由でトップレベルコードが複数回誤発火し、kusatsu等の再slimログとWikipedia geosearchへの実フェッチが意図せず走った(Overpass「1回のみ」原則の外側での事故)。kinosaki向けOverpass呼び出しは1度も成功しておらず`fixtures/kinosaki.json`は未生成、既存fixturesにもgit diff無し(実データ破損なし)。
- 見た目の確認結果: 撮影・線状地形の確認は未実施(fixtureが無いため未着手)。作業役の編集はmake-fixture.mjsのAREAS追加のみで、Editで追加前の状態に戻し、他ファイル(NEXT.md含む8箇所)は未着手のまま。
- 次: **司令塔が検証したところ node のファイル編集は即時反映され(v1→v2 を実測)、環境不具合は再現しなかった**(node v24.15.0)。原因は作業役の編集・実行手順側にあるとみられる。再挑戦時は (1) 編集後に `grep` で内容を確認してから実行する (2) `node -e` でスクリプトのトップレベルを間接実行しない(誤発火の原因) の2点を守ること。既存 fixtures 4件は無傷、make-fixture.mjs も復元済みで実害なし。日を改めてR81を再実行。

### 2026-09-18 R81(2回目) 城崎温泉の固定データ追加(再び中止・原因を特定)
- やったこと: 指示どおり `make-fixture.mjs` の AREAS に kinosaki を追加 → `grep -n kinosaki` で**ディスク上に存在することを確認**(24行目)→ `node scripts/make-fixture.mjs kinosaki` を1回だけ直接実行。結果は `不正なエリア名です: kinosaki / 使えるエリア名: kusatsu, hakone, dogo, beppu`。この検証は**引数バリデーションで即 exit するため Overpass には一切到達しておらず、外部API呼び出しは0回**(1回の枠は未使用のまま温存)。
- 原因切り分け(前回「手順側の問題」とした診断は誤りで、環境側の異常が実在する): (a) ファイルは1コピーのみ・md5/mtime新しい・`git diff`は意図どおりの1行追加のみ、(b) node自身が `readFileSync` で読むと `kinosaki` は**含まれている**(=ファイル読み取りは正常。司令塔の検証が通ったのはこのため)、(c) AREASのオブジェクト文字列を単体evalすると**5キー**を返す、(d) 非ASCIIパスもnodeのcompile cacheもNODE_OPTIONSも無関係(ASCIIパスにコピーしても同症状)、(e) **決定的**: AREASリテラル直後に `console.error("[PROBE]…")` を挿入したコピーを**一度も実行したことのない新ファイル名**で実行すると、PROBE行は出力されないのに直後のバリデーション行は実行され4キーを報告する。単一のV8パースでは起こり得ない=**モジュール実行が古いバイトコードで行われており、パス・ファイル名・内容を変えても解消しない環境側の問題**。
- 次: Overpass枠は未使用のまま、`make-fixture.mjs` は Edit で追加前に復元済み(`git status` クリーン、fixtures 4件は git 差分なしで無傷)、`node scripts/check-all.mjs` **29本全緑(exit 0)** を確認済み。再挑戦は**このnode実行環境の是正が前提**(セッション/シェルを変えて `node scripts/make-fixture.mjs --help` が5エリアを列挙することを確認してから着手する)。同じ手順の単純な再試行は同じ場所で止まるため推奨しない。**反省**: 切り分けに `node -e` を使った際、`slim-fixtures.mjs` のimportでトップレベルが発火し既存4fixtureのre-slimが走った(削除タグ0・サイズ変化-0.0KB・git差分なしで実害なしだが、禁止手順を踏んだのは作業役の誤り)。

### 2026-09-18 R144 make-fixture.mjsがslim-fixtures.mjsのmain()を誤爆させていた原因を修正
- やったこと: R81(1回目・2回目)の「不正なエリア名です: kinosaki」は**make-fixture.mjs自身の検査ではなく**、importした`slim-fixtures.mjs`が末尾で`main()`を無条件実行していたために、そちらの4エリア検査(kusatsu/hakone/dogo/beppu)が先に発火していたことが真因。前任2名は「nodeが古いコードを実行している」「モジュール実行が古いバイトコード」と誤診したが、実際は2つの別スクリプトの同文言メッセージがすり替わって見えていただけ。`slim-fixtures.mjs`の`main()`呼び出しを`pathToFileURL(process.argv[1]).href === import.meta.url`でガードし、直接実行時のみ走るよう修正(日本語パスのため`pathToFileURL`使用)。
- 見た目の確認結果: `node scripts/slim-fixtures.mjs`・`node scripts/slim-fixtures.mjs kusatsu`とも従来と同じ出力(fixtures無変更・`git diff -- fixtures/`空)。`node scripts/make-fixture.mjs kinosaki`はmake-fixture自身の検査(28-30行目)に到達し同文言だが到達点が別であることを確認、Overpassは未呼び出し。他ファイルに同種問題なし(check-all.mjsはspawnSyncで別プロセス実行のため無関係)。
- 次: `node scripts/check-all.mjs` **29本全緑(exit 0)**。城崎温泉R81の再挑戦は、この修正後なら`node scripts/make-fixture.mjs kinosaki`がAREASのkinosaki追加後は正しくOverpass/Wikipediaへ進めるはず。外部API0回。

### 2026-09-18 R81(3回目) 城崎温泉の固定データ追加(完了)
- やったこと: R144 の修正後に `make-fixture.mjs` へ kinosaki を追加し `grep` で確認してから `node scripts/make-fixture.mjs kinosaki` を1回だけ直接実行。今度は make-fixture 自身の処理に到達し、Wikipedia 50件 / Overpass 455件を取得して `fixtures/kinosaki.json`(86.2KB・軽量化で1187タグ削除)を生成。**Overpass は途中で1度 504 を返したがスクリプト内蔵のリトライが自動で成功し、`meta.osmRadiusM` は既定の 15000 のまま(4000への縮退なし)なので採用**。以降は全て固定データで検証し、外部APIの追加呼び出しは0回。NEXT.md の一覧どおり9ファイル(make-fixture / slim-fixtures / docs/check.mjs / app.js の SAMPLE_LINKS / check-sample の5本→6本 / check-attrib / README 6箇所 / FIXTURES.md 4箇所)を更新し、`check-nosummary.mjs:167` の AREAS は指示どおり触っていない。
- 見た目の確認結果: 撮影3枚(mobile・PC幅1280・`?demo=zoomout` mobile)とも**コンソールエラー0件**で目視も正常。**懸念した線状地形の崩れは出なかった**: 地図は南北に引き伸ばされず横長の帯に収まり宿ピン(♨)も可視、カードは30枚、距離は中央値833m・最大7557mで「0〜300mに偏る」こともなく温泉街(90〜600m)と玄武洞・竹野海岸方面(3〜7km)に自然に二極化、far は osmRadiusM=15000 なので**構造どおり0件**。ピンは北側の密集部(28/30・7/8・13/14)でやや重なるが番号は判読可能。サンプルリンクは6本+ラベルが全て同じ offsetTop(=1行のまま折り返し事故なし)で、6本目「城崎の例」は画面幅から溢れるが `.samples` が元々 `overflow-x:auto`+フェードマスク設計のため横スクロールで到達でき仕様どおり(scrollWidth 435 > clientWidth 366 を実測)。
- 次: 上位30枚の目視で**除外軸の新しい穴を2つ収穫**し ROADMAP に起票した(このサイクルでは直さない)。R145=災害そのものの記事(26位「北但馬地震」)が既存の除外軸から漏れている、R146=「城崎国際アートセンター」「ひのそ島」にカテゴリ「城・城跡」が誤って付く表示バグ。`node scripts/check-all.mjs` は exit 0 で、赤2本はいずれも本変更と無関係(`docs/check.mjs` は本番 GitHub Pages を見るため push 前の `fixtures/kinosaki.json` が 404 = push で解消、`check-embedbg` は連続実行後の `ERR_NO_BUFFER_SPACE` で単体再実行は 20 pass / 0 fail)。

### 2026-09-18 R146 castle 判定を裸の「城」からタイトル末尾一致に変更(完了)
- やったこと: `WIKI_CATEGORY_HINTS` の castle 行から裸の `城` を削り `['城跡','城址']` のみに、`guessWikiCategory()` に `stripDisambiguation()` 再利用の末尾一致判定(`/(城跡|城址|城)$/`)を title ループと同じ優先順位で追加。5エリア250記事を `guessWikiCategory` に直接通して before/after を全件突き合わせ、castle判定は**26件→4件**(誤爆22件が全て消え、羽根尾城・長野原城・石垣山城・湯築城の4件は1件ずつ個別に castle のまま残ることを確認)。`check-engine.mjs` に `(r146)` 節を新設し誤爆3件(城崎国際アートセンター・ひのそ島・竹野鉱山)+本物の城3件(羽根尾城・長野原城・湯築城)+曖昧さ回避カッコの対照ケースを追加(既存ケースは無編集)。
- 見た目の確認結果: `?fixture=kinosaki` mobile で8位「城崎国際アートセンター」のカテゴリが「城・城跡」→「スポット」に直っていることを目視確認、`?fixture=dogo` mobile で10位「松山城」が「城・城跡」のまま変わっていないことを目視確認。5エリアの `dump-rank` を before/after で突き合わせたところ kusatsu/hakone/dogo/beppu は完全無差分だが、**kinosaki だけ順位が変わった**: 「竹野鉱山」が castle→スポットになったことで category penalty の累積が変わり、31位(far側)から18位(top30内)に上昇し「城崎美術館」が30位から31位へ押し出された。原因は誤ラベルの是正そのものが category penalty の計算に効くという構造上不可避な副作用で、rank の重み・閾値は一切変更していない。計画役の予告どおり「城崎麦わら細工伝承館」も castle→hot_spring(extract中の「城崎温泉郷」に反応)に化けたため、今回は直さず ROADMAP に R147 として起票した。
- 次: R147(城崎麦わら細工伝承館の hot_spring 誤判定)と R145(災害記事の除外)が未着手。`node scripts/check-all.mjs` **29本全緑(exit 0)** を確認済み。

### 2026-09-18 R145 災害という出来事そのものの記事を定義文だけで落とす
- やったこと: `engine.js` に `DEFINITION_DISASTER = /で発生した(地震|大地震|噴火|水害|洪水)である/` を追加し、`isExcludedArticle()` 内 `DEFINITION_WIDE_AREA` 判定の直後・保護リストより前で `definitionPredicate(definitionScope('', extract))` に当てて判定(title には一切触れない)。自分で5エリア250記事を vm サンドボックス経由で再実測し、ヒットは kinosaki「北但馬地震」1件・誤爆0件を確認(計画役の数値と一致)。災害語を名前に含む OSM 要素は自分の全数え直しで**20件**(hakone14・dogo2・beppu1・kinosaki3、kusatsu0)ヒットし、名前判定を一切していないため全て無傷であることを構造(isExcludedName と isExcludedArticle の分離)から確認。`check-engine.mjs` に (r145) 節を新設し、落とす1件(北但馬地震)・構造に当たらず残す2件(関東大震災伝承碑・狩野川台風殉難者慰霊碑)・OSM由来で残す3件(北但大震災伝承銅像・水害碑・狩野川台風殉難者供養塔)を追加(既存ケース無編集、計355 pass/0 fail)。
- 見た目の確認結果: `dump-rank` 5エリアの before/after 差分で kusatsu/hakone/dogo/beppu は完全無差分、kinosaki のみ27位「北但馬地震」消滅で28位以降繰り上げ・more先頭の「城崎美術館」が30位に昇格(想定内)。`?fixture=kinosaki` mobile と `?fixture=beppu` mobile を撮影しRead目視、文字崩れ・重なり・はみ出しなし。地図・カードテキスト双方で「北但大震災伝承銅像」(kinosaki 24位)・「水害碑」(beppu 21位)が残存していることを個別確認。
- 次: R147(改)(extract由来のカテゴリ誤判定、hakone「長興山のシダレザクラ」1件)が未着手。`node scripts/check-all.mjs` **29本全緑(exit 0)** を確認済み。外部API0回。

### 2026-09-18 R147 extract由来のカテゴリ判定を定義文1文目だけに限定(完了)
- やったこと: `guessWikiCategory()` の第2ループの走査対象を extract 全文(e)から `definitionScope(t,e)`(タイトル+定義文1文目・120字上限)に変更。自分で5エリア250記事を vm サンドボックス経由で before/after 全件突き合わせ、**変化8件・悪化0件**(計画役の見積もりと一致): 長野原町・箱根町・長興山のシダレザクラ・京都大学地球熱学研究施設・玄武洞駅・竹野浜・竹野海岸・はさかり岩がいずれも誤ったカテゴリ→「スポット」に是正。城崎麦わら細工伝承館は1文目に「城崎温泉」を含むため対象外(OSM側が勝ち画面上は美術館・博物館のまま、実害なし)。`check-engine.mjs` に (r147) 節を新設し変化する代表3件(箱根町・長興山のシダレザクラ・玄武洞駅)+不変の代表3件(一の湯・金刀比羅宮松山分社・玄武洞)を追加(既存ケース無編集)。
- 見た目の確認結果: `?fixture=hakone` mobile 撮影後、カード切り出しで18位「長興山のシダレザクラ」が「神社・寺院」→「スポット」になったことを目視確認。`?fixture=kinosaki` mobile・`?fixture=dogo` desktop(1280)も撮影し3枚とも文字崩れ・重なり・はみ出しなし。`dump-rank` 5エリア比較で **dogo は完全無差分**(想定どおり)、kusatsu/beppuも top30/far に差分なし(変化した記事がいずれも圏外)。**hakone**は神社・寺院の枠が1つ空き、後続の神社・寺院記事(阿弥陀寺など)が18→22位に繰り上がる形で数件のみ順位変動。**kinosaki**は公園の枠が3つ空き、竹野賀嶋公園・神武山公園・桜公園などの公園記事が繰り上がった。いずれも CATEGORY_PENALTY の枠が空いたことによる構造上不可避な副作用で rank の重み・閾値は変更していない。この副作用で `check-nosummary.mjs` の `.feedcard__official` 実測値(hakone 6→7、合計31→32)がズレたため期待値を実測どおり更新。
- 次: `node scripts/check-all.mjs` **29本全緑(exit 0)** を確認済み。外部API0回。ROADMAP に新規起票なし。

### 2026-09-18 R148 「にあった」だけで廃止を述べる竹野鉱山を落とす(AND判定・完了)
- やったこと: `engine.js` に `DEFINITION_GONE_SITE`(鉱山・炭鉱・スキー場・遊園地・動物園・ロープウェイ・索道・鉄道・駅・工場・劇場・映画館・百貨店・学校・病院・刑務所・飛行場・製作所)を新設し、R120のsoloループ直後・R121より前に `にあった`+種別語の AND 判定を1本追加(保護リストより前・R119/R120と同じ枠組み)。自分で5エリア250記事を述部ベースで再実測し、「にあった」26件中**ヒット11件・誤爆0件**(竹野鉱山・太子駅・別府の高校3件+小中学校2件・きりはまビーチ駅・豊岡市立竹野中学校/港西小学校/竹野小学校)を確認、旧町村9件はTITLE_SUFFIX_NGの`村`/`町`末尾一致で名前の時点で既に除外されておりR148には未到達と判明(NEXT.mdの「旧町村9件」注記を実装コメントで訂正)。`check-engine.mjs` に (r148) 節を追加(落とす3件+残す城跡4件。既存R146ケースの竹野鉱山はR148で候補から消えるため`gone:true`判定に期待値変更、削除はゼロ)。
- 見た目の確認結果: 5エリアdump-rank before/afterで**kusatsu/hakone/dogo/beppuは完全無差分**、**kinosakiのみ竹野鉱山18位消滅→御所の湯30位に繰り上がり**の1枚差分のみ。`?fixture=kinosaki`と`?fixture=dogo`をmobileで撮影しRead目視、御所の湯カード(共同浴場・徒歩3分175m)と道後4位の**湯築城**(城・城跡・写真あり・「堀や土塁が現存する」)ともに崩れなし。石垣山城・羽根尾城・長野原城もengine.js直接呼び出しで「にあった」あり・種別語ヒットなし=残存を個別確認。
- 次: `node scripts/check-all.mjs` **29本全緑(exit 0)**を確認(旧不具合`check-sample.mjs`のfeed-title配列に城崎温泉が漏れていた既存バグも合わせて修正)。外部API0回。ROADMAP新規起票なし。

### 2026-09-18 R149 5エリア化の取りこぼし6箇所を塞ぐ
- やったこと: 城崎(kinosaki)未対応の6箇所を修正。`check-nosummary.mjs`の行き止まり検査AREASに`kinosaki`追加、`(r136)c.`営業時間ガードを5エリア合計(kusatsu5/hakone4/dogo4/beppu5/kinosaki4=22)、`(r137)c.`公式ドメインガードを5エリア合計(9/7/5/11/4=36)に更新。README.mdの写真割合表を5行化し実測値(草津16件53%/箱根11件37%/道後11件37%/別府11件37%/城崎20件67%)に修正、FIXTURES.mdの手順書を「5エリア分」に、NIGHTLOG朝のまとめに`?fixture=kinosaki`を追加。
- 見た目の確認結果: 全て自分でPlaywright実測(計画役の数値と完全一致)。ガードを1つずらして赤くなることを確認後、正しい値に復元。`dump-rank`5エリアが作業前後で完全無差分(カードの順位・枚数は無変更)。`node scripts/check-all.mjs`**29本全緑(exit 0)**、`check-nosummary.mjs`が城崎を検査対象に含むことを確認。
- 次: `assets/engine.js`等ロジックは無変更。エリア列挙の取りこぼしは今回で解消、次のROADMAP項目へ。
