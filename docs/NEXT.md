# 次の1タスク: R100 カード見出しの長いスポット名の折り返し方針を決める

- **タスクID**: R100
- **難易度**: sonnet
- **所要目安**: 20〜30分(実装は数行、大半は撮影と目視)

## 目的

カード見出し `.feedcard__name` だけが、同じ style.css 内の他の「長い名前を扱う場所」と方針が揃っていない。
ラテン文字の長い連続(スペースの無い語)が来たときにカード枠からはみ出さないことを保証し、
実測で3行を超えないなら「確認した」事実だけ残して閉じる。

## 実測で判明した前提(計画役が今サイクルで測った)

### 1. CSS の現状(確定)

- `assets/style.css:450-455` `.feedcard__name` の宣言は **`margin` / `font-size: var(--fs-lg)` / `font-weight: 700` / `line-height: var(--lh-tight)` の4つだけ**。`overflow-wrap` も `word-break` も `hyphens` も無い。
- 対比: `.suggest__name`(`style.css:134-137`)と `.topbar__title`(`style.css:329-336`)はどちらも `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` で1行に省略している。カード見出しだけ無方針。
- トークン実測値(`assets/tokens.css`): `--fs-lg: 1.125rem`(=18px、tokens.css:47) / `--lh-tight: 1.3`(tokens.css:51) / `--sp-4: 16px`(tokens.css:58)。よって見出し1行の高さは約23.4px。
- カード本文の左右パディングは `.feedcard__body`(`style.css:444`)の `var(--sp-3) var(--sp-4) var(--sp-4)` = 左右16px。
- `body { overflow-x: hidden }`(`style.css:14`)が**ページ全体の横スクロールは塞いでいる**ため、はみ出しても横スクロールバーは出ない。つまり事故が起きても「文字がカード右端で見えなくなる」形で静かに欠けるだけで、気づきにくい。**この点は今回の実装で必ず目視確認すること。**

### 2. 最長スポット名の実測(4 fixture を node で直接集計・外部API 0回)

OSM 側(`overpass.elements[].tags.name`)の最長名:

| エリア | 名前付きOSM要素数 | 最長名 | 文字数 |
|---|---|---|---|
| kusatsu | 158 | 湯けむりに ふすぼりもせぬ 月の貌 小林一茶 | 22 |
| hakone | 3324 | Shinkansen bottom view at full speed | 36 |
| dogo | 401 | 港山城跡　みなとやまじょうあと　MinatoyamaJouato Minatoyama Castle Ruins | 56 |
| beppu | 487 | Kyushu Yufuin Folk Craft Village | 32 |

Wikipedia 側(`wiki.query.pages[].title`)の最長名:

| エリア | 最長タイトル | 文字数 |
|---|---|---|
| kusatsu | ジェイアールバス関東長野原支店 | 15 |
| hakone | 山崎インターチェンジ (神奈川県) | 17 |
| dogo | 愛媛大学教育学部附属特別支援学校 | 16 |
| beppu | 京都大学大学院理学研究科附属地球熱学研究施設 | 22 |

**重要な観察**: 日本語名は最長でも22字で、日本語は任意の位置で折り返せるため崩れない。
リスクがあるのは **dogo の `MinatoyamaJouato`(16字の途切れないラテン文字列)** と
**hakone/beppu の英語名(スペース区切りなので語単位では折り返せる)** の2種。
`overflow-wrap: anywhere` が効くのは前者(スペースの無い長い連続)のみで、そこが本タスクの本丸。

### 3. 未確認(作業役が確かめること)

- 上の最長名が **実際に上位60件のカードに載るか**は未確認(fixture の生データを数えただけで、`rank()` を通していない)。
  `Shinkansen bottom view at full speed` や `港山城跡　…` は R79/R80 の除外ルールや rank 下位で落ちている可能性が高い。
  **作業役は `node scripts/dump-rank.mjs <area>` を4エリアで回し、cards+more(上位60件)に載る名前の最長を実測して NIGHTLOG に書くこと。**
- 上位60件に長名が1つも無い場合でも、fixture を作り直したり別エリアを足した瞬間に入りうるので、
  **予防として `overflow-wrap: anywhere` を足す方針は変えない**(1行追加・副作用なし)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (変更するのはここだけ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` (完了マーク)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` (3行記録)

## 実装方針

1. `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` を4回回し、**cards+more の名前の最長文字数**を記録する(外部API 0回)。
2. `assets/style.css:450` の `.feedcard__name` ブロックに **1行だけ**追加する:

```css
.feedcard__name {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: var(--lh-tight);
  /* 長いラテン文字の連続(例 dogo の MinatoyamaJouato)でもカード枠からはみ出さない。
     日本語名は任意位置で折り返せるので影響なし。省略はしない(情報を隠さない方針)。 */
  overflow-wrap: anywhere;
}
```

3. `.feedcard__times`(`style.css:466`)の `white-space: nowrap` は **R54 の判断なので絶対に触らない**。
4. `.suggest__name` / `.topbar__title` の省略方針も触らない(カード見出しは「省略せず折り返す」で方針が違ってよい。理由を NIGHTLOG に1行書くこと)。
5. 撮影で3行を超えるカードが出た場合も、**行数を制限する `-webkit-line-clamp` は入れない**(名前を隠すと何の場所か分からなくなる)。3行超が出たら事実だけ NIGHTLOG に記録する。

## 完了条件

- `.feedcard__name` に `overflow-wrap: anywhere` が入っている(または、dump-rank 実測で不要と判断したなら**その理由を NIGHTLOG に書いたうえで**無変更で閉じる)。
- 375px 幅の撮影で、カード見出しがカード右端(`.feedcard__body` の右パディング16px)を越えて欠けていない。
- `git diff --stat -- assets` が `style.css` のみ(app.js / engine.js / geo.js に差分なし)。
- `node scripts/check-all.mjs` が **27本全緑**(exit 0)。

## 検証手順

1. `node --check assets/app.js`(無変更のはずだが念のため)
2. dump-rank 4本: `node scripts/dump-rank.mjs kusatsu` / `hakone` / `dogo` / `beppu`
3. 撮影(すべて fixture 経由・外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=dogo" --mobile --full`(幅375px。長名が最も出やすい dogo)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=hakone" --mobile`(幅375px)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile`(幅375px・デグレ確認)
   - PC幅1枚: `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=dogo"`(1280px相当)
   - 撮った画像を **Read で開いて目視**し、見出しの欠け・重なり・はみ出しが無いことを確認する。
4. `node scripts/check-all.mjs` → **27本全緑(exit 0)**を必須とする。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**。
- rank の重み・閾値・`CATEGORY_FREE_SLOTS` などスコアに関わる値は**変更不可**。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは**0回**。撮影はすべて `?fixture=` で行う。
- 既存 `scripts/check-*.mjs` の検査内容を減らさない。

## 終わったら

1. `docs/ROADMAP.md` の R100 の行頭を `- [x] 2026-09-16 R100 …` に更新する。
2. `docs/NIGHTLOG.md` の「## サイクル記録」に **3行**追記(やったこと / 見た目の確認結果 / 次)。dump-rank で測った上位60件の最長名と文字数を必ず書く。
3. **先にコミット**する(1行の日本語メッセージ)。
4. `git push` する。
5. 報告は簡潔に(長文の報告書を書かない)。
