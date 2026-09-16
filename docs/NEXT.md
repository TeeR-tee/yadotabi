# NEXT: R66 カードの写真タップで大きく表示(簡易ライトボックス)

判断理由: 残る未完了(R14/R19/R40 は fixture 再生成で Overpass を叩く、R64 は GitHub Actions の課金確認=みのるんの判断が要る)の中で、R66 だけが外部API0回・ユーザー判断ゼロ・閲覧のみで完結し、R62(縦長写真の見切れ)で「切り抜かれて全体が見えない」と確認済みの課題に直接答えられるため。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`(overlay の器を1つ置く場合のみ。JS で生成しても可)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-lightbox.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(登録1行追加。24本になる)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`(タップ領域対象に閉じるボタンを足す場合のみ)
- `docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針(実物を読んだうえでの指示)

### 1. どこにフックするか — `els.feedList` の click 委譲(app.js:1694〜1748)
既存のクリック委譲は上から順に **(a) `.feedcard__no` バッジ(1696〜1713)→ (b) `a`(1715〜1733)→ (c) カード全体(1734〜1748、`feedMap.panTo`)** の3段。
画像タップの分岐は **(a) の直後・(b) の前**に挿入する。理由: 画像は `<a>` の中に無いので (b) には当たらないが、(c) の「カード全体タップで地図を pan」に吸われてしまうため、それより先に捕まえて `return` する必要がある。

```
var img = e.target.closest('.feedcard__img');
if (img) { openLightbox(img); return; }   // ← ここ。(a) の return の直後に置く
```

- `.feedcard__no`(番号バッジ)は `.feedcard__media` の中にあるが **(a) が先に return する**ので従来どおり。`.feedcard__link`(リンクチップ)は `.feedcard__body` 側なので無関係。どちらも壊れない。
- **プレースホルダ(`.feedcard__ph`、写真が無いカード)は対象外**。`.feedcard__img` にだけ当てること。
- 受動ログ: 画像タップでは **`passivePush` を呼ばない**。理由は (c) が現在記録している `tap` は「カードをタップ→地図が動いた」という意味の経路で、画像タップはそこに到達しなくなるため、同じ `tap` を流すとログの意味が変わってしまう。**新しい type も足さない**(`check-passive.mjs` が既存の形を検査しているため、今回は記録なしで確定)。この判断を NIGHTLOG に1行残すこと。

### 2. 表示する画像
`cardHtml()`(app.js:827〜865)が組む `<img class="feedcard__img" src=...>` の **src をそのまま使う**。Wikipedia サムネイル(480px 相当)なので**拡大しても解像度は上がらない**。したがって overlay 側は `max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;` で**中央に原寸以下で置くだけ**にし、無理に引き伸ばさない。この「元画像が480pxなので大きくは映らない」旨を NIGHTLOG に注記すること(仕様であってバグではない)。
`alt` は元の img の `alt`(R57 で「<スポット名>の写真」が入っている)をコピーする。

### 3. 閉じ方 — history は使わない
**`history.pushState` / `popstate` には一切触らない**。R58(状態B→戻るで状態A)が `popstate` を使っており、ライトボックスが履歴を積むと「戻る」の意味が二重になって R58 の `check-history.mjs` が壊れる。
閉じるのは次の2経路のみ:
- overlay のどこをタップしても閉じる(画像自身のタップでも閉じてよい)
- `Escape` キー(`document` に keydown を1つ足す。既存の Escape ハンドラは app.js:1631 の `els.searchInput` 上のもので、検索欄限定なので衝突しない)

視認性のため右上に `×` の閉じるボタンを置くのは可(置くなら44px確保し `check-a11y.mjs` の対象に足す)。

### 4. 背面のスクロール固定
overlay 表示中は `document.body` に `.is-lightbox` を付け、CSS で `overflow: hidden` にする。閉じたら必ず外す。
iOS の慣性スクロール対策で `position: fixed` まではやらない(スクロール位置が飛ぶ副作用の方が大きい)。`overflow: hidden` で止まることを撮影で確認する。

### 5. embed と reduced-motion
- `?embed=1` でも動かす。埋め込みは iframe 内なので overlay は iframe の内側に収まる。**R48 の `postHeightToParent()` は呼ばない**(overlay は `position: fixed` で body の高さを変えないため、親への高さ通知は不要かつ余計な postMessage になる)。
- フェードイン(0.15s 程度)を付けてよいが、`@media (prefers-reduced-motion: reduce)`(style.css:270 / 514 / 654 にある既存ブロックのいずれかに追記するか新規ブロック)で `transition: none; animation: none;` にする。

### 6. z-index
Leaflet の地図コントロール(小地図)より確実に上に来る値にすること。overlay は `position: fixed; inset: 0;`。

## 完了条件(すべて検証可能)
1. `?fixture=kusatsu` で1位カードの写真をクリック → overlay が表示され、その中に `img` が1枚ある
2. overlay をクリック → overlay が消える(`hidden` か DOM から除去)
3. overlay 表示中に `Escape` → 消える
4. **番号バッジ(`.feedcard__no`)のクリックで overlay が出ない**、かつ従来どおりピンが光る(`check-pinflash.mjs` が緑のまま)
5. **リンクチップ(`.feedcard__link`)のクリックで overlay が出ない**、かつ `passive` の `link` 記録が従来どおり(`check-passive.mjs` 緑)
6. 写真が無いカード(`.feedcard__ph`)のクリックでは overlay が出ず、従来どおり地図が pan する
7. overlay 表示中は `document.body` の `overflow` が `hidden`、閉じた後は元に戻る
8. `?fixture=kusatsu&embed=1` でも 1〜3 が成立する
9. `node --check assets/app.js` 通過
10. `node scripts/check-all.mjs` が **24本全緑**(新規 `check-lightbox.mjs` を登録)

## 検証手順
- `node scripts/check-lightbox.mjs` を新規作成。既存の `scripts/check-pinflash.mjs` の作り(ポート3000に自前サーバ→Playwright)をそのまま踏襲する。上の完了条件1〜8を項目化する。
- **`check-lightbox.mjs` の中で、overlay 表示中の mobile(375px)スクリーンショットを `screenshots/r66-lightbox-mobile.png` に保存する**(Playwright の `page.screenshot`)。あわせて desktop も1枚。
- 保存した2枚を **Read で開いて目視**し、暗幕が全面を覆っているか・画像が中央にあるか・背面のカードが透けすぎていないか・閉じるボタンが端で切れていないかを確認する。
- デグレ確認として `?fixture=kusatsu` mobile を1枚撮り、カード30枚・番号ピン判読可・コンソールエラー0件を確認。
- 撮影はすべて fixture、**外部API 0回**。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js`(rank・収集ロジック一切)
- `fixtures/*.json`
- `history.pushState` / `popstate` まわり(R58)
- 既存 `scripts/check-*.mjs` の**中身**(`check-all.mjs` への1行登録と、`check-a11y.mjs` への対象セレクタ追加のみ可)
- リンクチップのラベル文字列(`check-passive.mjs:94` が `Instagram` に依存)

## 難易度・所要目安
- sonnet
- 目安 25〜40分(実装15分・check-lightbox 作成10分・撮影と目視10分)
