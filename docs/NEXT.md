# NEXT — R3+R6 本番URL(GitHub Pages サブパス)の入口動作確認と死活チェックスクリプト

**選定理由(1行)**: R8 までで見た目の作り込みは一段落し最新2枚(r8-busy-final / r8-normal-final mobile)にも崩れは無かったので、次は「ローカルで綺麗でも本番 `/yadotabi/` サブパスで壊れていないか」という公開物の健全性を確かめる番。R3(入口の実地確認)と R6(死活チェックスクリプト)は同じ「本番URLを叩く」作業なので1タスクにまとめる。

- **タスクID**: R3+R6
- **難易度**: sonnet(手順が明確。新規スクリプト1本と、必要なら相対パス修正のみ)
- **所要目安**: 25〜35分(撮影・目視15分 + check.mjs 実装10分)

## 目的
1. 本番 https://teer-tee.github.io/yadotabi/ で `?fixture=` / `?hotel=` / `?q=` の各入口がサブパス配信でも壊れずに動くことを、撮影した画像の目視で確認する(R3)。
2. 以後のサイクルの最後に1コマンドで公開物の生死を確認できる `docs/check.mjs` を作る(R6)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs` (**新規**・主)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (**問題が出たときだけ**修正)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` (同上)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` (記録)

## 背景(実物のコードを読んだ上での注意点)
- `index.html` の CSS/JS 参照は `assets/...` の**相対パス**、`app.js:788` の fixture 読み込みも `fetch('fixtures/' + name + '.json')` と相対パスなので、理屈の上ではサブパスでも動くはず。**「動くはず」を実際の画像で確かめるのがこのタスク**。壊れていたら `<base>` ではなく相対パスのまま直す(絶対パス `/assets/` に変えてはいけない。ローカル配信が壊れる)。
- `app.js:815 applyNormalEntryPoint()` の `?q=` 経路は `YadoGeo.suggestHotels(q)`(Nominatim)を呼ぶ**外部API**。AUTOPILOT 規約4により、外部APIを叩く撮影は**このサイクルで最大2回**まで。内訳は「`?hotel=` 1回」「`?q=` 1回」に使い切る想定で、それ以外の撮影は必ず `?fixture=kusatsu` を付けること。
- `?hotel=` 経路(`app.js:753 hotelFromUrl`)は `<lat>,<lon>,<名前>` 形式。日本語の宿名を URL に入れるので、撮影時は必ず URL エンコードする(例: 草津の適当な座標 + 名前)。

## 実装方針
### (1) R3: 本番URLの入口確認(撮影 → 目視)
`node C:\workspace\tools\shot\shot.mjs <URL> --mobile --label <名前>` を**プロジェクトディレクトリをカレントにして**実行する(画像が `screenshots/` に落ちる)。撮る順に:

1. `https://teer-tee.github.io/yadotabi/` — 素の本番(状態A)。**外部API1回目相当だが宿ピン取得なので許容**。ラベル `r3-prod-top`。
2. `https://teer-tee.github.io/yadotabi/?fixture=kusatsu` — 外部APIなし。ラベル `r3-prod-fixture`。mobile と desktop の両方。
3. `https://teer-tee.github.io/yadotabi/?fixture=kusatsu&hotel=36.6226,138.5960,%E3%81%A1%E3%82%87%E3%81%86%E3%81%97%E3%82%85%E3%81%8F%E3%81%AE%E5%AE%BF` — fixture と併用すれば `?hotel=` の読み取り経路だけを外部APIなしで検証できる(`app.js:797` が hotel を優先する分岐)。ラベル `r3-prod-hotel`。
4. `https://teer-tee.github.io/yadotabi/?q=%E8%8D%89%E6%B4%A5%E6%B8%A9%E6%B3%89` — ここだけ Nominatim を使う(外部API2回目)。ラベル `r3-prod-q`。混雑して失敗したら**リトライせず**、その旨を NIGHTLOG に書いて次へ進む(規約4)。

各画像を **Read で開いて目視**する。観点:
- CSS が当たっているか(素のHTMLに戻っていないか。ボタンが角丸か、背景が白灰か)。
- 404 由来の空白・壊れたレイアウトが無いか。
- 2〜3 はカードが並び小地図の番号ピンが判読できるか(R8 の成果が本番にも出ているか)。
- 3 はヘッダーのタイトルが `ちょうしゅくの宿`(URLで渡した名前)になっているか = `?hotel=` が効いている証拠。
- 4 は検索欄に「草津温泉」が入り、地図がその辺りへ飛んでいるか。

### (2) R6: `docs/check.mjs`
Node 標準の `fetch` のみで書く(依存追加禁止)。処理:
- 定数 `BASE = 'https://teer-tee.github.io/yadotabi/'`。
- `index.html`・`assets/app.js`・`assets/geo.js`・`assets/engine.js`・`assets/style.css`・`assets/tokens.css`・`assets/ui.css`・`fixtures/kusatsu.json` を順に GET。
- 判定: 全て HTTP 200 / index.html の本文に `<title>やどたび` が含まれる / `kusatsu.json` が JSON としてパースでき `meta.lat` を持つ / 各 JS が空でない(1000バイト以上)。
- 結果を1行1項目で `OK` / `NG` を色なしで出力し、1件でも NG なら `process.exitCode = 1`。
- 冒頭にコメントで使い方 `node docs/check.mjs` を書く。

## 完了条件(検証可能)
- [ ] 上記4種の本番URLについて撮影画像が `screenshots/` にあり、Read で目視して崩れ・空白・CSS抜けが無いことを NIGHTLOG に記述した(`?q=` が混雑で撮れなかった場合はその理由を明記すれば可)。
- [ ] `?hotel=` で渡した宿名がヘッダーに出ることを画像で確認した(サブパスで入口が生きている証拠)。
- [ ] 崩れが見つかった場合は同サイクルで相対パスのまま修正し、再撮影して直ったことを画像で確認した。
- [ ] `docs/check.mjs` が存在し、`node docs/check.mjs` が全項目 OK・終了コード0で完了する。
- [ ] `node --check docs/check.mjs` 通過。
- [ ] ROADMAP の R3 と R6 が `[x] 2026-09-16` になっている。
- [ ] NIGHTLOG に3行(やったこと/見た目の確認結果/次)を追記した。
- [ ] コミット(1行日本語)して `git push` 済み。`git status -sb` が clean。

## 検証手順
```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/" --mobile --label r3-prod-top
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --mobile --label r3-prod-fixture
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --label r3-prod-fixture-desktop
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu&hotel=36.6226,138.5960,%E3%81%A1%E3%82%87%E3%81%86%E3%81%97%E3%82%85%E3%81%8F%E3%81%AE%E5%AE%BF" --mobile --label r3-prod-hotel
node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?q=%E8%8D%89%E6%B4%A5%E6%B8%A9%E6%B3%89" --mobile --label r3-prod-q
node docs/check.mjs
```
- 撮影幅: `--mobile` は 375x812、無指定は PC 幅。fixture の1枚だけ desktop も撮る。
- **画像は必ず Read で開いて目視**する。推測で「大丈夫そう」と書かない。

## 変更禁止範囲
- `assets/*.js` のロジック変更(入口が壊れていた場合の**パス修正のみ**可。ロジック・レイアウト・ピン計算には触らない)。
- `assets/style.css` / `assets/ui.css` / `assets/tokens.css`(R8 の成果を壊さない)。
- `fixtures/kusatsu.json`。
- 有料API・APIキーの導入、Nominatim/Overpass への3回以上のアクセス。
- `git stash` / `reset --hard` / `checkout` によるファイル復元。
