# NEXT: R69 キーボード操作の検査(check-keyboard.mjs 新規)

**選定理由**: 残る未完了(R14/R19/R40/R64/R69〜R73)のうち、R14/R19/R40 は fixture 再生成で Overpass を叩く必要があり夜間の無料APIマナーに触れる、R64 は GitHub Actions の課金確認という判断が要る、R71〜R73 は文書のみで小粒。R69 は外部API 0回・判断不要・実害のある欠陥(下記)が既に1件見えているため選ぶ。

**難易度**: sonnet / **所要目安**: 40〜60分(実装20分・check-all 3分・撮影と目視15分)

---

## 対象ファイル(絶対パス)

| ファイル | 変更 |
|---|---|
| `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-keyboard.mjs` | **新規** |
| `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` | 配列に1行追加(24本→25本) |
| `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` | 修正1箇所のみ(下記 A) |
| `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` | 上記に伴う最小の見た目維持 |

**変更禁止**: `assets/engine.js` / `assets/geo.js` / `fixtures/*.json`。rank の重み・閾値・除外ルールにも触らない。既存 check-*.mjs 24本の中身も編集しない(check-all.mjs のリスト追加のみ可)。

---

## 事前調査の結果(計画役が実物を読んだ事実。仮説ではない)

`index.html` と `app.js` を読んだ結果、**フォーカス可能要素はほぼ全て既に native な `<button>` / `<a href>`** で、`tabindex` は index.html・app.js のどこにも 1 個も無い。ROADMAP が心配していた「tabindex 欠落・div ボタン」はほぼ杞憂で、**実際の欠陥は1つだけ**。

既存の到達可能要素(DOM 順):
- 状態A: `#search-input`(input) → `#search-clear`(button, 入力時のみ) → `.suggest__item`(button, `app.js:520`) → `.chip`(button, `app.js:1604`) → `.samples a`(`app.js:1626`)
- 状態B: `#back-btn`(button, `index.html:56`) → `.feedcard__no`(button, `app.js:847`) → `.feedcard__link`(a, `app.js:791`) → `#more-btn`(button, `app.js:925`) → `.far__summary`(details/summary, `app.js:938`) → `.far__item a`(`app.js:934`) → `#feed-note` 内の「くわしい仕組み」リンク(`app.js:951`)

### A. 唯一の実欠陥 — カード写真がキーボードで開けない(R66 ライトボックスの取りこぼし)

`app.js:1756` の `var img = e.target.closest('.feedcard__img'); if (img) { openLightbox(img); return; }` により、カード写真のタップでライトボックスが開く。しかし写真は `app.js:834/837` で生成される**素の `<img>`** で、`tabindex` も `role` も無い。よって:
- **Tab で写真に到達できない** → キーボード利用者はライトボックスを開く手段が一切無い
- 「クリックできるのにフォーカスできない」状態で、R13 で整えたフォーカスリングも当たらない

**直し方(tabindex を増やさない範囲で、という ROADMAP の指示に沿う)**: `<img>` を `<button type="button" class="feedcard__imgbtn">` で包む。`cardHtml()`(`app.js:827`)の `media` 変数を組む2箇所(縦長デモ分岐 834行・通常分岐 837行)の `<img …>` をそれぞれこのボタンで囲むだけ。`tabindex` 属性は使わない(button は既定でフォーカス可能)。
- クリック委譲は `closest('.feedcard__img')` のままで動く(button の中の img が e.target になるため)。**ただし Enter でボタンが押されたときは e.target が button なので `closest('.feedcard__img')` が null になる** → 委譲側を `e.target.closest('.feedcard__imgbtn')` で拾い、その中の `img` を `openLightbox()` に渡す形に直す(`app.js:1756` 付近の2行)。
- `app.js:1726` の画像 error 委譲は `img.tagName !== 'IMG'` を見ているので、img 自体は残るため影響なし。念のため実行して確認する。
- `style.css` に `.feedcard__imgbtn { display:block; width:100%; height:100%; padding:0; border:0; background:none; cursor:pointer; }` を追加。`.feedcard__media` は `aspect-ratio:16/9`(style.css:383)なのでボタンを 100% にすれば見た目は完全に不変。
- プレースホルダ(写真なしカード、`placeholderHtml()`)は**元々クリックできない**ので包まない(挙動を変えない)。

### B. 確認だけして直さない可能性が高いもの(検査に入れて事実を残す)

- `.far__summary` は `<summary>` なのでブラウザ既定でフォーカス可能・Enter で開閉する。到達順の記録だけ取る。
- ライトボックスを開いた後、フォーカスが `.lightbox__close`(`app.js:874`)へ移っているか。`openLightbox()` は現状 `focus()` を呼んでいないので、**開いた直後の Tab がカードの続きへ行く**はず。閉じるボタンへ `focus()` を1行足すのは範囲内(閉じたら元の写真ボタンへ戻す `focus()` も1行)。ここまでは実装してよい。Esc 閉じは `lightboxKeyHandler`(`app.js:888`)で既に動く。
- `.suggest__item` は `role="option"` だが実体は button なので Tab で拾える。ARIA 的には listbox 内の option を Tab 対象にするのは正統ではないが、**今回は挙動を変えない**(到達できる方が実利がある)。事実だけ NIGHTLOG に残す。

---

## 実装方針(手順)

1. `scripts/check-keyboard.mjs` を新規作成。`scripts/check-sample.mjs` の作りを踏襲する(Playwright は `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` から import、ポート3000に自前サーバを立てて finally で落とす、`ok()` で pass/fail 集計、fail>0 で exit 1)。
2. 検査内容(すべて `?fixture=kusatsu` 等で外部API 0回):
   - **状態B の到達順**: `?fixture=kusatsu` を開き `page.keyboard.press('Tab')` を 40 回程度繰り返して、毎回 `document.activeElement` の `className`/`tagName`/`textContent` を記録する。期待: `#back-btn` → 1枚目の `.feedcard__imgbtn` → `.feedcard__no`(1) → `.feedcard__link`×5 → 2枚目の `.feedcard__imgbtn` → … と**カード単位で順に進み、1枚目より先に2枚目の要素が出てこない**ことを検査する(DOM 順に依存するので index の単調増加で見る)。
   - **写真ボタンに到達できること**(A の回帰): 1枚目の `.feedcard__imgbtn` に到達し、`Enter` で `.lightbox` が生成されること、`Escape` で消えること、閉じた後にフォーカスが元の `.feedcard__imgbtn` に戻っていること。
   - **番号バッジ**: `.feedcard__no` にフォーカスして `Enter` で `.pin--flash` が付くこと(check-pinflash.mjs と同じ判定を流用、待ちは 200ms)。
   - **もっと見る**: Tab を押し続けて `#more-btn` に到達でき、`Enter` で `.feedcard` が 60 枚になること。
   - **状態A の到達順**: `?demo=zoomout` を開き、`#search-input` → `.chip` 群 → `.samples a` の順に到達できること。検索欄に 1 文字入れると `#search-clear` が Tab 対象に加わること。
   - **フォーカスリングが見えること**: 上記のうち `.feedcard__imgbtn` と `#more-btn` にフォーカスした状態で `getComputedStyle(el).outlineWidth` が `0px` でないことを検査する(R13 で `outline:2px solid` を入れてある。**見た目バグは classList だけでなく computedStyle まで見る**というこれまでの教訓に従う)。
   - 各ケースで**コンソールエラー 0 件**。
   - **撮影**: 検査の中で `.feedcard__imgbtn` にフォーカスした状態と `#more-btn` にフォーカスした状態の 2 枚を `screenshots/r69-focus-img_mobile.png` / `screenshots/r69-focus-more_mobile.png` に `page.screenshot()` で保存する(375x812 の mobile 相当)。
3. A の修正を `app.js` / `style.css` に入れる。
4. `scripts/check-all.mjs` の配列にアルファベット順で `'scripts/check-keyboard.mjs'`(`check-initpos` と `check-lightbox` の間)を追加し、冒頭コメントの「24本」を「25本」に直す。

---

## 完了条件(すべて検証可能)

- [ ] `node scripts/check-keyboard.mjs` が全 PASS・exit 0。到達順のログが標準出力に読める形で出る。
- [ ] `.feedcard__imgbtn` に Tab で到達でき、Enter でライトボックスが開き Escape で閉じ、フォーカスが写真ボタンへ戻る。
- [ ] `#more-btn` に Tab で到達でき、Enter で 60 枚に展開する。
- [ ] フォーカス時の `outlineWidth` が 2 要素とも `0px` でない。
- [ ] `node scripts/check-all.mjs` が **25 本全緑・exit 0**(特に `check-lightbox.mjs` / `check-a11y.mjs` / `check-imgfail.mjs` / `check-pinflash.mjs` がデグレしていないこと)。
- [ ] `node --check assets/app.js` 通過。
- [ ] `git diff --stat -- assets/engine.js assets/geo.js fixtures` が**空**。

## 検証手順(撮影と目視)

1. `node scripts/check-keyboard.mjs` → 全 PASS と到達順ログを確認。
2. 上記 2 枚の撮影画像を **Read で開いて目視**: フォーカスリングが写真枠/ボタンの周りにはっきり見えるか、カードのレイアウトが修正前と変わっていないか(写真の大きさ・番号バッジの位置)。
3. `?fixture=kusatsu`(mobile)を 1 枚撮ってデグレ確認: カード 30 枚・番号ピン 1〜30 判読可・写真が従来どおり 16:9 で切れている・コンソールエラー 0 件。
4. `?fixture=kusatsu&demo=imgfail`(mobile)を 1 枚: 先頭 3 枚がプレースホルダに差し替わる既存挙動が壊れていないこと。
5. `node scripts/check-all.mjs` → 25 本全緑。
6. ROADMAP の R69 を `[x] 2026-09-16` に、NIGHTLOG に 3 行追記 → コミット → push。
