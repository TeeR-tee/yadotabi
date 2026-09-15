# NEXT: R36 `scripts/check-all.mjs`(全検査を1コマンドで順に実行)

## 選定理由(1行)
R11/R14/R19/R31/R32 はどれも「撮影して目視」が完了条件で検収コストが高いのに対し、R36 は以後すべてのサイクルの完了条件を `node scripts/check-all.mjs` が緑、の一言に圧縮でき、投資回収が最も早いため。

## 目的
現在 `check-*.mjs` が10本 + `docs/check.mjs` の計11本あり、作業役が毎回どれを走らせたか報告文で列挙している(漏れも起きうる)。これを1コマンドにまとめ、pass/fail と所要時間を表で出し、1本でも落ちたら exit 1 にする。

## 対象ファイル(絶対パス)
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(「開発者向け」節を新設し1〜3行。既存の節は触らない)
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R36 を `[x]` に)
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行)

## 計画役が実物で確認済みの事実(再調査不要)
- `scripts/` の check 系は **ちょうど10本**: a11y / chipcurrent / engine / geo / hotelparam / imgfail / more / passive / pinflash / r5。
- **全11本が exit code を返す**: engine と r5 は `process.exit(fail ? 1 : 0)`、他8本は `process.exitCode = fail ? 1 : 0`(catch でも 1)、`docs/check.mjs` は `hasFailure` で exitCode。
- **7本(a11y/chipcurrent/hotelparam/imgfail/more/passive/pinflash)が自分で `python -m http.server 3000 --bind 127.0.0.1` を spawn し、finally で kill している**。engine / geo / r5 はサーバ不要(純 Node)。`docs/check.mjs` は本番URLへの GET のみ。

## 実装方針
1. `scripts/check-all.mjs` を新規作成。Node 標準の `node:child_process` のみ使用(依存追加なし)。
2. 実行対象の配列を先頭に定数で持つ(`docs/check.mjs` を含む11本)。**ファイルの自動 glob ではなく明示リスト**にして、新しい検査を足したときに人が1行足す形にする(意図しないファイルを拾わない)。
3. **必ず直列(逐次)実行**する。7本が同じポート3000を取り合うため、並列にすると `EADDRINUSE` で偽の赤が出る。
4. **共有サーバ化は「検討したがやらない」を既定とする**。各テストが finally で kill する設計なので、外から1回だけ立てた 3000 は最初のテストに殺される。既存 check スクリプトの中身を書き換えるのは変更禁止範囲なので、**各テストの既存挙動にそのまま任せる**。所要時間が実測で著しく長い(合計5分超など)場合のみ NIGHTLOG に事実として書き、改修は別タスクに起票する(このサイクルではやらない)。
5. 各本は `spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: リポジトリルート })` で起動し、`Date.now()` の差で所要ミリ秒を測る。`status !== 0` を fail とする。
6. 全本終了後にサマリ表を出す。列は `#` / `script` / `result`(PASS/FAIL) / `ms`。末尾に「N本中 M本 PASS / 合計 X.Xs / 最遅: <script> (Y.Ys)」の1行。
7. 最後に `process.exitCode = anyFail ? 1 : 0`。
8. 1本落ちても**残りを止めずに最後まで走らせる**(どこまで壊れているかを1回で把握したいため)。ただしサマリでは FAIL を明示。
9. README に「開発者向け」節を新設し、`node scripts/check-all.mjs` で全検査を一括実行できる旨を1〜3行で書く(Python3 と Playwright が要る点にも1行触れてよい)。

## 完了条件(検証可能)
- `node scripts/check-all.mjs` が**11本すべて PASS の表を出して exit 0** で終わる(`echo $LASTEXITCODE` / `echo $?` で確認)。
- 表に **11行**あり、各行に PASS と所要ミリ秒が入っている。末尾サマリ行が出ている。
- **意図的に1本壊すと exit 1 になる**: scratchpad に `process.exit(1)` するだけのダミー .mjs を作って `SCRIPTS` 配列に一時的に足す、**または**実行対象の1本を一時的に存在しないパスに書き換えて走らせ、そのぶんが FAIL で表に出て exit 1 になることを確認する。**確認後は必ず元に戻し、戻した状態で再度 exit 0 になることを確かめてからコミットする**(既存 check-*.mjs 本体は絶対に書き換えない)。
- README に「開発者向け」節が存在し、`node scripts/check-all.mjs` が書かれている。

## 検証手順
1. `node --check scripts/check-all.mjs`
2. `node scripts/check-all.mjs` → 全緑・exit 0 を確認(表を報告に貼る)
3. 上記の「意図的に1本壊す」手順で exit 1 を確認 → 元に戻して再度 exit 0
4. `git diff --stat -- assets fixtures index.html` が**空**であること(コード本体は無変更)
5. 画面変更が無いため撮影は省略してよい。ただし NIGHTLOG に「画面変更なしのため撮影省略」と明記する

## 変更禁止範囲
- `assets/` 配下すべて(app.js / engine.js / geo.js / style.css / tokens.css / ui.css)
- `fixtures/` 配下すべて
- **既存の `scripts/check-*.mjs` 10本と `docs/check.mjs` の検査内容**(1行も編集しない。check-all.mjs は外から呼ぶだけ)
- `index.html`、`demo/` 配下
- README の既存の節(追記のみ)
- git stash / reset --hard / checkout でのファイル復元は禁止

## 難易度・所要目安
- 難易度: **sonnet**(新規1ファイル + README 1行。ロジックは spawnSync と表整形のみ)
- 所要目安: 実装15分 + 検証(11本の実走を2回)10〜20分 = **25〜35分**
