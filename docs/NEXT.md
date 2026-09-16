# NEXT: R96 ライトボックスのフォーカストラップ

- **タスクID**: R96
- **難易度**: opus(フォーカス管理の実装のため)
- **所要目安**: 20〜30分

## 目的

ライトボックス(カード写真の拡大表示)を開いている間に Tab を押すと、暗幕で視覚的に隠れている背後のページへフォーカスが抜ける。キーボード利用者が「今どこにいるか分からない」状態になる実害のある不具合を、数行の最小実装で塞ぐ。あわせて `scripts/check-lightbox.mjs` にキーボード検査が1件も無い「検査の穴」を埋める。

## 実測で判明した前提(2026-09-16 計画役が grep/Read で確認)

- `assets/app.js:897` `openLightbox(img, returnFocusEl)` — overlay を `document.createElement('div')` で都度生成し、`innerHTML` で **`.lightbox__close`(`<button type="button">`)1個と `.lightbox__img`(`<img>`)1個だけ**を入れる。`tabindex` は一切付けていない。
- `assets/app.js:917` `var closeBtn = overlay.querySelector('.lightbox__close'); if (closeBtn) closeBtn.focus();` — 開いた直後に閉じるボタンへフォーカスを移している(R69 由来)。**開く前のフォーカス元の保存・復帰は既に実装済み**(`app.js:915` で `lightboxReturnFocusEl = returnFocusEl || null`、`app.js:935-938` の `closeLightbox()` で `lightboxReturnFocusEl.focus()`)。**よって「閉じた後にフォーカスを戻す」部分は追加実装不要**。
- `assets/app.js:920-923` `lightboxKeyHandler = function (e) { if (e.key === 'Escape') closeLightbox(); };` を `document` に `keydown` で登録。**`Tab` の分岐が無い**のがバグの本体。
- `assets/app.js:1810-1814` 呼び出し元。`.feedcard__imgbtn`(ボタン)のクリックで `openLightbox(btnImg, imgBtn)` を呼ぶため、`returnFocusEl` は常に写真ボタン。
- `assets/app.js:905-907` overlay 自身の `click` で `closeLightbox()`(暗幕クリックで閉じる)。
- `scripts/check-lightbox.mjs`(212行)を grep したところ **`Tab` / `focus` / `activeElement` の語が1件も無い**。現在の検査項目は冒頭コメントの通り8件(表示・暗幕クリック・Escape・番号バッジ・リンクチップ・プレースホルダ・body overflow・embed)で、キーボード挙動は未検査。
- フォーカス可能要素は overlay 内に **閉じるボタン1つのみ**(`<img>` はフォーカス不可)。したがって「循環」は実質「その1つに留め続ける」で足りる。
- 未確認: 暗幕表示中に背後のカードへ実際にフォーカスが移るかを Playwright で実行して観測してはいない(コード上 Tab を止めていないことから論理的に導いた結論)。作業役は実装前に現状を1度再現し、NIGHTLOG に「修正前は N 回目の Tab で `.feedcard__link` に抜けた」と実測値を残すこと。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-lightbox.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針(最小実装・ライブラリ追加不可)

1. `app.js:920` の `lightboxKeyHandler` に `Tab` の分岐を足すだけ。

```js
lightboxKeyHandler = function (e) {
  if (e.key === 'Escape') { closeLightbox(); return; }
  if (e.key === 'Tab') {
    // フォーカス可能要素は .lightbox__close 1つだけなので、
    // Tab / Shift+Tab とも既定動作を止めて閉じるボタンに留める(背後へ抜けさせない)
    e.preventDefault();
    var btn = lightboxEl && lightboxEl.querySelector('.lightbox__close');
    if (btn) btn.focus();
  }
};
```

2. `tabindex` は増やさない。`Escape`・暗幕クリックの既存挙動、`closeLightbox()`(`app.js:926-939`)の復帰フォーカスは**1行も変えない**。
3. CSS(`assets/style.css`)は変更不要。
4. 将来 overlay 内のフォーカス可能要素が増えたときのために、`e.preventDefault()` の理由コメントを必ず残す。

## 完了条件

- ライトボックスを開いた状態で Tab を5回押しても `document.activeElement` が `.lightbox__close` のまま。
- Shift+Tab を3回押しても同様。
- `Escape` で閉じる、暗幕クリックで閉じる、閉じた後に元の写真ボタン(`.feedcard__imgbtn`)へフォーカスが戻る、の3点が従来どおり。
- ライトボックスを開いていないときの Tab 遷移は一切変わらない(R69 の `scripts/check-keyboard.mjs` が引き続き緑)。
- `node --check assets/app.js` 通過。
- `node scripts/check-all.mjs` が **27本全緑**。

## 検証手順

1. `node --check assets/app.js`
2. `scripts/check-lightbox.mjs` に**ケースを追加**(既存8項目は減らさない):
   - 9. 写真クリックで開いた直後 `document.activeElement` が `.lightbox__close`
   - 10. `page.keyboard.press('Tab')` ×5 の後も `document.activeElement.className` に `lightbox__close` を含む
   - 11. `page.keyboard.press('Shift+Tab')` ×3 の後も同様
   - 12. `Escape` で閉じた後 `document.activeElement` が `.feedcard__imgbtn`
   - 13. `?fixture=kusatsu&embed=1` でも 10 が成立
   - 冒頭コメントの「確認項目」リストにも追記すること
3. `node scripts/check-lightbox.mjs` 単体で全項目 PASS
4. 撮影(外部API 0回・fixture のみ):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile`(幅375) — デグレ確認1枚。画像を Read で開いて目視(カード30枚・番号ピン判読可・文字崩れなし)
   - ライトボックス表示中の1枚は `check-lightbox.mjs` が既に撮っているのでそれを Read で目視
5. `node scripts/check-all.mjs` → **27本全緑(fail 0)** が必須

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は変更不可
- rank の重み・閾値は変更不可
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**
- 外部API(Overpass / Nominatim / Wikipedia)呼び出しは **0回**
- 既存の check 本の検査項目を減らさない(追加のみ)
- `?embed=1` や `demo/hotel-page.html` の仕様変更はしない

## 終わったら

1. `docs/ROADMAP.md` の R96 行を `- [x] 2026-09-16 R96 ...` に更新
2. `docs/NIGHTLOG.md` のサイクル記録に**3行**(やったこと / 見た目の確認結果 / 次)を追記
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
