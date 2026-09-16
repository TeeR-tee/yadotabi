# NEXT: R49 + R50 文書2本(判断待ちの設計課題 / fixture 再生成手順)

**判断理由**: 残る未完了は R14・R19・R40(いずれも Overpass を叩く fixture 再生成が前提)、R48(embed 高さ postMessage・親子2ファイル改修)、R49・R50(文書)、R51(チップ並び替え)。R49+R50 はコード0行・外部API0回で、しかも R14/R19/R40 の前提資料(再生成の判断基準)と公開向けの正直さ(朝の相談の公開)を同時に埋められるため、外部APIマナーを一切消費しないこのタイミングで先に片づける。

- 難易度: **sonnet**
- 所要目安: **20分**
- 外部API呼び出し: **0回**(Overpass/Wikipedia を叩かない。`make-fixture.mjs` は**実行しない**)

---

## 対象ファイル(絶対パス)

編集してよいのはこの3つだけ。
1. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md` — **新規作成**
2. `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` — 節を1つ追加 + `docs/FIXTURES.md` へのリンク1行
3. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` — 完了記録(毎サイクル恒例)

## 実装方針

### R49: README に「判断待ちの設計課題」節を追加

- 置き場所: README の「## 仕組み(かんたん解説)」の**後ろ**、「## URLパラメータ一覧」の**前**。`## 判断待ちの設計課題` として新設する。
- 中身は `docs/NIGHTLOG.md` の「## 朝の相談(判断が要るもの)」節(NIGHTLOG:176〜184 付近)の4件を、**外部の読者が読んでも分かる日本語**に書き直したもの。1件あたり「現象 → なぜ迷っているか → 選択肢」を2〜4行。**判断はしない**(「〜にした」と書かない。「未決」であることを明示する)。
- 4件の事実(NIGHTLOG から確認済み。これ以外を創作しない):
  1. **検索候補とエリアチップの重なり(R2-1)** — 候補ドロップダウンは検索欄の真下に出るため、その下のエリアチップ行に必ず重なる。選択肢: (a)候補が開いている間チップを隠す (b)薄くする (c)このまま。
  2. **カテゴリ多様性の減点が有名どころを締め出す** — 箱根では attraction 118件・museum 109件が競合し、減点 `18×(n-2)` が上限なく積み上がる。大涌谷 −72・彫刻の森美術館 −108 で、距離加点や2ソース一致 +20 を打ち消して上位30枚に入らない。近場の無名スポットが先にカテゴリ枠を埋めるため**有名どころほど不利**という逆転。選択肢: (a)減点に上限 (b)Wikipedia記事があるものは免除 (c)このまま(「認知外を出す」狙い通りとみなす)。
  3. **実APIと fixture の Wikipedia 件数の食い違い** — 同じ中心(箱根湯本 35.2324,139.1069)・同じ半径10kmで `fixtures/hakone.json` は 50件・最遠3,720m、R20修正後の実API実測は 34件・最遠3,574m。つまり「50件上限で打ち切られている」という当初の前提が現在は再現しない。選択肢: (a)fixture 再生成で実APIに合わせる (b)真因調査に1サイクル使う (c)深追いしない。
  4. **小地図のピンのずらし幅** — 密集時に表示位置だけ最大96pxずらして番号を読めるようにしている(実座標は書き換えない)。180pxの概観図なので「正確さより見やすさ」を優先し、厳密な位置は Googleマップリンク側に任せる方針でよいか。
- 節の冒頭に1行だけ前置き(例: 「作りかけを隠さないために、まだ決めていない設計上の論点をそのまま公開しています。」)。
- 節の末尾に `docs/NIGHTLOG.md` への参照を1行。

### R50: `docs/FIXTURES.md` を新規作成

`scripts/make-fixture.mjs` の**実物**(読んで確認済みの事実のみ)を元に書く。創作禁止。

- **目的**: `?fixture=<area>` は撮影・検証を外部API0回で回すための保存済み生レスポンス。加工前の生JSONを保存し、ブラウザ側 geo.js の整形コードをそのまま通す(make-fixture.mjs:1-9)。
- **対象エリア表**(`AREAS` = make-fixture.mjs:18-22 の実値):

  | area | ラベル | lat | lon | osmRadiusM | wikiRadiusM |
  |---|---|---|---|---|---|
  | kusatsu | 草津温泉 | 36.6226 | 138.5960 | 15000(既定) | 10000 |
  | hakone | 箱根湯本 | 35.2324 | 139.1069 | 30000(個別指定) | 10000 |
  | dogo | 道後温泉 | 33.8520 | 132.7860 | 15000(既定) | 10000 |

- **実行方法**: `node scripts/make-fixture.mjs <area>`(引数なしは kusatsu)。出力先 `fixtures/<area>.json`。
- **エリアを増やす手順**: (1) `make-fixture.mjs` の `AREAS` に `{ lat, lon, label }`(必要なら `osmRadiusM`)を追加 → (2) `node scripts/make-fixture.mjs <area>` を**1回だけ**実行 → (3) `docs/check.mjs` の TARGETS に `fixtures/<area>.json` を追加 → (4) README の `?fixture=` の行と URLパラメータ表に area 名を追記 → (5) `?fixture=<area>` を mobile で撮影して目視。エリア名は `/^[a-z0-9_-]+$/` のみ(app.js の `fixtureNameFromUrl` と同じ検証)。
- **保存される meta**: `area` / `label` / `lat` / `lon` / `osmRadiusM`(実際に成功した半径) / `wikiRadiusM` / `generatedAt`(ISO文字列)。`generatedAt` は画面ヘッダーの「固定データ」バッジに取得日として表示される(R45)ので、鮮度が古くなったことに気づける。
- **Overpass のマナー**(スクリプトの実装どおり): Wikipedia を先に取り、Overpass は後(Wikipedia 失敗時に Overpass を無駄打ちしないため・make-fixture.mjs:178-180)。429/504 は 60秒待って最大2回再試行、それでも駄目なら半径 4000m に落として1回試す(`RETRY_WAIT_MS=60000` / `MAX_RETRY=2` / `FALLBACK_RADIUS_M=4000`)。**半径が落ちて成功した場合は fixture として採用せず日を改める**(meta.osmRadiusM が意図と違う値で残るため)。1サイクルあたりの生成は1エリアまで。
- **既存 fixture は原則再生成しない方針**: 既存3エリアを取り直すと元データが変わり、カードの並び・枚数・写真が変わる。過去の撮影・検査(`scripts/check-*.mjs` の期待値、09研究ノートの順位記録)との比較ができなくなるため、**再生成は「上流のクエリを変えた」「データが明らかに古い」など理由があるときだけ**。実施する場合は前後で `node scripts/dump-rank.mjs <area>` を取ってカード枚数と上位の並びを差分比較し、NIGHTLOG に記録する。
- **`buildOverpassQuery` の同期注意**: make-fixture.mjs のクエリは `assets/geo.js` の同名関数と**同一でなければならない**(make-fixture.mjs:51-52 のコメント)。片方だけ直すと fixture と本番で候補が食い違う。
- 末尾に「関連: R14(hakone.json 900KB の軽量化)・R19(far 分布)・R40(別府追加)はいずれもこの手順を前提にする」と1行。

### README からのリンク

「## ファイル構成」の `fixtures/` の行、または「開発者向け」節に
`固定データの作り方・再生成の判断基準は [docs/FIXTURES.md](docs/FIXTURES.md) を参照。` を1行足す。

## 完了条件(すべて検証可能)

1. `docs/FIXTURES.md` が存在し、上記のエリア表(3行)・実行コマンド・meta 一覧・Overpass のマナー・再生成しない方針 が書かれている。
2. README に `## 判断待ちの設計課題` 節があり、4件すべてが載っている。**どれにも結論が書かれていない**こと。
3. README から `docs/FIXTURES.md` への相対リンクが1本ある。
   ※ `docs/check.mjs` の README 検査は `<img src>` と `![]()` の**画像のみ**抽出する実装(check.mjs:225-230)なので、この .md リンクは自動検査の対象外。**リンク先ファイルが実在することを `ls docs/FIXTURES.md` で目視確認**すること(check.mjs は改造しない)。
4. `node scripts/check-all.mjs` が **全本 PASS・exit 0**(README の画像3本を含む既存のリンク検査が壊れていないことの確認を兼ねる)。
5. `git status --porcelain` で **`assets/` `fixtures/` `scripts/` `demo/` `index.html` の差分が空**(変更は docs/ と README.md のみ)。

## 検証手順

```
node scripts/check-all.mjs          # 全本 PASS / exit 0
git status --porcelain              # assets/ fixtures/ scripts/ demo/ index.html が出ないこと
```

画面変更が無いため**撮影は省略してよい**(NIGHTLOG にその旨を書く)。

## 変更禁止範囲

- `assets/` 配下すべて(app.js / geo.js / engine.js / *.css)
- `fixtures/` 配下すべて(**再生成しない**)
- `scripts/` 配下すべて(`make-fixture.mjs` も `check-*.mjs` も編集しない)
- `docs/check.mjs`(README のリンク検査ロジックを .md 対応に拡張しない。やるなら別タスクとして ROADMAP に起票)
- `index.html` / `demo/`
- 外部API(Overpass / Wikipedia / Nominatim)を**1回も叩かない**
- 朝の相談4件について**判断を下さない**(選択肢を並べるだけ)

## 終わったら

`docs/ROADMAP.md` の R49・R50 を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと/確認結果/次)追記 → コミット → `git push`。
