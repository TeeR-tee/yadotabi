# NEXT — R135 `docs/CHECKS.md` を実装に同期する

- タスクID: **R135**
- 難易度: **sonnet**
- 所要目安: 40〜60分(うち `check-all.mjs` の実行が約5分)
- 対象: ドキュメント1本のみ。やどたび本体・assets・fixtures・scripts は**一切変更しない**

## 目的

R134 で README に4件の食い違いが見つかったのと**同じ種類の陳腐化**が docs 配下に残っていないかを、計画役が全文書で実測照合した。結果、**食い違いが集中していたのは `docs/CHECKS.md` ただ1本**だった(FIXTURES.md・passive-log.md・AUTOPILOT.md は実測と一致。`scripts/` に未参照の残骸ファイルも0件)。

CHECKS.md は「`node scripts/check-all.mjs` が何をしているか」を人が最初に読む案内文書であり、**ここが嘘だと読んだ人が存在しないコードを直しに行く**。とくに「各本が自前でポート3000を掴んでいる」という記述は R130 の共有サーバ化で完全に過去のものになっているのに、文書はまだそれを前提に「並列化できない理由」を説明している。

## 実測で判明した前提(食い違い一覧・行番号 / 書かれている値 / 実際の値)

すべて計画役が 2026-09-18 にコマンドで実測した。**ただし作業役は数値を鵜呑みにせず、自分で同じコマンドを流して確かめてから書くこと**(R134 で前任の計画役が誤った前提を書いた再発防止)。

| # | 行 | 書かれている値 | 実際の値(実測コマンド) | 実害 |
|---|---|---|---|---|
| 1 | `docs/CHECKS.md:3` | 「`check-all.mjs` の `SCRIPTS` 配列(**`check-all.mjs:14`**)」 | `SCRIPTS` の定義は **`scripts/check-all.mjs:17`**。`:14` は `const ROOT = ...` の行(`grep -n "const SCRIPTS" scripts/check-all.mjs`) | 中。行番号を頼りに開くと別の行に着く |
| 2 | `docs/CHECKS.md:9` | 節見出し「サーバを立てる**24本**(ポート3000占有・**全て Playwright あり**)」 | サーバを使うのは **25本**。この節の表の行数も **25行**で、見出しの24と表の25が自己矛盾している(`sed -n '13,40p' docs/CHECKS.md \| grep -c "^| check"` = 25、`grep -l ensureServer scripts/check-*.mjs \| grep -v check-all \| wc -l` = 25) | 大。本数が文書内で食い違っている |
| 3 | `docs/CHECKS.md:44,51` | 「サーバもPlaywrightも**不要な3本** + docs/check.mjs」 | サーバ不要は4本(check-engine / check-geo / check-r5 / docs/check.mjs)で正しいが、**`docs/check.mjs` は Playwright を使う**(`grep -l playwright scripts/check-*.mjs docs/check.mjs \| wc -l` = 25 で、内訳はサーバを使う25本のうち playwright 無しの1本を除いた24本 + docs/check.mjs)。作業役は `grep -l playwright` を自分で流して、Playwright を使う本とサーバを使う本が**同じ集合ではない**ことを確かめてから書き直すこと | 中。節見出しの「Playwrightも不要」が docs/check.mjs には当てはまらない |
| 4 | `docs/CHECKS.md:55` | 「**23本**が同じ**ポート3000**を `--bind 127.0.0.1` で占有します。同時に2本走らせると後発が `EADDRINUSE` で即死します」 | **現在ポート3000を掴む check 本は0本**。R130 で `scripts/lib/server.mjs` の `ensureServer()` に一本化され、`findFreePort()` が `listen(0)` で OS に空きポートを選ばせている(`scripts/lib/server.mjs:33-43`)。`check-all.mjs:86` が親で1本だけ立て `YADOTABI_BASE` で子に渡す。`grep -rn "PORT = 3000" scripts/check-*.mjs` は**0件**(ヒットするのは `scripts/dump-rank.mjs` と `scripts/make-readme-shots.mjs` の2本だけで、どちらも check-all の対象外) | **最大**。この節を信じた人は存在しない `const PORT = 3000` を23ファイル探すことになる |
| 5 | `docs/CHECKS.md:58-63` | 「並列化する場合に必要になる改修」の1.「各本の `const PORT = 3000` を `Number(process.env.YADO_PORT) \|\| 3000` にする(**23ファイルの1行修正**)」・2.「`check-all.mjs` が本ごとに空きポートを割り当てて環境変数で渡す」 | **1も2も R130 で既に実装済み**(空きポート実測 + `YADOTABI_BASE` での受け渡し)。残っている障壁は 3. のメモリ上限とフレーク切り分けコストだけ | 大。「やる必要のある作業」として済んだ作業が2件残っている |
| 6 | `docs/CHECKS.md:41-42` | 所要目安が3世代混在: 「(R55 実測・**当時20本時点**)合計 **162.8s**」「**現在は27本**」「**27本**(check-all.mjs)の合計は **221.2s**、最遅は `check-embedbg 18.2s`」 | 現在は **29本**。直近の実測は NIGHTLOG の R2-1 サイクルで **279.4s**、R130 の3連続で 283s / 286s / 279s。27本という記述が2箇所ある | 中。総本数が冒頭(29本)と末尾(27本)で食い違う |
| 7 | `docs/CHECKS.md:11` | 「各本が自前でポート3000を spawn/kill するのをやめた」(R130 の説明として正しい) | 記述自体は正しいが、**`scripts/check-*.mjs` の16本の冒頭コメントには「自分で `python -m http.server 3000` を起動して検証後に落とす」が今も残っている**(`grep -ln "自分で .python -m http.server 3000. を起動" scripts/check-*.mjs \| wc -l` = 16)。check 本の中身は AUTOPILOT の原則で無編集なので、**今回はコードを直さず CHECKS.md 側に注記を1行足す** | 中。コードを読んだ人が文書と逆の結論を出す(R134 で実際に起きた事故と同じ構図) |

### 食い違いが**無かった**こと(作業役は触らないこと)

- `docs/FIXTURES.md` … `AREAS` 4エリアの lat/lon/osmRadiusM(`scripts/make-fixture.mjs:19-24`)、keep-list 14種(`scripts/slim-fixtures.mjs:24-39`)、スリム後サイズ(kusatsu 55.5KB / hakone 585.7KB / dogo 93.7KB / beppu 122.6KB)、`FAR_DRIVE_MIN`×`DRIVE_M_PER_MIN`=30,000m、「29本全緑」の記述 — **すべて実測と一致**。
- `docs/passive-log.md` … `PASSIVE_KEY = 'yado.passive.v1'`(`assets/app.js:297`)・上限200件(`:298`)・90日(`:299`)・`?demo=passive` で直近10件(`:237` の `slice(-10)`) — **すべて一致**。
- `docs/AUTOPILOT.md` … 役割・絶対ルール8項目・NIGHTLOG の書き方 — 実装と照合すべき数値が無く、運用規約として現状と矛盾なし。
- `scripts/` の未参照ファイル … `archive-shots` / `dump-rank` / `make-fixture` / `make-readme-shots` / `slim-fixtures` は**全て docs または README から参照されている**。孤児ファイルは0件。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md` ← **唯一の編集対象**
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` ← 完了マークのみ
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` ← 3行追記のみ

読むだけ(編集しない): `scripts\check-all.mjs` / `scripts\lib\server.mjs` / `scripts\check-*.mjs` / `docs\check.mjs`

## 実装方針

1. **まず自分で実測する**(計画役の表を写すのではなく、同じコマンドを流して数字を出す)。最低限このあたり:
   - `grep -n "const SCRIPTS" scripts/check-all.mjs`(行番号)
   - `grep -l ensureServer scripts/check-*.mjs | grep -v check-all | wc -l`(サーバを使う本数)
   - `grep -l playwright scripts/check-*.mjs docs/check.mjs`(Playwright を使う本の一覧)
   - `grep -rn "PORT = 3000" scripts/ docs/check.mjs`(ポート3000を掴む本が本当に0本か)
   - `sed -n '13,40p' docs/CHECKS.md | grep -c "^| check"`(表の行数)
2. 上の表 #1〜#6 を、実測した値で直す。**見出しの本数と表の行数を必ず一致させる**(これが今回いちばん恥ずかしい種類のバグ)。
3. 「## 並列化できない理由」節を**現状に書き換える**。ポート衝突はもう理由ではないので、理由は「Windows のメモリ上限(`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績)」と「フレークの切り分けコスト」の2点に整理する。R130 で何が既に解決済みかを1行で書き、「並列化する場合に必要になる改修」節から**済んだ2項目を落とす**(消したこと自体は節の冒頭に1行残してよい)。
4. 所要目安(`:41-42`)を、**自分で `node scripts/check-all.mjs` を1回流して出た合計秒と最遅の本名・秒**に置き換える(検証手順で必ず1回流すので、その出力をそのまま使えばよい)。過去の R55/R89 の記録は「履歴」として1行にまとめるか削るかは作業役の判断でよいが、**現在値がどれかが一目で分かること**。
5. #7 の注記を1行足す(例:「各 check 本の冒頭コメントには R130 以前の『自分で `python -m http.server 3000` を起動』という記述が16本に残っているが、実体は `ensureServer()` に一本化済み。check 本の中身は無編集の原則なので、コメントは直さずここに注記する」)。
6. 末尾の「この表が古くなっていないかの確認方法(R106)」節が、**今回の食い違いを検出できなかった理由**を考えて手順を1つ補強する(表の行数だけでなく、**節見出しに書いた本数**も突き合わせる、など)。同じ陳腐化が3ヶ月後にまた生えないようにするのが今回の本当の成果。

## 完了条件

- [ ] `docs/CHECKS.md` の本数(冒頭・節見出し・表の行数・末尾の所要目安)が**すべて実測値で一致**している
- [ ] `grep -n "23本\|24本\|27本\|20本時点" docs/CHECKS.md` が**空**
- [ ] `grep -n "ポート3000" docs/CHECKS.md` の残りが、**過去の経緯としての言及だけ**になっている(現状の説明としては残っていない)
- [ ] `SCRIPTS` 配列の行番号が実際の行と一致している
- [ ] 「並列化できない理由」が R130 後の現状を説明している
- [ ] check 本の冒頭コメントが古いことへの注記が1行ある
- [ ] R106 節の確認手順が1つ補強されている
- [ ] `docs/CHECKS.md` 以外の実装ファイルの差分が**0**(`git status -s` で確認)

## 検証手順

1. `node scripts/check-all.mjs` → **29本中29本PASS(exit 0)** を必須とする。出力の合計秒・最遅の本名と秒を、そのまま CHECKS.md の所要目安に書く。
2. `git status -s` で、変更が `docs/CHECKS.md` `docs/ROADMAP.md` `docs/NIGHTLOG.md` の3つだけであることを確認する。
3. 上の完了条件の `grep` を1つずつ実行して結果を NIGHTLOG に書ける形にしておく。
4. 画面には影響しないので**撮影は不要**(NIGHTLOG の「見た目の確認結果」には「ドキュメントのみの変更で画面に影響なし」と書く)。

## 変更禁止範囲

- `assets/` 以下(app.js / geo.js / engine.js / style.css / tokens.css / ui.css)は**一切触らない**
- `fixtures/` は触らない。再生成もしない
- `scripts/check-*.mjs` と `docs/check.mjs` の**中身は無編集**(古いコメントも直さない。CHECKS.md 側に注記するだけ)
- rank の重み・閾値は変更不可
- **数値は作業役が自分で実測して書くこと**。この NEXT.md の表を写経しない(R134 で前任の計画役が誤った前提を書いた事故の再発防止。計画役の数字と自分の実測がずれたら**自分の実測を採用し、ずれた事実を NIGHTLOG に書く**)
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- 外部API **0回**(`node docs/check.mjs` が本番URLへ GET するのは check-all の一部として従来どおりで、これは数に入れない)

## 終わったら

1. `docs/ROADMAP.md` の R135 を **`- [x] 2026-09-18 R135 ...`** に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-18 R135 CHECKS.md を実装に合わせ直す` の見出しを付けて**3行**(やったこと / 見た目の確認結果 / 次)を追記する
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書は書かない)
