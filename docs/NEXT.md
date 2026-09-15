# NEXT: S1 研究ノートの実験ログに v3 暫定 rank の実測を記録する

- **タスクID**: S1(ROADMAP「研究(09ノート)」節)
- **難易度**: sonnet
- **所要目安**: 25〜40分
- **判断理由**: 朝にみのるんが読む価値が最も高く、外部API不要(fixture のみ)で、本人が「ずっと考え続ける」と決めた領域の材料になる。残る R10/R11/R14/R15/R16 はどれもコード改修で、深夜に1件進めるより「観察結果の記録」を先に積む方が翌朝の判断材料になる。

## 目的
v3 の暫定 rank が実際にどう並べているかを、**結論を急がず事実だけ**記録する。仮説の検証ではなく観察。
見たい観点は3つ:
1. **有名どころ偏り** — 上位に来るのが定番(湯畑・大涌谷級)ばかりか、そうでないか
2. **Wikipedia記事の有無への依存** — WIKI_IMAGE(25)+WIKI_SUMMARY(15)+SOURCE_BOTH(20) で最大60点が Wikipedia 由来。記事が無い OSM 単独スポットが上位に食い込めているか
3. **カテゴリ分散の効き方** — CATEGORY_PENALTY(18)/CATEGORY_FREE_SLOTS(2) が上位30件のカテゴリ構成にどれだけ効いているか

## 対象ファイル(絶対パス)
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\dump-rank.mjs`(集計スクリプト)
- 追記: `C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md` の「## 6. 実験ログ」と「## 7. 未解決の問い」
- 更新: `docs\ROADMAP.md`(S1 を `[x] 2026-09-16`)、`docs\NIGHTLOG.md`(3行追記)

### コミット先が2つに分かれる点に注意
- **09_研究ノート は yadotabi リポジトリの外**(親リポジトリ `C:\workspace` 管理)。
  コミットは親側で行う: `git -C C:/workspace add "claude/旅行先用サイト/計画書一式/09_研究ノート_認知外を提案するアルゴリズム.md"` → `git -C C:/workspace commit -m "研究ノート09に実験ログv3を追記"`
- **dump-rank.mjs / ROADMAP / NIGHTLOG は yadotabi リポジトリ**。従来どおり yadotabi 内でコミットして `git push`。
- 親リポジトリにはリモートが無いので push は不要(yadotabi 側のみ push)。

## 実装方針
`scripts/dump-rank.mjs`(Node、外部依存なし)を新規作成する。

1. `fixtures/<area>.json` を読む(`kusatsu` / `hakone`)。
2. `assets/engine.js` は `window`/`globalThis` にぶら下がる IIFE なので、`node:fs` で読んで `new Function` か `vm.runInThisContext` で `globalThis` に評価し、`globalThis.YadoEngine` を取り出す。`geo.js` が無くても engine 側に haversine のフォールバックがあるので engine.js 単体でよい。
3. fixture の生レスポンス(overpass elements / wiki pages)から `collect()` が作るのと同じ候補配列を得る。**collect() は fetch を伴うので、fixture の raw を整形する部分だけ engine.js の公開 API で賄えないなら、`rank()` に渡す item 配列を dump-rank 側で組み立ててよい**(ただし項目名・意味は engine.js の実装に厳密に合わせる。ずれたら観察の意味が無い)。
   - 楽な代替案: `?fixture=...&perf=1` 相当を Playwright で開いて `YadoEngine` の結果を `page.evaluate` で吸い出す。`scripts/check-a11y.mjs` に Playwright 利用の前例があるので、そちらが速ければそれでよい。**どちらを選んだかを NIGHTLOG に1行書くこと。**
4. 出力は **markdown 表**を stdout へ。列は:
   `順位 | 名前 | カテゴリ | 距離m | Wikipedia要約有 | 画像有 | 公式サイト有 | source(osm/wiki/both) | score`
   これを草津・箱根それぞれ**上位30件**。
5. 表の下に集計3行を付ける(これが観点1〜3の素材):
   - 上位30件のカテゴリ内訳(カテゴリ名: 件数)
   - 上位30件のうち source 別件数(osm単独 / wiki単独 / both)
   - 上位30件の距離の中央値と最大値

## 09_研究ノートへの書き方
- 「6. 実験ログ」の既存表に **1行追加**(| 2026-09-16 | v3暫定rankの上位30件を草津・箱根のfixtureで実測 | … | … |)。
- その表の**直後**に `### 2026-09-16 v3 暫定rank 上位30件(生データ)` の小見出しを立て、草津・箱根の表と集計3行を貼る。
- **事実だけを書く**。「だから鍵はXだ」「やはりYが原因」のような結論は書かない。観察して言えることだけ(例:「上位10件のうち Wikipedia要約を持つものが N 件」)。
- 「7. 未解決の問い」に今夜見えた問いを **2〜4個**追記する。候補(実データで裏が取れたものだけ書く):
  - 座標付き Wikipedia 記事の網羅性が地域で大きく違う可能性(草津50件/箱根50件でいずれも取得上限50に到達しており、実際の記事数は不明のまま)
  - fixture の `far`(車1時間以上)が草津では構造的に0件、箱根では10件出た。地方ほど「遠くの選択肢」が痩せるのではないか
  - Wikipedia記事の有無に60点が乗る現在の重みで、OSM単独スポットが上位に出る余地がどれだけあるか

## 完了条件
1. `scripts/dump-rank.mjs` が `node scripts/dump-rank.mjs kusatsu` / `hakone` で markdown 表を出す。
2. 09_研究ノートの「6. 実験ログ」に表1行+生データ節(草津30件・箱根30件・集計各3行)が入っている。
3. 09_研究ノートの「7. 未解決の問い」が2〜4個増えている。
4. ROADMAP の S1 が `[x] 2026-09-16`、NIGHTLOG に3行。
5. 親リポジトリ側・yadotabi側それぞれでコミット済み、yadotabi は push 済み。

## 検証手順(文書タスクなので撮影は不要)
- `node scripts/dump-rank.mjs kusatsu` と `hakone` が exit code 0 で、**行数がちょうど30件**であること(ヘッダ・区切り行を除く)。
- 貼り付けた表の**列が7項目+score の8列**そろっていること、markdown の `|` 数が全行一致していること(崩れた表を貼らない)。
- 草津の上位に湯畑・西の河原など既知の定番が入っているか、逆に聞いたことのない名前が何件あるかを**目視で数えて**その数を実験ログに書く(これが「有名どころ偏り」の実態)。
- 念のため `node docs/check.mjs` を最後に1回(本番が生きていることの確認のみ)。
- 撮影は不要。既存の r13 系スクリーンショットで画面は問題なしと確認済み。

## 変更禁止範囲
- **`assets/engine.js` の rank/WEIGHT/CATEGORY_* は一切変更しない**。今回は観察だけ。「重みがおかしい」と思っても直さず、気づきを「7. 未解決の問い」に書いて終える。
- `assets/app.js` / `geo.js` / `style.css` / `index.html` / `fixtures/*.json` も無変更。
- 計画書一式の 09 以外のファイルは触らない。
- git stash / reset --hard / checkout でファイルを戻す操作は禁止(AUTOPILOT 規約7)。

## 報告(NIGHTLOG 3行)
- やったこと / 観察できた事実(数字を1つ以上) / 次
