# NEXT: R120 「かつて」を含まない廃止表現を落とす(R119 の申し送り)

- **タスクID**: R120
- **難易度**: sonnet(既存 R119 ブロックへの配列1本の追加。設計は本書で確定済み)
- **所要目安**: 25〜40分(実装10分 + 4エリア突き合わせ10分 + check-all 約4.5分 + 撮影)

## 目的

R119 は「もう存在しない場所」を落とす経路を入れたが、判定を **「かつて」AND 過去存在語** の
2語にしたため、**「かつて」を書かずに過去形だけで廃止を述べる記事**が素通りしている。
作業役からの申し送りどおりの残件で、実測すると **kusatsu 14位「群馬鉄山」**が写真・要約つきで
現役スポットのようにカードに並んでいる。宿の客が向かっても現地に何も無いのは R119 と同じ実害。

## 実測で判明した前提(2026-09-16 計画役)

`node scripts/dump-rank.mjs kusatsu` の cards 14位:

| 順位 | 名前 | カテゴリ | 距離m | source |
|---|---|---|---|---|
| 14 | 群馬鉄山 | スポット | 3391 | wiki |

fixtures/kusatsu.json の実テキスト(`wiki.query.pages` の extract):

> 群馬鉄山（ぐんまてつざん）は、群馬県吾妻郡六合村（現・中之条町）に**存在した**鉱山。群馬鉱山とも呼ばれる。

`definitionPredicate(definitionScope('', extract))` の結果は
`群馬県吾妻郡六合村（現・中之条町）に存在した鉱山。` で、**「かつて」が無い**ため
`assets/engine.js:510` の AND 判定を通過している(実測 `isExcludedArticle` = false)。

4エリア200記事を述部で走査した全ヒット(実測値):

| 語 | ヒット | 内訳 |
|---|---|---|
| `存在した` | 6件 | 群馬鉄山 / 白根火山ロープウェイ / 愛媛県立道後動物園 / 鶴見園 / キャンプ・チッカマウガ / 別府鉱山 |
| `存在していた` | 1件 | 草津シズカ山スキー場 |
| `あった` | 16件 | **湯築城・石垣山城・羽根尾城・長野原城**ほか村・町・廃校 |

## 実装方針

`assets/engine.js` の R119 定数(`engine.js:275-276`)の直後に単独成立語を1本足す:

```js
var DEFINITION_GONE_SOLO = ['存在した', '存在していた'];
```

`isExcludedArticle()`(`engine.js:493`)の R119 ブロック(`engine.js:510-514`)の**直前**に、
`DEFINITION_GONE_SOLO` を述部から探して当たれば `return true` するループを置く。
位置は既存の AND 判定と同じく **`isProtectedName()` より前**(R119 と同じ理由。保護リストは
「何であるか」しか見ておらず、閉鎖済み施設は名前だけ種別語のまま残るため)。
既存の AND 判定・`DEFINITION_GONE_PAST`・`hasOsmTagEvidence()` の救済経路は**1行も変えない**。

### 緩めてはいけない理由(必読)

- **`あった` を `DEFINITION_GONE_SOLO` に入れてはいけない**。実測で `湯築城`「愛媛県松山市道後公園に
  あった日本の城。」(dogo **4位**の正当な観光対象)・`石垣山城`・`羽根尾城`・`長野原城` を巻き込む。
  城跡は跡地が整備されていて**現地に行ける**。R119 が AND にしたのはこの1語のためであり、
  `存在した`/`存在していた` の2語だけを単独成立に切り出すのが安全な最小差分。
- **走査範囲を `definitionPredicate()`(定義文の述部)から広げてはいけない**。extract 全体を見ると
  二文目以降の「かつて〇〇が存在した場所に建つ美術館」で現役施設を巻き込む(R117 で確認済みの罠)。
- **`廃止` を足さない**。唯一のヒット `南別府駐屯地`(「…2022年（令和4年）3月17日に廃止された。」)は
  名前の `駐屯地`/`病院` 側で**既に除外済み**(実測 `isExcludedArticle`=true)なので差分が出ず、
  1件も救えない語で条件を広げると根拠が崩れる。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(唯一のコード変更先)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(`(r119)` 節=513行目の後に `(r120)` 節を新設。既存ケースは1件も削らない)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 影響を受ける候補の全件リスト

**直す側(判定が false→true に変わるのは、200記事中この1件だけ)**

| エリア | 名前 | 現在の位置 | 述部 |
|---|---|---|---|
| kusatsu | 群馬鉄山 | cards **14位** | 群馬県吾妻郡六合村（現・中之条町）に存在した鉱山。 |

**新ルールに当たるが R119 で既に除外済み(画面は不変・6件)**

白根火山ロープウェイ(kusatsu more) / 草津シズカ山スキー場 / 愛媛県立道後動物園(dogo) /
鶴見園(beppu) / キャンプ・チッカマウガ(beppu) / 別府鉱山(beppu)

**残す側(`あった` 系。1件も落としてはいけない)**

湯築城(dogo **4位**) / 石垣山城(hakone) / 石垣山一夜城歴史公園(hakone) / 羽根尾城(kusatsu) /
長野原城(kusatsu) / 六合村 (群馬県) / 道後村 / 道後湯之町 / 大窪村 / 早川村 /
別府駅商業施設(beppu **9位**・現役の駅ビル。「かつて…と総称されていた」だが過去存在語なし)

## 完了条件

1. 4エリア200記事の `isExcludedArticle` を変更前後で全件突き合わせ、**変わったのが群馬鉄山1件のみ**(誤爆0件)。
2. `node scripts/dump-rank.mjs` の差分が期待どおり:
   - **hakone / dogo / beppu は完全無差分**
   - kusatsu は14位の群馬鉄山が消え、15位以降が1つずつ繰り上がる(繰り上がった候補を**全件目視**し、
     廃止施設・宿・非観光対象が無いこと・cards が30枚を維持することを確認)
3. `node scripts/check-engine.mjs` に `(r120)` 節を新設(落とす1件 + `あった` 系の残す対照4件以上 +
   `存在した` が単独で成立することの確認)。既存ケースは1件も削らない。
4. `node --check assets/engine.js` OK。

## 検証手順

1. `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` を変更前後で取り、差分を比較。
2. `node scripts/check-engine.mjs` が全 PASS。
3. 撮影(ローカルサーバ・外部API 0回):
   - `http://127.0.0.1:3000/index.html?fixture=kusatsu` を **--mobile(375px)** で1枚(群馬鉄山が消え30枚維持)
   - `http://127.0.0.1:3000/index.html?fixture=hakone` を **--mobile** で1枚(デグレ確認)
   - 撮った画像を Read で開き、文字崩れ・はみ出し・帰属表示「Leaflet | © OpenStreetMap」が右上に
     読めること・ピン番号が判読できることを目視する。
4. **`node scripts/check-all.mjs` が 29本全緑(exit 0)**。これは必須。

## 変更禁止範囲

- **rank の重み・閾値は変更不可**(順位の設計はこのタスクの対象外)。
- `assets/geo.js` / `fixtures/*.json` は変更不可(再生成もしない)。
- 既存の `DEFINITION_GONE_MARK` / `DEFINITION_GONE_PAST` の AND 判定、`hasOsmTagEvidence()` の
  救済経路、`NAME_PROTECT_SUFFIX`、`EXTRACT_KEYWORD_NG` は触らない。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- **外部API 0回**(Overpass / Nominatim / Wikipedia を叩かない。撮影は `?fixture=` のみ)。

## 終わったら

1. `docs/ROADMAP.md` の R120 行を `- [x] 2026-09-16` に変える。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記する(先頭に新しい節を作らない)。
3. **先にコミット**(1行の日本語メッセージ) → `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
