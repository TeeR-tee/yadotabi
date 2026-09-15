# NEXT: R10 番号バッジをタップすると小地図の該当ピンが光る

**選定理由**: 残る未完了(R11/R14/R15/R19/R21)のうち、R10 だけがユーザーに見える体験改善で、CSSアニメのみ・ライブラリ追加なし・engine/geo に触れずに完結し、Playwright で機械検証できるため。

- 難易度: sonnet
- 所要目安: 40〜60分
- 変更禁止: `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` / `scripts/make-fixture.mjs`

## 対象ファイル(絶対パス)

- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-pinflash.mjs (新規)
- C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md / docs\NIGHTLOG.md (記録のみ)

## 現状(実物を読んで確認済み)

- `app.js:691` `feedCardHtml()` — カードは `<article class="card feedcard" data-index="N">`。番号バッジは `app.js:693` の
  `'<span class="feedcard__no" aria-hidden="true">' + (index + 1) + '</span>'`(`.feedcard__media` 内、現在はただの span でタップ不可)。
- `app.js:940` `renderFeedMap()` — `spotMarkers` に `state.cards` と同じ順で marker を push(`app.js:958-970`)。
  関数ローカル変数なので、外から番号→marker を引けない。
- `app.js:1242` `els.feedList` のクリック委譲 — `a` は素通し(`return`)、それ以外は `.feedcard` を拾って
  `passivePush('tap')` → `feedMap.panTo(...)` → `els.feedMap.scrollIntoView(...)`(`app.js:1263-1277`)。
- `style.css:173-196` — `.pin`(divIcon ルート、背景なし)/ `.pin span`(丸・影)/ `.pin--spot span`(青地・白2px枠)/
  `.pin--top span`(さらに外周リング+`transform: scale(1.12)`)。
- `style.css:522` に全体の `prefers-reduced-motion: reduce` があり、`*` に `animation-duration:.01ms !important` を当てている
  (=クラスは付くがアニメは走らない、という完了条件はこの既存ルールで自然に満たせる)。

## 実装方針

1. **marker を番号で引けるようにする**: `renderFeedMap()`(app.js:940)の `spotMarkers` を、モジュールスコープの
   `feedSpotMarkers` 配列にも保持する(`feedMarkers` の隣で宣言し、`renderFeedMap` 冒頭で `feedSpotMarkers = []` にリセット)。
2. **バッジをタップ可能にする**: `app.js:693` の span を
   `<button type="button" class="feedcard__no" data-no="N" aria-label="N番のピンを地図で光らせる">N</button>` に変える。
   `aria-hidden` は外す(タップ可能要素に aria-hidden は不可)。`.feedcard__no` の既存 CSS は流用しつつ、
   `border:0; padding:0; font: inherit; cursor:pointer;` をボタン用に足して**見た目は現状と同一**に保つ。
3. **クリック委譲に分岐を1本足す**: `app.js:1242` のハンドラ冒頭(`var a = e.target.closest('a')` の**前**)で
   `var badge = e.target.closest('.feedcard__no')` を見て、あればそこで `flashPin(Number(badge.dataset.no) - 1)` を呼び、
   カード本体の `panTo` + `scrollIntoView` も従来どおり実行して **`return`**(既存のカードタップと共存。
   `passivePush('tap')` は従来どおり記録する)。
4. **`flashPin(i)` 新設**(renderFeedMap の下あたり): `feedSpotMarkers[i]` の `getElement()` を取り、
   - 既に光っている要素があれば先にクラスを外す(連打対策。`flashTimer` を1本だけ持つ)
   - `el.classList.add('pin--flash')` → `setTimeout(..., 1200)` で `remove`
   - `feedMap.panTo` 済みでピンが画面外なら意味がないので、`flashPin` は panTo の**後**に呼ぶ
   - `getElement()` が無い(未描画)場合は何もしないで return
5. **CSS**(style.css の `.pin--top span` の直後): `.pin--flash span { animation: pin-flash 1s ease-out; }` と
   `@keyframes pin-flash`(白いリングが広がる `box-shadow` + 軽い `transform: scale()` の1秒)。
   `z-index` は上げず、既存の `box-shadow` 指定を打ち消さないよう keyframes 側で `.pin--spot span` と同じ基準影を含めて書く。
   **reduced-motion 用の追記は不要**(style.css:522 の `*` ルールが効く)。ただし念のため
   `@media (prefers-reduced-motion: reduce) { .pin--flash span { animation: none; } }` を書いても良い(クラス付与自体は残すこと)。

## 完了条件(検証可能)

1. `node scripts/check-pinflash.mjs` が全 pass(新規・Playwright、`check-more.mjs` の作りを踏襲):
   - `?fixture=kusatsu` を開き、3番カードの `.feedcard__no` を click → 200ms 後に
     3番ピンの要素に `pin--flash` クラスが付いている(他のピンには付いていない)
   - 1400ms 後に `pin--flash` が**外れている**
   - 別のバッジを連打しても `pin--flash` が付いた要素は常に1個以下
   - `reducedMotion: 'reduce'` のコンテキストで同じ click → **クラスは付くが** `getComputedStyle(...).animationName` が
     `none` か duration が 0.01ms 相当(=アニメしない)
   - コンソールエラー0件
2. `node scripts/check-a11y.mjs` 全 OK(`.feedcard__no` をボタン化したので**タップ領域44px**の対象になる可能性がある。
   44px 未満なら `.feedcard__link` と同じ `::after` で当たり判定だけ広げる方式を採る。既存の判定セレクタ一覧に
   `.feedcard__no` を追加して検査対象にすること)
3. 既存テストにデグレなし: `node scripts/check-engine.mjs`(111件)/ `check-more.mjs` / `check-passive.mjs` /
   `check-geo.mjs` / `node docs/check.mjs` / `node --check assets/app.js`
4. `node scripts/dump-rank.mjs kusatsu` の出力が変わらない(engine 無変更の証明)

## 検証手順(撮影+目視)

- `?fixture=kusatsu` mobile: バッジの見た目が現状と同じ(青丸・番号・位置)ことを目視。カード30枚・番号ピン1〜30判読可。
- Playwright で 3番バッジを click → **200ms 後**に mobile スクリーンショットを撮り、Read で開いて
  **「3番ピンだけが光っている(リングが見える)」ことを人間の目で判別できる**か確認する。判別できなければリングを太く/明るくする。
- `?fixture=hakone` mobile と `?fixture=kusatsu&embed=1` mobile でデグレなし。
- `?fixture=kusatsu&demo=passive` で、バッジタップ時も `tap` レコードが従来どおり1件出ることを確認。

## 注意

- 「もっと見る」で展開した31番以降のカードにもバッジは出るが、小地図のピンは30件しかない。
  `flashPin(i)` は `feedSpotMarkers[i]` が無ければ黙って何もしないこと(エラーを出さない)。
- ユーザー入力ゼロの原則: タップ1回で光るだけなので違反しない。
