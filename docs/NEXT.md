# NEXT: R16 カードの「もっと見る」(31〜60件目の展開)

**選定理由**: 残る未完了のうち R10/R11 は見た目の微調整、R14/R15/R21/R22 は裏方の改善で、ユーザーに見える価値が一番大きいのは「30件で打ち切られていた候補の続きを見られる」R16 だから(R2-1 と R20 関連は朝の相談待ちのため除外)。

**難易度**: sonnet / **所要目安**: 40〜60分

---

## 目的

`engine.js` の `present()` は `cards.slice(0, MAX_CARDS)`(30件)で打ち切っており、31件目以降は完全に捨てられている。これを「捨てる」から「畳んでおく」に変える。フィード末尾に「もっと見る(残り n 件)」の1行を置き、タップで31件目以降を展開する。**タップ1回で増えるだけなので、ユーザー入力ゼロの原則には反しない**(泊数・移動手段の入力とは別物)。

表示順は **cards(1〜30) → もっと見る行 → far(もっと遠く)**。

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(テスト追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`(対象セレクタ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-more.mjs`(**新規**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

---

## 実装方針

### 1. engine.js — `present()` の戻り値に `more` を足す

- 28〜30行目付近の定数の隣に `var MAX_MORE = 30;`(= 31〜60件目の30件)を追加する。
- `present(items, hotel)`(**767行目**)の `return`(**783〜786行目**)を、`cards` の slice を分けて3つ返す形にする:
  - `cards: cards.slice(0, MAX_CARDS)` (現状維持)
  - `more: cards.slice(MAX_CARDS, MAX_CARDS + MAX_MORE)` (31〜60件目。30件以下なら**空配列**)
  - `far: far.slice(0, MAX_FAR)` (現状維持)
- JSDoc(**759〜766行目**)の `@returns` を `{{cards:Array, more:Array, far:Array}}` に更新する。
- `suggest()`(**808行目**)は `present()` の戻り値をそのまま流しているので**コード変更不要**。ただし JSDoc(**804行目・806行目**)の `partial` / `@returns` の説明に `more` を足す。
- **`onProgress` の partial にも `more` を含める**(`emit()` が `present()` をそのまま渡す現行のままで自動的にそうなる。特別扱いはしない)。理由: 段階描画の途中で `more` だけ欠けると app.js 側に「あるとき無いとき」の分岐が増えて事故りやすい。app.js は「展開済みフラグ」で出し分けるので、途中段階で more が入っていても画面は変わらない。
- **`rank()` / `baseScore()` / 重み・閾値・カテゴリ多様性は一切触らない**。

### 2. app.js — state と描画

- `state`(**97〜105行目**)に2つ追加: `more: []`、`moreOpen: false`。
- `state.cards = ...` / `state.far = ...` を代入している **4か所**(539〜540行目のデモ、581〜582行目のリセット、598〜599行目の partial、606〜607行目の done)すべてで `state.more` も同様に代入する。**リセット箇所(581〜582行目、623〜624行目)では `state.moreOpen = false` にも戻す**(別の宿に移ったら畳み直す)。
- `farHtml(far)`(**710行目**)の**直前**に `moreHtml(more, open)` を新設する:
  - `more.length === 0` なら `''` を返す。
  - 未展開(`open === false`)のとき: `<button type="button" class="morebtn" id="more-btn">もっと見る（残り N 件）</button>` の1行だけ。
  - 展開済み(`open === true`)のとき: ボタンは出さず `''` を返す(カード本体は下記のとおり `feedList` 側に描く)。
- `renderFeed()`(**738行目**)の変更:
  - **761行目** `var html = state.cards.map(cardHtml).join('');` の直後に、`state.moreOpen` が真なら追加カードを連結する。`cardHtml(card, index)` は `index + 1` を番号バッジに使う(684行目)ので、**通し番号が31から続くように index をずらす**:
    `if (state.moreOpen) html += state.more.map(function (c, i) { return cardHtml(c, i + state.cards.length); }).join('');`
  - **770〜772行目** の far 描画の**手前**に、`els.feedFar` とは別の入れ物に `moreHtml` を描く。`index.html` の **62行目 `<div class="feed" id="feed-list">` と 64行目 `<div id="feed-far" hidden>` の間**に `<div id="feed-more" hidden></div>` を1行足し、`els` に `feedMore` を登録して `innerHTML` と `hidden` を更新する(far と同じ書き方に揃える)。
  - 読み込み中(`loading` が真)は「もっと見る」を出さない(スケルトンと並ぶと意味が分からないため)。`done` 段のみ表示する。
- クリック処理: 既存のイベント委譲(1219行目・1236行目あたりで `els.feedList` に対してやっているもの)とは別に、`els.feedMore` に `click` リスナを1つ付ける。`#more-btn` が押されたら `state.moreOpen = true;` にして `renderFeed()` を呼ぶだけ。**外部APIは呼ばない**(配列は既に手元にある)。
- **小地図のピンは `state.cards` の30件のままでよい**(`renderFeedMap()` 930行目・957行目は無変更)。31件目以降を足すとピンが密集して R8 で苦労した分離が壊れるため。
- 受動ログ(**779〜790行目**)は `state.cards` ベースのまま変更しない。余力があれば `passivePush('more', { n: state.more.length })` を1行足してもよいが必須ではない。

### 3. style.css

`.morebtn` を末尾に追加。フィード幅いっぱい・**`min-height: 44px`**・角丸・カードと同じ背景・中央寄せ・上下に余白。既存のボタン系トークン(`.btn--secondary` など)の色を流用し、新しい色は足さない。

---

## 完了条件(すべて検証可能)

1. **`node scripts/check-engine.mjs`** に `more` のケースを追加して**全件 pass**(現行103件 → 追加後も全部緑)。追加するテスト:
   - 候補が31件以上あるとき、31件目以降が `more` に入り、`cards` は30件のままであること。
   - 候補が30件以下のとき `more` が**空配列**であること(`undefined` ではない)。
   - `more` の先頭が、`cards` の末尾より順位が下(= rank 順が連続している)こと。
   - `onProgress` の partial にも `more` キーが存在すること。
2. **`node scripts/check-more.mjs`**(新規・Playwright。`scripts/check-a11y.mjs` の作り(ポート3000の自前起動・`file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` 読み)をそのまま踏襲する)が全項目OK・exit 0:
   - `?fixture=kusatsu` を開き、初期状態で `.feedcard` が **30枚**、`#more-btn` が**存在する**。
   - `#more-btn` を **click** し、`.feedcard` の枚数が **30枚より増える**こと。
   - 展開後の31枚目のカードの番号バッジが **`31`** であること。
   - 展開後は `#more-btn` が**消えている**こと。
   - コンソールエラー **0件**。
3. **`node scripts/check-a11y.mjs`** の `TARGETS`(26〜33行目)に `{ selector: '.morebtn', label: 'もっと見る' }` を追加し、**44px 以上**で全件OK。
4. 既存の回帰が全部緑: `node scripts/check-geo.mjs`(34件)、`node scripts/check-passive.mjs`、`node docs/check.mjs`、`node --check assets/app.js` / `assets/engine.js`。
5. **`node scripts/dump-rank.mjs kusatsu` と `hakone` の上位30件が変更前と差分ゼロ**(rank を触っていない証明)。

---

## 検証手順(撮影と目視)

`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` で以下を撮り、**必ず Read で画像を開いて目視**する:

1. `http://127.0.0.1:3000/?fixture=kusatsu` の **展開前**(フィード末尾までスクロールした状態 or フルページ) — 「もっと見る（残り N 件）」の1行がカード30枚目の下・「もっと遠く」の上に出ていること。文字の折り返し崩れ・はみ出しなし。
2. 同URLで `#more-btn` を click した **展開後** — 31枚目以降のカードが続き、番号バッジが 31, 32… と連番になっていること。画像・リンクチップの崩れなし。
3. `http://127.0.0.1:3000/?fixture=hakone` の mobile — デグレなし(カード30枚・番号ピン1〜30判読可)。
4. `http://127.0.0.1:3000/?fixture=kusatsu&embed=1` の mobile — 埋め込みモードでも「もっと見る」が破綻していないこと。

撮影は全て fixture モードなので**外部API呼び出しは0回**。

---

## 変更禁止範囲

- **`rank()` / `baseScore()` / 重み・閾値・カテゴリ多様性ルール**(engine.js)— 一切触らない
- **`assets/geo.js`** — 無変更
- **`fixtures/*.json`** — 無変更(再生成もしない)
- `renderFeedMap()` / `nudgeOverlaps()` — 無変更(ピンは30件のまま)
- git stash / reset --hard / checkout は禁止

---

## 報告(NIGHTLOG に3行)

やったこと / 見た目の確認結果(撮った画像と判定) / 次。実装が終わったら**まずコミットしてから**報告を書くこと。報告は簡潔に。
