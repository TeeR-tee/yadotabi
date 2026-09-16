# 次のタスク: R89 `check-hotelparam.mjs` の高速化(検査を削らずに待ち方を変える)

- **タスクID**: R89
- **難易度**: sonnet
- **所要目安**: 20〜30分
- **目的**: `check-all.mjs` 27本の最遅本である `check-hotelparam.mjs` の所要時間を、**検査項目を1つも減らさずに**短縮する。固定待ち(`waitForTimeout` 相当)を「待つべきものを待つ」形に置き換えるのが本題。

## 実測で判明した前提(2026-09-16 計画役が実測)

計測: `node scripts/check-hotelparam.mjs` を同条件で3回連続実行(他プロセスなし)。

| 回 | 所要 |
|---|---|
| 1回目 | 33917 ms |
| 2回目 | 34332 ms |
| 3回目 | 33432 ms |
| **中央値** | **33917 ms** |

- ROADMAP R89 本文の「27秒」は R55 当時の値。**現在は約34秒**で、R99 の3ケース追加(`scripts/check-hotelparam.mjs:225-227`)などで増えている。ROADMAP の数字は事実誤認として NEXT.md のこの実測で上書きする。
- **主因は固定待ちで確定**。検査関数は4種あり、いずれも `await waitFor(1500)` を1回持つ:
  - `checkTitle()` … `scripts/check-hotelparam.mjs:63`、待ちは `:73`
  - `checkBadgeVisible()` … `:82`、待ちは `:92`
  - `checkBadgeDate()` … `:110`、待ちは `:120`
  - `checkStateA()` … `:137`、待ちは `:147`
  - さらに `main()` 内の直書きケース b … `:195-203`、待ちは `:199`
- `main()`(`:160-235`)から呼ばれる検査ケースは **17件**(`:177-227`)。`page.goto` は関数側5箇所 × 呼び出し17回 = **17回のページ読み込み**。
- したがって **固定待ちの合計は 1500ms × 17 = 25500ms**。全体 33917ms の **約75%** が固定待ち。残り約8.4秒がブラウザ起動・context 生成・goto・評価。
- `browser.newContext()` は **17回**(`:64` `:83` `:111` `:138` `:196` の5箇所を17回通過)。`chromium.launch()` は **1回**のみ(`:174`)なのでブラウザ起動は既に共有済み。
- 待っている対象は毎回「`#feed-title` / `#feed-badge` / `#feed-badge-date` / `#map` の描画完了」であり、fixture モードは外部APIを叩かないため実際の描画は1500msよりずっと早いはず(**未確認**: 実描画完了までの実測値は取っていない)。
- `waitFor()` は `setTimeout` のラッパ(`:59-61`)で、Playwright の `waitForTimeout` ではないが役割は同じ。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(**唯一の変更対象**)
- 参考(読むだけ・変更禁止): `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`、`C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`

## 実装方針(行番号つき)

1. **固定待ちを条件待ちに置換**。各検査関数の `await waitFor(1500)` を、その関数が本当に必要とする条件の待機に変える。
   - `checkTitle()` `:73` → `#feed-title` の textContent が空でなくなるまで待つ。
     例: `await page.waitForFunction(() => { const el = document.querySelector('#feed-title'); return el && el.textContent.trim().length > 0; }, { timeout: 5000 });`
   - `checkBadgeVisible()` `:92` → 期待が「可視」のときは `#feed-badge` が可視になるまで待つ。**期待が「不可視」のケース(`:209` d)は待つ対象が無い**ので、代わりに `#feed-title` の描画完了を待つ形にする(不可視の確認を早すぎるタイミングで行って誤PASSしないこと)。
   - `checkBadgeDate()` `:120` → 同様。`expectDate === true` なら `#feed-badge-date` のテキストが日付正規表現にマッチするまで、`false` なら `#feed-title` の描画完了まで。
   - `checkStateA()` `:147` → `#map` が可視になるまで(`page.waitForSelector('#map', { state: 'visible' })` + `#feed-title` の描画完了)。
   - `main()` 内ケース b `:199` → `checkTitle()` と同じ条件待ちに揃える。
2. **共通ヘルパを1つ作る**。同じ待機式が5箇所に散るので、`async function waitRendered(page)` のような小さな関数を `:61` の直後あたりに足して各所から呼ぶ(重複を増やさない)。
3. **タイムアウトは必ず設ける**(5000ms 程度)。条件待ちが成立しない場合に無限待ちにならないこと。タイムアウトしたら例外ではなく **FAIL として記録**して次のケースへ進む形が望ましい(現状は例外で `main().catch` に落ちて全体が止まる)。ここは実装者判断でよいが、選んだ理由を NIGHTLOG に1行残すこと。
4. **context の使い回しは今回やらない**。`page.on('console')` でケースごとにエラーを分離して数えているため、共有すると混線する。17回の `newContext` は残す(1回あたりのコストは goto 込みで約500ms 程度と推定、**未確認**)。もし条件待ち置換だけで目標に届かないときの次の一手として `docs/CHECKS.md` に書き残す。
5. **検査の中身・件数・期待値は1文字も変えない**。`ok()` の呼び出し数・ラベル・アサーション内容は現状維持。

## 完了条件

- [ ] `node scripts/check-hotelparam.mjs` の **PASS 件数が変更前と完全に一致**する(変更前の件数を先に記録しておくこと。現状 `==== N pass / 0 fail ====` の N をメモ)。`fail` は 0。
- [ ] **同条件3回の中央値で比較**する。変更前の中央値は **33917 ms**(上表)。変更後も同じく3回連続実行して中央値を出し、NIGHTLOG に before/after を両方書く。
- [ ] **検査項目数は変えない**(`ok()` の呼び出し回数・`page.goto` の回数・ケース数17件はすべて据え置き)。
- [ ] 5秒以上縮めば成果。縮まなければ**なぜ縮まないか**(どこに時間が残っているかの実測内訳)を `docs/CHECKS.md` に1段落書いて閉じる — これも正当な完了。
- [ ] `node scripts/check-all.mjs` が **27本全緑**(exit 0)。

## 検証手順

1. 変更前に `node scripts/check-hotelparam.mjs` を1回流し、`N pass / 0 fail` の N を控える。
2. 実装。
3. `node --check scripts/check-hotelparam.mjs`。
4. `node scripts/check-hotelparam.mjs` を **3回連続**で実行し、それぞれの所要msを記録(PowerShell なら `Measure-Command`、bash なら `date +%s%N` で挟む)。中央値を出す。PASS 件数が N と一致し fail が 0 であることを毎回確認。
5. **`node scripts/check-all.mjs` を実行し 27本全緑(exit 0)**を確認 ← 必須。
6. 画面に一切変更が無いので撮影は `?fixture=kusatsu` mobile 1枚のデグレ確認のみ(カード30枚・番号ピン判読可・コンソールエラー0件)。
7. `git diff --stat -- assets fixtures index.html demo` が **空**であることを確認(scripts と docs 以外に波及していないこと)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/` / `assets/app.js` は**変更不可**。
- rank の重み・閾値・除外ルールは**変更不可**。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)呼び出しは **0回**。fixture とローカルサーバのみ。
- 他の `scripts/check-*.mjs` は編集しない(今回は hotelparam 1本だけ)。
- `check-all.mjs` 本体も編集しない。

## 終わったら

1. `docs/ROADMAP.md` の R89 の行を `- [x] 2026-09-16 R89 …` に更新(実測の before/after 中央値を本文に1行足す)。
2. `docs/NIGHTLOG.md` の「## サイクル記録」の先頭に **3行**追記(やったこと / 見た目と計測の確認結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書は書かない)。
