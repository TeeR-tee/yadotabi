# NEXT — R131 初めて開いた人に「何をするサイトか」を1行だけ伝える

- タスクID: **R131**
- 難易度: **sonnet**(HTML 1要素 + CSS 1ブロック + app.js の表示制御数行。判断は「どの文言か」だけ)
- 所要目安: 30〜45分(うち check-all が約5分)
- 外部API: **0回**(`?demo=` と `?fixture=` とローカルサーバのみ)

## 目的

本番URLを渡された初めての人が、**このサイトが何をするものかを1文字も読めない**。
`<title>` と `<meta name="description">` にある売り「宿を選ぶだけで、まわりの見どころが並びます。入力は不要。」が、
**画面には一度も出ていない**。地図と地名チップだけが出るので「地図アプリ?」「宿の予約サイト?」と誤解される。
今回やるのは **1行の追加だけ**。説明で画面を埋めない。

## 計画役が 2026-09-18 に本番で実測した前提(前任の調査を再実測済み)

Playwright・**localStorage 空の新規コンテキスト**・本番 https://teer-tee.github.io/yadotabi/ ・外部API 1回。
撮影: `screenshots/2026-09-18_r131-first-visit_mobile.png` / `..._desktop.png`(Read で目視済み)。

1. **`document.body.innerText` の全文**(mobile 375x812 / desktop 1280x900 で**同一**):
   `🧳 / 登別 / 定山渓 / 銀山 / 鬼怒川 / 日光 / 草津 / 伊香保 / 軽井沢 / 箱根 / 熱海 / 修善寺 / 下呂 / 有馬 / 城崎 / 白浜 / 道後 / 別府 / 由布院 / 黒川 / 指宿 / サンプル: / 草津の例 / 箱根の例 / 道後の例 / 別府の例 / おまかせ / 🏨…♨(ピンの絵文字が67個) / + / − / Leaflet | © OpenStreetMap`
   → **サイト名も、説明も、行動の指示も一つも無い**ことを再確認した。`document.title` は `やどたび - 宿を選ぶだけ` で、タブにしか出ない。
2. **実測レイアウト**(mobile 375 / desktop 1280。`.pickbar` の高さは両幅とも同値):
   - `.pickbar` top 0 / **高さ 171px**
   - `.pickbar__row` top 12 / h 46、`.chips` top 66 / h 44(`scrollWidth 1350 > clientWidth 351` で横スクロール)
   - `.samples` top 118 / h 44、mobile は **`scrollWidth 371 > clientWidth 351`** で「おまかせ」が右端で見切れている(撮影でも「おま…」までしか読めない)
   - `#map` top 171 / **mobile h 642px・desktop h 730px**
3. **今回は Overpass が成功した**(mobile 67ピン・desktop 同等、`.mapnote` は `hidden: true` で文言は空)。
   前任が見た「宿ピン0件+『宿ピンの取得が混雑中です。』だけが読める」状態は **Overpass 429 のときだけ出る一時的な悪化**であって、
   **説明が無いという本題は API が成功していても等しく成立する**(上の innerText がその証拠)。
   → よって **`.mapnote` には一切手を触れない**。混雑文言の改善は今回の対象外。
4. `.samples` は既にあるが `サンプル:` というラベル + 青い下線リンク5本で、**開発者向けの脚注に見える**。
   初見の人に「1タップで答えが見られる入口」だと読ませるには語が弱い。実装は `assets/app.js:1845-1856` の
   `renderSampleLinks()` が `innerHTML` を組み立てており、`state.embed || fixtureNameFromUrl(params)` のときは
   `els.samples.hidden = true`(= embed と fixture では既に出ない)。
5. 目視の判断: **初めての人が何をすればいいか分からない**。押せる物が「検索欄・チップ・サンプル・地図のピン」と4種類あるのに、
   押した先に何が出るのかがどこにも書いていない。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`(要素を1つ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(`.pickbar__lead` のスタイル1ブロック)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(表示/非表示の制御と、`.samples` のラベル文字列)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-sample.mjs`(検査の追加。**既存ケースは1つも削らない**)

## 実装方針(どこに・何文字・どんな文言を)

### (1) `.pickbar` の中、`.chips` と `.samples` の**あいだ**に説明1行

- `index.html` の `<div class="chips" id="area-chips">` の**直後**、`<div class="samples">` の**直前**に
  `<p class="pickbar__lead" id="pickbar-lead" hidden>` を1つ置く。
- 文言は **`宿を選ぶと、まわりの見どころが並びます。`**(**20文字。全角24文字以内を上限とする**)。
  `<title>`/`<meta description>` と同じ趣旨の言い換えで、**動詞が「選ぶ」1つだけ**なので手順書にならない。
- スタイルは `.samples__label` と同系の脇役の見た目にする: `font-size: var(--fs-xs)` / `color: var(--c-text-sub)` /
  `margin: var(--sp-2) 0 0` / `line-height: 1.4` / `white-space: nowrap` は**付けない**(狭い端末で折り返して良い)。
  高さは1行ぶん(約17px)+ margin(約8px)= **約25px** の見込み。
- **`.samples` の `margin-top` を `var(--sp-2)` から 0 に下げる**(リード文と続けて1つの塊に見せ、増分を抑えるため)。
  これで `.pickbar` は 171px → **約188〜196px**(完了条件の 200px 以内)に収まる想定。実測して外れたら
  `.pickbar__lead` の `margin-top` を `var(--sp-1)` 相当まで詰めて調整してよい(**文言を削るのは最後の手段**)。

### (2) `.samples` のラベルを押せる導線だと分かる語に変える

- `assets/app.js:1851` の `'<span class="samples__label">サンプル:</span>'` を
  **`'<span class="samples__label">例を見る:</span>'`** に変える(6文字)。**リンク5本のラベル文字列は変更しない**
  (`check-sample.mjs` が `草津の例` 等の本数と文字を見ている)。
- mobile の見切れ(`scrollWidth 371 > clientWidth 351`)は `サンプル:`(5文字)→`例を見る:`(5文字)で**幅がほぼ変わらない**ため
  今回は解消しない。これは **R74 が意図して入れた横スクロール + 右端フェード**の仕様であり、今回の対象外。
  見切れを直したくなっても **`.samples` のスクロール方式を変えない**こと(R74 の判断を上書きしない)。

### (3) 出す条件 / 出さない条件

`renderSampleLinks()` と**同じ判定**を使い、リード文の `hidden` を1箇所で決める(判定をコピーせず、同関数の中で両方を制御する)。

| 条件 | リード文 | 理由 |
|---|---|---|
| 通常の本番(パラメータ無し) | **出す** | 本題。初見の人に向けた唯一の説明 |
| `?embed=1` | **出さない** | 埋め込み先(予約サイトの宿ページ)は既に文脈を持っている。R48 の高さ通知に余計な高さが乗る |
| `?fixture=<area>` | **出さない** | fixture は**状態Bへ直行**するため状態Aの `.pickbar` 自体が見えない。`.samples` と同じ扱いで整合が取れる(分岐を増やさない) |
| `?q=` / `?hotel=` | 既定どおり(`?hotel=` は状態Bへ直行するので実質出ない) | 追加の分岐を作らない |

→ 実装上は **`els.samples.hidden` と同じ真偽値を `els.pickbarLead.hidden` にも入れるだけ**。
`els` への登録は `app.js:2058` 付近の `samples:` の隣に `pickbarLead: document.getElementById('pickbar-lead')` を足す。

### 却下した案と理由(後任がここを緩めないこと)

- **却下A: 初回だけ出るチュートリアル/オンボーディングのオーバーレイ**
  → 手順送り・閉じるボタン = 利用者に操作を要求する。**入力ゼロ原則に正面から反する**。
- **却下B: 「泊まる宿を選んでください」等の命令形の指示文**
  → 指示された感じが出るうえ、宿を選ばなくてもサンプルやチップから始められる事実と食い違う。事実を述べる平叙文にする。
- **却下C: 2行以上の説明(使い方の箇条書き・「3ステップ」等)**
  → 地図が縮み、R129 で直したばかりの「提案が読めない」問題に逆戻りする。**追加は1行のみ**。
- **却下D: ロゴ/サイト名「やどたび」の大きな見出しを足す**
  → 名前だけでは何をするか伝わらない(伝わるのは機能の一文の方)。ヘッダーが2段になり地図が大きく削れる。
  🧳 のブランドマークは既にあるのでそれで足りる。
- **却下E: `.mapnote`(混雑中の文言)を書き換えて説明を兼ねさせる**
  → 実測3のとおり API 成功時は `hidden` になり**説明が消える**。説明はエラー表示に相乗りさせない。
- **却下F: 設定・トグル・「説明を隠す」ボタンを付ける**
  → 選択を求める操作の追加。入力ゼロ原則に反する。1行は常に出しっぱなしで良い。

## 完了条件

1. パラメータ無しの状態A(`?demo=nohotels` で外部APIを止めた状態)で、`.pickbar__lead` が**可視**で
   テキストが `宿を選ぶと、まわりの見どころが並びます。`(24文字以内)であること。
2. **`.pickbar` の高さが mobile 375x812 で 200px 以下**、かつ **`#map` の高さが 610px 以上**であること(実測値を NIGHTLOG に書く)。
3. `.samples` のラベルが `例を見る:` になり、**リンクが5本のまま**・全要素の `offsetTop` が同値(1行維持)であること。
4. `?embed=1` と `?fixture=kusatsu` で `.pickbar__lead` が**不可視**であること。
5. `node --check assets/app.js` が OK。
6. **`node scripts/check-all.mjs` が 29本全緑(exit 0)**。外部API 0回。
7. 撮影4枚を Read で目視し、文字崩れ・重なり・はみ出し・チップとの被りが無いこと。

## 検証手順

```
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=nohotels" --mobile      # 375x812 本題
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=nohotels"               # 1280x900 本題
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile     # デグレ確認(状態B)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1"      # 埋め込みで出ないこと
node scripts/check-all.mjs      # ← 29本全緑が必須
```

`check-sample.mjs` に追加する検査(既存ケースは1件も削らない):
- `?demo=nohotels` で `.pickbar__lead` が可視・テキストが空でない・文字数が24以内
- 同URLで `.pickbar` の `offsetHeight <= 200`(mobile 相当のビューポート)
- `?fixture=kusatsu` と `?fixture=kusatsu&embed=1` で `.pickbar__lead` が不可視
- 既存の「`.samples` の子要素の offsetTop が全て同値」がラベル変更後も PASS すること

## 変更禁止範囲

- **rank の重み・閾値は変更不可**。`assets/engine.js` / `assets/geo.js` / `fixtures/` は**1行も触らない**。
- **入力UIの追加禁止**: 入力欄・チェックボックス・トグル・設定・モーダル・手順送りのチュートリアルを一切足さない。
  押せる物は既存のチップ/サンプル/宿ピンのままにする。
- `.mapnote` の文言・表示条件は変更しない。
- `.samples` の横スクロール方式(R74)と、サンプルリンク5本のラベル文字列は変更しない。
- 検査のアサーションを減らさない。
- **git stash / reset / checkout でファイルを戻す操作は禁止**。
- **外部API 0回**(Overpass/Nominatim/Wikipedia を叩かない。撮影は `?demo=` と `?fixture=` のみ)。

## 終わったら

1. `docs/ROADMAP.md` の R131 の行頭を **`- [x] 2026-09-18`** にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」の末尾に、
   `### 2026-09-18 R131 <一言>` の見出しを付けて **3行**(やったこと / 見た目の確認結果(実測pxつき) / 次)を追記する。
3. **先にコミット**(1行の日本語メッセージ)→ `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
