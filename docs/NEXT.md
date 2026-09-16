# NEXT — R98 埋め込み iframe の堅牢性(sandbox / referrerpolicy)を実測で確定し明文化する

- タスクID: **R98**
- 難易度: **sonnet**(実装は属性追加と文書2箇所。判断材料は下に実測済み)
- 所要目安: 25〜35分

## 目的
営業先(宿・予約サイト)に「うちのサイトに貼って大丈夫か」「CSSがぶつからないか」と聞かれたときに答えられる状態にする。
ROADMAP の R98 本文は「sandbox は**足さない方向で理由だけ**残す」と書いているが、**計画役が Playwright で実測した結果この前提は誤り**で、適切な組み合わせなら無傷で足せることが分かった(下記)。本文の記述は今回訂正する。

## 実測で判明した前提(2026-09-16 計画役が Playwright で測定・外部API 0回)
ローカル静的サーバ + `/index.html?fixture=kusatsu&embed=1&bg=fff7e6` を iframe に入れ、親側で R48 の受信スクリプトを動かして測定した。

| iframe の属性 | カード枚数 | 高さ postMessage | Leafletタイル | localStorage | `?bg=` 反映 | コンソールエラー |
|---|---|---|---|---|---|---|
| 属性なし(現状) | 30 | 2回 / 最大17348px | 8枚 | ok | された | 0件 |
| `sandbox="allow-scripts"` のみ | **0** | 640pxのみ | 18枚 | **SecurityError** | されず | **CORS 2件** |
| `sandbox="allow-scripts allow-same-origin"` | 30 | 2回 / 17348px | 8枚 | ok | された | 0件 |
| 上記 + `allow-popups allow-popups-to-escape-sandbox` + `referrerpolicy="no-referrer"` | 30 | 2回 / 17348px | 8枚 | ok | された | 0件 |
| `referrerpolicy="no-referrer"` のみ | 30 | 2回 / 17348px | 8枚 | ok | された | 0件 |

外部リンク(`.feedcard__link` の `target="_blank"`)を実際にクリックして新規タブが開くかも測った:

| 属性 | 結果 |
|---|---|
| 属性なし | OPENED(Googleマップ経路URL) |
| `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox` | **OPENED** |
| `allow-scripts allow-same-origin`(popups なし) | **NO-NEW-PAGE(リンクが死ぬ)** |

**結論: 採用してよい組み合わせは `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` + `referrerpolicy="no-referrer"` の1つだけ。**
- `allow-same-origin` を外すと origin が `null` になり、fixture の fetch が CORS で落ち(カード0枚)、`localStorage`(受動ログ F3・地図位置 `yado.mapview.v3`)が SecurityError で throw する。
- `allow-popups` 系を外すと、カードの「行き方/公式/Instagram」等の外部リンクが全て無反応になる。営業上これは致命的。
- `allow-scripts allow-same-origin` の同時指定は「サンドボックスの実効性がほぼ無い」とよく批判される組み合わせだが、**同一オリジンに置く自社ページの iframe ではなく別オリジン(github.io)からの埋め込みなので、親ページから見た防御としては依然として意味がある**(親の DOM/Cookie に触れない)。この理由も文書に残すこと。

その他、コードを読んで確認した事実:
- `demo/hotel-page.html:212-213` の iframe の現在の属性は `class="embed" src loading="lazy" title style="border:0;"` の5つのみ(`sandbox`・`referrerpolicy` なし)。
- `demo/embed-check.html:14` と `README.md:40` にも iframe タグの例がある(こちらは属性なし)。
- `assets/app.js:1433` が `global.parent.postMessage({...}, '*')` を送る側。**送信側は今回一切触らない。**
- 親ページの CSS が iframe の中身を壊さない件は iframe が独立文書である以上構造上自明だが、**未確認**(今回は乱暴なCSSを入れた撮影までは必須にしない。やるなら下の任意項目)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html`
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`
- (任意) `C:\workspace\claude\旅行先用サイト\yadotabi\demo\embed-check.html`

## 実装方針
1. `demo/hotel-page.html:212-213` の実 iframe に2属性を足す:
   `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` と `referrerpolicy="no-referrer"`。既存5属性・`loading="lazy"` は維持。直上に「なぜこの4トークンが全部要るか」を実測値つきで2〜3行コメント。
2. 同ファイル `:229` 付近の `<pre class="tag-example">`(営業先がコピーするタグ)にも同じ2属性を入れ、**表示用コピーと実 iframe を必ず揃える**(R88 で上限値がズレていた前例あり)。
3. 同ファイル `.sales-notes`(`:217`〜`:223` の `<ul>`)に1〜2行追記: 「iframe は独立した文書なので、宿ページ側のCSS・JavaScriptからは干渉されません(逆にやどたび側も宿ページを書き換えません)」。
4. `README.md:37`〜`:44` の埋め込み節の iframe 例(`:40-41`)にも同2属性を足し、直後に「`sandbox` のトークンを削ると何が壊れるか」を上の実測表から3行に要約して載せる(`allow-same-origin` を外すとデータ取得と保存が死ぬ / `allow-popups` を外すと外部リンクが死ぬ)。
5. `demo/embed-check.html:14` はローカル確認用なので、揃えるか触らないかを実装時に決めて理由を NIGHTLOG に1行残す。

## 完了条件
- `demo/hotel-page.html` の実 iframe と `<pre>` のコピーで sandbox トークン4つ・referrerpolicy が完全一致している。
- `demo/hotel-page.html` を開いてカード30枚が出て、iframe の高さが自動で伸び(二重スクロールなし)、カードの外部リンクをクリックして新規タブが開く。
- `git diff --stat -- assets fixtures scripts index.html` が**空**(やどたび本体は無変更)。

## 検証手順
1. `node --check` は不要(HTML/MD のみ)。
2. 撮影(いずれも外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs http://127.0.0.1:3000/demo/hotel-page.html --mobile`(375px)
   - 同URLを PC幅(1280px)でも撮影
   - 画像を **Read で開いて目視**: カード30枚・番号ピン判読可・文字崩れ/はみ出しなし・背景色 `#fff7e6` が効いている・iframe 内に二重スクロールが出ていない。
3. `node scripts/check-embedheight.mjs` が **8件 PASS**(sandbox 追加後も高さ通知が通ることの本命の回帰検査)。
4. 外部リンクの生存確認: Playwright で iframe 内の `.feedcard__link` をクリックし新規タブが開くことを1回だけ機械確認する(使い捨てスクリプトは `C:\Users\rt774\AppData\Local\Temp\claude\...\scratchpad` に置き、リポジトリには残さない)。
5. **`node scripts/check-all.mjs` が 27本全緑(exit 0)** — 必須。
6. コンソールエラー0件を確認。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**。
- rank の重み・閾値は**変更不可**。
- `assets/app.js`(postMessage 送信側)も今回は無変更。
- `git stash` / `git reset` / `git checkout` でのファイル復元は**禁止**。
- 外部API(Overpass / Wikipedia / Nominatim)呼び出し **0回**。fixture のみ。
- `scripts/check-*.mjs` の既存検査を減らさない。

## 終わったら
1. `docs/ROADMAP.md` の R98 を `[x] 2026-09-16` にする。**あわせて本文の「sandbox は足さない方向で理由だけ残す」を実測結果に合わせて訂正する**(事実誤認をそのまま残さない)。
2. `docs/NIGHTLOG.md` の「サイクル記録」に3行(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
