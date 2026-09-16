# NEXT: R83 カード要約が無いときの代替文を正直な1行にする

## なぜこれを選んだか(1行)
計画役が4 fixture を dump-rank で実測したところ上位30件の **3〜6割が要約なし**(dogo 19/30・hakone 14/30・beppu 14/30・kusatsu 11/30)と判明し、想定よりはるかに広く効く表示改善で、engine/rank に触れず判断も要らないため。

## 実測データ(計画役が `node scripts/dump-rank.mjs <area>` で取得済み。作業役は再計測不要)
| エリア | cards 30件中 要約なし | more 30件中 要約なし | far |
|---|---|---|---|
| kusatsu | 11 | 26 | 0件 |
| hakone | 14 | 30 | 10件(全件要約なし) |
| dogo | **19** | 29 | 0件 |
| beppu | 14 | 30 | 0件 |

撮影は最も密度の高い **dogo** で行う(ROADMAP 本文は beppu と書いているが、実測で dogo の方が要約なしが多いので dogo を採る。この差し替え理由を NIGHTLOG に1行残すこと)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — `cardHtml()` の summary 描画
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` — 代替文の淡色クラス追加
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs` — 新規(機械検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` — 上記を登録(25本→26本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` — 記録

## 実装方針(実物を読んだ上での指示)
現状 `assets/app.js:841-843`:

```js
var summary = card.summary
  ? '<p class="feedcard__summary">' + escapeHtml(card.summary) + '</p>'
  : '';
```

この三項の `: ''` を、代替文の `<p>` に差し替えるだけ。`card.summary` は `engine.js:925`(`toCard`)で `truncate(stripCoordPrefix(item.summary), SUMMARY_MAX_CHARS)` の結果が入り、Wikipedia 記事が紐づかない OSM 単独候補では `null`(`engine.js:512` の初期値)のまま来る。**engine.js 側は一切変更しない。**

- 出す文言(事実のみ・推測や謝罪を書かない):
  `Wikipediaに記事がありません。地図と公式サイトで確認してください。`
  - 「公式サイト」はカードによってはリンクチップが無いので、断定を避けたければ `Wikipediaに記事がありません。地図の情報だけで表示しています。` でもよい。**どちらか一方を選び、選んだ理由を NIGHTLOG に1行**。文言は事実のみ・煽らない。
- クラスは新設 `feedcard__summary feedcard__summary--none` の2枚がけにする(既存の `.feedcard__summary` の余白・行高・2行クランプをそのまま継承でき、高さのばらつきが出ない)。
- `style.css` の `.feedcard__summary`(468行付近)の直後に追記:
  ```css
  .feedcard__summary--none { color: var(--c-text-faint); }
  ```
  色は `assets/tokens.css:31` の `--c-text-faint`(#9494a3)。ダークテーマ側(tokens.css:104/139)も定義済みなので追加不要。**font-size は変えない**(既存の `--fs-sm` のまま。小さくすると R13 のコントラスト前提が崩れる)。
- 文言はハードコードでよいが、テストから参照しやすいよう `cardHtml()` の直前にモジュール内定数 `var NO_SUMMARY_TEXT = '…';` を1つ置くこと。

## 完了条件(検証可能)
1. `?fixture=dogo` の上位30枚のうち、要約が無い **19枚**すべてに `.feedcard__summary--none` が付き、テキストが `NO_SUMMARY_TEXT` と一致する。
2. 要約がある 11枚には `--none` が付かない(`.feedcard__summary--none` の件数がちょうど 19)。
3. カードの `<p class="feedcard__summary">` の総数が 30(=要約の有無にかかわらず全カードに1本ある)になり、以前の「行ごと消える」状態が無くなる。
4. `.feedcard__summary--none` の `getComputedStyle().color` が `.feedcard__summary` の既定色と**異なる**(CSS 詳細度の衝突で淡色が効かない事故を防ぐため、classList だけでなく computedStyle まで確認する)。
5. `node scripts/check-all.mjs` が 26本中26本 PASS・exit 0。
6. `node --check assets/app.js` 通過・コンソールエラー0件。

## 検証手順
1. `node scripts/check-nosummary.mjs`(新規)を単体で通す。上の1〜4を Playwright で検査する。既存の `scripts/check-distance.mjs` が同じ「fixture を開いてカード DOM を数える」形なので、そのサーバ起動・ポート3000・finally での kill の型をそのまま真似ること(**既存 check 本の中身は編集しない**)。
2. `scripts/check-all.mjs` の `CHECKS` 配列(14行目以降のアルファベット順の並び)に `'scripts/check-nosummary.mjs'` を `check-nohotels.mjs` の次へ挿入し、冒頭コメントの「24本」「25本」を「25本」「26本」に直す。
3. 撮影(すべて fixture・外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile --full`
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`(デグレ確認)
   撮った画像を **Read で開いて目視**し、(a)代替文が本文より明らかに淡く見えるか (b)1行に収まり2行目に「ください。」だけ落ちていないか (c)カードの高さが要約ありカードと揃い、リンクチップ行が押し下げられて折り返していないか を確認する。崩れていたら同サイクルで直す。
4. `node scripts/check-all.mjs` 全緑を確認 → ROADMAP の R83 を `[x] 2026-09-16` に → NIGHTLOG に3行(やったこと/見た目の確認結果/次)→ コミット → `git push`。

## 変更禁止範囲
- `assets/engine.js`(`toCard`・`truncate`・rank の重み・閾値・除外ルール)
- `assets/geo.js`
- `fixtures/*.json`(再生成しない。Overpass を叩かない)
- 既存 `scripts/check-*.mjs` の中身(新規追加と check-all.mjs への登録のみ可)
- `git stash` / `reset --hard` / `checkout` によるファイル復元操作

## 難易度・所要目安
sonnet / 25〜40分(実装10分・新規 check 本10分・check-all 約4分・撮影と目視10分)。

**実装が終わったらまず先にコミットすること。報告は簡潔に(長文の報告書を書かない)。**
