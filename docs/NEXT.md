# NEXT: R23 カード画像の読み込み失敗時のフォールバック

**判断理由**: 残り候補(R11/R14/R19/R21/R23〜R27)のうち、Wikipedia のサムネイルは外部URLで 404・削除・遅延が実際に起きるため、壊れた枠が本番のユーザーに見える唯一の「見た目の実害」であり、検証も外部APIなしで完結できるので R23 を選ぶ。

難易度: **sonnet** / 所要目安: **20〜30分**

---

## 目的

カード画像 `<img class="feedcard__img">` の src(Wikipedia サムネイル)が 404 や失敗で読めないとき、いまは画像枠(16:9・`--c-surface-2` の灰色面)が空白のまま残るか、壊れアイコンが出る。これを**画像なしカードと同じ見た目**(`.feedcard__ph` のカテゴリ絵文字+淡いグラデーション)へ差し替える。

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (主)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-imgfail.mjs` (新規)
- 必要なら `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (原則不要。既存の `.feedcard__ph` をそのまま使えば足りる)

### 変更禁止範囲(厳守)

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**1バイトも変更しない**(`git diff --stat` で確認すること)
- rank の重み・閾値・カテゴリ多様性ルールには触れない

---

## 実装方針(実物の行番号つき)

### 1. 画像を出している場所

`assets/app.js` の `cardHtml(card, index)` (**682行目〜**)。**684〜687行目**が該当:

- 684-685行: `card.imageUrl && safeUrl(card.imageUrl)` が真なら `<img class="feedcard__img" src="..." alt="" loading="lazy">`
- 686-687行: 偽なら `<div class="feedcard__ph" data-cat="..."><span aria-hidden="true">絵文字</span></div>`

この 686-687 行のプレースホルダ HTML を**そのまま再利用**するのが方針。`cardHtml` から `placeholderHtml(card)` のような小さな関数に切り出し、両方から呼ぶ形にすると差し替えが 1 行で済む(絵文字は同関数内の `emojiFor(card.categoryLabel)`、定義は **291行目**)。

`<img>` タグ側には `data-ph` 等で**差し替えに必要な情報(カテゴリラベルと絵文字)を属性として持たせてもよい**が、その場合も値は必ず `escapeHtml()` (**225行目**) を通すこと。文字列連結で HTML を組む既存方針(ファイル先頭 10行目のコメント)を崩さない。

### 2. onerror の付け方 — inline ではなく addEventListener(委譲)

`index.html` に CSP の meta タグは**無い**ので inline `onerror=` でも現状は動くが、以下の理由で**イベント委譲を採用**する:

- 将来 CSP を入れたときに黙って壊れない
- `renderFeed()` (**759行目**) が `els.feedList.innerHTML = html` (**790行目**) で毎回 DOM を作り直すため、カードごとに個別リスナを張る方式は「もっと見る」展開・段階描画のたびに張り直しが必要になるが、委譲なら一度で済む

具体的には、既存のクリック委譲と同じ場所(`els.feedList` は **1364行目**で取得。クリック委譲の登録箇所を grep して同じ関数内に置く)に、**キャプチャフェーズ**で1回だけ登録する:

```
els.feedList.addEventListener('error', handler, true);
```

**重要**: `error` イベントは `<img>` から**バブリングしない**ので、第3引数 `true`(capture)が必須。ここを落とすと一切発火せず、テストだけ通らないという事故になる。

ハンドラの中身:

1. `e.target` が `IMG` かつ `classList.contains('feedcard__img')` でなければ何もしない
2. 同じ画像で無限に発火しないよう、処理前に `img.removeAttribute('src')` するか、差し替えで要素ごと消えるので実質1回で終わる(差し替え方式なら追加のガード不要)
3. 親 `.feedcard__media` の中で、その `<img>` を `placeholderHtml(card 相当)` の DOM に**置換**する(`img.replaceWith(...)` か `img.outerHTML = ...`)。番号バッジ `.feedcard__no`(**695行目**で media の中に入っている)は消さないこと
4. 置換後の要素が `.feedcard__ph` クラスを持つこと = 完了条件の判定対象

`#feed-more` 側にも展開後のカードが入る可能性を確認すること。**795〜798行目**を読むと `els.feedMore` にはボタンだけが入り、展開カードは `feedList` 側(**783〜785行目**)に連結されるので、委譲は `feedList` 1箇所でよい。

### 3. 撮影用フラグ `?demo=imgfail`

`applyEntryPoint()` 内のデモ解釈(**1111〜1116行目**、`var demo = params.get('demo') || ''` が 1112行目)に 1 行追加し、モジュール変数 `demoImgFail`(**131〜135行目**の宣言群に合わせて追加、コメントも同じ書式で)を立てる。

効かせる場所は `cardHtml`: `demoImgFail && index < 3` のとき、`card.imageUrl` を無視して**存在しない URL**(例 `'./__imgfail_test__.png'`、同一オリジンなので外部APIを叩かない)を src に入れる。これで先頭3枚が必ず error を起こす。

**フラグが無いときは完全に従来どおり**であること(`demoFar` 等と同じく、既定値 false で分岐の外側は不変)。

---

## 完了条件(検証可能)

1. `node scripts/check-imgfail.mjs` が全項目 PASS・exitCode 0。最低限この5項目:
   - `?fixture=kusatsu&demo=imgfail` を開き、**先頭3枚のカードのメディア部が `.feedcard__ph` になっている**(`.feedcard__img` が残っていない)
   - 4枚目以降は従来どおり `.feedcard__img` が残っている(=全部潰していない)
   - 先頭3枚のプレースホルダ内にカテゴリ絵文字のテキストが入っている(空の箱でない)
   - 先頭3枚の番号バッジ `.feedcard__no` が消えていない(1・2・3 が読める)
   - `?fixture=kusatsu`(フラグ無し)で `.feedcard` 30枚・`.feedcard__ph` の枚数が**修正前と同じ**(デグレなし)
2. コンソールエラーは画像404由来のネットワークエラー以外0件
3. `node --check assets/app.js` 通過
4. 既存テストにデグレなし: `node scripts/check-engine.mjs` / `check-more.mjs` / `check-pinflash.mjs` / `check-passive.mjs` / `check-a11y.mjs` / `check-geo.mjs` / `check-r5.mjs` / `node docs/check.mjs`
5. `git diff --stat` に `assets/engine.js` / `assets/geo.js` / `fixtures/` が**出ないこと**

`scripts/check-imgfail.mjs` は `scripts/check-more.mjs` の作りを踏襲する(Playwright を `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` から絶対パスで読み、ポート3000のローカルサーバを自前で起動・停止。このプロジェクトに npm install はしない)。

---

## 検証手順(撮影+目視)

外部API 0回。すべて fixture で完結する。

1. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&demo=imgfail" --mobile` — 先頭3枚が**灰色の空白枠ではなく、淡いグラデーション+カテゴリ絵文字**になっていること、番号バッジ 1・2・3 が読めること、カード高さが 16:9 のまま崩れていないことを Read で目視
2. 同URLを desktop 幅で1枚
3. `?fixture=kusatsu`(フラグ無し) mobile でデグレなし(カード30枚・番号ピン1〜30・写真あり)
4. `?fixture=hakone` mobile でデグレなし

---

## 記録とコミット

- 実装が終わったら**まず先にコミット**する(コミットメッセージは1行の日本語)
- `docs/ROADMAP.md` の R23 行を `- [x] 2026-09-16 R23 ...` にする
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)を追記
- `git push` して本番に反映
- 報告は簡潔に(長文の報告書を書かない)
