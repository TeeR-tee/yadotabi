# NEXT: R106 `docs/CHECKS.md` を `scripts/check-all.mjs` の実体と一対一に合わせる

- タスクID: **R106**
- 難易度: **sonnet**(文書のみ・コード変更なし)
- 所要目安: 20〜30分

## 目的

`docs/CHECKS.md` は朝にみのるんが「今どんな検査が回っているか」を読む唯一の文書だが、実体より2本古く、本数(25本/24本/21本/4本)も全て実際と違う。**文書と実態のズレは、朝に読む人にとって記録全体の信頼性を損なう。** 実体に合わせて直し、今後ズレたら気づける注記を1行足す。

## 実測で判明した前提(2026-09-16 計画役が実行して確認)

1. `ls scripts/check-*.mjs` は 27ファイル。うち `check-all.mjs` 自身を除いた **check本は26本**。
2. `scripts/check-all.mjs:14-40` の `SCRIPTS` 配列は `scripts/check-*.mjs` **26本 + `docs/check.mjs` 1本 = 計27本**。`check-all.mjs:2` のコメントも「26本 + docs/check.mjs の計27本」で正しい。
3. 名前の突き合わせ結果(`comm` で差分を取った実測):
   - **実体にあって `docs/CHECKS.md` に載っていない本 = 2本**: `check-debugflag`(R84 で新設)、`check-nosummary`(R83 で新設)。
   - CHECKS.md にあって実体に無い本 = **0本**(幽霊行は無い)。
4. `docs/CHECKS.md` の `^| check` で始まる表行は **24行**(サーバを立てる節21行 + 不要な節3行 `check-engine`/`check-geo`/`check-r5`)。`docs/check.mjs` の行を足して25行。→ ROADMAP の R106 本文にある「27行」は**事実誤認**(`^| ` で数えるとヘッダ区切りを含むため)。これも訂正対象。
5. サーバを立てる本数の実測: `grep -l "http.server" scripts/check-*.mjs` = **23ファイル**(`check-all.mjs` を含まない。`check-all.mjs` はグレップに一致しない)。サーバを立てない本は `check-engine` / `check-geo` / `check-r5` の **3本**。よって正しい内訳は **サーバを立てる23本 + 立てない3本 + `docs/check.mjs` = 27本**。
   - 現行 CHECKS.md の「21本」「4本」は、`docs/check.mjs` を「立てない側」に数えていたこと(4本)と、R83/R84 の2本が未反映だったことの合算のズレ。
6. `check-debugflag` / `check-nosummary` が何を検査するかは NIGHTLOG に記録あり: debugflag は「`?debug=1` 単独(fixture 無し)では `.dbg` が0件」等11項目、nosummary は R83 の「要約が無いカードの代替1行」。**未確認**: 両本がサーバを立てるか否かは grep の23本に含まれるかで作業役が確認すること(計画役は個別確認していない)。

## 対象ファイル(絶対パス)

- 編集する: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`
- 読むだけ: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`、`C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-debugflag.mjs`、`C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`

## 実装方針(行番号つき)

1. `docs/CHECKS.md:1` の見出し「…が回す25本の一覧…」→ **27本**に訂正。
2. `docs/CHECKS.md:1` の直後(新しい2行目あたり)に注記を1行足す:
   > この表は `scripts/check-all.mjs` の `SCRIPTS` 配列(`check-all.mjs:14`)と**一対一で一致させること**。check 本を増減したらこの表も同じコミットで直す。
3. `docs/CHECKS.md:5`「`check-*.mjs` の24本と `docs/check.mjs` の1本、計25本」→ 「**26本** と `docs/check.mjs` の1本、計**27本**」に訂正。
4. `docs/CHECKS.md:7` の節見出し「サーバを立てる21本」→ **23本**。同 `:49` の「21本が同じポート3000」も **23本**に、`:54` の「(21ファイルの1行修正)」も **23ファイル**に訂正。
5. `docs/CHECKS.md:11-33` の表に、名前順の正しい位置へ2行追加:
   - `| check-debugflag | \`?fixture=\` 併用時だけ効く \`?debug=1\` のスコア内訳表示(fixture 無しでは出ないこと) |` → `check-chipcurrent`(`:16`)と `check-distance`(`:17`)の間。
   - `| check-nosummary | Wikipedia 記事が無いカードの代替1行の表示 |` → `check-nohotels`(`:29`)と `check-passive`(`:30`)の間。
   - 事前に手順6で立ち位置(サーバを立てる/立てない)を確認し、立てない本だったら `:40-45` の表の側へ入れて本数も調整すること。
6. `docs/CHECKS.md:38` の節見出し「サーバもPlaywrightも不要な4本」→ 実体に合わせて **3本 + `docs/check.mjs`** の書き方に直す(`docs/check.mjs` は本番URLへGETするので「サーバを立てない」の理由が他3本と違う、と1行添える)。
7. `docs/CHECKS.md:35-36` の所要目安の段落は数字が実測値なので**書き換えない**。ただし `:35` 末尾「現在は25本に増え約4分」→「現在は27本」に数字だけ訂正。
8. 本数を直した後、文書内に残る「25本」「24本」「21本」「4本」を `grep -n` で洗い、取りこぼしが無いことを確認する。

## 完了条件

- `docs/CHECKS.md` の check 本の名前一覧が `scripts/check-all.mjs:14-40` の `SCRIPTS` と**過不足ゼロで一致**する(作業役自身が `comm` か目視で差分0を確認)。
- 文書内の本数が全て 27 / 26 / 23 / 3 に揃っている。
- 冒頭に「`check-all.mjs` の配列と一致させること」の注記が1行ある。
- `scripts/check-all.mjs` と各 check 本の中身は**1行も変更されていない**(`git diff --stat -- scripts docs/check.mjs assets index.html` が空)。

## 検証手順

1. `node scripts/check-all.mjs` → **27本全緑・exit 0**(必須)。
2. 名前の突き合わせを再実行して差分0を確認:
   `ls scripts/check-*.mjs | sed 's|scripts/||;s|\.mjs||' | grep -v '^check-all$' | sort` と CHECKS.md から抽出した名前を `comm` で比較。
3. `git diff --stat` に `docs/CHECKS.md` と `docs/ROADMAP.md` と `docs/NIGHTLOG.md` 以外が出ていないこと。
4. 撮影: 画面は一切変わらないので**デグレ確認1枚のみ**。
   `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile`(幅375)を撮り、Read で開いてカード30枚・文字崩れなしを目視する。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**不可**。
- rank の重み・閾値は**不可**。
- `scripts/check-all.mjs` と各 `scripts/check-*.mjs`、`docs/check.mjs` の中身は**不可**(R106 は文書のみ)。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- 外部API呼び出し **0回**(fixture のみ使用)。

## 終わったら

1. `docs/ROADMAP.md` の R106 の行を `- [x] 2026-09-16 R106 …` にする(本文末尾に実測の差分2本と、ROADMAP本文の「27行」が事実誤認だった旨を短く追記)。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」の末尾に3行(やったこと / 確認結果 / 次)を追記する。**先頭に新しい節を作らない。**
3. **先にコミット** → `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
