# NEXT: F3 受動ログ(localStorage `yado.passive.v1`・送信なし)

**判断理由**: 残りの未完了は R10/R11/R14/R15/R16 とも見た目・撮影の小改善で、F3 だけが計画書08 v3.2 の本筋(将来 rank を学習で改善するためのデータ土台)であり、いま作らないと今後の利用ログが一切残らないため最優先で選んだ。R2-1 は朝の相談待ちのため除外。

**難易度**: sonnet / **所要目安**: 60〜80分

---

## ゴール

ユーザーが「どのカードのどのリンクを押したか」「何枚目まで見たか」「そのとき表示されていた宿と上位カードのID」を localStorage に黙って記録する。**送信は一切しない。ユーザー操作を求めるUIは一切追加しない。** 将来 rank の重みを実データで検証する材料にする。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (**主戦場**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\passive-log.md` (新規・形式と目的)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-passive.mjs` (新規・機械検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (`?demo=passive` の表示だけ。末尾に追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` (完了記録)

## 変更禁止

`assets/engine.js` / `assets/geo.js` / rank の重み・閾値・カテゴリ多様性 / `fixtures/*.json` / `index.html`(DOM追加は `?demo=passive` 用の1要素を JS から動的生成するので不要)。

## 実装方針(実物の行番号つき)

既存の `lsGet(key)` / `lsSet(key, value)`(app.js **215行 / 224行**)が既に try/catch で例外を握りつぶす実装なので、**そのまま使う**。新しい localStorage アクセスを生で書かないこと。

### 1) 記録の土台(app.js の `lsSet` 直後、232行 `emojiFor` の手前に新設)

```
var PASSIVE_KEY = 'yado.passive.v1';
var PASSIVE_MAX = 200;
function passivePush(type, data) { ... }   // {t: Date.now(), type: ..., ...data} を配列末尾に push し、
                                           // 200件を超えたら先頭から捨てる(slice(-200))。lsGet/lsSet 経由。
```
- `lsGet(PASSIVE_KEY)` が配列でない(null・壊れたJSON)ときは `[]` から始める。
- 埋め込み(`state.embed`)でも記録してよい。`?demo=` 系の撮影中でも記録してよい(検査で使うため)。

### 2) 「表示した宿と上位カードのID」— `renderFeed()`(app.js **681行**)

`renderFeed()` の末尾、`renderFeedMap()`(**721行付近**)の直前に、`state.stage === 'done'` かつ「この宿でまだ記録していない」ときだけ 1回 `passivePush('view', {...})` する。多重記録防止用に `var passiveViewedKey = null;` をモジュール変数に持ち、`state.hotel.id + '@' + state.cards.length` 等で判定する(段階描画で renderFeed が複数回走るため、done の1回だけに絞ること)。

記録内容: `{type:'view', hotel:{id,name,lat,lon}, topIds:[上位10件の card.id], n:state.cards.length}`
`card.id` は engine.js の `toCard`(engine.js 744行)が必ず入れているので存在する。

### 3) リンクのタップ — 既存のクリック委譲(app.js **1110行** `els.feedList.addEventListener('click', ...)`)

現状 1行目が `if (e.target.closest('a')) return;` でリンクを素通ししている。**この return の前に記録を挟む**(return 自体は残す。地図を動かさない挙動は不変)。

```
var a = e.target.closest('a');
if (a) {
  var art = a.closest('.feedcard');
  if (art) { 上の card を取り出して passivePush('link', {hotelId, cardId, cardName, index, label: a.textContent.trim(), url: a.href}); }
  return;
}
```
- `target="_blank"` なので新しいタブが開くが、記録はクリック時点で同期的に済むので問題ない。
- `.far__item a`(`els.feedFar` 側)は今回は対象外でよい(feedList の委譲に乗らないため)。対象外にした旨を passive-log.md に明記する。
- カード本体のタップ(リンク以外)も `passivePush('tap', {...})` で記録する(既存の panTo 処理の直前)。

### 4) スクロール到達位置 — IntersectionObserver

`renderFeed()` が `els.feedList.innerHTML = html` で毎回 DOM を作り直すので、**描画のたびに observer を作り直す**。モジュール変数 `var cardObserver = null; var maxSeenIndex = -1;` を持ち、

- `renderFeed()` の末尾で `observeCards()` を呼ぶ。`observeCards()` は既存 observer を `disconnect()` してから新規生成し、`els.feedList.querySelectorAll('.feedcard[data-index]')` を全部 observe する。
- コールバックで `entry.isIntersecting` のものだけ `Number(entry.target.dataset.index)` を見て `maxSeenIndex` を更新する。**更新があったときだけ** `passivePush('seen', {hotelId, maxIndex: maxSeenIndex})` ではなく、**スクロール中の連打を避けるため**「最大値が更新されたら 1秒 debounce して1件だけ記録」にする(既存の `debounce()` が app.js **202行**にあるので流用)。
- `typeof IntersectionObserver === 'undefined'` なら何もしない(古い端末で落とさない)。
- 宿を切り替えたとき(`selectHotel`、app.js **518行**)に `maxSeenIndex = -1` と `passiveViewedKey = null` をリセットする。

### 5) 撮影用フラグ `?demo=passive`

- `applyEntryPoint()` の URL パース部(app.js **936〜940行** の `demo` 判定のかたまり)に `if (demo === 'passive') demoPassive = true;` を追加する。`demoStateA` には**含めない**(状態Bのフィードを見せたいので)。
- `demoPassive` が true のとき、`renderFeed()` の最後で `els.feedList` の後ろ(または body 末尾)に `<pre class="passivebox">` を1つ作り、`lsGet(PASSIVE_KEY)` の中身を「末尾10件を `type / 要約` の1行ずつ + 総件数」で表示する。`perfBox`(app.js 138行付近の `?perf=1` 用固定行)と同じ「フラグが無ければ何も作らない」方式を踏襲する。
- passivePush のたびにこのボックスを更新する(記録が増えるのを目視できる)。
- style.css 末尾に `.passivebox` の節(小さい等幅・薄い背景・`max-height` + `overflow:auto`・`font-size:11px`)を追記する。

## 完了条件(機械検査 `scripts/check-passive.mjs`)

`scripts/check-a11y.mjs` の作りをそのまま踏襲する(Playwright は `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` を絶対パスで import、ポート3000が空いていれば `python -m http.server 3000` を自分で起動して最後に落とす)。以下が全て真で `exitCode 0`:

1. `?fixture=kusatsu` を 375px 幅で開き、カードが30枚描画されるのを待つ。
2. localStorage に `yado.passive.v1` があり、`type:'view'` のレコードが**ちょうど1件**、`topIds` が10件、`hotel.name` が入っている。
3. 3枚目のカードまでスクロール(`.feedcard[data-index="2"]` を `scrollIntoView`)し、1.5秒待つ。`type:'seen'` のレコードがあり `maxIndex >= 2`。
4. 2枚目のカード(`data-index="1"`)の Instagram リンクをクリックする。`target="_blank"` なので `context.waitForEvent('page')` で新しいページを受け取って**即 close する**。`type:'link'` のレコードがあり `cardId` が2枚目のカードのIDと一致、`label` が `Instagram`。
5. 上限テスト: `page.evaluate` で 250件のダミーを書いてからリロードし、1件 push させたあと配列長が **200以下**であること。
6. localStorage を封じた状態(`page.addInitScript` で `localStorage.setItem` を throw させる)で `?fixture=kusatsu` を開き、**カード30枚が普通に出てコンソールエラー0件**であること(例外の握りつぶし確認)。

あわせて既存が壊れていないこと: `node scripts/check-engine.mjs`(103件)・`node scripts/check-a11y.mjs`・`node scripts/check-r5.mjs`・`node --check assets/app.js`・`node docs/check.mjs`。

## 検証手順(目視)

1. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&demo=passive" --mobile` を撮り、**画像を Read で開いて**最下部のログボックスに `view` レコードが見えること、カード・小地図・番号ピンに崩れが無いことを確認する。
2. `?fixture=kusatsu`(フラグ無し)の mobile を撮り、ログボックスが**一切出ていない**・カード30枚のままであることを確認する(デグレ確認)。
3. `?fixture=hakone` の mobile でもデグレなしを確認する。

## docs/passive-log.md に書くこと

- 目的: 「将来 rank の学習材料にする」。いまは送信も分析もしない、端末内にだけ残る。
- キー `yado.passive.v1` / 上限200件のローテーション / 各 type(`view` / `tap` / `link` / `seen`)のフィールド表。
- 収集しないもの: 個人情報・位置情報の実測値・検索クエリ文字列は入れない(宿の座標は URL に元から出ている公開情報なので可)。
- 対象外: 「もっと遠く」内のリンク(feedList の委譲に乗らないため)。
- 見る方法: `?demo=passive`、または DevTools で `JSON.parse(localStorage['yado.passive.v1'])`。
