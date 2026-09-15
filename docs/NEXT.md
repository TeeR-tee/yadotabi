# NEXT: R2 視覚QA第1回(未撮影画面の網羅撮影と崩れ修正)

**難易度: opus / 所要目安: 40〜60分 / 1サイクル1タスク**

## なぜこれか(判断理由)
ユーザーが「文字崩れ・アイコンずれ・配置ずれを何度もループで見てほしい」と明言しており、これまで撮れているのは状態B(通常/混雑)と埋め込み・デモだけ。未撮影の画面(0件・検索候補・最近・もっと遠く展開・ズーム不足)に崩れが眠っている可能性が最も高く、費用対効果が最大。

## 対象ファイル(絶対パス)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js (撮影用パラメータの追加のみ)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css (見つかった崩れの修正)
- C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md / docs\NIGHTLOG.md (記録)

## 実装方針(app.js の実物に基づく具体箇所)

撮影ツール `shot.mjs` は URL しか渡せない。そこで **撮影専用の URL パラメータを2つ追加**する。どちらも `applyEntryPoint()`(app.js 791行〜、`simulate=overpass504` を読んでいる箇所のすぐ下)で読み、既存 `state`/`simulate` の作法に合わせる。

### (1) `?simulate=empty` — 提案0件の画面
- 現状 `emptyHtml(hotel)` (app.js 515行付近)は実装済みだが、fixture では必ず30件出るため**一度も描画されたことがない**。
- 実装: モジュール内に `var simulateEmpty = false;` を置き、`applyEntryPoint` で `params.get('simulate') === 'empty'` のとき true。`selectHotel` の `.then`/onProgress 内(app.js 413〜426)で `if (simulateEmpty) { result.cards = []; result.far = []; }` 相当に潰す。**geo.js は触らない**(データ層でなく表示層で潰すのが安全)。
- 撮影URL: `?fixture=kusatsu&simulate=empty`
- 見る観点: 「この周辺ではまだ提案を作れませんでした」の2行が折り返して切れていないか、Googleマップボタンが横はみ出ししていないか、**小地図が空(ピン0)になったときの高さと余白**が不自然でないか。

### (2) `?demo=suggest` / `?demo=recent` — 検索候補ドロップダウンを開いた状態
- 候補は `renderSuggest(rows)` (app.js 305行)が `els.suggest.hidden = false` にして出す。`showRecent()` (324行)は localStorage の履歴が空だと `hideSuggest()` して何も出ない。撮影では入力もクリックもできないので**ダミー行を直接 renderSuggest に渡す**。
- 実装: `applyEntryPoint` の最後(`applyNormalEntryPoint(params)` 呼び出しの後、状態Aのまま)で
  - `demo=suggest` → 宿4件+地名1件くらいのダミー行配列(`act/icon/name/sub/hotel` の既存キー構成、長い宿名と長い `displayName` を1件ずつ混ぜて折り返し限界を試す)を `renderSuggest()` に渡す。
  - `demo=recent` → `icon:'🕘' / sub:'最近見た宿'` の3件を `renderSuggest()` に渡す(`showRecent` と同じ形)。
- 注意: `hideSuggest` は blur / 外側クリック / `runSuggest` で走る。撮影時は操作しないので消えないはずだが、消えるなら `setTimeout(..., 300)` で描画を遅らせてよい。**入力欄の値も `els.searchInput.value` にダミー語を入れて**実際の見た目に寄せる。

### (3) 「もっと遠く」展開 — `?demo=far`
- `farHtml` (app.js 528行)は `<details class="far">` なので閉じている。`demo=far` のとき render 後に `document.querySelector('.far')?.setAttribute('open','')` で開くだけ。fixture の far 件数が0なら ROADMAP に記録して撮影スキップでよい(先に `far.length` を確認すること)。
- 見る観点: `.far__item` のリンク名+🚗分バッジが同一行で折り返して重ならないか。

### (4) 状態Aのズーム不足バナー
- パラメータ追加は不要。`setMapNote('ズームすると宿が出ます')` (app.js 243/262行)は**初期ズームが小さいとき**に出る。`?z=` 等が無いので、`applyEntryPoint` に `?demo=zoomout` を足して `ensureMap()` 後に `map.setZoom(8)` する方式が確実(localStorage 汚染を避けるため撮影用にのみ)。
- 見る観点: `.mapnote` (style.css 133行)が mobile で地図や検索欄に重なっていないか、3行折り返しでも全文読めるか。

## 完了条件
1. `?simulate=empty` / `?demo=suggest` / `?demo=recent` / `?demo=far` / `?demo=zoomout` が動き、いずれも**通常動作にデグレを起こさない**(パラメータ無しの `?fixture=kusatsu` と素の状態Aが従来どおり)。
2. 下記10枚を撮影し、すべて Read で目視した。
3. 見つかった崩れを同サイクルで修正(直せないものだけ ROADMAP 先頭に起票)。
4. `node --check assets/app.js` 通過、`node docs/check.mjs` 全OK。
5. ROADMAP の R2 を `[x] 2026-09-16` に、NIGHTLOG に3行追記、コミット→push。

## 検証手順(撮影URL一覧)
ローカル `http://127.0.0.1:3000/` に対し `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅(デフォルト)の2本ずつ:

| # | URL | 幅 |
|---|---|---|
| 1-2 | `/?fixture=kusatsu&simulate=empty` | mobile / desktop |
| 3-4 | `/?demo=suggest` | mobile / desktop |
| 5-6 | `/?demo=recent` | mobile / desktop |
| 7-8 | `/?fixture=kusatsu&demo=far` | mobile / desktop |
| 9-10 | `/?demo=zoomout` | mobile / desktop |
| 参考 | `/?fixture=kusatsu`(デグレ確認) | mobile |

Read で見る観点(毎枚): 文字の途中切れ・右端はみ出し・要素の重なり・アイコンと文字のベースラインずれ・不自然な空白・横スクロール発生。

## 変更禁止範囲
- assets/geo.js、assets/engine.js、fixtures/*.json、index.html、demo/ 配下は触らない。
- 提案ロジック(rank/収集件数)を変えない。今回は**見た目の確認と修正だけ**。
- ユーザー入力を増やす変更をしない(ユーザー入力ゼロの原則)。
- git stash / reset --hard / checkout でファイルを戻さない。
