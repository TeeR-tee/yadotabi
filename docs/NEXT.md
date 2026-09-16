# NEXT: R60 +（おまけ）R55 の記録

- **タスクID**: R60（主）+ R55（記録のみ）
- **難易度**: sonnet
- **所要目安**: 25〜35分（実装10分 / 検査追加10分 / 撮影・目視10分）

## 選定理由（1行）
R14/R19/R40 は fixture 再生成（Overpass を叩く）が絡み夜間に回すには重いので、外部API 0回で完結し実害（押しても光るピンが無い番号バッジ）を消せる R60 を選び、調査で「表はもう出ている」と分かった R55 を記録だけ同梱する。

---

## R60: 「もっと見る」展開後、31番以降は地図にピンが無いことを明記する

### 現状（実物を読んだ結果）
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
  - `moreHtml(more, open)` — **847〜851行**。`open` が真ならボタンを出さず **空文字を返すだけ**。展開後この領域は空になる。
  - `renderFeed()` の展開部分 — **938〜941行**。`state.moreOpen` が真のとき `state.more` を `cardHtml(c, i + state.cards.length)` で連結する（＝番号は 31 以降）。
  - `renderFeed()` の more 反映 — **950〜955行**。`els.feedMore.hidden = !more; els.feedMore.innerHTML = more;`
  - クリックハンドラ — **1679〜1681行**（`#more-btn`）。
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` — **66行** `<div id="feed-more" hidden></div>`、**70行** `<div id="feed-note" hidden></div>`。
- 小地図のピンは `renderFeedMap()` が `state.cards`（＝30件）のみを描くため、31番以降に対応するピンは存在しない。

### 実装方針（注記で済ませる。ピンは足さない）
ROADMAP の判断どおり**ピンは追加しない**（`nudgeOverlaps` の負荷と重なりが倍近くになり、R8 で作り込んだ分離が壊れるリスクが実利を上回るため）。

1. `moreHtml(more, open)`（app.js:847）を、`open` が真のときに**空文字ではなく注記1行を返す**よう変更する。
   - 例: `if (open) return '<p class="morenote">31番以降は地図に表示していません。</p>';`
   - 番号の 31 は直書きせず `state.cards.length + 1` 相当を使えるよう、必要なら `moreHtml(more, open, startNo)` の第3引数を足して `renderFeed()`（app.js:951）から `state.cards.length + 1` を渡す。カードが30枚未満のエリアでも数字が嘘にならないようにすること。
   - `more.length === 0` のときは従来どおり空文字（先頭の `if (!more.length) return '';` は維持）。
2. `renderFeed()` 側（app.js:950〜955）は**既存のまま**で動く（`more` が空文字でなくなるので `hidden` が外れ `#feed-more` に入る）。展開ボタンと同じ場所＝展開領域の直前に出るので、ROADMAP の「展開領域の先頭」の意図を満たす。
3. `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` に `.morenote` を追加。`.feednote`（657行付近）と同じ淡色・小さめの文字で、`.morebtn`（599行）の余白感を踏襲する。新規色トークンは作らず既存変数を使う。
4. 番号バッジのタップ対象から31以降を外す案は**採らない**（R10 のフラッシュ導線は `state.cards` のピンにしか当たらず既に無反応のため、挙動変更なしで注記だけ足す方が影響が小さい）。

### 対象ファイル（絶対パス・これ以外は触らない）
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-more.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`（記録）

### 変更禁止範囲
- `assets\engine.js`、`assets\geo.js`、`fixtures\*.json`、`app.js` の `nudgeOverlaps()`（R8 の密集分離）。
- rank の重み・閾値、`renderFeedMap()` のピン生成ロジック（ピンは足さない）。

---

## R55: check-all.mjs の所要時間（記録のみ・コード変更なし）

`C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` を読んだ結果、**各本の所要msの表（49〜54行）と、合計・最遅の要約行（60〜63行）は既に実装済み**。よって ROADMAP の「既に出ているなら合計と最遅の記録を NIGHTLOG に残すだけ」に該当する。

- やること: 今サイクルの `node scripts/check-all.mjs` の出力から、**合計秒数・最遅の本・遅い上位3本**を NIGHTLOG に1行で書き残す。
- `--only` 引数や `PLAYWRIGHT_*` の追加は**今回やらない**（最適化は測ってから、という R55 本文の方針どおり。数字が残れば R55 は完了扱いでよい）。

---

## 完了条件（検証可能）
1. `scripts\check-more.mjs` に注記のケースを追加し、全 PASS。
   - 展開前: `#feed-more` 内に `.morenote` が**存在しない**（`#more-btn` のみ）。
   - `#more-btn` クリック後: `.morenote` が1つ存在し、`textContent` に「31」と「地図」を含む。
   - 展開後も `#more-btn` が消えていること（既存ケース4を維持）。
   - コンソールエラー0件（既存ケース5を維持）。
2. `node scripts\check-all.mjs` が **20本全PASS・exit 0**。
3. `node --check assets\app.js` が通る。
4. NIGHTLOG に check-all の合計秒数・最遅・遅い上位3本が記録されている（R55）。

## 検証手順（撮影・外部API 0回）
1. `node scripts\check-all.mjs`（出力の表を控える＝R55の材料）。
2. 撮影: `?fixture=kusatsu` を mobile で開き、**「もっと見る」を押した後**のフルページを1枚（`2026-09-16_r60-expanded_mobile.png` 等）。
   - Playwright でクリックしてから撮る必要があるので、`check-more.mjs` 内で `page.screenshot({ fullPage: true })` を1枚保存する形でも可。
3. 画像を Read で目視し、(a) 注記が30枚目のカードと31枚目のカードの間に1行で収まっている、(b) 文字のはみ出し・折り返し崩れが無い、(c) カード枚数が増えている、を確認。
4. デグレ確認として `?fixture=kusatsu`（展開前）mobile を1枚。注記が出ていないこと。
5. `?fixture=kusatsu&embed=1` でも位置が崩れないことを1枚で確認（埋め込みでも小地図は出るので注記は出す判断でよい）。

## 記録
- ROADMAP の R60・R55 を `[x] 2026-09-16` に。
- NIGHTLOG に3行（やったこと / 見た目の確認結果 / 次）＋ R55 の数字。
- コミット→push（先にコミット、報告は簡潔に）。
