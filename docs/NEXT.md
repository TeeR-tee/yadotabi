# NEXT: R63 状態Aの下に「サンプルを見る」デモ導線

## なぜこれを選んだか(1行)
残候補のうち R14/R19/R40 は fixture 再生成や rank 分布の調査で1サイクルに収まらず、R62 は目視のみで成果が「確認した」で終わりがちなのに対し、R63 は**初見の人が宿を選ばないと何も起きない**という本番URLの最大の入口問題を、表示のみ・ロジック変更なしで解消できるため。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`(セレクタ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-sample.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(21本目として登録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`

## 実物の構造(調査済み・これを前提に実装する)
- `index.html:31-49` が状態A。`<header class="pickbar">` の中に `.pickbar__row`(検索欄)と `index.html:43` の `<div class="chips" id="area-chips">` があり、その**外側の兄弟**として `index.html:45-48` の `<div class="mapwrap">`(`#map` + `.mapnote`)が続く。
- `assets/app.js:23` `var AREAS = [...]`(20件・座標直書き)。`assets/app.js:1514` `renderChips()` が `els.chips.innerHTML` にボタンを流し込む。クリックは `assets/app.js:1599-1608` の `els.chips.addEventListener('click', ...)` で `flyTo()` するだけ。
- `assets/app.js:1705` の `els` 定義に要素を追加し、`assets/app.js:1720` `renderChips()` の直後で新導線を描く。
- `assets/style.css:146-156` `.chips`(`display:flex` / `overflow-x:auto` / 右端24pxの mask)、`assets/style.css:158-173` `.chip`(`min-height:44px`)。`.mapwrap` は `flex:1 1 auto; min-height:0`(`assets/style.css:183` 付近)なので、**pickbar に要素を足すと地図の高さがその分だけ削られる**。ここが今回の設計上の争点。

## 実装方針
### 配置の3案(必ず撮り比べる)
| 案 | 置き方 | 地図の高さへの影響 |
|---|---|---|
| A | `.chips` の**下**に新しい1行 `<div class="samples" id="sample-links">` を追加 | 高さが約28〜32px減る |
| B | `.chips` の**行内・末尾**に既存チップと同じ flex 子として差し込む(区切り線付き) | 影響ゼロ。ただし横スクロールの奥に隠れて初見に届かない恐れ |
| C | `.mapwrap` 内の**地図上オーバーレイ**(`.mapnote` と同じ `position:absolute` の作り、左下か上部中央) | 影響ゼロ。ただし Leaflet の帰属表示・`.mapnote` と重なる恐れ(R31/R2 で一度踏んだ) |

作業役は**3案すべてを実装してではなく、まず A を実装して撮影 → B・C は CSS/配置だけ差し替えて撮影**し、mobile 375px の3枚を Read で目視比較したうえで採用案を決め、理由を NIGHTLOG に1行残すこと。初期推奨は **A**(初見に確実に届く。地図は `?demo=zoomout` で見て30px削れても破綻しないはず)だが、撮影で地図が窮屈なら C に切り替えてよい。

### 中身
- ラベルは「サンプル:」の淡色プレフィクス + `草津の例` / `箱根の例` / `道後の例` の3リンク。
- **リンク(`<a href>`)で実装する**(ボタンではない)。`href` は `?fixture=kusatsu` / `?fixture=hakone` / `?fixture=dogo`。GitHub Pages のサブパス配下なので**絶対パスを書かない**(`?fixture=kusatsu` のクエリのみの相対指定にすること。R3 でサブパス問題を踏んでいる)。
- 出す条件: `state.embed` が真のとき、および `fixtureNameFromUrl()` が非 null のときは**出さない**(`hidden` を立てる)。判定は `init()` で URL を読んでいる `assets/app.js:1722-1728` の既存パターンを流用し、`renderChips()` の直後に `renderSampleLinks()` を呼ぶ。
- タップ領域 44px を満たすこと(`.samples a { min-height:44px; display:inline-flex; align-items:center }`)。淡色は `var(--c-text-sub)`、サイズは `var(--fs-xs)`。
- JS のイベントハンドラは**足さない**。素の `<a>` の遷移に任せる(= ロジック変更ゼロ)。
- 表示のみ。`AREAS` は触らない。

## 完了条件(検証可能なものだけ)
1. `scripts/check-a11y.mjs` の `TARGETS`(`scripts/check-a11y.mjs:23-34`)に `{ selector: '.samples a', label: 'サンプル導線' }` を追加し、`PAGES` の `?demo=zoomout`(状態A)で最小 44px 以上の OK が出る。
2. 新規 `scripts/check-sample.mjs`(`scripts/check-hotelparam.mjs` の作りを踏襲・Playwright は `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs`)で以下が全 PASS:
   - a. `?demo=zoomout`(状態A)で `.samples` が可視(`offsetParent !== null` かつ `getComputedStyle().display !== 'none'`)、リンクが3本。
   - b. 3本の `href` がそれぞれ `fixture=kusatsu` / `hakone` / `dogo` を含む。
   - c. 1本目をクリック(またはその href へ遷移)すると `#view-feed` が可視・`#view-select` が不可視になり、`#feed-title` が「草津温泉」、`.feedcard` が 30 枚。
   - d. `?fixture=kusatsu` では `.samples` が**不可視**(fixture 中は出さない)。
   - e. `?fixture=kusatsu&embed=1` でも `.samples` が不可視。
   - f. 各ケースでコンソールエラー0件。
3. `scripts/check-all.mjs` の一覧(`scripts/check-all.mjs:13-31`)に `scripts/check-sample.mjs` を追加し、**21本すべて PASS・exit 0**。
4. mobile 375px の `?demo=zoomout` で、導線行が1行に収まり横スクロールが出ず、地図が潰れていない(撮影で目視)。

## 検証手順
```
node --check assets/app.js
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=zoomout" --mobile   # 案A/B/Cの3枚
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile # 導線が出ていないこと
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1" --mobile # 同上
node scripts/check-a11y.mjs
node scripts/check-sample.mjs
node scripts/check-all.mjs
```
撮った画像は必ず `Read` で開いて目視する(文字崩れ・重なり・はみ出し・地図の潰れ)。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js`(rank・重み・閾値・収集ロジック)
- `fixtures/*.json`(再生成も禁止。Overpass を叩かない)
- 既存 `check-*.mjs` の中身(`check-a11y.mjs` の TARGETS 追加と `check-all.mjs` のリスト追加のみ例外)
- `AREAS` の並び・ラベル・座標
- git stash / reset --hard / checkout でのファイル復旧

## 難易度・所要目安
- sonnet。所要 25〜40分(実装10分 + 3案の撮り比べ10分 + check-all 約160秒 + 記録・コミット)。
