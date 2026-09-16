# NEXT: R67 check-all の失敗時に「何が落ちたか」をファイルに残す

選定理由: 前サイクルで check-hoteltip が1回だけ落ちて再現しなかった(フレーク)が、`stdio:'inherit'` のせいでログがターミナルに流れて消え、原因追跡が不可能だった。次にフレークが出たときに証拠が残ることを優先する(R65 は証拠が無いままでも進められるので後回し)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` ← **このファイルだけを編集する**
- 出力先(新規・コミット対象外): `C:\workspace\claude\旅行先用サイト\yadotabi\screenshots\fail-<本名>-<時刻>.txt`
  - `screenshots/` は `.gitignore` 済みなので、失敗ファイルが git に混ざる心配はない。

## 調査済みの事実(実装前に読むこと)
1. `check-all.mjs:42` が `spawnSync(process.execPath, [scriptPath], { stdio: 'inherit', cwd: ROOT })`。
   **`'inherit'` だと `res.stdout` / `res.stderr` は `null` になる**。これが「失敗しても何も残らない」の直接原因。
2. 各 `check-*.mjs` は最後に `main().catch((err) => { console.error(...); process.exitCode = 1; })` の形(例: `scripts/check-sample.mjs` の末尾)。
   つまり**失敗の情報は stdout の `n pass / m fail` 行と stderr の例外**に出ており、`check-all.mjs` 側で捕まえれば足りる。
   → **各 check 本にスクリーンショット保存を足す必要はない**。ROADMAP R67 本文の「環境変数 `YADO_SHOT_ON_FAIL=1` を渡す方式」は、各本が対応コードを持っていない以上そのままでは効かないので**不採用**。代わりに「落ちた本の出力をテキストで残す」最小案を採る(ROADMAP 本文もその代替案を許容している)。
3. 表の出力は `check-all.mjs:50-65`。`results` に `{ script, pass, ms }` を積んでいるだけ。

## 実装方針(最小)
1. `import fs from 'node:fs'` を追加(`node:path` の隣、1-9行目の import 群)。
2. ループ(39-46行目)を変える:
   - `stdio` を `'inherit'` から **`['ignore', 'pipe', 'pipe']`** にし、`encoding: 'utf8'` を付ける。
   - 進捗が見えなくなるので、**捕まえた stdout/stderr はその場で `process.stdout.write()` / `process.stderr.write()` にそのまま流す**(従来どおり画面には出る)。
   - `pass` が false のときだけ、`results` に積むのに加えて下の 3. を呼ぶ。
3. 新しい純粋寄りの関数を1つ足す(表出力の直前あたり):
   - `function saveFailLog(script, res, ms)`:
     - 本名 = `path.basename(script, '.mjs')`(例 `check-hoteltip`)。
     - 時刻 = `new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)`(例 `2026-09-16T12-03-44`)。ファイル名に `:` を使わない(Windows で不正文字)。
     - 保存先 = `path.join(ROOT, 'screenshots', 'fail-<本名>-<時刻>.txt')`。`fs.mkdirSync(dir, { recursive: true })` してから書く。
     - 中身: 1行目に再現コマンド `node <script>`、次に exit code と所要ms、続けて **stdout の末尾 40 行**と **stderr の末尾 40 行**(丸ごとだと巨大になりうるので末尾のみ。行数は定数 `TAIL_LINES = 40` に出す)。
     - 書き込み自体が失敗しても check-all を落とさない(try/catch で握って `console.warn` するだけ)。
4. 末尾のサマリ(62-65行目)の後に、失敗が1本以上あったときだけ
   `失敗ログ: screenshots/fail-xxx-....txt` を FAIL の本の数だけ列挙する行を出す。
5. それ以外は触らない。表の書式・`process.exitCode` の決め方(48行目 `anyFail`)は現状維持。

## 完了条件(検証可能)
- [ ] `SCRIPTS` の1本を一時的に存在しないパス(例 `scripts/check-nonexistent.mjs`)に差し替えて実行すると、
      `screenshots/fail-check-nonexistent-<時刻>.txt` が生成され、中に再現コマンドと stderr の末尾が入っている。**確認後は必ず元に戻す**。
- [ ] 成功時(全本 PASS)は `screenshots/` に `fail-*.txt` が1つも増えない(実行前後の `ls screenshots/fail-*.txt` の件数が同じ)。
- [ ] `node scripts/check-all.mjs` が **22本中22本 PASS・exit 0**。
- [ ] 実行中の画面出力が従来どおり各本のログを流している(`stdio` 変更で無言にならない)。
- [ ] `git status -sb` に `screenshots/` 配下が現れない(gitignore 済みの再確認)。

## 検証手順
1. `node --check scripts/check-all.mjs`
2. `ls screenshots/fail-*.txt 2>/dev/null | wc -l` で実行前の件数を控える。
3. `node scripts/check-all.mjs` → 22/22 PASS・exit 0 を確認。2. と件数が同じことを確認。
4. `SCRIPTS` の1行を壊して再実行 → FAIL 表・exit 1・fail ファイル生成を確認し、`cat` で中身を目視。
5. 壊した1行を戻して `node scripts/check-all.mjs` を再実行し、22/22 PASS に戻ることを確認。
6. 画面の見た目は変わらないので**撮影は不要**(NIGHTLOG にその理由を1行書く)。

## 変更禁止範囲
- 既存 `scripts/check-*.mjs` と `docs/check.mjs` の**中身は1文字も編集しない**(検査内容・件数を変えない)。
- `assets/`(app.js / engine.js / geo.js / style.css 等)、`fixtures/`、`index.html`、`demo/` は無変更。
- `SCRIPTS` の並び順・本数を恒久的に変えない(検証で壊すのは一時的、必ず戻す)。
- git stash / reset --hard / checkout は禁止。

## 難易度 / 所要目安
- 難易度: **sonnet**(1ファイル・50行以内の追記)
- 所要目安: 実装10分 + check-all 2回(約3分×2)で **20〜25分**
