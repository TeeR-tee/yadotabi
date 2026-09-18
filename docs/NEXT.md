# NEXT — R134 README を実装に合わせ直す(初見の開発者が最初に打つコマンドの説明が2倍以上ずれている)

- タスクID: **R134**
- 難易度: **sonnet**(README.md 1ファイルのみ・ロジック変更なし)
- 所要目安: 25〜40分(うち check-all 29本が約5分)

## 目的

みのるんが同僚に見せ、将来は宿泊予約サイトへ営業する前提で、計画役が本番と README を実際に触って点検した。
**製品そのもの(デモページ・提案の中身・本番の健全性)は見せられる状態にある**が、README だけが実装から大きく取り残されている。
初めて読む開発者が「開発者向け」節の指示どおりにやると、本数もセットアップ前提も間違っている。ここを直す。

## 実測で判明した前提(すべてこのサイクルで計画役が実際に確認した数値・文言)

### 問題なかったもの(直さなくてよい)

- 本番 `node docs/check.mjs` は **29件すべて [OK]**(総計 3771ms / 平均 130ms / 最遅 `index.html` 238ms / 合計 1475.5KB)。リンク切れ0・iframe属性3件とも正常。
- 営業用デモ `https://teer-tee.github.io/yadotabi/demo/hotel-page.html` を mobile 375px で撮影 → HTTP 200・**コンソールエラー0件**。注意書き(架空の宿と明記)・料金表・CTA・「このお宿のまわり(やどたび)」の iframe が正しく描画され、埋め込み内に「草津温泉 / 固定データ 2026-09-16 取得」のバッジと小地図(帰属表示「Leaflet | © OpenStreetMap」あり)まで出ている。営業資料として成立している。
- `?fixture=beppu` の提案を通しで確認 → 1位 別府市美術館 / 2位 別府タワー / 3位 竹瓦温泉 / 4位 別府公園 / 5位 ラクテンチ。**R133 の修正が本番に効いており「別府駅商業施設」は消え、9位はヒットパレードクラブ**。提案として成立している。

### 直すべきもの(README.md のみ)

1. **`README.md:201`**「`scripts/check-*.mjs` **12本**と `docs/check.mjs` の計**13本**」
   → 実測: `ls scripts/check-*.mjs` = **29本**、`check-all.mjs` の `SCRIPTS` 配列 = **29要素**。
   正しい表現は **「`scripts/check-*.mjs` の28本と `docs/check.mjs` の1本、計29本」**(`docs/CHECKS.md:7` が既にこの表現で正しい。そのまま合わせる)。
2. **`README.md:201`**「一部の検査は内部でPythonの `python -m http.server` を一時起動するため、**Python 3 が必要**です。」
   → **R130(2026-09-17)で誤りになった**。現在は `scripts/lib/server.mjs` の `ensureServer()` に一本化され、`check-all.mjs` が親で1つだけ立てて環境変数 `YADOTABI_BASE` で子に渡す。NIGHTLOG の R130 に「実行後に python の http.server が残っていないことも確認」と実測記録あり。この1文は削除し、代わりに「Node.js だけで動きます(Python は不要です)」の意の1文に置き換える。
3. **`README.md:205`**「(**25本**の検査それぞれが何を検査するか…)」→ **29本**。
4. **`README.md:95-103`**「写真があるカードの割合(fixture 上位30件・**2026-09-16 時点**)」の表が**3エリアしかなく別府が無い**うえ、**数字も現在の実装と合っていない**。
   計画役が `node scripts/dump-rank.mjs <area>` の上位30件の「画像有」列を数えた **2026-09-18 実測**:

   | エリア | 上位30件中 写真あり | 割合 | README の旧値 |
   |---|---|---|---|
   | 草津 kusatsu | **17件** | **57%** | 20件 / 67% |
   | 箱根 hakone | **11件** | **37%** | 18件 / 60% |
   | 道後 dogo | **11件** | **37%** | 12件 / 40% |
   | 別府 beppu | **11件** | **37%** | (行が無い) |

   R115〜R133 で廃止施設・他社の宿・索引記事などを除外した結果、上位30枚の顔ぶれが入れ替わって割合が下がっている。表の日付も **2026-09-18 時点** に更新すること。
5. **`README.md:88`** 「判断待ちの設計課題」の先頭項目「**検索候補とエリアチップの重なり**…選択肢は (a) 候補が開いている間はチップを隠す (b) チップを薄くする (c) このままにする、の3つで**未決です**」
   → **R2-1(2026-09-18)で (a) を採用して修正済み**。`assets/style.css` に `pickbar--suggesting` が **3箇所実在**することを確認済み。未決の項目として残っていると、READMEを読んだ人には直っていない不具合に見える。この項目を削除するか、「**解決済み(2026-09-18 R2-1)**: 候補が開いている間は `.chips`/リード文/サンプル行を `visibility:hidden` で隠す方式を採用した」という1行の解決済み記載に書き換える(判断待ちの節から外し、他の4項目はそのまま残す)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` — **このファイルのみ変更する**
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` — 完了マークのみ
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` — サイクル記録3行のみ

## 実装方針

- 上記5点を README.md に反映するだけ。**本数は自分で数え直してから書く**(`ls scripts/check-*.mjs | wc -l` と `check-all.mjs` の `SCRIPTS` 配列の要素数が一致することを確認)。
- 写真割合の表は**自分で `dump-rank` を4エリア回して数え直してから**書く(計画役の値をそのまま写さず、一致することを確かめる)。一致しなければ自分の実測値を採用し、NIGHTLOG に差を書く。
- 英語段落(`README.md:3`)は数字を含まないので変更不要。
- 他の節(用語ミニ辞典・URLパラメータ表・ファイル構成・fixtures サイズ表)は実装と一致していることを計画役が確認済み。**触らない**。

## 完了条件

1. README の「開発者向け」節が **29本** で統一され、12本/13本/25本 の記述が0件になる(`grep -n "12本\|13本\|25本" README.md` が空)。
2. README から「Python 3 が必要」の記述が消え、Node.js だけで動く旨に置き換わっている。
3. 写真割合の表が **4エリア**(草津・箱根・道後・別府)になり、日付が 2026-09-18 になっている。
4. 「判断待ちの設計課題」から検索候補の重なりが未決項目として消え、解決済みとして扱われている(残り4項目は保持)。
5. `node scripts/check-all.mjs` が **29本中29本PASS(exit 0)**。

## 検証手順

1. `grep -n "12本\|13本\|25本\|Python" README.md` が空(または Python の言及が「不要」の文脈のみ)であることを確認。
2. `ls scripts/check-*.mjs | wc -l` と README の記述が整合することを確認。
3. `node scripts/dump-rank.mjs kusatsu` / `hakone` / `dogo` / `beppu` を回し、README の表の4行が実測と一致することを確認。
4. 撮影(README はコードに影響しないがデグレ無しの確認として):
   - `node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --mobile`(幅375)
   - `node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" `(desktop 既定幅)
   - **注**: `shot.mjs` は実行時のカレントディレクトリが `C:\workspace\tools\shot` でないと `MODULE_NOT_FOUND` で落ちる(計画役が実測)。`cd C:/workspace/tools/shot` してから実行すること。
   - 画像を `Read` で開いて文字崩れ・重なり・はみ出し・帰属表示の欠落が無いことを目視。
5. `node scripts/check-all.mjs` → **29本中29本PASS(exit 0)** を必須とする。

## 変更禁止範囲

- `rank` の重み・閾値の変更は**不可**。
- `assets/engine.js` / `assets/geo.js` / `fixtures/*` の変更は**不可**。
- 入力UIの追加は**禁止**(入力ゼロの原則)。
- `git stash` / `git reset` / `git checkout` によるファイルの巻き戻しは**禁止**。
- **外部API 0回**(撮影は本番URL・fixture のみ。Overpass/Nominatim/Wikipedia を直接叩かない)。

## 終わったら

1. `docs/ROADMAP.md` の R134 を **`[x] 2026-09-18`** にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」の末尾に `### 2026-09-18 R134 <一言>` の見出しを付けて3行(やったこと / 見た目の確認結果 / 次)を追記する。
3. **先にコミット**する(1行の日本語メッセージ)。
4. `git push` する。
5. 報告は簡潔に(長文の報告書を書かない)。
