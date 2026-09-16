# NEXT — R130 検査基盤の不安定さを直す(サーバ起動を1箇所に共通化)

- タスクID: **R130**
- 難易度: **sonnet**(定型的な機械置換が中心。判断が要るのは共通ヘルパの設計1箇所だけ)
- 所要目安: 60〜90分(うち検証の check-all 3連続だけで約13分)
- 外部API: **0回**(fixture とローカルサーバのみ)

## 目的

`node scripts/check-all.mjs` を毎サイクルの必須ゲートにしているのに、**同じコードのまま結果が揺れる**。
前サイクル(R129)で3回連続実行したところ毎回 29本中28本PASS で、**落ちる1本が毎回入れ替わった**
(check-autozoom / check-links-target / check-feednote / check-embedbg)。いずれも単体実行では全件PASS。
作業役が無関係な失敗の調査に時間を取られ、R129 は報告が3回に分かれた。
**「29本全緑」を信用できる状態に戻す**のが今回の唯一の目的で、検査の中身は1つも変えない。

## 実測で判明した前提(行番号つき)

1. **各 check が自前でポート3000を spawn/kill している**。25本が同一のブロックを持つ
   (`grep -c "python', \['-m', 'http.server'"` で25本ヒット)。**共通ヘルパは存在しない**。
   例: `scripts/check-autozoom.mjs:23` `const PORT = 3000;` → `:61-70` で起動 → `:241` `if (serverProc) serverProc.kill();`
   `scripts/check-feednote.mjs:27` / `:49-58` / `:146`、`scripts/check-embedbg.mjs:20` / `:70-79` / `:130`、
   `scripts/check-links-target.mjs:26` / `:76-85` / `:130` も**字句レベルで同一**。
2. 起動側には待ちがある(`isPortOpen()` を 200ms × 25回ポーリング)が、**終了側に待ちが無い**。
   `serverProc.kill()` を呼んで**即 process 終了**するため、次の check が始まる時点で前の python が
   まだ TIME_WAIT / 終了処理中で、`isPortOpen(3000)` が **true を返してしまう**
   → `alreadyRunning = true` と誤判定 → **自分ではサーバを起動しない** → 直後に python が本当に死んで
   `page.goto` が `net::ERR_CONNECTION_REFUSED` になる。これが「毎回違う1本が落ちる」の正体。
3. 失敗の実例(保存済みログ):
   - `screenshots/fail-check-links-target-2026-09-16T15-52-35.txt`
     `check-links-target 実行エラー: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/?fixture=kusatsu&embed=1` (exit 1, 5394ms)
   - `screenshots/fail-check-autozoom-2026-09-16T15-44-55.txt`
     `check-autozoom 実行エラー: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:3000/?simulate=overpass504` (exit 1, 7256ms)
   - どちらも**5〜7秒で落ちている**(通常は30〜60秒かかる検査)= 起動直後の接続段階での死であり、検査内容とは無関係。
4. `scripts/check-all.mjs:3` のコメントに **「共有サーバ化はしない(各テストが自前でポート3000を spawn/kill するため)」** と
   書かれているが、この前提こそが不安定の原因。**このコメントを今回書き換える**。
5. **サーバを使わない4本**は今回の対象外(無改変): `scripts/check-engine.mjs` / `scripts/check-geo.mjs` /
   `scripts/check-r5.mjs` / `docs/check.mjs`。対象は**25本ちょうど**。

## 対象ファイル(絶対パス)

- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\lib\server.mjs`
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`
- 変更: 上記25本(`scripts\check-a11y.mjs` `check-attrib.mjs` `check-autozoom.mjs` `check-chipcurrent.mjs`
  `check-debugflag.mjs` `check-distance.mjs` `check-embedbg.mjs` `check-embedheight.mjs` `check-feednote.mjs`
  `check-firstcard.mjs` `check-history.mjs` `check-hotelparam.mjs` `check-hoteltip.mjs` `check-imgfail.mjs`
  `check-initpos.mjs` `check-keyboard.mjs` `check-lightbox.mjs` `check-links-target.mjs` `check-more.mjs`
  `check-nohotels.mjs` `check-nosummary.mjs` `check-passive.mjs` `check-pinflash.mjs` `check-recent.mjs`
  `check-sample.mjs`)
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(仕組みの説明を1〜3行)
- 参考(無改変): `scripts\dump-rank.mjs` `scripts\make-readme-shots.mjs` も PORT=3000 を持つが検査ではないので触らない

## 実装方針(共通化1箇所で収める。**単体実行できる性質は壊さない**)

1. **`scripts/lib/server.mjs` を新設**し、次の2つだけを export する。
   - `export async function ensureServer()` — 戻り値 `{ base, stop }`。
     - 環境変数 **`YADOTABI_BASE`** が設定されていれば**起動せず**、`{ base: process.env.YADOTABI_BASE, stop: async () => {} }` を返す(= 親が用意した共有サーバの再利用)。
     - 無ければ**自分で起動する**。ポートは固定3000をやめ、**`net.createServer().listen(0)` で空きポートを1つ実測してから** `python -m http.server <port> --bind 127.0.0.1` を spawn する(固定3000は他の作業役プロセスや前サイクルの残骸と衝突するため)。
     - 起動待ちは `isPortOpen()` を **150ms × 60回(最大9秒)** ポーリングし、時間内に開かなければ**明示的に throw**(黙って続行して ERR_CONNECTION_REFUSED になるのを防ぐ)。
     - `stop()` は `kill()` したあと **プロセスの `exit`/`close` イベントを await** し、さらに `isPortOpen()` が false になるまで 100ms × 30回 待つ(**終了待ちが無いのが今回の主因**)。
   - `export const PROJECT_ROOT`(`fileURLToPath(new URL('../..', import.meta.url))`)。
2. **`check-all.mjs` を親サーバ方式にする**。先頭で1回だけ `ensureServer()` を呼び、各子プロセスの
   `spawnSync` に `env: { ...process.env, YADOTABI_BASE: base }` を渡す。全29本が終わったら `finally` で `stop()`。
   `docs/check.mjs` など `YADOTABI_BASE` を読まない4本は環境変数を無視するだけなので影響なし。
   これで**子プロセスは25本ともサーバを起動しなくなり、ポートの奪い合いが構造的に消える**。
3. **25本の各 check** は次の3点だけを機械的に置換する。**検査ロジックには一切触らない**。
   - `const PORT = 3000; const BASE = \`http://127.0.0.1:${PORT}\`;` → `ensureServer()` の戻り値 `base` を使う形に。
     `BASE` という変数名は各本の本文が多用しているので**変数名は BASE のまま**にし、`main()` 冒頭で `const { base: BASE, stop } = await ensureServer();` のように束縛して差分を最小化する(トップレベル const → main 内 const への移動が要る本は、`let BASE;` をトップレベルに置いて `main()` で代入する形でもよい。どちらか一方に統一すること)。
   - ローカルの `isPortOpen` / サーバ起動ブロック / `alreadyRunning` 判定を削除し、`ensureServer()` の呼び出し1行に置き換える。
   - `finally` の `if (serverProc) serverProc.kill();` を `await stop();` に置き換える。
   - `waitFor()` など**検査本体が使っているヘルパは残す**(消すと検査が壊れる)。
4. 単体実行(`node scripts/check-feednote.mjs`)では `YADOTABI_BASE` が無いので**従来どおり自分で起動して自分で落とす**。
   手動で別ターミナルのサーバを使いたい場合は `YADOTABI_BASE=http://127.0.0.1:3000 node scripts/check-feednote.mjs` で再利用できる。
5. ポート固定3000をやめる副作用に注意: ファイル内に `http://127.0.0.1:3000` を**直書きしている箇所が残っていないか**
   `grep -rn "127.0.0.1:3000" scripts/ docs/` で確認し、検査25本の中に残っていたら `BASE` 参照に直す
   (`dump-rank.mjs` / `make-readme-shots.mjs` は対象外なので残ってよい)。冒頭コメントの「`python -m http.server 3000` を起動して」という説明文も実態に合わせて直す。

### 比較して**採らなかった**案(理由を NIGHTLOG に1行残す必要はない)

- **ポートを3000から別の固定値に変えるだけ**: 連続実行の衝突は同じ番号を奪い合うことが原因なので、番号を変えても直らない。却下。
- **check-all に sleep を挟むだけ**: 29本 × 数秒で全体が遅くなるうえ、待ち時間の当てずっぽうに戻るだけで再発する。却下。
- **25本すべてに個別で終了待ちを書く**: 直りはするが同じコードが25箇所に増え、次に直すとき25箇所を触ることになる。共通ヘルパに集約する方が影響範囲が小さい。

### 変更の影響範囲(見積もり)

25本 × 約3箇所 = 約75箇所の置換だが、**元のブロックが字句レベルで同一**なので機械的に処理できる。
新しいロジックは `scripts/lib/server.mjs` の1ファイルだけに存在する。`assets/` 配下・engine/geo/fixtures・rank は**1バイトも変わらない**。

## 完了条件

1. **`node scripts/check-all.mjs` を3回連続で回し、3回とも「29本中29本PASS」**であること(ログの該当行を報告に貼る)。
2. 単体実行が壊れていないこと: `node scripts/check-autozoom.mjs` `node scripts/check-feednote.mjs`
   `node scripts/check-links-target.mjs` `node scripts/check-embedbg.mjs` の4本を**個別に**実行し、全件PASS。
3. 検査の項目数(各本の `N pass / 0 fail` の N)が**改修前と同じかそれ以上**であること。減っていたら失敗。
4. `git diff --stat -- assets index.html fixtures demo` が**空**であること。
5. 3回連続実行のうち1回でも ERR_CONNECTION_REFUSED / ERR_CONNECTION_RESET / ERR_NO_BUFFER_SPACE が出たら未達。

## 検証手順

```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node --check scripts/lib/server.mjs
node scripts/check-autozoom.mjs
node scripts/check-feednote.mjs
node scripts/check-links-target.mjs
node scripts/check-embedbg.mjs
node scripts/check-all.mjs
node scripts/check-all.mjs
node scripts/check-all.mjs
git diff --stat -- assets index.html fixtures demo
```
画面の見た目は一切変わらない改修なので、**撮影は不要**(撮る場合も fixture モードのみ・外部API 0回)。

## 変更禁止範囲

- `assets/` 以下は触らない(`app.js` / `style.css` / `engine.js` / `geo.js`)。`index.html` `fixtures/` `demo/` も同様。
- **検査の内容を減らさない**。落ちにくくするために `ok()` を消す・条件を緩める・タイムアウトを伸ばして誤魔化す、は禁止。
  もし共通化の過程で落ちる検査があれば、それは**本物のバグ**なので NIGHTLOG に書いて起票する(握りつぶさない)。
- `git stash` / `git reset` / `git checkout <path>` でファイルを戻す操作は**禁止**。
- 外部API **0回**(Overpass / Nominatim / Wikipedia を叩かない)。
- `.gitignore` は変更しない。rank の重み・閾値・fixtures の再生成も禁止。

## 終わったら

1. `docs/ROADMAP.md` の R130 を **`[x] 2026-09-17`** にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に
   `### 2026-09-17 R130 検査サーバの共通化` の見出しを付けて**3行**追記(やったこと / 3連続の結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない。3連続の「29本中29本PASS」の行だけ貼れば十分)。
