# NEXT(次の1タスク)

## タスク: R5 読み込み体感の計測と短縮(+ 小修正: 要約先頭の座標表記を除去)

選定理由: 残りバックログのうち R2-1 は朝の相談待ち、F3/F4/S1/R10/R11 は体験の底上げにならない。R5 は「宿を選んでから最初のカードが出るまで」という本アプリの価値そのもので、しかも fixture で外部API無しに計測・検証できる(マナー違反ゼロ)。F5(画像遅延読み込み)は R5 の一部として吸収する。

---

## 事前に把握済みの事実(再調査不要。ここから始めてよい)

実物を読んだ結果、**段階描画そのものは既に入っている**。よって「onProgress を実装する」タスクではなく、**どこで時間を食っているかを測ってから直す**タスクである。

1. `assets/engine.js` L354-405 `collect()`: `Promise.allSettled([fetchSpots, fetchWikiNearby])` で**両方待ってから**先へ進む。ただし L405 で `onStage('osm', osmItems, meta)` を呼んでいる。→ **allSettled が両方の解決を待つので、この "osm" 段は実際には Wikipedia 完了後にしか発火しない。これが体感遅延の本丸である可能性が高い。**
2. `assets/engine.js` L601-631 `suggest()`: `emit()` が段階ごとに `present(rank(items))` して `onProgress` に渡す。
3. `assets/app.js` L469-476: onProgress を受けて `state.cards` を差し替え `render()` する。**受け側は既に正しい。**
4. `assets/app.js` L548: カード画像は既に `loading="lazy"` 付き。→ **F5 の画像遅延読み込みは実装済み。** 残るのは「画像なしカードの見栄え」だけなので F5 は本タスクで完了扱いにしてよい(ROADMAP を `[x]` にする条件は下記)。
5. `assets/engine.js` L21-22: `OSM_RADIUS_M = 15000` / `WIKI_RADIUS_M = 10000`。
6. `fixtures/hakone.json` は 904KB(kusatsu は 68KB)。`app.js` L878 の `fetch('fixtures/…').then(res.json())` のパースが hakone だけ重い。**これは撮影用の事情であり本番の通常動作には影響しないので、最適化対象ではない。計測時は「fixture 読み込み完了時刻」を起点にして切り分けること。**

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` (collect の待ち方、SUMMARY 整形)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (`?perf=1` 計測ログ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` (記録)

## 実装方針

### ステップ1: まず測る(`?perf=1`)
`app.js` に `?perf=1` のときだけ動く計測を足す。Playwright は使わない(既存の shot.mjs で完結させる)。
- `selectHotel()` の `render()` 直後を t0(状態Bに入った瞬間)とする。
- `perfMark(label)` を作り、`performance.now() - t0` を `console.log('[perf] ' + label + ' ' + ms + 'ms')` で出す。マークする地点: `fixture-loaded` / `stage:osm` / `stage:wiki` / `stage:done` / `first-card-painted`。
- `first-card-painted` は「`state.cards.length > 0` で `render()` した直後の `requestAnimationFrame`」で1回だけ打つ(二重計上しないようフラグを持つ)。
- `?perf=1` が無いときは `perfMark` は即 return。本番の挙動・DOMは一切変えないこと。
- 数値は console だけでなく、`?perf=1` のとき画面最下部に小さな固定行で出してもよい(撮影で読めると検証が楽)。ただし `?perf=1` 時限定。

### ステップ2: 測った結果に応じて直す(この順で検討)
- **(a) 本命: collect の "osm" 段を Wikipedia を待たずに発火させる。** `Promise.allSettled` を捨てず、OSM の Promise に個別に `.then()` を付けて、OSM が解決した時点で `onStage('osm', …)` を先に呼ぶ形に組み替える。両方の完了を待つ既存の `allSettled` はそのまま残す(エラー処理・osmFailed 判定の構造を壊さない)。onStage が二重に呼ばれないようフラグで1回に限る。
- **(b) `fetchSpots` の半径 15km→10km。** (a) を入れても OSM 自体が遅いなら検討する。**ただし far(車1時間以上)の件数が減る副作用があるので、縮小するなら `?fixture=hakone&demo=far` で far が10件出続けることを撮影で確認してから。減るなら半径は戻し、NIGHTLOG に「10kmでは far が痩せるので 15km 維持」と書く。**
- (c) 画像 `loading=lazy` は既に入っているので変更不要。

### ステップ3: 同サイクルの小修正(必須・司令塔指示)
`assets/engine.js` の要約整形(L542 付近の `truncate(item.summary, SUMMARY_MAX_CHARS)` に渡す前)で、Wikipedia extract 先頭の座標表記を除去する。
- 現状: 早雲寺のカードが「北緯35度13分48.3秒 東経139度6分13.2秒 早雲寺（そううんじ）は、…」で始まっており、要約の120字が座標で潰されている。
- 対応: 先頭の `北緯…秒 東経…秒`(度分秒・小数あり)や `座標: …` にあたる部分を正規表現で落とし、残りの先頭空白も除去する。**切り出した専用関数にして、除去しても本文が空になる場合は元の文字列を返す**(安全側)。truncate より前に適用すること。
- 同じ整形は R2-2 とは無関係。R2-2(0件カードの文言短縮)は今回は**やらない**(R5 の検証と混ざるため)。

## 完了条件(検証可能な数値)

1. `?fixture=kusatsu&perf=1` で、`first-card-painted` が **1000ms 以内**(t0 = 状態B突入時)。
2. `?fixture=hakone&perf=1` で `stage:osm` が `stage:done` より **300ms 以上早い**(= 段階描画が実際に効いている証拠)。同時に、その差が 0ms 近辺なら改善が効いていないということなので (a) を再検討する。
3. `?fixture=hakone` のカード1枚目(早雲寺)の要約が **「早雲寺（そううんじ）は、」から始まる**(座標表記が消えている)。撮影画像を Read して目視確認する。
4. `?fixture=kusatsu` / `?fixture=hakone` の mobile・desktop でカード枚数・番号ピン(1〜30)・リンクチップにデグレが無い。
5. `node --check assets/engine.js` と `node --check assets/app.js` が通る。`node docs/check.mjs` が終了コード0。

## 検証手順

1. `node --check assets/engine.js && node --check assets/app.js`
2. ローカル起動 → `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&perf=1" --mobile`(perf行を読む)、同 `?fixture=hakone&perf=1`。
3. `?fixture=hakone` の mobile / desktop、`?fixture=kusatsu` の mobile を撮影し、**画像を Read で開いて目視**(座標表記の除去・崩れ無し)。
4. (b) を入れた場合のみ `?fixture=hakone&demo=far` で far 10件を確認。
5. `node docs/check.mjs`。
6. ROADMAP の R5 を `[x] 2026-09-16` に。**F5 も完了条件4を満たしていれば `[x]` にし、「画像は既に loading=lazy、画像なしカードの空白も確認済み」と1行添える。**
7. NIGHTLOG に3行(やったこと / 見た目の確認結果(計測値を必ず数値で) / 次) → コミット → `git push`。

## 変更禁止範囲

- `fixtures/*.json`(再生成しない。hakone の軽量化は別タスク)
- `assets/geo.js` のキャッシュ・リトライ・fixture 分岐のロジック(半径の値を engine.js 側から渡す変更は可)
- `assets/style.css` / `tokens.css` / `ui.css`(perf 表示行の最小限のスタイルを除く)
- `index.html` の構造、`demo/` 配下、`scripts/make-fixture.mjs`
- ユーザー入力を増やす変更(泊数・移動手段・○△×の復活)は絶対禁止
- git stash / reset --hard / checkout でのファイル巻き戻し禁止

## 難易度・所要

- 難易度: **opus**(非同期の待ち方の組み替えでエラー処理を壊しやすい)
- 所要目安: 25〜40分
