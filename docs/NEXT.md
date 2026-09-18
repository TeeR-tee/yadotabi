# NEXT — R2-1 検索候補が開いている間、その下の3行を隠す

- **タスクID**: R2-1
- **難易度**: sonnet(CSSに1ブロック + app.js に数行。ロジックの分岐は1本だけ)
- **所要目安**: 40〜60分(実装15分・撮影と目視15分・check-all 約5分)

## 目的

検索欄に文字を入れて候補が開いている間、候補のドロップダウンが**エリアチップ行・リード文・サンプル行の上に覆いかぶさり、それぞれを「途中で切れた状態」で見せている**。これを「候補が開いている間はその3行を見せない」ことで解消する。

**これはデザインの好みではなく不具合**である。理由は実測の2点(下記)。

## 実測で判明した前提(2026-09-18 計画役が Playwright で実測)

再現手順: `node scripts/check-*.mjs` と同じローカルサーバを立て、`?demo=suggest` を mobile 375x812 / desktop 1280x900 で開く(外部API 0回)。撮影済み: `scratchpad/r2-1_mobile.png`。

### (1) 半端に切れた要素が見えている = 明らかな見た目の破綻

mobile 375x812 の実測値(desktop 1280x900 も縦位置は完全に同値):

| 要素 | top | bottom | left | right |
|---|---|---|---|---|
| `.pickbar` | 0 | **187.3** | 0 | 375 |
| `#suggest-list` | **61.5** | **427.0** | **50.2** | 363 |
| `.chips` | 65.5 | 109.5 | 12 | 363 |
| `.pickbar__lead` | 117.5 | 134.3 | 12 | 363 |
| `.samples` | 134.3 | 178.3 | 12 | 363 |
| `#map` | 187.3 | 812 | 0 | 375 |

- ドロップダウンの左端は **x=50.2**、1個目のチップ「登別」は left=12/right=68。つまり**チップの右 17.8px だけがドロップダウンに隠れ、左 38.2px が残る**。撮影画像で「登別」の右半分が白い箱に切り落とされているのが目視できる。
- 同様に `.pickbar__lead`(「宿を選ぶと、まわりの見どころが並びます。」)は x=50.2 で切られ **「宿を選...」** までしか読めず、`.samples` のラベルも **「例を見...」** で切れている。
- **ROADMAP の旧文言「候補の背後から半分はみ出して見える」は原因の記述が誤り**。`#suggest-list` の computed style は `background: rgb(255,255,255)`(完全不透明)・`opacity: 1`・`box-shadow: rgba(20,20,30,0.16) 0 12px 32px`・`z-index: 600` で、**透けてはいない**。見えているのは覆われていない側の半端な断片である。よって「不透明な背景と影を付ける」案は**既に実装済みで、直す対象が存在しない**。

### (2) タップ範囲が重なっていて誤タップが起きる = 好みではなく不具合

`document.elementFromPoint(チップの中心)` を全チップで実測した結果(mobile):

- 「登別」= `chip`(押せる。ドロップダウンの左外に中心があるため)
- **「定山渓」「銀山」「鬼怒川」「日光」= `suggest__name`**(押すと候補の行が反応し、意図と違う宿が選ばれる)
- 「草津」以降 = 横スクロール領域の外なので `null`

desktop 1280x900 も同型で、「定山渓」〜「日光」が `suggest__name`、「草津」「伊香保」「軽井沢」が `suggest__item` を返す。

`.samples` も同じ: サンプル導線5本すべての中心が `suggest__name` / `suggest__item` を返し、**「草津の例」を押したつもりで候補の宿が選ばれる**。`.pickbar__lead` の中心も `suggest__item`。

つまり**押せそうに見える要素(チップ・サンプル導線)が、実際には別のものを押す状態**になっている。これは利用者の意図と結果が食い違う不具合であり、直すのに好みの判断は要らない。

### (3) 「候補をチップ行の下に出す」案が成り立たないことの実測

ドロップダウンは bottom=427.0 まで伸びるのに対し `.pickbar` は bottom=187.3 で終わる。**候補の 239.7px(全高 365.5px の 66%)は既に `.pickbar` の外=地図の上にはみ出している**。チップ行の下(top≈187px)へ動かしても、候補は 553px まで伸びて地図をさらに覆うだけで、重なりの相手がチップから地図に変わるにすぎない。しかも `.pickbar__search` を基準にした `top: calc(100% + 4px)` という素直な位置指定を捨てることになる。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`(検査の追加)

## 実装方針

**候補が開いている間だけ `.chips` / `.pickbar__lead` / `.samples` を `visibility: hidden` にする。**

1. `app.js` の `renderSuggest()` の末尾(`els.suggest.hidden = false;` の直後)と `hideSuggest()` の中で、`.pickbar` に状態クラス `pickbar--suggesting` を付け外しする。個別の3要素を JS から触らず**親1箇所のクラスだけ**にすること(`.samples`/`.pickbar__lead` は R131 で `hidden` 属性を使っているので、`hidden` を JS から上書きすると `?embed=1` / `?fixture=` の非表示が壊れる)。
2. `style.css` に `.pickbar--suggesting .chips, .pickbar--suggesting .pickbar__lead, .pickbar--suggesting .samples { visibility: hidden; }` を1ブロック追加する。

**`display:none` ではなく `visibility:hidden` を使うこと**(重要)。実測の構造上、`#suggest-list` は `.pickbar__search` の子で `top: calc(100% + 4px)` によって**検索欄からの相対位置**に置かれている一方、`.chips`/`.pickbar__lead`/`.samples` は `.pickbar__row` の兄弟である。`visibility` なら3行は場所を占めたまま消えるので、

- `.pickbar` の高さは **187.3px のまま変わらない**
- `#map` の高さは **624.7px のまま変わらない**(Leaflet の `invalidateSize()` を呼ぶ必要が無い)
- ドロップダウン自身の top(61.5px)も動かない

`display:none` にすると `.pickbar` が約 82px 縮んで地図がその分伸び、候補を閉じた瞬間に戻るため、**入力するたびに地図がガタッと上下する**。これは新しい不具合を作るだけなので採らない。

3. `visibility: hidden` はタップ判定も同時に消えるため、(2) の誤タップは同じ1行で解消する(実装後に `elementFromPoint` で再測して確認すること)。
4. 隠れた3行は**読み上げからも消える**(`visibility:hidden` の標準挙動)ので `aria-hidden` の追加は不要。

## 却下した案とその理由

| 案 | 却下の理由 |
|---|---|
| 候補に不透明な背景と影を付ける | **既に実装済み**。実測で `background: rgb(255,255,255)` / `opacity: 1` / `box-shadow: 0 12px 32px rgba(20,20,30,.16)` / `z-index: 600` を確認した。透過は起きておらず直す対象が無い。ROADMAP の原因記述が誤りだった。 |
| 候補をチップ行の下に出す | 候補は既に `.pickbar` の外へ 239.7px(全高の66%)はみ出しており、下げても地図をより深く覆うだけ。重なりの相手が変わるだけで解消しない。位置指定も複雑になる。 |
| チップ行を暗くする(opacity を下げる) | 見た目は和らぐが**タップ判定が残るので誤タップが直らない**。(2) が本体の不具合なので解決になっていない。しかも「どのくらい暗くするか」は好みの判断になる。 |
| `.chips` を `display:none` にする | `.pickbar` が縮んで地図の高さが入力のたびに変わる(ガタつき)。Leaflet の再計算も要る。新しい不具合を作る。 |
| 候補の幅を検索欄いっぱい(left:0)に広げてチップを完全に覆う | 半端に切れる問題は消えるが**チップのタップ判定は覆われたまま残り**、誤タップは直らない。 |

## 完了条件

1. `?demo=suggest` の mobile 375x812 / desktop 1280x900 で、**チップ・リード文・サンプル導線が1つも画面に見えない**(半端に切れた断片が0個)。
2. 同じ状態で `.chip` 全件・`.samples a` 全件・`.pickbar__lead` の中心座標に対する `document.elementFromPoint()` が、**`.chip` / `.samples a` / `.pickbar__lead` のいずれも返さない**(= 誤タップの余地が無い)。
3. `.pickbar` の高さが **187.3px のまま**、`#map` の高さが **624.7px のまま**(候補の開閉前後で ±1px 以内)。
4. 候補を閉じたら(`?demo=` を付けない通常表示・`hideSuggest()` 後)3行が**元どおり見えてタップできる**。
5. `?embed=1` と `?fixture=kusatsu` で `.pickbar__lead` / `.samples` が従来どおり非表示のまま(R131 のデグレなし)。
6. `node --check assets/app.js` OK。
7. `node scripts/check-all.mjs` が **29本全緑**(exit 0)。

## 検証手順

1. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅)
   - `?demo=suggest` を **375x812** と **1280x900**
   - `?demo=recent` を **375x812**(最近見た宿の候補でも同じく3行が隠れること)
   - `?demo=zoomout` を **375x812**(候補を開いていない通常の状態Aでデグレが無いこと)
   - `?fixture=kusatsu` を **375x812**(状態Bのデグレ確認)
   撮った画像は必ず `Read` で開いて、文字崩れ・重なり・はみ出し・帰属表示の欠落を目視する。
2. Playwright で上記「完了条件」の 2・3 を数値で測り、実測値を NIGHTLOG に書く。
3. `scripts/check-a11y.mjs` に検査を追加する。既存のケースは**1件も削らない**。追加するのは「`?demo=suggest` で `.chip` / `.samples a` の中心に対する `elementFromPoint` が当該要素を返さないこと」と「候補を閉じた状態では返すこと」の対照2件。
4. `node scripts/check-all.mjs` を実行し **29本全緑(exit 0)** を確認する。
5. **外部API 0回**(すべて `?demo=` / `?fixture=` の固定データで行う)。

## 変更禁止範囲

- `rank` の重み・閾値は変更不可。
- `assets/engine.js` / `assets/geo.js` / `fixtures/` は変更不可。
- 入力UI(入力欄・設定・チュートリアルの手順送り等)の**追加は禁止**(入力ゼロ原則)。
- `.suggest__item` の高さ・padding は変更しない(R13 のタップ領域44pxを維持)。
- `.samples a` のラベル文字列・`.suggest` の背景/影/z-index は変更しない。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止。
- 外部API 0回。

## 終わったら

1. `docs/ROADMAP.md` の R2-1 の行を **`[x] 2026-09-18`** に変える(旧文言の「半分はみ出して見える」「デザイン判断が要る」は実測で否定されたので、実施内容に合わせて書き直すこと)。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-18 R2-1 <一言>` の見出しを付けて3行(やったこと / 見た目の確認結果 / 次)を追記する。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
