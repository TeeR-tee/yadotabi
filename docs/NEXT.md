# NEXT — R97 印刷用CSS(@media print)の新設

- タスクID: **R97**
- 難易度: **sonnet**(CSS追記のみ・ロジック無変更)
- 所要目安: 25〜35分(撮影・印刷プレビュー確認を含む)

## 目的
宿の人が状態B(周辺スポット一覧)をブラウザの印刷/PDF保存で紙に出して客に渡す使い方が営業上ありえるのに、
印刷用のCSSが1行も無く、紙に何が出るか誰も確認していない。まず**現状を確認**し、崩れていれば
`assets/style.css` の末尾に `@media print` を1ブロックだけ足す。

## 実測で判明した前提(計画役が grep/Read で確認・2026-09-16)
- `grep -rn "@media print" assets/ index.html demo/` は **0件**。印刷用CSSは本当に存在しない。
- `assets/style.css` は **790行**。末尾(780-790行)は `.lightbox__close:focus-visible` と `body.is-lightbox { overflow:hidden }`。
- `position: fixed|sticky` は **3箇所だけ**:
  - `style.css:306` `.topbar { position: sticky; top:0; z-index:500 }` — 状態Bのヘッダー(戻る/タイトル/固定データバッジ)
  - `style.css:702` `.passivebox { position: fixed; bottom:0 }` — `?demo=passive` 専用の黒い目視ボックス
  - `style.css:745` `.lightbox { position: fixed; inset:0; z-index:20000 }` — R66 のライトボックス。`opacity:0` が既定なので普段は見えないが、印刷時にどうなるかは**未確認**
- `.feedmap`(`style.css:353`)は `height:180px`(密集時は `.feedmap--tall` で220px)の Leaflet 小地図。
  タイル画像は印刷時に読めない/真っ黒になりうる。`index.html:60` の `<div id="feed-map" class="feedmap">`。
- **`.feed`(`style.css:384`)は既に `display:flex; flex-direction:column` の1カラム**。
  → 依頼文の「カード1カラム」は**既に満たされており、印刷用に列数を変える改修は不要**。この事実を NIGHTLOG に残すこと。
- カード内: `.feedcard__summary`(`style.css:471`)は `-webkit-line-clamp: 2` で2行に切っている。
  紙では全文が読める方が有用だが、**今回は触らない**(行数が増えるとページ数が読めなくなるため。理由を NIGHTLOG に残す)。
- `.feedcard__link::after`(`style.css:514`)はタップ領域44pxの透明な当たり判定。印刷では見えないので触らない。
- `.feedmap .leaflet-control-attribution`(`style.css:356`)のコメントに
  「**OSM利用規約上の必須表示。非表示化はしない**」とある。→ **地図本体を消すなら帰属表示も一緒に消える**のは規約上問題ない
  (地図が出ていないのだから)。逆に**地図を残すなら帰属表示も必ず残すこと**。
- 状態Aのマークアップは `index.html:40-51`(検索欄・`.chips`・`.samples`・`#map`)。印刷対象は状態Bのみで、
  状態Aは `hidden` のため印刷にも出ない(未確認: `hidden` 要素が印刷に出ないのは標準挙動だが、実装時に印刷プレビューで確認すること)。
- `scripts/check-all.mjs` は **27本**(`check-*.mjs` 26本 + `docs/check.mjs`)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` — **唯一の変更対象**
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(完了マーク)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行追記)

## 実装方針
1. **先に現状を撮る**(これ自体が成果)。Playwright で `page.emulateMedia({ media: 'print' })` を使い、
   `?fixture=kusatsu` の状態Bを印刷メディアで desktop 幅(1280)スクリーンショット。
   ついでに `page.pdf({ format: 'A4' })` で PDF も1本出して `screenshots/` に置き、崩れを目視する。
2. 崩れていれば `assets/style.css` の**末尾(790行の後)**に `@media print { ... }` を**1ブロックだけ**追記する。
   中身は最小限に:
   - `.feedmap, .feedmap--tall { display: none !important; }` — 地図はタイルが紙で読めないため消す(判断の根拠を NIGHTLOG に)
   - `.topbar { position: static; }` — sticky を解除(z-index/背景はそのまま)
   - `.topbar__back { display: none; }` — 紙で押せないボタンを消す
   - `.lightbox, .passivebox { display: none !important; }` — 暗幕とデバッグ箱を紙に出さない
   - `.feedcard { break-inside: avoid; page-break-inside: avoid; }` — カードがページ境界で割れないように
   - `.feedcard__link { border-color: #999; color: #333; }` — チップの枠線を薄く
   - **背景色の強制印刷はしない**(`print-color-adjust: exact` を書かない)
3. **`@media print` ブロックの外は1行も変更しない**。画面表示用のCSSに触れていないことを
   `git diff assets/style.css` で確認し、差分が `@media print { ... }` の追加のみであることを目視する。

## 完了条件
- [ ] 印刷メディアでの現状スクリーンショット(変更前)と変更後の2枚が `screenshots/` にある
- [ ] 「地図を消すか残すか」の判断と理由が NIGHTLOG に1行以上ある
- [ ] `.feed` が既に1カラムだった事実が NIGHTLOG に残っている
- [ ] `git diff assets/style.css` の差分が `@media print` ブロックの追加のみ
- [ ] `node scripts/check-all.mjs` が **27本全緑**

## 検証手順
```
# 通常表示のデグレ確認(画面用CSSを壊していないこと)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu"

# 印刷メディアの撮影は Playwright の emulateMedia({media:'print'}) を使う使い捨てスクリプトで
#   撮影URL: http://127.0.0.1:3000/?fixture=kusatsu  幅1280(desktop)と375(mobile)
#   ついでに page.pdf({format:'A4'}) も screenshots/ に保存して目視

# 必須
node scripts/check-all.mjs   # 27本全緑
```
撮影した画像は必ず **Read で開いて目視**し、文字の重なり・はみ出し・真っ黒な矩形が無いことを確認する。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**
- rank の重み・閾値は**変更不可**
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは **0回**(fixture のみ)
- `@media print` ブロックの外側のCSSは1行も変更しない
- `.feedcard__summary` の `-webkit-line-clamp: 2` は今回触らない
- 既存 `scripts/check-*.mjs` の検査内容は減らさない

## 終わったら
1. `docs/ROADMAP.md` の R97 行を `- [x] 2026-09-16 R97 …` に更新
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の**末尾**に3行追記
   (やったこと / 見た目の確認結果 / 次)。**ファイル先頭に新しい節を作らない**
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
