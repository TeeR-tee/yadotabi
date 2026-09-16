# NEXT: R79 公共施設が除外ルールを通過して観光候補に残る件の是正(最優先)

難易度: opus / 所要目安: 60〜90分 / 外部API: 0回(fixture のみ)

## 背景(前サイクル R40 別府の観察)

R35 で `isExcludedName` を OSM 側にも適用したが、**別府の上位30件に公共施設が9件も残っている**。
`node scripts/dump-rank.mjs beppu` の実測(2026-09-16):

| 順位 | 名前 | source | なぜ通過したか(計画役の見立て) |
|---|---|---|---|
| 5 | 別府駅 (大分県) | both | 末尾が `駅` ではなく `(大分県)` のため `TITLE_SUFFIX_NG` の末尾一致を素通り |
| 9 | ビーコンプラザ | wiki | コンベンションセンター。語が一つも当たらない |
| 10 | 別府市野口原総合運動場陸上競技場 | wiki | `競技場`/`運動場` が語彙に無い |
| 11 | 京都大学大学院理学研究科附属地球熱学研究施設 | wiki | 末尾が `施設`。`大学` は部分一致ではなく**末尾一致**の語なので当たらない |
| 12 | 別府市総合体育館 | wiki | `体育館` が語彙に無い |
| 14 | 別府市公会堂 | wiki | `公会堂` が語彙に無い |
| 18 | トキハ別府店 | wiki | 百貨店。`店` が語彙に無い |
| 19 | 別府郵便電話局電話分室 | wiki | 末尾が `分室`。`郵便局` は末尾一致なので当たらない |
| 24 | 野口病院管理棟 | wiki | 末尾が `管理棟`。`病院` は末尾一致なので当たらない |

**要点: 落ちていない候補の多くは wiki 単独(source=wiki)で、原因は「OSM に適用できていない」ではなく `TITLE_SUFFIX_NG` が末尾一致のみのため「病院管理棟」「〇〇大学…施設」「別府駅 (大分県)」のように語の後ろに何かが付くと素通りする点**。R35 の修正は正しく効いており、今回足すのは語彙と当て方。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` (本体)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs` (ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\dump-rank.mjs` (任意・`more` 出力の追加のみ可)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` / `docs\ROADMAP.md` (記録)

## 実装方針(実物の行番号つき)

読むべき実物:
- `assets/engine.js:138` `NAME_PROTECT_SUFFIX`(保護語・末尾一致)
- `assets/engine.js:148` `TITLE_SUFFIX_NG`(末尾一致で落とす)
- `assets/engine.js:170` `TITLE_KEYWORD_NG`(部分一致で落とす)
- `assets/engine.js:180` `EXTRACT_KEYWORD_NG`(冒頭文の部分一致)
- `assets/engine.js:355` `isProtectedName()` / `:365` `isExcludedName()` / `:389` `isExcludedArticle()`
- 適用点: wiki 側 `assets/engine.js:691`、OSM 側 `buildOsmItems()` `assets/engine.js:624`

方針は**既存定数に足すだけ**。関数の構造(保護 → 除外の順)は変えない。

1. `TITLE_KEYWORD_NG`(部分一致)に**公共施設の種別語**を追加する。ここは部分一致なので「管理棟」「附属…施設」「(大分県)」の後置きにも当たる:
   `体育館` `公会堂` `市民会館` `県民会館` `文化会館` `競技場` `運動場` `武道館` `庁舎` `合同庁舎` `管理棟` `事務所` `出張所` `研究所` `研究施設` `試験場` `浄化センター` `福祉センター` `保健センター` `コンベンションセンター` `貯水池` `分室` `職員` `官公庁`
   - `センター` 単体は入れない(観光案内センター・ビジターセンターを巻き込むため)。必要な `〇〇センター` は上のとおり**複合語で**入れること。
2. `TITLE_SUFFIX_NG`(末尾一致)への追加は最小限に: `百貨店` `支所` `分署` `車庫` `営業所`(既存)。`店` 単体は禁止(「〇〇本店」の飲食観光店を巻き込む)。
3. `NAME_PROTECT_SUFFIX`(保護)に**観光側で誤爆しそうな語**を先に足しておく:
   `観光案内所` `ビジターセンター` `観光案内センター` `交流センター` `文化ホール` `タワー` `展望` `ロープウェイ` `足湯` `地獄` `砂湯`
   - 保護は除外より先に評価される(`isExcludedName:367`)ので、ここに入れた語は必ず生き残る。
4. **駅の後置き対策**: `別府駅 (大分県)` のような曖昧さ回避の括弧付きタイトルは、判定前に `\s*[（(][^）)]*[）)]\s*$` を1回だけ剥がして正規化する小ヘルパ(例 `stripDisambiguation(name)`)を `isExcludedName` の冒頭に入れる。**保護語の判定にも同じ正規化後の文字列を使う**こと。
5. `EXTRACT_KEYWORD_NG` は冒頭文で確実に落とせるものだけ足す: `体育館である` `公会堂である` `コンベンション` `百貨店である` `研究施設である` `陸上競技場`。

**rank の重み・閾値・`geo.js`・`fixtures/*.json` は一切触らない。**

## 完了条件(検証可能)

1. `node scripts/dump-rank.mjs beppu` の cards 30件に、上表の9件が**0件**であること(`別府駅 (大分県)` 含む)。
2. 4 fixture(kusatsu / hakone / dogo / beppu)で before/after の候補一覧を取り、**落ちた候補を全件目視**。観光対象(温泉・神社・寺・美術館・博物館・公園・タワー・展望・地獄・砂湯・道の駅 等)が1件でも落ちていたら `NAME_PROTECT_SUFFIX` に追加して再実行。最終的に**観光対象の誤爆0**。
3. 差分一覧(エリアごとに「落ちた候補名 / 判定に当たった語 / 観光対象か」)を `docs/NIGHTLOG.md` に表で残す。
4. `scripts/check-engine.mjs` に今回の語のケースを追加(落とす側6件以上・保護される側6件以上。最低でも「別府市総合体育館→除外」「野口病院管理棟→除外」「別府駅 (大分県)→除外」「観光案内センター→保護」「別府タワー→保護」「別府市美術館→保護」)。
5. `node scripts/check-all.mjs` が **25本全緑**。

before/after の取り方: 実装前に `node scripts/dump-rank.mjs <area> > %TEMP%\before_<area>.md` を4エリア分、実装後に同じく after を取って差分を見る。`more`(31〜60番)も見たいので、`dump-rank.mjs` に `presented.more` の表を足す小改修は許可する(表示のみ・ロジック無変更)。

## 検証手順(撮影)

- `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=beppu" --mobile`
- `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=kusatsu" --mobile`
- 撮った画像を必ず Read で開き、カードが30枚あること・上位に公共施設が見えないこと・文字崩れ/重なりが無いことを目視する。
- 候補が減りすぎて30枚に満たないエリアが出たら、それは除外しすぎのサインなので保護語を見直す(枚数減も NIGHTLOG に記録)。

## 変更禁止範囲

- rank の重み・閾値(`score` 計算、カテゴリ多様性の減点)
- `assets/geo.js`
- `fixtures/*.json`(再生成しない。Overpass を叩かない)
- 既存の `check-*.mjs` の**他の本**の中身
