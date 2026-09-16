# NEXT — R82 + R77(2サイクル分をまとめて1本。どちらも表示と検査だけ)

難易度: **sonnet** / 所要目安: **20〜30分**

## なぜこの2件か(判断理由)
R64 は GitHub Actions の無料枠確認がみのるん判断寄り、R81 は Overpass を1回叩く5エリア目で同僚検証前は4エリアで十分、R85 は営業先が国内予約サイト想定なので優先度が低い。残る R82(1行)と R77(表示可否の判断)はどちらも engine/geo/fixtures に触れず機械検査で閉じられるので、この2件を1サイクルでまとめる。

---

## R82 状態Bの「戻る」ボタンの aria-label

### 実測で判明した前提(計画役が確認済み。作業役は鵜呑みにせず再確認すること)
**`index.html:56` には既に `aria-label="地図に戻る"` が付いている。**

```html
<button class="topbar__back" id="back-btn" type="button" aria-label="地図に戻る">←</button>
```

つまり ROADMAP R82 の本文「`aria-label` を1つ足すだけ」は**事実誤認**で、実装済み。残っている作業は「**機械検査が無いので、将来うっかり消えても誰も気づかない**」という回帰防止だけ。

### 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R82 を `[x] 2026-09-16` に。**本文に「既に実装済みで、今回足したのは検査だけ」と1行訂正を添える**)

### 実装方針(行番号つき)
`check-a11y.mjs` は現在タップ領域44pxしか測っていない(`TARGETS` は 24〜34行、計測ループは末尾の `for (const target of TARGETS)` 内)。ここに**別立ての検査**を1つ足す。既存の高さ検査のループは一切書き換えない。

1. `TARGETS`(34行の `];` の直後)に、新しい定数を足す:
   ```js
   // aria-label が空でないことを確かめる対象(高さ検査とは別立て)
   const LABEL_TARGETS = [
     { selector: '.topbar__back', label: '戻るボタン' },
   ];
   ```
2. 各ページの `for (const target of TARGETS)` ループが終わった直後・`await context.close();` の**手前**に、同じ `page` を使う短いループを足す:
   - `page.evaluate` で `document.querySelectorAll(selector)` を `el.offsetParent !== null` で絞り、各要素の `getAttribute('aria-label')` を配列で返す。
   - 表示要素0件なら既存の書式に合わせて `[SKIP]` を出して continue(状態Aのページでは戻るボタンは非表示なので必ず SKIP になる)。
   - 全件が空文字/null でなければ `[OK]`、1件でも空なら `[NG]` + `hasFailure = true`。
   - ログ書式は既存行に揃える: `` console.log(`[${ok ? 'OK' : 'NG'}] ${pageInfo.label} ${target.label} の aria-label: ${JSON.stringify(labels)}`) ``
3. `check-all.mjs` は check-a11y を既に呼んでいるので**登録の変更は不要**。

### 完了条件
- `node scripts/check-a11y.mjs` が `?fixture=kusatsu` で `[OK] … 戻るボタン の aria-label: ["地図に戻る"]` を出し、状態Aの4ページでは `[SKIP]` になる。
- `index.html:56` の `aria-label="…"` を一時的に消すと `[NG]` + exit 1 になることを1回確認し、**必ず元に戻す**(壊れたまま push しない)。
- 既存の44px検査が全件 OK のまま(件数・最小pxの行が減っていない)。

---

## R77 カードに「何件中」を出すか決める

### 実測で判明した前提
`assets/engine.js:980 present()` は `cards.slice(0, MAX_CARDS)` / `more = cards.slice(MAX_CARDS, MAX_CARDS + MAX_MORE)` で切っており、**`present()` は「切る前の総数」を呼び出し側に返していない**。far は別枠(`FAR_DRIVE_MIN` 超過)なので「全◯件」の◯が何を指すかが自明でない。

一方 `assets/app.js:1078` の `#feed-note` は既に `noteHtml()`(app.js:983 付近)が「暫定版です」の注記で使っており、`app.js:961 moreHtml()` は展開前に **`もっと見る（残り◯件）`** と残数を、展開後に **`◯番以降は地図に表示していません。`**(R60)を出している。

### この事実からの推奨(作業役はこれを検証して決めること)
**「出さない」を採る**のが筋が良い。理由は3つ:
1. 「残り30件」は `moreHtml()` が既に出しており、**30 + 残り30 = 全60** はユーザーが足し算するまでもなく「まだある」ことが伝わっている。情報の二重化になる。
2. 「全◯件」を正しく出すには `present()` の戻り値に総数を足す改修が要る(= engine.js の変更)。ROADMAP R77 は「表示のみ・engine/rank は触らない」と明記しており、**engine を触らずに正確な総数は出せない**。不正確な数(例: 30+30=60 固定)を出すのは、このプロジェクトが守ってきた「正直さ」に反する。
3. `#feed-note` は R47 の「提案の作り方」注記が既に2行を占めており、375px で行数が増えると小地図とカード1枚目の間が間延びする。

ただし**必ず撮り比べてから結論を書く**こと(推奨を鵜呑みにしない)。

### 対象ファイル(絶対パス)
- 撮り比べのみ。**コードは原則変更しない**(「出す」判断に転んだ場合のみ `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` の `noteHtml()` を変更可。その場合も engine.js は不可)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(結論と理由を記録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R77 を `[x] 2026-09-16` に。**採否と理由を本文に残す**)

### 検証手順
1. `?fixture=kusatsu` mobile(375px)を撮影 = 現状(A案: 出さない)。
2. 一時的に `noteHtml()` の先頭へ「上位30件を表示中（全60件）」の1行を差し込んで撮影 = B案。**撮り終わったら必ず元に戻す**。
3. 2枚を Read で目視し、`#feed-note` の行数・カード1枚目との間隔・375px での折り返しを比較。
4. 採否を NIGHTLOG に「理由つきで」書く。

---

## 共通の検証(両方まとめて最後に1回)
```
node --check assets/app.js
node scripts/check-a11y.mjs
node scripts/check-all.mjs      # 27本・約4分・全緑(exit 0)であること
node scripts/dump-rank.mjs kusatsu   # ランキングに差分が出ていないこと
```
撮影は `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` を使い、**保存された画像を必ず Read で開いて目視する**(報告だけして画像が無い事故が過去2回あった)。

## 変更禁止範囲
- `assets/engine.js`、`assets/geo.js`、`fixtures/*.json` は**1行も触らない**。
- rank の重み・閾値・除外ルール・Overpass クエリは触らない。
- 既存 `scripts/check-*.mjs` の**既存の検査ロジックは書き換えない**(check-a11y への追記は「足す」のみ)。
- git stash / reset --hard / checkout でファイルを戻す操作は禁止。
- 外部API は0回(fixture のみ)。

## 終わったら
実装 → 撮影・目視 → check-all 全緑 → ROADMAP を `[x]` に(R82 は「既に実装済みだった」訂正つき、R77 は採否と理由つき) → NIGHTLOG に3行 → **先にコミット** → `git push`。報告は簡潔に(長文の報告書は書かない)。
