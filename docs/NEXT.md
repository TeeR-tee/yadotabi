# NEXT: R58 ブラウザの戻るで状態Aに戻る(history.pushState)

## 選定理由(1行)
残候補のうち R14/R19/R40 は fixture 再生成で Overpass を叩くため夜間ループ向きでなく、R55 は計測のみで成果が薄く、R57/R59 より **スマホで端末の戻るを押すとサイトごと離脱する** R58 の実害が大きいので R58 を選ぶ。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(唯一のコード変更対象)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-history.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(1行追加。現在19本→20本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針(実物の行番号つき)

### 1. 状態フラグを1つ足す
`state` の隣(モジュール先頭のローカル変数群、`requestSeq` などと同じ場所)に
`var historyPushed = false;` を追加する。これが **二重 push 防止** の要。

### 2. `selectHotel(hotel)` — app.js:656
現在 `render();`(app.js:673)→ `perfReset();`(675)の流れ。`render()` の**直後**に
状態Bへ入ったことを履歴に積む処理を入れる:

- `state.embed` が true のときは **何もしない**(埋め込みでは親ページの履歴を汚さない)。
- `historyPushed` が既に true のときも **何もしない**。状態Bで別の宿を選び直す経路(検索候補・エリアチップ)があるため、ここを守らないとカードを選ぶたびに履歴が積み上がり「戻る」を何度も押さないと状態Aに戻れなくなる。
- 上記2つを通過したときだけ `global.history.pushState({ yado: 'feed' }, '', global.location.href)` を呼び、`historyPushed = true` にする。URL は**変えない**(第3引数に現在の href をそのまま渡す)。`?fixture=`/`?hotel=`/`?demo=` などの撮影パラメータを保持したいのと、GitHub Pages のサブパスで URL を書き換える事故を避けるため。

### 3. `goBack()` — app.js:705
現在 `requestSeq++` から `render()`(716)まで。**関数の中身は状態リセットのまま変えず**、
呼び出し経路を2つに分ける方式にする:

- `goBack()` の本体(状態リセット+render)はそのまま残す。ただし末尾で `historyPushed = false;` にリセットする。
- 新たに `function goBackFromUi()` を作り、`historyPushed` が true なら `global.history.back()` を呼ぶだけ(実際の画面遷移は popstate ハンドラに任せる)、false なら従来どおり `goBack()` を直接呼ぶ。
- app.js:1573 の `els.backBtn.addEventListener('click', goBack);` を **`goBackFromUi`** に差し替える。これで画面内の「←」でも履歴が1つ消費され、押した後に端末の戻るでサイト離脱しない(履歴の辻褄が合う)。

### 4. `popstate` の購読 — `bindEvents()`(app.js:1523)の末尾
`global.addEventListener('popstate', function () { ... })` を追加:
- `state.embed` なら何もしない。
- `state.view === 'feed'` のときだけ `goBack()` を呼ぶ(`historyPushed` は goBack 内で false に戻る)。
- それ以外(既に状態A)は何もしない。ブラウザが勝手に離脱するのは正しい挙動。

**popstate 時に地図位置を保持すること**: `goBack()` は `render()` を呼ぶだけで `map.setView()` を触っていないので、Leaflet のインスタンス `map` は状態Bの間も生き続けており中心・ズームは保たれる。**新たに `flyTo`/`setView`/`ensureMap` を呼び足さないこと**。ただし状態Aの `#map` は `render()` で `hidden` が外れた直後にサイズ 0 から復帰するため、既存の `render()` 内に `invalidateSize()` 相当の処理が無ければ**その1行だけ**足してよい(地図が灰色になる場合の保険。中心・ズームは引数なしの `invalidateSize()` では変わらない)。

### 5. `?hotel=` / `?fixture=` 直行のとき — `applyEntryPoint()`(app.js:1278)
この経路も内部的には `selectHotel()`(app.js:1369 付近)を呼ぶので **2. のロジックがそのまま適用され pushState が1回走る**。戻る先は「サイトを開く前のページ」ではなく**この push 分**なので、端末の戻る1回で状態A(地図)が出る。ROADMAP の「離脱でよい」より親切だが入力ゼロ原則に反せず、`?hotel=` で入った人が地図を触れる利点があるのでこれを採用する(この判断を NIGHTLOG に1行残すこと)。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` は **1行も触らない**(rank の重み・閾値・除外ルール・Overpass クエリを含む)
- `fixtures/*.json` は再生成しない。Overpass / Wikipedia を**一切叩かない**
- 既存 `scripts/check-*.mjs` の中身は編集しない(`check-all.mjs` へのリスト1行追加のみ可)
- `style.css` は原則不要(見た目の変更なし)

## 完了条件(機械検証可能)
`node scripts/check-history.mjs` が全項目 PASS。最低限この5ケース:
1. `?fixture=kusatsu` を開き、状態Bに入った直後の `history.length` が、状態A時点より **+1** になっている。
2. その状態で `page.goBack()` → `#view-select` が表示され `#view-feed` が hidden、`YadoApp.getState().view === 'select'`。
3. 状態Bで**同じ宿を選び直す/別の宿に切り替える**操作を1回行っても `history.length` が **さらに増えない**(二重 push 防止)。
4. `?fixture=kusatsu&embed=1` では状態Bに入っても `history.length` が **変化しない**。
5. popstate で戻った後の状態Aの地図中心・ズームが、状態Bに入る前の値と **一致**(`YadoApp.getMap().getCenter()` / `getZoom()` を前後で比較)。

加えて `node scripts/check-all.mjs` が **20本すべて PASS・exit 0**。`node --check assets/app.js` 通過。

## 検証手順(撮影+目視)
外部API 0回。`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` で:
1. `http://127.0.0.1:3000/?fixture=kusatsu` mobile — カード30枚・番号ピン1〜30判読可でデグレなしを目視。
2. `http://127.0.0.1:3000/?fixture=kusatsu&embed=1` mobile — 戻るボタン非表示のまま崩れなしを目視。
3. コンソールエラー0件を確認。
(見た目は変わらない改修なので、目的は**デグレ検出のみ**。3枚以上は撮らない)

## 難易度 / 所要目安
sonnet / 35〜50分(実装15分・新規 check 本15分・撮影と check-all 15分)

## 終わったら
実装が終わったら **まずコミット**(1行日本語)して push。報告は簡潔に(長文の報告書を書かない)。
`docs/ROADMAP.md` の R58 を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと/目視結果/次)を追記する。
