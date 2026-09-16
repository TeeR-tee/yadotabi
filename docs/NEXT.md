# NEXT — R112 `?bg=` の暗色指定で読めなくなる組み合わせを防ぐ

- **タスクID**: R112
- **難易度**: sonnet
- **所要目安**: 25〜35分
- **選定理由**: 残る候補(R92/R102/R103/R111/R112/R113)のうち、実ユーザー(=営業先の宿サイト訪問者)の画面が実際に壊れるのは R112 だけ。R111 は検査の追加のみで表示は1px も変わらず、R113 は無料APIのマナー(内部事情)。R92/R102 はローカルのディスク整理。

## 目的
`?embed=1&bg=<暗色>` を指定した埋め込みで、地色だけが暗くなり文字色トークンは据え置きのため、ページ背景の上に直接乗っている淡色テキストが読めなくなる。`?hotel=` の範囲外座標を黙って無視する R99 と同じ方針で、**輝度が低すぎる指定は黙って無視して既定の地色に戻す**。

## 実測で判明した前提(このサイクルで grep/Read して確認した事実)
1. `assets/app.js:1429 bgFromUrl(params)` は書式のみ検証。`app.js:1433` が `/^[0-9a-fA-F]{6}$/`、`app.js:1434` が `return '#' + hex;`。**輝度・コントラストの検査は1行も無い**。
2. `assets/app.js:1438 setEmbed(on, bg)` が `app.js:1442` で `document.documentElement.style.setProperty('--c-bg', bg)` を実行。解除は `app.js:1444` の `removeProperty`。呼び出し元は `app.js:1557` と `app.js:1950` の2箇所(どちらも `bgFromUrl(params)` を渡すだけなので、**`bgFromUrl` を直せば両方に効く**)。
3. **ROADMAP 本文の「黒地に黒文字になり、カードの本文が完全に読めなくなる」は誇張だった(要訂正)**。実測では `assets/style.css:9` の `body { background: var(--c-bg) }` と `style.css:635` の `body.is-embed { background: var(--c-bg) }` が地色を使う一方、**カードは `--c-surface`(`assets/tokens.css:25` = `#ffffff`)で塗られており地色の影響を受けない**(`.feedcard` 系 = `style.css:402` `.feedcard__media` 等、`.morebtn` = `style.css:662` も `--c-surface`)。よってカード本文(`--c-text` = `tokens.css:29` `#1a1a23`)は白カードの上のままで読める。
4. **本当に被害が出るのは、地色の上に直接乗っている淡色テキスト**。実測で該当するのは以下:
   - `.feednote`(`assets/style.css:721-726`、色は `--c-text-faint` = `tokens.css:31` `#9494a3`)= R47 で足した「この提案の作り方」の注記。`assets/app.js:1033` が生成。
   - `.morenote`(`assets/style.css:684-690`、同じく `--c-text-faint`)= R60 の「31番以降は地図に表示していません」。`app.js:1007` が生成。
   - 参考コントラスト比: `#9494a3` 対 既定地色 `#f7f7f9` = 約 2.9:1(元々低め)。対 `#000000` では約 5.9:1 と数値上は上がるが、**淡色グレーが黒地に浮く見え方は設計意図と別物**であり、カード(白)との明暗差が極端になって画面全体がちらつく。撮影で必ず確認すること。
   - **未確認**: 実際にどの程度読みづらいかは撮影していない。手順(1)で必ず自分の目で確かめること。
5. `scripts/check-embedbg.mjs` が既に存在し(R68)、`check-embedbg.mjs:87-117` で有効値 `bg=fff7e6`・`%23fff7e6`・無効値・embed なし・`--c-bg` の空文字を検査済み。**新規ファイルは作らずこの本に足す**(`check-all.mjs` の本数 28 は変わらない)。
6. `scripts/check-all.mjs:14-41` の配列は check-*.mjs 27本 + `docs/check.mjs` = **28本**。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(`bgFromUrl` のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-embedbg.mjs`(ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針
1. **先に撮る**。`node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu&embed=1&bg=000000" --mobile` など3色(`000000` / `333333` / `fff7e6`)を撮り、`.feednote` / `.morenote` の読めなさを目視して NIGHTLOG に一言残す。
2. `assets/app.js:1433` の書式検査の**直後**に相対輝度の判定を足す(数行)。
   - `hex` を2桁ずつ `parseInt(.., 16) / 255` で R,G,B に分解。
   - sRGB ガンマ補正: `c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)`。
   - `L = 0.2126*R + 0.7152*G + 0.0722*B`。
   - **`L < BG_MIN_LUMINANCE` なら `return null;`**(= `?bg=` 未指定と同じ既定地色。既存の無効値経路にそのまま乗る)。
   - 閾値は `0.5` を初期値とし、手順(1)の撮り比べで調整してよい。**採用した数値と理由を NIGHTLOG に必ず残す**。`#fff7e6`(L≈0.93)と `#f7f7f9`(既定)は必ず通り、`#000000`(L=0)と `#333333`(L≈0.033)は必ず弾かれること。
   - 定数は `bgFromUrl` の直前にモジュールスコープで `var BG_MIN_LUMINANCE = 0.5;` として置き、なぜ弾くのかの1行コメントを添える。
3. `app.js:1428` の JSDoc コメントを「3桁/7桁/色名/CSS混入**および暗すぎる色**は黙って無視して null を返す」に更新。
4. `scripts/check-embedbg.mjs` の無効値ケース(`check-embedbg.mjs:102-106` 付近の配列)に暗色を足すか、同形の新ケース節を1つ足す。最低限:
   - `bg=000000` → `bodyBg === DEFAULT_BG` かつ `cssVar === ''`
   - `bg=333333` → 同上
   - `bg=fff7e6` が従来どおり**通る**ことの既存ケースが壊れていないこと
5. **文字色を暗色対応させる案は採らない**(トークン全体の設計判断が要るため朝の相談向き)。`assets/tokens.css` と `assets/style.css` は1行も変更しない。

## 完了条件
- `?embed=1&bg=000000` / `&bg=333333` が既定地色にフォールバックし、`--c-bg` のインラインスタイルが空であること。
- `?embed=1&bg=fff7e6` は従来どおり適用され、`demo/hotel-page.html:215` の iframe(`bg=fff7e6`)の見た目が変わらないこと。
- `git diff --stat -- assets/style.css assets/tokens.css assets/engine.js assets/geo.js fixtures demo index.html` が**空**。
- `node scripts/check-all.mjs` が **28本全緑**。

## 検証手順
1. `node --check assets/app.js`
2. 撮影(ローカルサーバ `http://127.0.0.1:3000/index.html`、外部API 0回)— 各URLを `--mobile`(375幅)と PC幅(1280)で撮り、**画像を Read で開いて目視**:
   - `?fixture=kusatsu&embed=1&bg=000000`(修正前・修正後の両方)
   - `?fixture=kusatsu&embed=1&bg=333333`
   - `?fixture=kusatsu&embed=1&bg=fff7e6`(デグレ確認)
   - `?fixture=kusatsu`(通常表示のデグレ確認、mobile 1枚)
3. `node scripts/check-embedbg.mjs`(追加ケース込みで全 pass)
4. `node scripts/check-all.mjs` → **28本全緑を必須**

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/` は**変更不可**。
- rank の重み・閾値は**変更不可**。
- `assets/style.css` / `assets/tokens.css` の既定トークンは変更しない。
- `git stash` / `git reset` / `git checkout` によるファイルの巻き戻しは**禁止**。
- **外部API 0回**(Overpass / Nominatim / Wikipedia を叩かない。撮影は全て `?fixture=` で行う)。
- `check-all.mjs` の既存 check 本の検査項目を減らさない。

## 終わったら
1. `docs/ROADMAP.md` の R112 行を `- [x] 2026-09-16 R112 ...` に更新し、**前提3(「黒地に黒文字でカード本文が読めない」は誇張。実害は `.feednote` / `.morenote`)を本文に訂正追記**する。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記(やったこと / 見た目の確認結果 / 次)。先頭に新しい節を作らないこと。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
