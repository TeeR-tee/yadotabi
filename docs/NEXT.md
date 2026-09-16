# NEXT: R110 受動ログに「古さで捨てる」掃除を足す

- **タスクID**: R110
- **難易度**: sonnet(1ファイル1関数に定数1つ+1行。検査の追加が主作業)
- **所要目安**: 25〜40分

## 目的

受動ログ(`localStorage` の `yado.passive.v1`)は件数200件の上限しか無く、**古さで捨てる処理が1行も無い**。
たまにしか使わない人の端末には半年前・1年前のタップ記録が残り続ける。F3 の方針(送信しない・端末内のみ)は
「残す量を最小限にする」ことと表裏なので、期限切れを落とすのが筋。**90日**を採用する。

## 実測で判明した前提(2026-09-16 計画役が grep/Read で確認)

1. `assets/app.js:292` `var PASSIVE_KEY = 'yado.passive.v1';` / `app.js:293` `var PASSIVE_MAX = 200;`。
   期限・日数に相当する定数は `grep -n "PASSIVE" assets/app.js` に**1つも無い**(該当行は 225/292/293/297/303 のみ)。
2. `assets/app.js:296-305` `passivePush(type, data)` が唯一の書き込み口。
   - `app.js:299` `var entry = { t: Date.now(), type: type };` → **時刻は毎件記録済み**(掃除の材料は既にある)。
   - `app.js:302` `if (list.length > PASSIVE_MAX) list = list.slice(-PASSIVE_MAX);` が件数上限のみ。
   - `app.js:303` `lsSet(PASSIVE_KEY, list);` で保存。配列は**古い順(push で末尾追加)**。
3. **ROADMAP の R110 本文にある「R61 が何ヶ月も前の宿を初期位置に使う可能性がある」は事実誤認**。実測:
   - `app.js:351-365` `initialView()` は `lsGet(LS_MAPVIEW)` → 無ければ `getRecent()`(`app.js:323`)の先頭を使う。
   - `getRecent()` が読むのは `app.js:62` `LS_RECENT = 'yado.recent.v3'` で、**受動ログとは別キー**。
   - `app.js:328-340` `pushRecent()` の entry は `{ name, lat, lon, kind }` の4フィールドのみで **`t` が無い**。
     → `yado.recent.v3` 側は時刻を持たないため**今回のタスクでは年齢掃除の対象にできない**(`app.js:60` `RECENT_MAX = 5` の
     件数上限のみ)。**この訂正を NIGHTLOG に必ず残すこと。** recent 側にも `t` を足すかは別タスク(ROADMAP 追記は計画役が別途)。
   - よって R110 の実利は「R61 の誤動作防止」ではなく**受動ログ自体の保持期間を有限にすること**。目的文はそう書き直す。
4. 読み出し側は `app.js:223-235` `updatePassiveBox()`(`?demo=passive` のときだけ生成)のみ。`app.js:225` で `lsGet(PASSIVE_KEY)`、
   `app.js:232` `list.slice(-10)` の直近10件と `app.js:234` の `'[passive] 総件数 ' + list.length` を表示する。
   → **掃除が効けば「総件数」が減る**ので、これが機械検査の観測点になる。
5. `scripts/check-passive.mjs` を確認済み。`check-passive.mjs:16` で同じキーを定義、`:30-38` `readPassive(page)` が
   `localStorage` を直読みする。**`check-passive.mjs:94` の `hasText: 'Instagram'`**(2枚目カードの Instagram リンクをクリック)
   と `:105-106` の `e.label === 'Instagram'` 判定は**リンクのラベル文字列に依存しているので絶対に壊さない**。
   既存のチェックは無編集で、末尾にケースを1件足すだけにする。
6. `?demo=passive` のフラグは `app.js:1503` `if (demo === 'passive') demoPassive = true;` で立つ。
   **未確認**: 検査で古い entry を仕込む方法は `page.addInitScript` で `localStorage` に直接書くのが素直
   (`?demo=` に新フラグを足す必要は無い見込み)。作業役が実装時に確かめること。
7. `node scripts/check-all.mjs` は現在 **28本**(`check-all.mjs:2` のコメント「check-*.mjs 27本 + docs/check.mjs の計28本」)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(定数1行 + `passivePush` 内1行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-passive.mjs`(末尾にケース追加のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\passive-log.md`(「キーと上限」節に保持期間を追記)

## 実装方針(行番号つき)

1. `app.js:293` の直後に定数を1行足す:
   `var PASSIVE_MAX_AGE_DAYS = 90;` と、ミリ秒換算 `var PASSIVE_MAX_AGE_MS = PASSIVE_MAX_AGE_DAYS * 86400000;`
   (90日の理由: 旅行の検討サイクルは数週間〜2ヶ月なので、季節をまたぐ1つ分を残せば rank 検証の材料としては十分。
   これを NIGHTLOG に理由として残す。`docs/passive-log.md` の目的「rank の重みを実データで検証する材料」と突き合わせた結果である旨も添える。)
2. `app.js:298`(`if (!Array.isArray(list)) list = [];`)の直後、`app.js:301` の `list.push(entry)` より**前**に、年齢フィルタを1行:
   `var cutoff = Date.now() - PASSIVE_MAX_AGE_MS;`
   `list = list.filter(function (e) { return e && typeof e.t === 'number' && e.t >= cutoff; });`
   - `t` が無い/数値でない古い形式の entry も同時に落ちる(想定どおり。安全側)。
   - 件数上限(`app.js:302`)はそのまま**年齢フィルタの後**に残す(両方効く)。
3. `updatePassiveBox()`(`app.js:223`)は**変更しない**。掃除は書き込み時にのみ走る(読むだけでは消さない=副作用を増やさない)。
4. `docs/passive-log.md` の「キーと上限」節に「保持期間: 90日。`passivePush()` が書き込むたびに `t` が90日より古いレコードを落とす」の1〜2行を足す。
5. `scripts/check-passive.mjs` の末尾に検査を1件追加(既存の項目・`ok()` 相当の呼び出しは減らさない):
   - `page.addInitScript` で `yado.passive.v1` に「`t` が100日前の entry 3件 + 1日前の entry 1件」を仕込む。
   - `?fixture=kusatsu&demo=passive` を開き、カードを1枚タップして `passivePush` を1回発火させる。
   - `readPassive(page)` で読み直し、**100日前の3件が消え、1日前の1件と新規1件が残る(計2件)**ことを検査。
   - あわせて `.passivebox` の `textContent` が `総件数 2` を含むことも見る(表示側との整合)。

## 完了条件

- `assets/app.js` の差分が **定数2行 + フィルタ2行の計4行以内**(`git diff assets/app.js` で確認)。
- 100日前の entry が新規書き込み後に消え、90日以内の entry は残ることを `check-passive.mjs` が機械検査で示す。
- `check-passive.mjs` の既存項目が全て pass のまま(`hasText: 'Instagram'` のケースを含む)。
- `node scripts/check-all.mjs` が **28本中28本 PASS**。
- `docs/passive-log.md` に保持期間が明記されている。

## 検証手順

1. `node --check assets/app.js`
2. `node scripts/check-passive.mjs` 単体(既存 + 新規ケースが全 pass)
3. `node scripts/check-all.mjs` → **28本全緑が必須**
4. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` / desktop は `--desktop` 相当):
   - `http://127.0.0.1:3000/?fixture=kusatsu&demo=passive` を **mobile 375px** で1枚 → `.passivebox` の文字が崩れず総件数が読めること
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **mobile 375px** で1枚(デグレ確認。カード30枚・文字崩れ無し)
   - 保存した画像を必ず `Read` で開いて目視する
5. `git diff --stat -- assets/style.css index.html fixtures demo geo.js` が**空**であること

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/` は**変更不可**。
- rank の重み・閾値は**変更不可**。
- `scripts/check-passive.mjs:94` の `hasText: 'Instagram'` とリンクラベル文字列は**変更不可**。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- 外部API **0回**(fixture と localStorage だけで完結する)。
- `PASSIVE_MAX = 200`(件数上限)は残す。年齢掃除で置き換えない。

## 終わったら

1. `docs/ROADMAP.md` の R110 行を `- [x] 2026-09-16 R110 ...` にする(R61 に関する事実誤認の訂正も1文添える)。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の**末尾**に3行(やったこと / 見た目の確認結果 / 次)。
   90日を選んだ理由と、**「R61 が読むのは `yado.recent.v3` で受動ログではない」という実測での訂正**を必ず含める。
3. **先にコミット**(1行の日本語メッセージ)→ `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
