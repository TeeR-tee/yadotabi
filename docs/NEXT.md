# NEXT: R52 + R53 文書2本(パラメータ一覧表の是正 + 埋め込み手順の明文化)

難易度: **sonnet** / 所要目安: **20分** / コード変更なし(文書・デモページの表示文のみ)

## 選定理由(1行)
残候補 R14/R19/R40 は fixture 再生成で Overpass を叩くため夜間に回すには重く、R54/R55 は撮り比べ・計測の判断が要る。一方 R52 は調査の結果 **README の `?demo=` 行が実装(11値)に対し 7値しか書かれておらず実際に古い**(R28 `nohotels` / R44 `autozoom` / R43 `hoteltip` が欠落)ことが判明したため、無害な文書タスクではなく実在の誤記修正になる。R53 も受信スクリプトが HTML コメントにしか説明が無く読者に届いていないので同種。両方ともコード無変更で検証可能。

## 計画役の事前調査(実測済み・作業役は再確認だけでよい)
- `assets/app.js:1278-1310` の `var demo = params.get('demo')` 分岐に実在する値は **11個**:
  `far` / `zoomout` / `suggest` / `recent` / `recentmix` / `passive` / `imgfail` / `nohotels` / `autozoom` / `hoteltip`
  (※ `zoomout` は `demoNoSaveView` と `demoStateA` の両方を立てる。上の列挙で重複して見えるのは同じ値の2行)
  → 正味は **10値**。README は 7値しか書いておらず `nohotels` / `autozoom` / `hoteltip` の3つが欠落。
- `?simulate=` の実在値は **`overpass504`(app.js:1269)と `empty`(app.js:1277)の2つのみ**。README は正しい。
- `?slow=` は `assets/app.js:1197 slowDelaysFromUrl()` と `assets/geo.js:87 slowDelays`。形式 `osm<ms>,wiki<ms>`、上限は app.js の実装を読んで確認すること(README は10000msと記載)。
- `?fixture=` の実在値は `fixtures/` 配下の `kusatsu` / `hakone` / `dogo` の3つ。README は正しい。
- `?embed=1` / `?perf=1` / `?hotel=` / `?q=` も README の記載どおり。
- 既存の表は README の「## URLパラメータ一覧」節(README.md 内、「## ファイル構成」の直前)にあり、**2列(パラメータ / 実装上の値)**。ROADMAP R52 が求める4列にはなっていない。

## 対象ファイル(絶対パス)
1. `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`
2. `C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html`
3. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md`(相互リンク1行の追加のみ)
4. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針

### R52 — README のパラメータ一覧表を4列に作り直す
- 既存の「## URLパラメータ一覧」節の表を、**4列**に置き換える:
  `| パラメータ | 値の例 | 何が起きるか | 外部APIを叩くか |`
- 各行の「外部APIを叩くか」は事実ベースで書く。目安:
  - `?fixture=` → **叩かない**(fixtures/ の保存済み応答のみ)
  - `?demo=` の `suggest`/`recent`/`recentmix`/`zoomout`/`nohotels`/`autozoom`/`hoteltip` → 状態Aのデモ分岐で宿ピンを取りに行かないため **叩かない**(app.js の `demoStateA` 分岐を読んで各値ごとに確認すること。憶測で書かない)
  - `?simulate=overpass504` → Overpass は飛ばさない。Wikipedia 側は fixture 併用かどうかで変わるので、併用前提で書く
  - `?hotel=` / `?q=` 単独 → **叩く**
- `?demo=` は値が10個あって1行に詰めると読めないので、**`?demo=` だけ別の小見出し+専用の表**に切り出してよい(各値1行 / 何が再現されるか)。判断は作業役に任せるが、選んだ形を NIGHTLOG に1行残す。
- **app.js を grep して実在するものだけ書く**。ROADMAP 本文や NIGHTLOG の記述と実装が食い違う場合は**実装を正**とし、食い違いを NIGHTLOG に1行残す。
- 表の直後に `docs/FIXTURES.md` への相対リンク1行を置く。逆に `docs/FIXTURES.md` からも README のこの節への相対リンクを1行足す(R52 の「FIXTURES.md からもリンクする」要件)。

### R53 — `demo/hotel-page.html` の `.sales-notes` に貼り方の説明を足す
- 現状 `hotel-page.html:214-222` の `<ul>` は3項目、その下に `<pre class="tag-example">` の iframe タグ1行。高さ自動調整の受信スクリプト(同ファイル 224-235行)については **HTML コメント(221行)にしか触れられておらず、ページを見た人には存在が伝わらない**。
- `.sales-notes` に営業資料として読める **2〜3行**を追記する。必ず含める内容:
  1. `width="100%"` / `height` は初期値(720程度)でよく、**高さは受信スクリプトを置けば自動で伸びる**こと(置かない場合は固定高のままで中に二重スクロールが出る)
  2. `?hotel=<緯度>,<経度>,<宿名>` の**宿名は URL エンコードが必要**なこと(日本語・空白を含むため)
  3. 受信スクリプトの実物がこのページの `</body>` 直前にあること(「このページのソースをそのままコピーできます」)
- 受信スクリプトを**見える形で示す**なら `<pre class="tag-example">` をもう1つ増やしてよい(`&lt;script&gt;` へのエスケープを忘れないこと)。増やす場合は mobile 375px で `pre` が横にはみ出さないこと(既存の `overflow-x:auto` と `word-break:break-all` が効いているか撮影で確認)。
- **やどたび本体(index.html / assets/)は一切変更しない。**

## 変更禁止範囲(厳守)
- `assets/` 配下すべて(app.js / geo.js / engine.js / *.css)
- `fixtures/` 配下すべて
- `scripts/` 配下すべて(check-*.mjs / check-all.mjs / make-fixture.mjs / dump-rank.mjs)
- `index.html`
- 作業後に `git diff --stat -- assets fixtures scripts index.html` が**空**であることを確認する

## 完了条件(すべて検証可能)
1. `grep -n "params.get('demo')" -A 40 assets/app.js` で拾える `demo === '…'` の値の集合と、README の `?demo=` 表に並ぶ値の集合が**完全一致**する(過不足ゼロ)。同様に `?simulate=` は `overpass504` / `empty` の2つと一致。
2. README の表が4列(`パラメータ / 値の例 / 何が起きるか / 外部APIを叩くか`)になっている。
3. README → `docs/FIXTURES.md`、`docs/FIXTURES.md` → README のリンクが双方向に存在する。
4. `demo/hotel-page.html` の `.sales-notes` に、上記3点(高さ自動調整・URLエンコード・受信スクリプトの所在)が読める形で入っている。
5. `node docs/check.mjs` が全項目 OK・exit 0(README のリンク切れ検査を含むので、追加した相対リンクが壊れていれば落ちる)。
6. `node scripts/check-all.mjs` が **18本全PASS・exit 0**。
7. `git diff --stat -- assets fixtures scripts index.html` が空。

## 検証手順
1. `node --check` は対象外(JS を触らないため)。代わりに `node docs/check.mjs` を先に回す。
2. `demo/hotel-page.html` は表示が変わるので**撮影必須**:
   `node C:\workspace\tools\shot\shot.mjs http://localhost:3010/demo/hotel-page.html --mobile --full`
   (ポートは既存の撮影手順に合わせる。`--full` でページ全体を1枚に)
   → 画像を **Read で開いて目視**し、(a) `.sales-notes` の追記が折り返しで崩れていないか (b) `pre.tag-example` が mobile 幅で横にはみ出していないか (c) 下の iframe(やどたび本体)が従来どおり表示されているか を確認する。
3. README は画面ではないので撮影不要。ただし表の Markdown が崩れていないか(パイプの数が全行で揃っているか)を目視する。
4. 最後に `node scripts/check-all.mjs` 18本全緑を確認してからコミット・push。

## 記録
- `docs/ROADMAP.md` の R52 と R53 を `- [x] 2026-09-16 …` にする。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)。
  **「README の `?demo=` が7値→10値に是正された(nohotels/autozoom/hoteltip が未記載だった)」という事実を必ず1行残すこと。**
  次の候補は R14 / R19 / R40 / R54 / R55。
