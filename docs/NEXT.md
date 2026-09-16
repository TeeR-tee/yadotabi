# NEXT: R14 fixtures の軽量化(不要な OSM タグを既存 JSON から落とす)

## なぜこれを選んだか(1行)
R77/R78/R72 は文書のみで効果が小さい一方、R14 は計画役の実測で「hakone 900KB → 586KB(−35%)」が確実に出ると分かり、`buildOverpassQuery` の6 clause と `pick*()` 群を全部読んで**消費されるタグキーを完全に列挙できた**ため、安全側の keep-list 方式(除去リストではなく残留リスト)で着手可能になったから。

## 背景(計画役が実測した事実)
- `fixtures/*.json` は **すべて minify 済み**(改行・インデントなし)。`JSON.stringify(j, null, 2)` で書くと逆に**増える**(hakone 900KB → 1056KB)ので、**必ず `JSON.stringify(j)`(第2・第3引数なし)で書くこと**。
- hakone.json は全 838KB 中 **444KB がタグ**。上位は name 47.9KB / **localwiki 46.0KB** / amenity 34.1KB / leisure 26.7KB / religion 22.6KB / **name:en 22.0KB** / **addr:province 14.7KB** / historic 13.6KB / wikidata 13.2KB / **addr:block_number 12.4KB** / building 10.0KB / **source 8.8KB** / denomination 8.7KB。distinct キーは **238種**。
- Overpass は `out center tags;` で**全タグを返す**ので、生JSON にはアプリが読まないキーが大量に入っている。

## 消費されるタグキー(geo.js を全部読んで確定。これ以外は落としてよい)
| キー | 使っている場所 |
|---|---|
| `name`, `name:ja` | `pickName()` geo.js:643 |
| `tourism` | `CATEGORY_RULES` geo.js:243-250、宿側 `fetchHotelsInBbox` geo.js:847 |
| `historic` | `CATEGORY_RULES` geo.js:251-254 |
| `leisure` | `CATEGORY_RULES` geo.js:255-256 |
| `amenity` | `CATEGORY_RULES` geo.js:257-258 |
| `natural` | `CATEGORY_RULES` geo.js:259-263 |
| `man_made` | `CATEGORY_RULES` geo.js:264 |
| `wikidata` | `detectWikipedia()` geo.js:585、`pickWikidataId()` geo.js:619 |
| `wikipedia`, `wikipedia:ja`, および **`wikipedia` で始まる全キー** | `detectWikipedia()` geo.js:584-593(`key.indexOf('wikipedia') === 0` の前方一致)、`pickWikipediaTitle()` geo.js:600 |
| `website`, `contact:website` | `pickWebsite()` geo.js:627 |
| `opening_hours` | `pickOpeningHours()` geo.js:635 |

補足:
- `detectCategory()` は `name` も引数に取る(`looksLikeWorship()` geo.js:559 / `WORSHIP_NAME_SUFFIX` geo.js:557)が、これは上の `name` で足りる。
- `engine.js` は `el.tags` を直接読まない(`grep -n "tags" assets/engine.js` はヒット0)。タグ消費は geo.js に閉じている。
- **`localwiki`(46KB)は `wikipedia` 前方一致に当たらない**ので落ちる。落として正しい(アプリは読まない)。

## 対象ファイル(絶対パス)
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\slim-fixtures.mjs`
- 加工対象(上書き): `C:\workspace\claude\旅行先用サイト\yadotabi\fixtures\kusatsu.json` / `hakone.json` / `dogo.json` / `beppu.json`
- 追記: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs`(保存直前に同じ keep-list を通す)
- 追記: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md`(keep-list の由来と再生成時の注意を数行)

## 実装方針
1. `scripts/slim-fixtures.mjs` を新規作成(Node 標準のみ・npm install しない)。
   - `KEEP_TAG_KEYS` を上表どおりの Set で定義し、判定は `KEEP_TAG_KEYS.has(k) || k.indexOf('wikipedia') === 0`。
   - `fixtures/<area>.json` を読み、`json.overpass.elements[].tags` から非 keep キーを `delete` する。
   - **`json.meta` / `json.wiki` / 要素の `type`/`id`/`lat`/`lon`/`center` には一切触らない**(`json.wiki` は Wikipedia の生応答で `query` キーを持つ。ここを削ると要約・写真が消える)。
   - 書き戻しは `fs.writeFileSync(path, JSON.stringify(json))`。**pretty print 禁止**(理由は上記)。
   - 引数なしで4エリア全部、`node scripts/slim-fixtures.mjs hakone` で1エリアだけ。before/after のKBと落としたキー数を1行ずつ出す。
   - **Overpass は絶対に叩かない**(既存 JSON の加工のみ)。
2. `scripts/make-fixture.mjs` に同じ keep-list を移植し、保存直前(`overpass: { elements: elements }` を組む前後、make-fixture.mjs:188-206 付近)で通す。**両方に同じリストを二重管理しないこと** — `slim-fixtures.mjs` から `export const KEEP_TAG_KEYS` して make-fixture 側が `import` する形にする。
3. 実行前に `node scripts/dump-rank.mjs <area> > before_<area>.txt` を4エリア分、スクラッチパッドに保存しておく(これが完了条件の基準になる)。

## 完了条件(検証可能)
1. **4エリアすべてで `dump-rank` の出力が加工前後で完全一致(差分ゼロ)**。1文字でも差が出たら落としたキーが実は使われているので、そのキーを keep-list に戻す。
2. `fixtures/hakone.json` が **600KB 未満**になる(計画役の実測見込み 586KB)。kusatsu 約56KB / dogo 約94KB / beppu 約123KB が目安。
3. 4ファイルとも `JSON.parse` が通り、`meta.generatedAt` と `wiki.query` が残っている。
4. `node scripts/check-all.mjs` が **25本全緑**。
5. `?fixture=kusatsu` と `?fixture=hakone` の mobile 撮影で、カード30枚・番号ピン判読可・写真と要約が従来どおり出ている(写真が消えたら `wiki` を壊している)。

## 検証手順
```
node scripts/dump-rank.mjs kusatsu > <scratch>/before_kusatsu.txt   # hakone/dogo/beppu も同様
node scripts/slim-fixtures.mjs
node scripts/dump-rank.mjs kusatsu > <scratch>/after_kusatsu.txt    # 4エリア分
diff before_<area>.txt after_<area>.txt   # 4エリアとも差分ゼロであること
ls -l fixtures/
node scripts/check-all.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile
```
撮った画像は必ず Read で開いて目視する。

## 変更禁止範囲
- `assets/geo.js` / `assets/engine.js` / `assets/app.js` / `style.css` — **一切触らない**(今回はデータ加工のみ)。
- rank の重み・閾値・`CATEGORY_RULES`・除外ルール・`buildOverpassQuery` の6 clause。
- `json.meta` と `json.wiki` の中身。
- 既存 `scripts/check-*.mjs` の中身。
- fixture の**再生成**(Overpass を叩き直すこと)。今回は既存 JSON の加工のみ。
- git stash / reset --hard / checkout でのファイル復元。

## 難易度・所要目安
難易度: 中の下(ロジック変更なし、リスクは keep-list の漏れのみで、それは完了条件1が機械的に検出する)。
所要目安: 25〜40分(うち dump-rank 4エリア × before/after で約10分)。
