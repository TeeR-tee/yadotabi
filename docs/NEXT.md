# NEXT: R54 状態Bのカードに「宿から◯km」の距離表記を足す

判断理由: R14/R19/R40 は Overpass を叩く再生成が前提でリスクが高く、R55 は計測のみで見た目の成果が出ない。R54 は `Card.distanceM` が既にある**表示だけ**の変更で、コスト0円・ユーザー入力ゼロ・撮影で検証可能。

難易度: sonnet / 所要目安: 25〜40分

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(**主**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(必要なら nowrap 周りのみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-more.mjs` または新規 `scripts\check-distance.mjs`(検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(新規検査を足す場合のみ1行追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 現状(調査済み・そのまま使ってよい)
- 分数表記の実物は `assets/app.js:785-786`(`feedCardHtml()` 内、`.feedcard__meta` の2番目の span):
  ```
  '<span class="feedcard__times">🚶徒歩' + escapeHtml(String(card.walkMin)) + '分 · 🚗車' +
    escapeHtml(String(card.driveMin)) + '分</span>' +
  ```
- `Card.distanceM` は `assets/engine.js:824-835` の `toCard()` で **メートル整数(Math.round 済み)** として既に付与されている。`engine.js` は**読むだけ・変更禁止**。
- CSS は `assets/style.css:409` の `.feedcard__times { font-weight: 600; white-space: nowrap; }`。この nowrap は維持する。
- 親の `.feedcard__meta`(`style.css:400`)は `display:flex; flex-wrap:wrap` なので、カテゴリ span と times span は幅が足りなければ**2行に折り返す**。ここでの「1行に収まる」の判定対象は **times span 単体が1行であること**(nowrap なので途中で折れないが、長すぎるとカード幅をはみ出す恐れがある)。

## 実装方針
1. `assets/app.js` の `feedCardHtml()` の直前あたりに純粋関数を1つ足す:
   - `function distanceText(m)` — `isFinite(m) && m >= 0` でなければ `''` を返す。
   - `m < 1000` → `Math.round(m) + 'm'`(例 `850m`)。
   - `m >= 1000` → `(m/1000)` を**小数第1位**で丸めて `'km'`(例 `1.2km`)。`.0` になる場合は整数表記(`2km`)にする。
2. `app.js:785-786` の times span の末尾に ` · ` + 距離を足す。最終形は `🚶徒歩12分 · 🚗車3分 · 1.2km`。
   - `distanceText()` が空文字なら距離部分ごと出さない(` · ` も付けない)。
3. 撮影で 375px にはみ出す場合の調整は**順序のみ**で行う。距離を先頭にする(`1.2km · 🚶徒歩12分 · 🚗車3分`)、または `🚶`/`🚗` の絵文字を落とす案を撮り比べる。**徒歩・車のどちらかを省く判断はしない**(みのるんの判断が要るので NIGHTLOG の「朝の相談」へ)。
4. `.far__time`(`app.js:819`)は今回**触らない**。

## 変更禁止範囲
- `assets/engine.js`(rank の重み・閾値・`distanceM` の計算)
- `assets/geo.js`
- `fixtures/*.json`
- SNS リンクチップのラベル文字列(`check-passive.mjs:94` が `Instagram` に依存)
- `.feedcard__link::after { height:44px }`(R13 のタップ領域)

## 完了条件(検証可能)
1. `scripts/check-distance.mjs`(新規、`check-more.mjs` の作りを踏襲)または `check-more.mjs` への追記で、`?fixture=kusatsu` を開き:
   - 全 `.feedcard__times` のテキストが `/^🚶徒歩\d+分 · 🚗車\d+分 · (\d+m|\d+(\.\d)?km)$/`(順序を変えた場合はそれに合わせた正規表現)に一致する。
   - **m/km の切替**を両方カバーする: 1000m 未満のカードが `m` 表記、1000m 以上のカードが `km` 表記であることを最低1件ずつ確認する(kusatsu は近距離、hakone は遠距離が混ざるので両エリアを見る)。
   - 375px で全 `.feedcard__times` の `scrollWidth <= clientWidth`(はみ出しなし)を実測する。
2. `node scripts/check-all.mjs` が **全本 PASS**(新規検査を足した場合は本数が1増える)。
3. `node scripts/check-a11y.mjs` 全件 OK(タップ領域 44px 維持)。
4. `node --check assets/app.js` が OK。
5. `node scripts/dump-rank.mjs kusatsu` と `hakone` が変更前後で**差分ゼロ**(engine 無変更の証明)。
6. `git diff --stat -- assets/engine.js assets/geo.js fixtures` が**空**。

## 検証手順(撮影)
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile`
- 上2枚を **Read で目視**し、(a) 距離が出ている (b) times span がカード右端をはみ出していない (c) カテゴリ span と重なっていない (d) 文字崩れなし、を確認する。
- 余力があれば `?fixture=dogo` と `?fixture=kusatsu&embed=1` も撮ってデグレなしを確認する。
- 外部APIは一切叩かない(全て fixture)。

## 記録
- `docs/ROADMAP.md` の R54 を `[x] 2026-09-16` に。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)。**順序調整が必要だった場合はその理由を必ず残す**。
- コミット → `git push`。
