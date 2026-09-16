# NEXT: R48 `?embed=1` で高さを親に postMessage で通知する

選定理由: 残る未完了は R14 / R19 / R40 / R51 だが、R14・R19・R40 は fixture 再生成や rank 分布調査を伴い Overpass を叩くリスクがある(無料APIのマナー)。R48 は外部API 0回・fixture 不変で、しかも「予約サイトに貼れる部品」という本プロジェクトの売り(F1/F2)の完成度を直接上げるので最優先。R51 は次サイクル送り。

## 目的
現在 `demo/hotel-page.html` の iframe は `height: 640px`(PC 720px)固定で、中身(カード30枚+「もっと見る」で+30枚)が必ずはみ出して **iframe 内に二重スクロール**が出る。埋め込み時だけ中身の高さを親へ通知し、親が iframe を伸ばせるようにする。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(送信側)
- `C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html`(受信側サンプル)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-embedheight.mjs`(新規・機械検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(18本目として登録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針

### 1. 送信側 `assets/app.js`
- 既存の `setEmbed(on)`(**app.js:1217**)の直後に `postHeightToParent()` と `startHeightObserver()` を新設する。
- **必ず `state.embed === true` のときだけ送る**。非 embed では ResizeObserver も張らない(`setEmbed(true)` の中からのみ `startHeightObserver()` を呼ぶ)。フォールバック経路(app.js:1318 付近の `setEmbed(false)` 相当)で embed が解除されたら observer を `disconnect()` する。
- 送る内容:
  ```
  parent.postMessage({ type: 'yadotabi:height', height: <number> }, '*');
  ```
  他の情報は載せない。受信は一切しない(`message` リスナーを足さない)。
- 高さの取り方: `Math.ceil(document.documentElement.scrollHeight)`。`body` は `margin:0` 前提だが、念のため `Math.max(body.scrollHeight, documentElement.scrollHeight)` を取る。
- 発火点は 2 系統:
  1. `new ResizeObserver(...)` で `document.body` を監視(描画完了・画像読み込み・「もっと見る」展開のすべてを1つで拾える)。`ResizeObserver` が無い環境(古いブラウザ)は `typeof ResizeObserver === 'function'` でガードし、無ければ何もしない(送らないだけで壊れない)。
  2. 保険として `renderFeed()`(**app.js:869**)の末尾と、「もっと見る」クリックハンドラ(**app.js:1589-1593**、`state.moreOpen = true; renderFeed();` の直後)から `postHeightToParent()` を1回呼ぶ。ResizeObserver が先に発火していれば同値なので二重送信は無害。
- **連打防止**: 直前に送った高さと同じなら送らない(`lastSentHeight` を持つ)。さらに `requestAnimationFrame` で1フレームに1回へ丸める。
- 状態Aや通常モードのコードパス(`render()` app.js:1148、`ensureMap()`)には触らない。

### 2. 受信側サンプル `demo/hotel-page.html`
- `iframe.embed`(**demo/hotel-page.html:209**)の `height: 640px`(CSS **:136-145**)は**初期高さとして残す**(JSが無効/postMessage が来ないときに真っ白にならないため)。
- `</body>`(**:223**)の直前に `<script>` を1つ足す:
  - `window.addEventListener('message', function (e) { ... })`
  - **origin を必ず検証する**。許可するのは `https://teer-tee.github.io`(本番)と、ローカル検査用に `window.location.origin`(同一オリジンで `../index.html` を読むため `e.origin === location.origin` になる)。この2つ以外は即 return。
  - `e.data` が object で `e.data.type === 'yadotabi:height'` かつ `height` が 100〜20000 の有限数のときだけ `iframe.style.height = height + 'px'`。範囲外は無視(暴走防止)。
  - 対象 iframe は `document.querySelector('iframe.embed')` を1つだけ。
- 埋め込みコード例の `<pre class="tag-example">`(**:220**)にも、受信スクリプトが必要である旨の1行コメントを添える(営業資料としての正しさ)。

### 3. 機械検査 `scripts/check-embedheight.mjs`(新規)
`scripts/check-more.mjs` の作り(自前で `python -m http.server 3000` を起動し finally で落とす / Playwright は `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` を絶対パスで読む)をそのまま踏襲する。確認項目:
1. `/demo/hotel-page.html` を開き、カード描画完了後に `iframe.embed` の実高さ(`getBoundingClientRect().height`)が初期値 640px より**大きく**なっている
2. iframe 内の `#more-btn` をクリック(`frameLocator`)した後、iframe の高さが**さらに増える**
3. 増えた後の iframe 高さが、iframe 内の `document.documentElement.scrollHeight` と ±4px 以内で一致する
4. 親ページ側に二重スクロールが無い(iframe 内 `scrollHeight <= clientHeight + 4`)
5. **非 embed の検査**: `/index.html?fixture=kusatsu`(embed なし)を直接開き、`postMessage` が一度も呼ばれないこと。`addInitScript` で `window.parent.postMessage` をラップしてカウンタに記録し、描画完了後に 0 件であることを確認する
6. `?fixture=kusatsu&embed=1` 単体(親なし)を開いてもコンソールエラー 0 件
7. コンソールエラー 0 件(親・子とも)

`scripts/check-all.mjs` の `SCRIPTS` 配列(**:13-28**)にアルファベット順の位置(`check-chipcurrent.mjs` と `check-engine.mjs` の間)で `'scripts/check-embedheight.mjs'` を追加し、ヘッダコメント(**:2**)の「16本」「17本」を「17本」「18本」に直す。

## 完了条件(検証可能)
- `node scripts/check-embedheight.mjs` が全項目 PASS・exit 0
- `node scripts/check-all.mjs` が **18本中18本 PASS**・exit 0
- `node --check assets/app.js` 通過

## 検証手順(撮影・目視)
1. `node C:\workspace\tools\shot\shot.mjs http://127.0.0.1:3000/demo/hotel-page.html --mobile --full` を撮り、**iframe の下端でカードが切れておらず**、iframe の下に「1行の iframe タグを貼るだけで…」の営業注記が続いていることを Read で目視
2. 同 URL の desktop 幅も1枚
3. デグレ確認: `?fixture=kusatsu`(非 embed・mobile)と `?fixture=kusatsu&embed=1`(単体・mobile)を各1枚。カード30枚・番号ピン1〜30判読可・文字崩れなし・コンソールエラー0件
4. 撮影は全て fixture 経由なので **外部API 0回**

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json`(rank の重み・閾値・収集ロジックには一切触らない)
- 既存 `scripts/check-*.mjs` の中身(`check-all.mjs` への1行追加のみ可)
- `?embed=1` の既存の出し分け(検索・チップ・地図を隠す挙動、`.is-embed` の CSS)
- git stash / reset --hard / checkout でのファイル復元は禁止

## 難易度・所要目安
- 難易度: **sonnet**(既存パターンの踏襲。新規ロジックは postMessage 送信 15行程度+受信サンプル 15行程度)
- 所要目安: 実装 20分 + check-all 約1分 + 撮影/目視 10分 = **30〜40分**

## 実装後
`docs/ROADMAP.md` の R48 を `[x] 2026-09-16` に、`docs/NIGHTLOG.md` に3行(やったこと/見た目の確認結果/次)を追記し、コミット→push。報告は簡潔に。
