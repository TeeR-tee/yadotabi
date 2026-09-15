# NEXT（次の1タスク）

## タスクID: R4 — Overpass 混雑(429/504)時の自動リトライと「Wikipediaだけで提案」

**繰り上げ理由**: 前サイクル(R7)の通常モード撮影で実際に Overpass 504 の混雑トーストが出て、状態Aが宿ピン無しのまま止まった。R2/R3 より先に「画面が空にならない」を直すのが実利が大きい。

## 目的
Overpass が混雑(429/504)しても、(1) 3秒後に1回だけ自動で再試行し、(2) それでも駄目なら Wikipedia だけで提案を出し切り、(3) 「宿情報だけ混雑中」と正直に1行伝える。ユーザーが何もせず待つだけで結果が出る状態にする。

## 対象ファイル（絶対パス）
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`（注意書きの見た目のみ。必要なら）

## 実装方針（実物を読んだ上での具体指示）

### 1) geo.js — fetchSpots に1回だけリトライ（行607〜697 の `fetchSpots`）
- 現状: 行629〜653 で `fetchWithTimeout(OVERPASS_URL, ...)` → 行641 `if (res.status === 429 || res.status === 504) throw new Error('地図サーバーが混雑しています。…')`。リトライ無し。
- 変更: この POST〜JSON化のブロックを内部ヘルパ `async function requestOverpass(query)` に切り出し、`fetchSpots` からは次のように呼ぶ。
  1. 1回目を実行。429/504 なら **`await delay(3000)`（行311 の既存 `delay` を使う。新規実装しない）** して2回目を1回だけ実行。
  2. 2回目も 429/504 なら、**`err.overpassBusy = true` を立てた Error** を throw する（メッセージは既存文言を流用）。呼び出し側がこのフラグで「混雑」と判別できるようにするのが肝。
  3. タイムアウト(`fetchWithTimeout` が投げる Error)は**リトライしない**（60秒待った後にさらに待たせない）。429/504 のみ対象。
- 同じく行712〜 の `fetchHotelsInBbox`（行756 に同じ 429/504 の throw がある）にも同じヘルパを使い、`overpassBusy` を立てる。**ただし bbox 側はリトライ不要**（地図移動のたびに呼ばれるため、無料APIのマナー上リトライは増やさない。フラグ付与だけ）。
- 併せて **テスト用フック**: ファイル冒頭の fixture 節（行48〜70 付近）に `var simulateBusy = false; function setSimulateBusy(v){ simulateBusy = !!v; }` を追加し、`requestOverpass` の先頭で `simulateBusy` が真なら実際に fetch せず 429 相当として扱う（1回目・2回目とも失敗させる）。`global.YadoGeo` のエクスポートに `setSimulateBusy` を足す。app.js 側で `?simulate=overpass504` を読んで呼ぶ（下記4）。

### 2) engine.js — collect が「OSMだけ落ちた」ことを伝えられるようにする（行353〜430 の `collect`）
- 確認済みの事実: 行372 `Promise.allSettled` になっており、行377 の「両方 rejected のときだけ throw」も既に正しい。**つまり OSM が落ちても Wikipedia だけで結果は返っている。ここは壊さない。**
- 不足しているのは「落ちたことの伝達」。行388 の `if (osmResult.status === 'fulfilled' ...)` の前後で、`osmResult.status === 'rejected'` のときに `var osmFailed = true;` を持ち、返す配列に `Object.defineProperty(merged, 'osmFailed', {value:true, enumerable:false})` で印を付けるか、**より素直に `onStage('wiki', merged, {osmFailed:true})` の第3引数で渡す**。既存の `onStage(stage, items)` の呼び出し（行401 と行428）とシグネチャ互換を壊さないよう、第3引数追加で対応すること。
- 行592〜 の `suggest` も同様に、`onProgress(stage, result, meta)` の第3引数で `{osmFailed:true}` を透過させ、最後の `onProgress('done', result, meta)`（行609付近）と `return` する結果にも `result.osmFailed = true` を載せる（`present` が返すオブジェクトにプロパティを足すだけ）。

### 3) app.js — 正直な1行を出す（行402〜419 の `YadoEngine.suggest(...)` 呼び出し、行528〜566 の `statusText` / `renderFeed`）
- `state`（行90 付近）に `osmFailed: false` を追加。
- 行403 のコールバックと行408 の `.then` で `result.osmFailed` / meta を受け、`state.osmFailed = true` を立てて `render()`。
- 行534 `renderFeed` 内、行540〜542 の `els.feedStatus`（`index.html:45` の `<p class="feedstatus" id="feed-status">`）を流用する。読み込み完了後（`stage === 'done'`）に `state.osmFailed` なら、隠さずに **「周辺の宿情報だけ混雑中。Wikipediaの情報で提案しています。」** を表示する。`statusText(stage)` を `statusText(stage, osmFailed)` に拡張し、`done && osmFailed` でこの文言を返すのが一番小さい変更。
- 行546 の `stage === 'error'` 分岐（両方失敗時）はそのまま残す。
- 状態Aの混雑トースト（`index.html:32` の `#map-note`）も、`fetchHotelsInBbox` が `overpassBusy` で落ちたときは文言を **「宿ピンの取得が混雑中です。検索やエリアチップから選べます。」** に変え、「1分待て」だけで終わらせない。

### 4) app.js — `?simulate=overpass504`（行706〜730 付近の URL パラメータ処理）
- 行713 の `new URLSearchParams(global.location.search)` を使い、`params.get('simulate') === 'overpass504'` なら `YadoGeo.setSimulateBusy(true)` を呼ぶ。fixture と併用可能にする（`?fixture=kusatsu&simulate=overpass504` で「Overpassだけ死んでWikipediaは生きている」状態を再現）。
- ただし fixture モードは `fetchSpots` が Overpass を叩かない（行622）。**simulate が真のときは fixture の overpass 分岐より先に失敗させる**こと。そうしないと再現にならない。Wikipedia 側（`fetchWikiNearby`）は fixture のまま成功させる。

## 完了条件（検証可能）
1. `node --check assets/geo.js && node --check assets/engine.js && node --check assets/app.js` が通る。
2. `?fixture=kusatsu` （simulate なし）で従来どおりカード30枚・ピン1〜5判読可能。feedStatus に混雑文言が出ない（デグレなし）。
3. `?fixture=kusatsu&simulate=overpass504` で、**カードが0枚にならず** Wikipedia 由来のカードが表示され、feedStatus に「周辺の宿情報だけ混雑中。Wikipediaの情報で提案しています。」が1行出る。「提案を作れませんでした」の空カードは出ない。
4. 3秒リトライが1回だけ起きる（2回目も失敗して初めて諦める）。撮影時の体感かコンソールログで確認。**無限リトライしていないこと**が必須。
5. 状態Aのトーストが「宿ピンの取得が混雑中です。…」に変わっている。

## 検証手順
- ローカルサーバを起動し、`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅で撮る。
- 撮る4枚: (a) `?fixture=kusatsu` mobile（デグレ確認）、(b) `?fixture=kusatsu&simulate=overpass504` mobile、(c) 同 desktop、(d) `?simulate=overpass504` の状態A mobile（トースト文言）。
- **本物APIを叩く撮影は0回**でよい（simulate と fixture で全部再現できる）。AUTOPILOT ルール4を守る。
- Read で目視する観点: 混雑の1行が**カードや小地図と重なっていないか**、長文なので**2行に折り返しても切れていないか**（`.mapnote` の nowrap は R1 で直済みだが `.feedstatus` は未確認、要チェック）、カードが空でないか、ピン番号とカード番号が一致しているか。

## 変更禁止範囲
- `fixtures/kusatsu.json`、`scripts/make-fixture.mjs`（固定データの中身は触らない）。
- R7 で入れた `nudgeOverlaps()` / `pin--top` / `zIndexOffset`（app.js の `renderFeedMap`）。
- rank / present のスコアリングロジック（engine.js 行440〜585 付近）。今回は取得の堅牢化だけ。
- ユーザー入力を増やす変更（「再試行ボタン」等は追加しない。自動で1回だけが方針）。

## 難易度 / 所要目安
中。3ファイル横断だが各変更は小さい。目安 25〜40分（撮影4枚と目視を含む）。
