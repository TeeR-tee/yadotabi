# NEXT: R84 `?debug=1` でランキングの根拠をカードに表示する(開発者/研究向け)

選定理由: 残る未完了は R64(GitHub Actions・無料枠の確認が要り朝の相談寄り)・R77(表示するか否かの判断タスク)・R81(Overpass を叩く fixture 追加)・R82(aria-label 1行の小タスク)・R85(英語デモページ)。このうち **R84 は外部API 0回・rank の計算結果を変えずに 09_研究ノートの「なぜこの順位か」を画面上で追えるようにする**もので、既存の `dump-rank.mjs` を回さないと分からなかった情報を撮影1枚で見られるようになり、今後の rank 議論(朝の相談のカテゴリ多様性減点の件)の検証コストを直接下げるため。

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-debugflag.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(新規1本を登録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(パラメータ表 R52 に1行追加)

## 実装方針(実物を読んだうえでの指示)

### 1. engine.js — rank にスコア内訳を「副作用なく」足す口

現状(実測済み):
- `baseScore(item, now)` = engine.js:847。加点は `WIKI_IMAGE`/`WIKI_SUMMARY`/`OFFICIAL_SITE`/`SOURCE_BOTH:20`、減点は `distanceM/1000 * DISTANCE_PER_KM(6)`、季節 `seasonBonus`。定数は engine.js:250-259。
- `rank(items, hotel, context)` = engine.js:873。`scored = list.map(...)` で `{item, score}` を作り(879)、仮ソート(882)、カテゴリ多様性減点 `WEIGHT.CATEGORY_PENALTY(18) * (seen - CATEGORY_FREE_SLOTS + 1)`(896-899)、再ソート(902)、最後に **`scored.map(entry => entry.item)` で item だけ返す**(907)。
- `toCard(item, hotel)` = engine.js:915。`source: item.source || 'osm'`(931)と `distanceM`(927)は既に Card が持っている。

やること:
1. `baseScore` を **数値を返す従来の形のまま維持**しつつ、内訳を別関数 `scoreBreakdown(item, now)` に切り出す(`{image, summary, official, both, distance, season, base}` を返す純粋関数)。`baseScore` はその `base` を返すだけにする。**重み・閾値・計算順序は一切変えない**(浮動小数の加算順が変わると同点の並びが変わる恐れがあるので、加算は現行と同じ順序で書くこと)。
2. `rank()` 内で、`entry` に `breakdown` を持たせ、カテゴリ減点を引いた箇所(898)で `breakdown.categoryPenalty` と `breakdown.categoryIndex(seen)` を記録、最終スコアを `breakdown.total` に入れる。
3. 907 の返し方を変える。**item を書き換えず**、`entry.item` に `_debug` を後付けする形にする:
   ```
   return scored.map(function (entry, i) {
     entry.item._debug = { rank: i + 1, source: entry.item.source, category: entry.item.category,
                           distanceM: entry.item.distanceM, ...entry.breakdown };
     return entry.item;
   });
   ```
   ES5 スタイルに合わせて spread は使わず `Object.keys` ループか明示代入にすること(このファイルは `var` ベースの ES5 で書かれている)。
   **`_debug` は常に付けてよい**(付けても並び順・スコアには影響しない)。付与しないフラグ分岐を engine 側に作らない方が、テストで「有無で不変」を比べられて安全。
4. `toCard()`(915)の返り値に `_debug: item._debug || null` を1行足す。`present()`(943)は無変更。

**rank の計算結果(返る配列の順序と中身)は変えないこと。** `_debug` はぶら下がるだけ。

### 2. app.js — `?debug=1` のパース(fixture 必須)

- パース位置は app.js:1425-1440 の「撮影・目視QA専用の入口」ブロック。`demoImgFail` 等と同じ並びに `var debugRank = false;`(宣言は app.js:142-150 のフラグ群の末尾)を足し、
  ```
  if (params.get('debug') === '1' && fixtureNameFromUrl(params)) debugRank = true;
  ```
  とする。`fixtureNameFromUrl(params)`(app.js:1317)が null(=`?fixture=` 無し/不正値)なら**絶対に立てない**。本番URLで一般の人に `.dbg` が見えてはいけない。
- なお fixture の読み込みは非同期で、失敗時は `isFixtureMode` を立てずに通常動作へフォールバックする経路がある(1483-1500 付近)。`debugRank` は URL だけで決めているので、**フォールバックした場合は `debugRank = false` に戻す**こと(fixture が読めなかった＝本番データを見ている状態なので)。

### 3. app.js — cardHtml に1行足す

- `cardHtml(card, index)` = app.js:830。`.feedcard__body` の最後、`linkRowHtml(card)`(862)の**直後**に挿入する:
  ```
  (debugRank && card._debug ? debugHtml(card._debug) : '')
  ```
- `debugHtml(d)` は新設の小関数。出力例(1行、淡色・極小):
  `<p class="dbg">#3 · osm · 神社・寺院 · 742m · 合計 26.4 <span class="dbg__b">写真+8 要約+6 公式+4 両ソース+20 距離-4.5 カテゴリ-18</span></p>`
  - 数値は `toFixed(1)` 程度に丸める。0 の項目は出さない(行が長くなるだけ)。
  - **必ず `escapeHtml()` を通す**(category ラベルが入るため)。
- `more`(31件目以降)も同じ `cardHtml` を通るので自動で出る。`far` 側は対象外でよい。

### 4. style.css

`.dbg` を追加: `font-size: 10px; color: var(--fg-faint 相当の既存トークン); margin-top: 6px; line-height: 1.5; word-break: break-all;`。既存のトークン名は `style.css` / `tokens.css` を読んで実在するものを使うこと。**mobile 375px で2行に収まること**を撮影で確認する(3行以上になるなら内訳の語を「写」「要」等には縮めず、`total` と `categoryPenalty` 以外を削る方向で調整し、理由を NIGHTLOG に書く)。

---

## 完了条件(すべて検証可能)

1. `scripts/check-engine.mjs` に **「debug 情報の有無で cards の順序・内容が不変」** のケースを追加して緑。具体的には、同じ入力で `rank()` → `present()` を通し、`JSON.stringify` で `_debug` キーを除いた `cards`/`more`/`far` が **R84 実装前の期待値と完全一致**すること(実装前に一度 `node scripts/dump-rank.mjs kusatsu > before.txt` を4エリア分取っておき、実装後の出力と `diff` が空であることも確認する)。
2. `scripts/check-debugflag.mjs`(新規・Playwright、既存の `check-imgfail.mjs` を雛形にする)が以下を全て PASS:
   - `?fixture=kusatsu&debug=1` で `.dbg` が 30件以上ある
   - `?fixture=kusatsu`(debug 無し)で `.dbg` が **0件**
   - `?debug=1` 単独(fixture 無し)で `.dbg` が **0件** ← 最重要
   - `?fixture=kusatsu&debug=1` の1位カードの `.dbg` テキストが `#1` を含み、`osm`/`wiki`/`both` のいずれかを含む
   - debug 有無で `.feedcard__name` の並びが完全一致(DOM 上でも順序不変を確認)
3. `node scripts/check-all.mjs` が **全本 PASS・exit 0**(新規1本を登録して本数+1)。
4. `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` の出力が実装前後で **差分ゼロ**。

## 検証手順(撮影+目視)

外部API 0回。`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅で撮り、画像を Read で目視する。
1. `?fixture=kusatsu&debug=1` mobile / desktop — 内訳行が読めるか、カード本文と重なっていないか、375px で横はみ出しがないか。
2. `?fixture=beppu&debug=1` mobile — OSM 単独候補(R83 の代替文が出るカード)で `.dbg` と代替文が2行続いても詰まって見えないか。
3. `?fixture=kusatsu` mobile — **デグレ確認。`.dbg` が1つも出ていないこと**。
4. `?fixture=kusatsu&embed=1&debug=1` mobile — 埋め込みでも崩れないこと(出す/出さないの判断は実装者に任せる。決めた理由を NIGHTLOG に1行書く)。

## 変更禁止範囲

- `WEIGHT`(engine.js:250-256)の値、`CATEGORY_FREE_SLOTS`(259)、`FAR_DRIVE_MIN`、`MAX_CARDS`/`MAX_MORE`/`MAX_FAR` — **一切触らない**
- `assets/geo.js` — 無変更
- `fixtures/*.json` — 再生成しない・編集しない(Overpass を叩かない)
- 除外ルール(`TITLE_SUFFIX_NG` / `TITLE_KEYWORD_NG` / `isExcludedName` / `isExcludedArticle`)— 無変更
- 既存 `scripts/check-*.mjs` の中身 — `check-engine.mjs` へのケース追加と `check-all.mjs` への登録行のみ可

## 難易度 / 所要目安

- 難易度: **opus**(rank の内部構造に触るため、副作用ゼロの担保が本質。実装量自体は小さい)
- 所要目安: 実装 30〜45分 + check-all 約4分 + 撮影目視 10分

## 仕上げ

実装が終わったら **まず先にコミット**すること。ROADMAP の R84 行を `[x] 2026-09-16` にし、NIGHTLOG に3行(やったこと / 見た目の確認結果 / 次)を追記してから `git push`。報告は簡潔に(長文の報告書を書かない)。
