# NEXT — R25 `docs/check.mjs` を GitHub Actions で毎日1回実行

## 判断理由
残り未完了のうち R11(小地図の高さ・要デザイン判断寄り)・R14(fixture 軽量化・Overpass 再生成リスク)・R19(far 分布・rank 隣接で慎重さが要る)に対し、R25 はコード変更ゼロ・新規1ファイル・外部APIを叩かず、本番が壊れたら翌朝気づける仕組みが手に入るので費用対効果が最大。R26(README スクショ)はさらに軽いが価値も小さいので次に回す。

## 対象ファイル(絶対パス)
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\.github\workflows\check.yml`
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R25 を `[x] 2026-09-16` に)
- 追記のみ: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行)
- その他のファイルは一切変更しない(`docs/check.mjs` 自体も変更不要)

## 実装方針
`.github/workflows/check.yml` を新規作成する。内容の要件:

1. `name: check` (任意の短い名前で可)
2. トリガーは3つ:
   - `schedule:` — `cron: '30 21 * * *'`(UTC 21:30 = JST 翌朝 6:30)。GitHub の cron は数十分遅延することがあるので「毎朝6時台に走ればOK」という緩い期待にする。
   - `workflow_dispatch:` — 手動実行できるように(`gh workflow run` で緑を確認するのに必須)
   - `push:` — `branches: [main]`(実際のデフォルトブランチ名を `git branch --show-current` で確認して合わせること)
3. ジョブは1つ、`runs-on: ubuntu-latest`
4. ステップは3つだけ:
   - `actions/checkout@v4`
   - `actions/setup-node@v4` with `node-version: '20'`(check.mjs は Node18+ の標準 fetch のみ使用、依存インストール不要なので `npm ci` は書かない)
   - `run: node docs/check.mjs`
5. `permissions: contents: read` を明記(最小権限)。
6. 通知先(Slack/メール等)の設定は**書かない**。失敗時に Actions のジョブが赤くなるところまでがゴール。
7. タイムアウト保険として job に `timeout-minutes: 5` を入れておく(本番URLが無応答のとき無限に回らないように)。
8. YAML なので**タブ文字を使わない**(インデントは半角スペース2)。`on:` はクオート不要だが、エディタが `true` に解釈するような整形はしない。

補足: `docs/check.mjs` は本番URL(teer-tee.github.io)と、リンク検査で見つかる外部ドメインは fetch しない設計になっている。Overpass/Wikipedia/Nominatim は一切叩かないので、Actions から毎日実行しても無料APIのマナーに反しない。公開リポジトリなので Actions の実行時間は無料枠。

## 完了条件(検証可能)
- [ ] `.github/workflows/check.yml` が存在し、`schedule` / `workflow_dispatch` / `push` の3トリガーを持つ
- [ ] ローカルで `node docs/check.mjs` が全項目 OK・exit code 0 で終わる
- [ ] YAML の構文が正しい(下の検証手順のいずれかでパース成功)
- [ ] push 後、`gh workflow run check.yml` → 数十秒待って `gh run list --workflow=check.yml --limit 3` で **conclusion が success(緑)** の実行が1件以上ある
- [ ] push トリガーで走った分も含め、赤い実行が無い
- [ ] `git status -sb` が clean かつ origin と同期済み

## 検証手順
1. ブランチ名確認: `cd "C:\workspace\claude\旅行先用サイト\yadotabi" && git branch --show-current`
2. ローカル死活チェック: `node docs/check.mjs`(exit 0 を確認)
3. YAML 構文確認(どちらか成功すればOK):
   - `node -e "const s=require('fs').readFileSync('.github/workflows/check.yml','utf8'); if(/\t/.test(s)) throw new Error('tab found'); console.log('no tabs, '+s.split('\n').length+' lines')"`
   - さらに確実にしたい場合は `python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/check.yml',encoding='utf-8'));print('yaml ok')"`(python が無ければスキップ可。無ければ目視でインデントを確認する)
4. コミット → `git push`
5. `gh workflow run check.yml`(初回は Actions に workflow が登録されるまで少し待つ。`gh workflow list` に出てこなければ 15〜30秒待って再試行)
6. `gh run list --workflow=check.yml --limit 5` を実行し、`completed success` を確認する。in_progress なら 20〜30秒おきに数回確認する。
7. 赤かった場合は `gh run view --log-failed` でログを見て、YAML かパスの誤りを直して再 push(check.mjs 自体は直さない。本番URLが実際に壊れているなら、それは R25 の成果=検知できたということなので NIGHTLOG に事実として書き、ROADMAP に別タスクとして起票する)
8. 画面の変更が無いタスクなので撮影は省略してよい(NIGHTLOG に「画面変更なしのため撮影省略」と明記する)

## 変更禁止範囲
- `assets/` 配下すべて(app.js / geo.js / engine.js / *.css)
- `fixtures/` 配下すべて
- `index.html`、`demo/` 配下
- `docs/check.mjs` 本体(今回は実行するだけ)
- `scripts/` 配下の既存チェッカー
- git stash / reset --hard / checkout でファイルを戻す操作(AUTOPILOT 規約7)

## 難易度・所要目安
- 難易度: sonnet
- 所要目安: 15〜25分(うち gh run の待ち時間が数分)
