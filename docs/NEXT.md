# NEXT — R81 5エリア目「城崎温泉」の固定データ追加

- タスクID: **R81**
- 難易度: 中(外部API1回＋横断的なファイル更新)
- 所要目安: 40〜60分
- 日付: 2026-09-18

## 目的

既存4エリアは 草津=密集 / 箱根=広域分散 / 道後=市街地隣接 / 別府=散在。城崎温泉は温泉街が円山川沿いの1本道に細長く並ぶ **「線状」** の地形で、どれとも違う。実際の本番城崎で英語名カードの穴(R127)が見つかった実績があるとおり、**承認不要で未知の問題を掘り起こせる観測材料**を1つ増やすのが狙い。R80 の救済機構が4エリアでは差分0だったので、その観測母数を増やす意味もある。

## 実測で判明した前提(更新が必要なファイル・行番号つき)

grep で全件洗い出した。**1つでも漏らすと check-all が落ちる**。

| # | ファイル(絶対パス) | 行 | 何をするか |
|---|---|---|---|
| 1 | `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs` | 19-24 `AREAS` | `kinosaki: { lat: 35.6262, lon: 134.8055, label: '城崎温泉' }` を追加(**osmRadiusM は指定しない**=既定15000) |
| 2 | `...\fixtures\kinosaki.json` | 新規 | スクリプトが生成 |
| 3 | `...\scripts\slim-fixtures.mjs` | 3(コメント), 61 `AREAS` | 配列に `'kinosaki'` 追加＋コメントを「5エリア」に |
| 4 | `...\docs\check.mjs` | 20-23 TARGETS | `'fixtures/kinosaki.json',` を追加 |
| 5 | `...\assets\app.js` | 1929-1934 `SAMPLE_LINKS` | `{ fixture: 'kinosaki', label: '城崎の例' }` を追加(1583-1593 の `random` は SAMPLE_LINKS を見るので自動で5エリア対象になる) |
| 6 | `...\scripts\check-sample.mjs` | 12,16(コメント) / 48付近 `count === 5` / 73-77 | **リンク5本→6本**へ。`ok(count === 5, 'a. サンプルリンクが5本')` を 6 に直し、`fixture=kinosaki` の行を1本追加。コメント `b.`/`f.` の「4本」「4エリア」も6本/5エリアに |
| 7 | `...\scripts\check-attrib.mjs` | 185-189 | `await checkUrl(browser, `${BASE}/?fixture=kinosaki`, 'kinosaki');` を beppu の次に追加 |
| 8 | `...\README.md` | 3(英文) / 29 / 59 / 114 / 216-219(サイズ表) | `kinosaki` を列挙に追加、`random` の説明「4エリアから」→「5エリアから」、サイズ表に1行追加(実測値を入れる) |
| 9 | `...\docs\FIXTURES.md` | 15-20(対象エリア表) / 22-33(far実測表) / 107(軽量化サイズ) | 対象エリア表に kinosaki 行、far 実測表に `node scripts/dump-rank.mjs kinosaki` の実測1行、必要なら注記を「4エリア→5エリア」に |
| 10 | `...\docs\ROADMAP.md` | 73 | `[x] 2026-09-18` にする |
| 11 | `...\docs\NIGHTLOG.md` | 末尾 | サイクル記録に見出し＋3行 |

**触らなくてよいと確認済み**: `scripts/check-nosummary.mjs`(167行 `AREAS` は R137 の official 枚数=31枚の実測アサーションで、4エリア固定のまま正しい。**kinosaki を足すと数が合わず落ちるので絶対に足さない**)、`assets/engine.js`(beppu 等はコメント内の実例のみ)、`scripts/check-engine.mjs`(同上)。

## 実装手順

1. `make-fixture.mjs` の `AREAS` に kinosaki を追加。
2. **`node scripts/make-fixture.mjs kinosaki` を 1回だけ実行する。**
   - マナー(`docs/FIXTURES.md` 57-62行): 429/504 が出て内部リトライ後も駄目なら、**半径 4000m に縮退して成功しても採用しない**。`fixtures/kinosaki.json` を消し、NEXT.md はそのままにして NIGHTLOG に「Overpass 混雑のため日を改める」と書いて終了(他のファイル変更もコミットしない)。
   - 生成後に `meta.osmRadiusM` が **15000** であることを必ず確認する(4000 なら縮退＝不採用)。
   - slim は自動適用されるので `slim-fixtures.mjs` の手動実行は不要。
3. 上表 3〜9 のファイルを更新する。
4. `node --check` 相当(`node scripts/check-all.mjs`)で確認。

## 生成後に確認すること(線状地形なので特に注意)

`node scripts/dump-rank.mjs kinosaki` と `?fixture=kinosaki` の撮影画像の両方で見る。

- **件数**: cards が **30枚**あるか(半径15kmで候補が足りず30枚に満たないと、`.feedcard が30枚` を前提にした検査や体験が崩れる)。Wikipedia pages 件数・OSM elements 件数もログで控える。
- **上位候補の妥当性**: 1〜10位に城崎らしい行き先(外湯・ロープウェイ・玄武洞など)が来ているか。関係ない一般名詞・人物伝記・索引記事が混じっていないか(R142/R127 系の穴が出やすい)。
- **英語名/表記の穴(R127 の再発)**: カード名が英語のまま/記号混じりになっているものが無いか、30枚を目視。
- **線状地形で崩れやすい点**(予想して必ず見る):
  1. **地図の縦横比** — 候補が南北に細長く並ぶと自動ズームが縦に引き伸ばされ、地図が極端に縮小(=宿ピンが見えない)または見切れる恐れ。mobile で地図パネルを目視。
  2. **ピンの重なり** — 温泉街の1本道に候補が密集し、番号ピンが重なって判読不能になっていないか。
  3. **距離の分布** — 温泉街内が数百m、玄武洞・城崎マリンワールド方面が数km と二極化しやすい。`dump-rank` の距離列で「0〜300m に偏って上位が全部同じ通り」になっていないか。
  4. **far の件数** — osmRadiusM=15000 なので far しきい値 30,000m に届かず **0件が正常**(FIXTURES.md 33行の構造どおり)。0 でなければ何かおかしい。
  5. **ファイルサイズ** — 他エリアと桁違いなら要因を NIGHTLOG に記す。

## 完了条件

- `fixtures/kinosaki.json` が存在し `meta.osmRadiusM === 15000` / `meta.label === '城崎温泉'`。
- `?fixture=kinosaki` でカード30枚が表示され、コンソールエラー0件。
- 上表 1〜9 の更新が全て済んでいる。
- `node scripts/check-all.mjs` が **29本全緑**。
- 見つけた穴(あれば)は ROADMAP に新規起票(このサイクルでは直さない)。

## 検証手順

1. `node scripts/dump-rank.mjs kinosaki` → 上位30件を目視。
2. 撮影(2枚):
   - `node C:\workspace\tools\shot\shot.mjs "http://localhost:<port>/?fixture=kinosaki" --mobile`(幅 390)
   - 同URLを PC幅(幅 1280)
   - さらに `?demo=zoomout` を mobile で1枚(サンプルリンク6本が1行に収まり横スクロールできるかの目視。`.samples` の折り返し事故が出やすい)
3. 画像を Read で開き、文字崩れ・重なり・はみ出し・地図の縦横比・ピンの重なりを目視。
4. `node scripts/check-all.mjs` → **29本全緑**を確認(1本でも赤なら push しない)。

## 変更禁止範囲

- `assets/engine.js` の **rank の重み・閾値は一切変更しない**(`FAR_DRIVE_MIN` / `DRIVE_M_PER_MIN` / `OSM_RADIUS_M` 等を含む)。
- **Overpass の呼び出しは1回のみ**。失敗したら日を改める(リトライを手で回さない)。
- **入力UIの追加禁止**(ユーザー入力ゼロの原則)。
- `scripts/check-nosummary.mjs` の4エリア実測アサーション(31枚/18枚)を触らない。
- `git stash` / `git reset` / `git checkout` によるファイル復元は禁止。
- 1サイクル1タスク。見つけた不具合はその場で直さず ROADMAP へ。

## 終わったら

1. `docs/ROADMAP.md` の R81 を **`[x] 2026-09-18`** にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-18 R81 城崎温泉の固定データ追加` の見出しを付けて3行(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. **報告前に `git log --oneline -1` を実行し、実際のコミットハッシュを確認してから報告する**(推測のハッシュを書かない)。
