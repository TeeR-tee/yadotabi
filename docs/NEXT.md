# NEXT: R93 `docs/check.mjs` のリンク切れ検査が iframe のクエリ付きURLを見ているかの確認

- タスクID: **R93**
- 難易度: **sonnet**(文書1本+検査1行。ロジック変更なし)
- 所要目安: 20〜30分

## 目的

`demo/hotel-page.html:212` の iframe(本番URLを `?fixture=...&embed=1&bg=...` 付きで指す)が、R22 のリンク切れ検査の対象に入っているのかどうかが、コードを読まないと誰にも分からない状態だった。これを**実測で確定**させ、`docs/CHECKS.md` に1行残して閉じる。

## 実測で判明した前提(計画役が確認済み)

**結論: iframe は既に検査対象に入っている。ROADMAP 本文が想定した (b) の実装は不要。**

1. `demo/hotel-page.html:212` の iframe の src は `"../index.html?fixture=kusatsu&embed=1&bg=fff7e6"` で、**絶対URLではなく相対パス**。ROADMAP 本文の「本番URLを指している」は不正確。
2. `docs/check.mjs:131` の `attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g` は `src` も拾うので、この iframe の値は `rawValues` に入る。
3. `docs/check.mjs:150` の `/^https?:\/\//` に相対パスは当たらないため、`docs/check.mjs:160` の相対パス分岐 `new URL(raw, url)` に進む。
4. 計画役が同じ式を node で実行した実測値:
   - `resolved.href` = `https://teer-tee.github.io/yadotabi/index.html?fixture=kusatsu&embed=1&bg=fff7e6`
   - `resolved.href.startsWith(BASE)` = `true`(`docs/check.mjs:161` を通過)
   - `resolved.pathname` = `/yadotabi/index.html`
   - `docs/check.mjs:165` の `.replace(/^\/yadotabi\//, '')` 後 = **`index.html`**
5. つまり **`URL.pathname` を使っているおかげでクエリ文字列は自動的に落ちており**、`checkLink()`(`docs/check.mjs:175`)は `index.html` を HEAD で叩く。ROADMAP が心配した「`?hotel=` 付きで叩いて Overpass を誘発する」事故は**構造上すでに起きない**。
6. `internalPaths` は `Set`(`docs/check.mjs:143`)なので、同じ `index.html` を複数回登録しても GET は1回に畳まれる。
7. 同じ経路を通る他の相対 iframe: `demo/embed-check.html:14` の `src="../index.html?embed=1&fixture=kusatsu"` も同様に `index.html` へ解決される。
8. **検査の穴として実在するもの(こちらが本題)**: `demo/hotel-page.html:224` の `<pre class="tag-example">` 内にある**絶対URL**
   `https://teer-tee.github.io/yadotabi/?hotel=36.6226,138.5960,草津 湯けむり荘&amp;embed=1&amp;bg=fff7e6`
   は `docs/check.mjs:151` の `raw.startsWith(BASE)` に**当たってしまい**、`resolved.pathname` = `/yadotabi/` → `''` → `checkLink(page, '' || 'index.html')`(`docs/check.mjs:200`)で `index.html` として叩かれる。結果は無害(クエリは落ちるので Overpass は誘発されない)が、**HTML エスケープされた見本テキストがリンクとして抽出されている**という事実は誰も記録していない。これも1行として残す価値がある。
9. 未確認: `docs/check.mjs` は本番URLへ GET するため、実行すると GitHub Pages に数十リクエストが飛ぶ。ローカルのファイル内容と本番の内容が一致しているかは push 済みかどうかに依存する(今回は変更が docs のみなので影響なし)。

## 対象ファイル(絶対パス)

- 書き換える: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`
- 読むだけ(変更禁止): `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs`
- 読むだけ(変更禁止): `C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html`

## 実装方針

ROADMAP の分岐 (a)(入っている)を採る。**`docs/check.mjs` は1行も変更しない**。

1. `docs/CHECKS.md` の末尾(「並列化する場合に必要になる改修」節の後)に **「## リンク切れ検査(R22/R34)が何を見ているか」** 節を新設し、次の4点を書く。
   - `docs/check.mjs:131` の正規表現が `src`/`href` の両方を拾うため、**iframe の src も検査対象に入っている**。
   - `docs/check.mjs:165` が `URL.pathname` を使うため、**クエリ文字列は自動的に落ちて叩かれる**。`demo/hotel-page.html:212` の `../index.html?fixture=kusatsu&embed=1&bg=fff7e6` は `index.html` として HEAD される(上の実測値をそのまま貼る)。よって `?hotel=` 付きで叩いて Overpass を誘発する事故は構造上起きない。
   - `docs/check.mjs:143` の `Set` により、同じパスへの重複リクエストは1回に畳まれる。
   - **穴として残っている点**: `demo/hotel-page.html:224` の `<pre>` 内の見本コード(実際のリンクではない文字列)も `docs/check.mjs:151` の絶対URL分岐で抽出され、`index.html` として叩かれている。無害なので今は直さないが、将来 `<pre>` に存在しないパスの見本を書くと**偽の NG が出る**ことを注記する。
2. `docs/check.mjs` の `HTML_PAGES` 定数(`docs/check.mjs:113`)の直前に、**コメントを2〜3行だけ**足してよい(「相対 iframe の src はここで pathname に畳まれるのでクエリは叩かない」旨)。**コードの実行結果を変えないこと**。迷うなら CHECKS.md だけで済ませてよい。

## 完了条件

- `docs/CHECKS.md` に上記4点の節がある。行番号と実測値(`index.html` に畳まれること)が本文に書かれている。
- `docs/check.mjs` の**挙動**が変わっていない(コメント以外の差分ゼロ)。`git diff -- docs/check.mjs` がコメント行のみ、または空。
- `git diff --stat -- assets fixtures scripts index.html demo` が**空**(やどたび本体・デモページは無変更)。

## 検証手順

1. `node docs/check.mjs` を **1回だけ**実行し、出力に `リンク demo/hotel-page.html → index.html` の行が **OK** で出ていることを目視で確認する(= iframe が検査対象に入っている証拠。この行そのものを NIGHTLOG に貼ること)。全体が exit 0 であること。
2. `node scripts/check-all.mjs` → **27本全緑**(必須)。
3. デグレ確認の撮影1枚のみ:
   - `node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --mobile`(375px)
   - 撮った画像を Read で開き、カード30枚・番号ピン判読可・文字崩れなしを目視。
4. `node --check` は JS を触らないので不要(コメントを足した場合のみ `node --check docs/check.mjs`)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**。
- rank の重み・閾値は**変更不可**。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは**0回**。ただし `docs/check.mjs` は本番URL(同一オリジン)への GET なので**実行1〜2回は可**。
- `docs/check.mjs` のロジック(正規表現・分岐・リクエスト先)は変更しない。コメント追記のみ可。

## 終わったら

1. `docs/ROADMAP.md` の R93 行を `- [x] 2026-09-16 R93 ...` に更新し、末尾に「(実測の結果 iframe は既に検査対象。pathname でクエリが落ちるため対処不要。CHECKS.md に記録)」と1行足す。
2. `docs/NIGHTLOG.md` の「## サイクル記録」に**3行**追記(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット**してから `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
