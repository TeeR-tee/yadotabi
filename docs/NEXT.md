# NEXT — R22 `docs/check.mjs` にリンク切れ検査を追加

担当: builder-sonnet / 難易度: 低〜中 / 所要目安: 20分

## 選定理由(1行)
R2-1 と朝の相談項目を除く残り(R10/R11/R14/R15/R19/R21/R22)のうち、R22 は公開物の健全性を毎サイクル自動で守る土台であり、外部APIを一切叩かず(本番の自サイトのみ)・見た目のデグレ risk がゼロで、最も費用対効果が高いため。

## 目的
index.html と demo/*.html が参照している**自サイト内の相対パス**(css / js / iframe src / 画像 / fixtures)と、
meta タグ内の**自サイト絶対URL**(og:image = `docs/og.jpg` など)が、本番 GitHub Pages で本当に 200 を返すかを検査する。
サブパス `/yadotabi/` 配下でのパス間違い(`/assets/...` と書いてしまう等)や、ファイルを消した/リネームした際の取りこぼしを機械的に検出するのが狙い。

## 対象ファイル(絶対パス)
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs` ← **このファイルだけ**
- 参照(読むだけ・変更禁止): `index.html`, `demo/embed-check.html`, `demo/hotel-page.html`

## 現状の check.mjs(実物・全82行)
- 10行: `const BASE = 'https://teer-tee.github.io/yadotabi/';`
- 12〜22行: `TARGETS` 配列(index.html / assets 6本 / fixtures 2本)を固定列挙
- 24〜25行: `JS_FILES` Set と `MIN_JS_BYTES = 1000`
- 27行: `let hasFailure = false;`
- 29〜33行: `report(label, ok, detail)` — `[OK]/[NG]` を1行出力し NG なら `hasFailure = true`
- 35〜73行: `async function checkTarget(path)` — `BASE + path` を fetch し、200 判定 → `<title>やどたび` / JSON妥当性 / JSサイズ の追加検査
- 75〜77行: `for (const path of TARGETS) await checkTarget(path);`
- 79〜81行: `if (hasFailure) process.exitCode = 1;`

## 実装方針
既存の `report()` / `hasFailure` / `BASE` をそのまま再利用し、**末尾(77行目の for ループの後、79行目の exitCode 判定の前)に追記**する形にする。既存の TARGETS ループと report の書式は一切変えない。

1. `HTML_PAGES = ['index.html', 'demo/embed-check.html', 'demo/hotel-page.html']` を新設。
2. `async function collectLinks(page)`:
   - `fetch(BASE + page)` して本文を取得(非200ならその旨を report して空配列を返す)。
   - 正規表現で属性値を抽出する。最低限この3系統:
     - `/(?:src|href)\s*=\s*"([^"]+)"/g`(css / js / iframe / 画像 / a)
     - `/<meta[^>]+content\s*=\s*"([^"]+)"/g`(og:image, twitter:image 等)
   - 抽出した値を**振り分ける**:
     - `#` 始まり、`javascript:`、`mailto:`、空文字 → 無視
     - `http://` / `https://` 始まりで **`BASE` で始まらないもの** → **外部ドメインなので叩かない**(件数だけ数え、`[OK] <page> 外部リンク N件(検査対象外)` と出す)
     - `BASE` で始まる絶対URL → `BASE` を剥がして相対パスとして扱う
     - それ以外(相対パス) → **ページの位置を基準に解決する**。`new URL(value, BASE + page)` を使い、結果が `BASE` で始まらなければ「サイト外に出た」として NG。
   - **クエリ文字列は落とす**(`?embed=1&fixture=kusatsu` を付けたまま叩かない。`new URL(...)` の `.pathname` を使う)。`demo/hotel-page.html` の iframe src はクエリ付きなので必須。
   - `demo/*.html` の `../index.html` が `BASE + 'index.html'` に正しく解決されることが、この解決ロジックの要。
3. 抽出した自サイトURLを **Set で重複排除**してから順に `fetch(url, { method: 'HEAD' })` する。
   - GitHub Pages が HEAD に 405 等を返す場合に備え、**200以外が返ったら GET で1回だけ確認し直す**(GETで200ならOK扱い)。
   - 結果は `report(`リンク ${page} → ${path}`, ok, detail)` の形で1行ずつ出す。
4. 直列(`for ... await`)で回す。並列化しない(自サイトとはいえ行儀よく)。

### 注意
- 外部ドメイン(unpkg.com の leaflet.css / leaflet.js)は**絶対に fetch しない**。これは AUTOPILOT の「無料APIのマナー」に準じた必須条件。
- `demo/hotel-page.html` の `href="#"` 3件はスキップされること。
- 検査で見つかった NG を**この場で修正しない**。NG が出たら NIGHTLOG に事実を書き、ROADMAP に別タスクとして起票する(1サイクル1タスク)。

## 完了条件
- [ ] `node docs/check.mjs` が既存9項目 + リンク検査を出力し、**全て OK で exit code 0**(NG が出たら上記「注意」に従い起票して報告)
- [ ] 出力に `docs/og.jpg`(og:image の絶対URL)の 200 確認行が含まれる
- [ ] 出力に `demo/embed-check.html` 由来の `../index.html` → `index.html` の解決結果が含まれる
- [ ] 出力に unpkg など外部ドメインを叩いた形跡が無い(「外部リンク N件(検査対象外)」の行のみ)
- [ ] `node --check docs/check.mjs` が通る

## 検証手順
1. `node --check docs/check.mjs`
2. `node docs/check.mjs` を実行し、**出力全文を NIGHTLOG に貼れる形で確認**する
3. 既存検査のデグレが無いこと(`[OK] index.html (HTTP 200)` などが従来どおり出る)
4. 回帰確認: `node docs/check.mjs` 以外は何も変えていないので、`node scripts/check-engine.mjs`(111件) と `node scripts/check-a11y.mjs` が従来どおり通ることだけ確認
5. **撮影は不要**(画面を一切変更しないタスクのため)。ただし念のため `?fixture=kusatsu` mobile を1枚だけ撮って崩れが無いことを確認してもよい

## 変更禁止範囲
- `index.html` / `demo/*.html` / `assets/*` / `fixtures/*` / `scripts/*` は**一切変更しない**(検査で NG が出ても直さない)
- `docs/ROADMAP.md` は `- [x] 2026-09-16 R22 ...` に更新するのみ
- rank の重み・engine.js のロジックには触れない
- git stash / reset --hard / checkout は禁止

## 終わったら
1. **先にコミット**(`docs/check.mjs` + ROADMAP + NIGHTLOG 3行)→ `git push`
2. 報告は簡潔に(長文の報告書を書かない)
