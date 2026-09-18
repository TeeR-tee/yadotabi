# 次の1タスク: R92 `screenshots/` 1085枚・1.1GB を可逆に畳む(削除はしない)

- タスクID: **R92**
- 難易度: **sonnet**(ファイル移動と小さなスクリプト追加のみ。engine/rank の判断を含まない)
- 所要目安: 30〜45分
- 外部API: **0回**

## 目的

撮影ファイルが毎サイクル数十MB積み上がり、ローカルのディスクを 1.1GB 食っている。
**1枚も消さずに**、古い撮影を `screenshots/archive/` へ移して「直近の作業で撮ったものだけが `screenshots/` 直下にある」状態にする。
消す判断はみのるんのものなので、このタスクは**移動だけ**を行い、削除は一切しない(自動削除の仕組みも作らない)。

## 計画役が実測した前提(2026-09-18 時点・全て実測値)

| 項目 | 実測値 |
|---|---|
| `screenshots/` 直下のファイル | **1096枚の .png + 17本の fail-*.txt = 1113ファイル**(ほかに空の `tmp/` が1つ) |
| 合計容量 | **1.1GB** |
| 最古 | `2026-09-15T17-51-00_127.0.0.1_3000_hotel_36.6226_138.5960__feed_mobile.png`(命名が未統一な初期の1枚) |
| 最新 | 2026-09-18 撮影分(R2-1/R133 のもの) |
| mtime 別の内訳 | **2026-09-16: 956枚 956MB** / 2026-09-17: 106枚 70MB / 2026-09-18: 51枚 41MB |
| git 状態 | `.gitignore:5` に `screenshots/` があり**リポジトリには1件も入っていない**(`git ls-files screenshots/` は0件)。よって移動しても git の差分は出ない |
| docs からの参照 | **3件だけ**。`docs/ROADMAP.md:8` の `2026-09-17_r128-forward-stuck_mobile.png`、`:9` の `2026-09-17_r129-landscape-fold_land812.png`、`:10` の `fail-check-links-target-2026-09-16T15-52-35.txt` |
| scripts からの参照 | **読み取りは0件**。`grep` した20箇所は全て `page.screenshot({path:...})` などの**書き込み先**で、既存ファイルの存在を前提にする箇所は無い |
| README の画像 | `docs/shots/state-a.jpg` など3枚を参照。`docs/shots/` は `screenshots/` とは**別ディレクトリ**で git 管理下。`scripts/make-readme-shots.mjs:19` の `SHOTS_DIR` も `docs/shots` を向いており、今回の移動と完全に無関係 |

**結論**: `screenshots/` は誰からも読まれていない出力専用ディレクトリなので、移動でリンクが切れる心配があるのは上の**docs 3件だけ**。

## 対象ファイル(絶対パス)

- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\archive-shots.mjs`
- 追記: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(「撮影ファイルの命名と保持方針」の節)
- 移動先(新規ディレクトリ): `C:\workspace\claude\旅行先用サイト\yadotabi\screenshots\archive\`
- 記録: `docs/ROADMAP.md` / `docs/NIGHTLOG.md`

## 実装方針

### 1. `scripts/archive-shots.mjs` を新設(移動のみ・削除機能を1行も書かない)

- 既定は**ドライラン**。`node scripts/archive-shots.mjs` は「何枚・何MBが対象か」を表示するだけで1ファイルも動かさない。
- 実際に動かすのは `--apply` を付けたときだけ。
- 使うのは `fs.readdirSync` / `statSync` / `mkdirSync` / `renameSync` のみ。**`unlinkSync`・`rmSync`・`rm -rf` 相当は絶対に書かない**(書いてあったらレビューで落とす)。
- 移動先は `screenshots/archive/`。同名衝突時は `renameSync` せずスキップして警告(上書き=消失を防ぐ)。

### 2. 移動条件(実測から決定)

**mtime が 2026-09-17 00:00 より前のファイル**を対象にする(= 9/16 以前の 956枚・956MB)。

理由: 9/16 の1日だけで全体の 86% の容量を占めており、ここを畳むだけで 1.1GB → 約150MB に落ちる。
直近2日(9/17・9/18 の157枚)は R128〜R133 の検証中に撮ったもので、みのるんが朝に見返す可能性があるため手元に残す。
条件は**日付のハードコードではなく「今日から2日より古い」という相対指定**にする(次回以降も同じコマンドが使えるように)。しきい値は `--days=2` で変えられるようにし、既定値を 2 にする。

### 3. 除外リスト(移さないファイル)

次のものは対象日より古くても `screenshots/` 直下に残す。スクリプト内に定数配列で持ち、理由をコメントに書く。

1. `fail-check-links-target-2026-09-16T15-52-35.txt` — `docs/ROADMAP.md:10` から参照されている
2. `r69-focus-img_mobile.png` / `r69-focus-more_mobile.png` — `scripts/check-keyboard.mjs:112,154` が**固定名で上書き保存**する先。移すと同名ファイルが2箇所にできて紛らわしい
3. `r105-q-nohit-mobile.png` — `scripts/check-hotelparam.mjs:206` が同じく固定名で書き込む先

(`2026-09-17_r128-*` と `2026-09-17_r129-*` の2枚も ROADMAP から参照されているが、9/17 なのでそもそも移動対象外。念のため除外リストにも名前を入れておくと安全)

### 4. 再発防止は「今回は入れない」

自動で畳む仕組み(フックや check-all への組み込み)は**今回作らない**。理由を NIGHTLOG に書くこと:

- `screenshots/` は撮影の証拠であり、自動で動かすと「さっき撮った画像が消えた」と作業役が混乱する。
- 代わりに `docs/CHECKS.md` に「月に1度 `node scripts/archive-shots.mjs --apply` を回す」という手順を1行書き、**人が実行する**形に留める。
- `check-all.mjs` には**登録しない**(検査ではないため)。

### 5. `docs/CHECKS.md` への追記

「撮影ファイルの命名と保持方針」という節を作り、次の4点を書く。

- 命名は `<ISO日時>_<ラベル>_<mobile|desktop>.png`(既に統一されている)。
- `screenshots/` は `.gitignore` 済みでリポジトリには入らない。
- 古いものは `node scripts/archive-shots.mjs`(確認) → `--apply`(実行)で `screenshots/archive/` へ移す。**移動なので元に戻せる**。削除はしない。
- 消してよいと判断したときだけ、みのるんが手で `screenshots/archive/` ごと消す。

## 完了条件

1. `node scripts/archive-shots.mjs` がドライランで「対象 N枚 / N MB」を表示し、1ファイルも動いていない。
2. `--apply` 実行後、`screenshots/` 直下のファイル数が **約157件**(9/17・9/18 分＋除外リスト分)に減り、`screenshots/archive/` に約950件が入っている。**合計ファイル数が移動前後で一致する**(=1枚も消えていない)ことを数えて確認する。
3. `docs/CHECKS.md` に保持方針の節がある。
4. `archive-shots.mjs` に削除系のAPI(`unlinkSync`/`rmSync`/`rmdirSync`)が1つも出てこない(`grep` して確認し、結果を NIGHTLOG に書く)。

## 検証手順

1. 移動**前**に `find screenshots -type f | wc -l` と `du -sh screenshots/` を記録する。
2. ドライラン → `--apply` → 再度カウント。**移動前の総数と移動後の総数(archive 込み)が同じ**であることを確認。
3. `node --check scripts/archive-shots.mjs` が通ること。
4. **撮影が動くこと**: `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` 相当で1枚撮り、`screenshots/` 直下に新規ファイルができることを確認。撮った画像を Read で開いてカード30枚・帰属表示「Leaflet | © OpenStreetMap」に崩れが無いことを目視する。
5. **検査が動くこと**: `node scripts/check-all.mjs` が **29本中29本PASS(exit 0)**。固定名で書き込む check(`check-keyboard` / `check-hotelparam` / `check-lightbox`)が移動後も正常に保存できることを、この通し実行で確認する。
6. `git status -sb` で `screenshots/` 配下の変更が**1件も出ない**(`.gitignore` が効いている)ことを確認。

## 変更禁止範囲

- `assets/` 以下と `fixtures/` は1文字も触らない。
- `engine.js` の rank の重み・閾値、`geo.js` は無改変。
- **画像・ログファイルの削除は禁止**(移動のみ)。`.gitignore` も変更しない。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止。
- 外部API 0回。

## 終わったら

1. `docs/ROADMAP.md` の R92 の行を **`- [x] 2026-09-18`** に変更する(R102 は R92 と内容が重複するので、R92 の成果で満たされた分は R102 の行にも一言追記してよいが、勝手に `[x]` にはしない)。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-18 R92 撮影1.1GBを可逆に畳む` の見出しを付けて**3行**(やったこと / 確認結果 / 次)を追記する。
3. **先にコミット**する(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に。長文の報告書は書かない。
