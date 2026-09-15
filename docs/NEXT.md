# NEXT: R29 `?q=` / エリア移動でエリアチップの該当チップを強調する

## 選定理由(1行)
R28 の案内文は既に `app.js:396` に実装済み(`setMapNote(hotels.length ? '' : 'この範囲には宿が見つかりませんでした')`)で残りは撮影フラグとテストだけなのに対し、R29 は未実装かつ `docs/shots/state-a.jpg` が問題を実証している(検索欄「草津温泉」なのにチップ行は登別〜日光が並び、草津チップは画面外で無強調)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(主)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(`.chip--current` の見た目のみ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-chipcurrent.mjs`(新規・機械検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 現状(実物の行番号)
- `AREAS` = app.js **23〜44行**(20件、`{label, lat, lon}`。ラベルは「草津」「箱根」等の短い名前)。
- `renderChips()` = app.js **1238〜1242行**。`els.chips.innerHTML` に `<button type="button" class="chip" data-index="i">` を並べるだけ。強調の仕組みは無い。
- `flyTo(lat, lon, zoom)` = app.js **427〜433行**。`ensureMap` → `map.setView` → `saveMapView()` → `loadHotelsInView()`。**チップ経由(1288行)・検索候補の地名ジャンプ(1277行)・`?q=`(1225行)の3経路すべてがここを通る**ので、強調更新の一元的なフック地点になる。
- チップのクリック委譲 = app.js **1282〜1289行**(`AREAS[Number(btn.dataset.index)]` → `flyTo`)。
- `?q=` 入口 = app.js **1220〜1228行**。`q.length >= 2` なら `els.searchInput.value = q` 後に `YadoGeo.suggestHotels(q)` の先頭結果へ `flyTo`。
- `.chips` = style.css **114行**(横スクロール、`mask-image` の右端フェード付き)、`.chip` = **126行**、フォーカスリングは **513行**。

## 実装方針
1. app.js に `function currentAreaIndex(text)` を新設(`renderChips()` の近く、1242行あたり)。
   - 引数の文字列を trim し、`AREAS` を先頭から走査して **`text.indexOf(a.label) === 0`(=チップのラベルで前方一致)** する最初の index を返す。該当なしは `-1`。
   - 「草津温泉」→「草津」、「箱根湯本」→「箱根」が当たる。逆方向(ラベルが入力を含む)は拾わない。
2. app.js に `function setCurrentChip(index)` を新設。
   - `els.chips.querySelectorAll('.chip')` を回し、一致する1つだけに `classList.add('chip--current')` と `setAttribute('aria-current','true')`、他は `remove` / `removeAttribute`。
   - 一致チップがあれば `btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })`。**`block:'nearest'` を必ず付ける**(付けないとページ全体が縦にスクロールして地図が隠れる)。`prefers-reduced-motion` を考えて `behavior` は `'auto'` 固定でよい。
3. 呼び出し箇所(3経路を1点に集約):
   - **チップ経由**: 1282〜1289行のハンドラで `flyTo` の直前に `setCurrentChip(Number(btn.dataset.index))`。
   - **`?q=` / 検索候補の地名ジャンプ**: `setCurrentChip(currentAreaIndex(<入力文字列>))` を呼ぶ。`?q=` は 1222行の `els.searchInput.value = q` の直後に **`suggestHotels` の解決を待たず**に呼ぶ(地名の文字列だけで判定できる。API が失敗しても強調は出る)。候補の地名ジャンプ(1274〜1278行)は `row.hotel.name` を渡す。
   - 埋め込みモード(`body.is-embed`)と状態Bではチップ自体が隠れているので追加の分岐は不要。`els.chips` が空の可能性はないが、`setCurrentChip` は要素が無ければ黙って return する防御を入れる。
4. style.css に `.chip--current` を1ブロック追加(126行の `.chip` の直後)。`border-color: var(--c-primary); background: var(--c-primary-soft); color: var(--c-primary); font-weight: 600;` 程度。**`min-height:44px` と padding は変えない**(R13 のタップ領域44px検査を壊さないため)。`.chip:hover`(141行)と同系統の見た目にして新トークンは足さない。

## 完了条件(検証可能)
新設 `node scripts/check-chipcurrent.mjs`(`scripts/check-more.mjs` の作りを踏襲。Playwright は `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs`、自前で `python -m http.server 3000`)で以下が全 PASS:
1. `?q=草津温泉&demo=suggest` を開き、`.chip--current` がちょうど **1個**で、そのテキストが `草津`。`aria-current="true"` も同じ1個だけ。
2. 同ページで、その草津チップの `getBoundingClientRect()` が `.chips` コンテナの可視範囲内にある(= `scrollIntoView` が効いて画面内に来ている)。
3. `?q=箱根湯本&demo=suggest` で `.chip--current` のテキストが `箱根`。
4. `?q=ぬけぬけ温泉&demo=suggest`(AREAS に無い語)で `.chip--current` が **0個**、`aria-current` も0個。
5. `?demo=zoomout`(`?q=` なし)で `.chip--current` が **0個**(素の状態Aで勝手に強調しない)。
6. チップ「箱根」を `click` した後、`.chip--current` が箱根の1個だけになる(前の強調が残らない)。
7. コンソールエラー0件。
8. デグレ: `node scripts/check-a11y.mjs` 全OK(チップが44px維持)、`node scripts/check-more.mjs` 6 pass、`node scripts/check-engine.mjs` 111件 pass、`node docs/check.mjs` exit 0、`node --check assets/app.js` 通過。
9. `git diff --stat -- assets/engine.js assets/geo.js fixtures` が**空**。

## 検証手順(撮影+目視)
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?q=草津温泉&demo=suggest" --mobile` と desktop の2枚。**画像を Read で開いて**、(a)草津チップだけが色付き枠になっている (b)チップ行が横スクロールして草津が画面内に来ている (c)検索候補のドロップダウンとの重なりが R2-1 の現状より悪化していない (d)チップの高さ・文字が他と揃っている、を目視。
- デグレ確認: `?fixture=kusatsu` mobile(カード30枚・番号ピン1〜30判読可)、`?demo=zoomout` mobile(チップ20件が無強調で横1行・右端フェード健在)の2枚も Read で目視。
- 外部APIは `demo=suggest` / `demo=zoomout` / `fixture` のみなので**0回**。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**一切触らない**(rank の重み・閾値・カテゴリ多様性も同様)。
- `AREAS` のラベル・座標を変更しない(並び順も北→南のまま)。
- `.chip` の `min-height` / `padding` / `.chips` の横スクロール構造を変更しない。
- R2-1(検索候補とチップの重なり)は朝の相談待ちなので**手を出さない**。今回は重なりを悪化させないことだけ確認する。
- 入力ゼロ原則: 表示の強調のみ。ユーザーに選択や入力を求めるUIは足さない。
- git stash / reset --hard / checkout は禁止。

## 難易度・所要目安
- 難易度: **sonnet**(app.js に関数2本+呼び出し3箇所、CSS 1ブロック、検査スクリプト1本)
- 所要目安: 25〜40分(実装10分 / 検査スクリプト15分 / 撮影・目視10分)
- 終わったら**先にコミット**(1行の日本語)→ push。報告は簡潔に(長文の報告書を書かない)。
