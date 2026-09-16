# NEXT — R111 カードの外部リンクが新しいタブで開くことの機械検査を新設

- **タスクID**: R111
- **難易度**: sonnet(新規 check スクリプト1本。アプリ本体は読むだけ)
- **所要目安**: 25〜40分(うち `check-all.mjs` 全緑確認に約4分)

## 目的
`target="_blank" rel="noopener"` は**埋め込み(`?embed=1`)用途の前提条件そのもの**。
iframe の中で同一タブ遷移が起きると、宿の予約ページごとやどたびに乗っ取られたように見える。
にもかかわらず、この属性を見ている検査が**1本も無い**ため、将来 `feedCardHtml()` 系を
書き換えて属性が1箇所だけ落ちても誰も気づけない。検査を1本足して腐りを止める。

## 実測で判明した前提(2026-09-16 計画役が grep/Read で確認)
1. `grep -rn "_blank\|noopener" scripts/` は **0件**(ヒットなし)。ROADMAP の記述どおり。
2. `assets/app.js` 側の `target="_blank" rel="noopener"` は **4箇所**。
   ROADMAP 本文の行番号(830/995/1018/1035)は**古い**ので、実測値に訂正する:
   - `app.js:839` — `linkRowHtml()`(`app.js:821` 開始)内。カードのリンクチップ
     `<a class="feedcard__link" ...>`。**今回の検査の主対象**。
   - `app.js:1004` — 提案0件カードの「Googleマップで周辺を見る」ボタン(`.btn--secondary`)。
   - `app.js:1027` — `farHtml()`(`app.js:1021`)内「もっと遠く」リストの各リンク。
   - `app.js:1044` — `noteHtml()`(`app.js:1041`)内の「くわしい仕組み」リンク(`.feednote a`)。
3. `linkRowHtml()`(`app.js:821-843`)のチップは**最大5本**で、`safeUrl()`(`app.js:252`)が
   null を返した種類は行ごと省かれる: `行き方`(gmap) / `公式`(official) / `Instagram` /
   `TikTok` / `YouTube`。**`公式` はスポットに website タグがあるときだけ出る**ため、
   30枚 × 5本 = 150本ちょうどにはならない。
   → **未確認**: 実際の本数は測っていない。実装時に `?fixture=kusatsu` で
   `document.querySelectorAll('.feedcard__link').length` を数え、
   その実数を NIGHTLOG の記録に書くこと(検査のアサーションは
   「**0本ではない**かつ**全件が条件を満たす**」にして、固定値でハードコードしない)。
4. `scripts/check-all.mjs:13-41` の `SCRIPTS` 配列は現在 **27本 + `docs/check.mjs` = 28本**。
   `scripts/check-all.mjs:2` のコメントも「27本 + docs/check.mjs の計28本」。
   → 追加すると **28本 + docs/check.mjs = 29本** になる。
5. 最新スクリーンショット `2026-09-16T19-51-29_r66-regression-kusatsu_mobile.png` を目視。
   カード1位「光泉寺」にチップ5本(行き方/公式/Instagram/TikTok/YouTube)が1行に収まっており、
   崩れ・はみ出し無し。**今回の変更で画面は1ピクセルも変えないので、この見た目が維持されること**が
   デグレ確認の基準。

## 対象ファイル(絶対パス)
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-links-target.mjs`
- 編集: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(`SCRIPTS` 配列に1行 + 冒頭コメントの本数)
- 編集: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(表に1行 + 本数表記)
- **読むだけ(編集禁止)**: `assets/app.js`

## 実装方針
1. `scripts/check-debugflag.mjs` を**雛形としてコピー**して作る。
   - Playwright の import は絶対パス
     `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs`(同ファイル20行目と同一)。
   - ポート3000に `python -m http.server` を自前で立てて `finally` で落とす作り(同 46-66行)を踏襲。
   - `ok(cond, label, extra)` ヘルパ(同 30-34行)と末尾の `pass / fail` 出力もそのまま流用。
2. 検査ケース(全て `?fixture=` 経由なので**外部API 0回**):
   - **ケース1** `?fixture=kusatsu`(375x812): `.feedcard__link` を `count()` して
     - `count > 0`(0本なら検査が空振りしているので FAIL)
     - 全件の `getAttribute('target') === '_blank'`
     - 全件の `getAttribute('rel')` が `noopener` を**トークンとして**含む
       (`rel.split(/\s+/).includes('noopener')`。部分文字列一致にしない)
     - 失敗時は `extra` に「何本中何本が違反したか + 違反した最初の href」を出す
   - **ケース2** `?fixture=kusatsu&embed=1`(375x812): ケース1と同じ3点を再確認。
     埋め込みこそ本丸なのでここは必ず見る。
   - **ケース3**(任意・余力があれば) 「もっと見る」(`#more-btn`、`app.js:1018`)を押して
     31件目以降を展開し、展開後の `.feedcard__link` も全件同条件であること。
     `moreHtml()` の分岐を通った後でも属性が落ちないことの確認。
   - 各ケースで `waitFor(2500)` 相当の待ちを入れる(雛形と同じ)。
3. `rel` に `noreferrer` を足すかは**判断が要るので今回は足さない**。
   検査も `noopener` の有無だけを見る(`noreferrer` の有無は問わない)。
4. `scripts/check-all.mjs` の `SCRIPTS` 配列に `'scripts/check-links-target.mjs'` を
   **アルファベット順の位置**(`check-keyboard.mjs` と `check-lightbox.mjs` の間)に1行足す。
   `scripts/check-all.mjs:2` のコメントを「27本」→「28本」、「計28本」→「計29本」に直す。
5. `docs/CHECKS.md` に1行追加し、本数表記(28→29 等)を `grep` で全箇所そろえる。

## 完了条件
- [ ] `scripts/check-links-target.mjs` が単体で全 PASS / 0 fail
- [ ] `.feedcard__link` の実本数を測り、NIGHTLOG に数字として記録した
- [ ] `node scripts/check-all.mjs` が **29本全緑**(28本 + 新1本。1本でも赤なら未完了)
- [ ] `git diff --stat -- assets index.html fixtures demo` が**空**(アプリ本体・固定データ無変更)
- [ ] `docs/CHECKS.md` の表の行数と本数表記が実体と一致

## 検証手順
```
node --check scripts/check-links-target.mjs
node scripts/check-links-target.mjs
node scripts/check-all.mjs          # ← 29本全緑が必須
git diff --stat -- assets index.html fixtures demo   # 空であること
```
撮影(デグレ確認のみ・外部API 0回):
```
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
```
(幅 375px。撮った画像を必ず Read で開いて目視し、上記スクリーンショットと同じく
チップ5本が1行に収まり崩れが無いことを確認する。画面は変わらないはずなので、
変わっていたら `app.js` を触ってしまっている。)

## 変更禁止範囲
- `assets/engine.js` の rank の**重み・閾値**は変更不可(読むのは可)
- `assets/geo.js` と `fixtures/*.json` は変更不可
- `assets/app.js` は**読むだけ**。1行も編集しない(この検査は現状を正とする)
- 既存 `scripts/check-*.mjs` の**検査内容を減らさない**
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- **外部API 0回**(Overpass / Nominatim / Wikipedia を1回も叩かない。全て `?fixture=` 経由)

## 終わったら
1. `docs/ROADMAP.md` の R111 の行を `- [x] 2026-09-16 R111 ...` に変える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記
   (やったこと / 見た目の確認結果 / 次)。ファイル先頭に新しい節を作らない
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
