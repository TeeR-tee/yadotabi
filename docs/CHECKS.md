# CHECKS.md — `scripts/check-all.mjs` が回す32本の一覧と並列化できない理由

この表は `scripts/check-all.mjs` の `SCRIPTS` 配列(`check-all.mjs:17`)と**一対一で一致させること**。check 本を増減したらこの表も同じコミットで直す。

## 対象範囲

`node scripts/check-all.mjs` は `scripts/check-*.mjs` の31本と `docs/check.mjs` の1本、計32本を `spawnSync` で直列に呼ぶだけの外側の殻です。各 check 本の中身はこのタスクでは無編集(AUTOPILOT の運用どおり)。

## サーバを立てる27本(全て Playwright あり)

**R130 以降、サーバの起動・停止は `scripts/lib/server.mjs` の `ensureServer()` に一本化しました**(各本が自前でポート3000を spawn/kill するのをやめた)。`check-all.mjs` が親として1回だけサーバを立て、環境変数 `YADOTABI_BASE` で各子プロセスに渡すため、子は起動せず奪い合いが起きません。単体実行時は同変数が無いので従来どおり自分で起動し、`listen(0)` で実測した空きポートを使い、`stop()` がプロセスの終了とポートの解放を待ってから返ります(終了待ちが無かったのが連続実行で1本ずつ落ちていた原因)。

**注記(R135)**: `scripts/check-*.mjs` のうち16本の冒頭コメントには、R130より前に書かれた「自分で `python -m http.server 3000` を起動して検証後に落とす」という記述が残っていた。実装(`scripts/lib/server.mjs`)を確認すると **`python -m http.server` を使うこと自体は今も正しい**(`ensureServer()` が単体実行時に内部で `spawn('python', ['-m', 'http.server', ...])` する)。古かったのは「ポート**3000固定**で**各本が個別に**起動・終了する」という前提部分であり、実際は `findFreePort()` で実測した空きポートを使い、`check-all.mjs` 経由なら親が1本だけ起動して `YADOTABI_BASE` で子に配る方式に変わっている。この行は指示書上コード無編集(コメントは16本すべてコメント文のみ実装に合わせて修正済み・非コメント行の差分は0)。

| 本名 | 何を検査するか |
|---|---|
| check-a11y | アクセシビリティ(aria-label 等)。R129: 横向き(812x375/667x375)で1枚目カードの可視高さ150px以上、縦向き(375x812)で `.feedmap` が220pxのまま(デグレなし)も検査 |
| check-attrib | 出典・ライセンス表記の有無 |
| check-bundle | カードを「テーマの束」にまとめた見出し(.feedbundle)の検査(R157/R158)。展開前は0本・展開後は1本以上・中身1件の束が無いこと・見出しの下のカードが全て同じテーマであること・番号バッジ/data-indexの過不足なし・初期5件がrank順のまま先頭に並ぶこと等を検査 |
| check-autozoom | 地図の自動ズーム挙動。R113: 同じエリアチップ連打で再取得が増えないこと/別チップでは増えることも含む |
| check-chipcurrent | `?q=`/チップ選択時に該当エリアチップが強調されること(R29) |
| check-debugflag | `?fixture=` 併用時だけ効く `?debug=1` のスコア内訳表示(fixture 無しでは出ないこと) |
| check-distance | 距離表示・並び順 |
| check-embedbg | embed時の背景表示 |
| check-embedheight | embed時の高さ調整 |
| check-feednote | フィード注記の表示 |
| check-firstcard | first-card-painted の実測ms記録と緩いしきい値検査(R107) |
| check-history | 「最近の宿」履歴の記録・表示 |
| check-hotelparam | ホテルURLパラメータの解釈 |
| check-hoteltip | ホテル選択時のツールチップ |
| check-imgfail | 画像読み込み失敗時のフォールバック |
| check-initpos | 初期表示位置 |
| check-keyboard | キーボード操作対応 |
| check-links-target | カード内外部リンクが `target="_blank"` かつ `rel` に `noopener` を含むこと(R111、embed時・もっと見る展開後も含む) |
| check-lightbox | 画像ライトボックス表示 |
| check-more | 「もっと見る」展開挙動 |
| check-nohotels | 宿0件画面(`?demo=nohotels`)の案内文と、タイル読込失敗時の案内(R101) |
| check-nosummary | Wikipedia 記事が無いカードの代替1行の表示 |
| check-passive | 受動ログ(localStorage `yado.passive.v1`)の記録内容 |
| check-pinflash | カードの番号バッジをタップすると小地図の該当ピンが光ること(R10) |
| check-reason | R151: カードの「なぜこれを出したか」1行(feedcard__reason)。理由あり件数が10〜20件、「唯一のX」の実在確認、more/farに付かないこと、debug有無で並び順が一致することを検査 |
| check-recent | 検索候補に「最近見た宿」が見出し付きで統合されること(R32) |
| check-sample | サンプル導線チップの表示・件数 |

所要目安(現在値・2026-09-20 R205 実測): **32本**(check-all.mjs)の合計は **343.4s(Windows)/ 342.5s(CI)**、最遅は `check-reason.mjs 28.9s`。CI(GitHub Actions)でもWindowsと同じ32本全PASSの結果が出ることをR205で確認済み。過去(check本数が少なかった頃)の記録はNIGHTLOGの当該サイクルを参照(この節は現在値だけを保持する運用にする)。

## サーバもPlaywrightも不要な5本

| 本名 | 何を検査するか |
|---|---|
| check-engine | `engine.js` の除外・併合・要約ロジックの単体テスト |
| check-geo | `geo.js` の同心円リング収集ロジック(fetchをスタブ) |
| check-osmfallback | R181: Overpass が落ちた回でも「その土地の主役」(OSM専用候補、例: 湯畑・松山城)が提案から消えないこと。外部APIは叩かず、fetchを差し替えたvm上でgeo.jsを動かして検証 |
| check-r5 | 段階描画の発火順 |
| docs/check.mjs | 本番URLへのGET・応答時間・ファイルKB・リンク切れ検査(他4本と違い、ローカルではなく本番URLへのHTTPアクセスのためサーバもPlaywrightも不要)。R109: 埋め込みタグの sandbox/referrerpolicy が3箇所で一致しているか |

実測では「サーバを使う27本」と「Playwrightを使う27本」は完全に同じ集合(`grep -l ensureServer` と `grep -l playwright` の結果が一致。ただし `check-all.mjs` 自身は親サーバ起動のため `ensureServer` を含むがSCRIPTS対象外なので除外して数える)で、サーバ不要かPlaywright不要かで割れる本は存在しない。上記5本だけがどちらも不要。

## 並列化できない理由

- R130 で `scripts/lib/server.mjs` の `ensureServer()` に一本化され、`findFreePort()` が `listen(0)` で空きポートを実測するため、**ポート3000の奪い合いはすでに解消済み**(現状ポート3000を掴む check 本は0本。`grep -rn "PORT = 3000" scripts/` にヒットするのは check-all 対象外の `dump-rank.mjs` と `make-readme-shots.mjs` のみ)。
- 残っている障壁は次の2点のみ。
  1. Windows のメモリ上限: Playwright の Chromium を同時に何個立てるかの上限が未決定(`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績あり)。
  2. フレークが起きたときの切り分けコスト: 直列なら失敗本の特定が容易だが、並列化するとどの本のタイミング干渉かの切り分けが難しくなる。
- `check-all.mjs` は `spawnSync` による直列呼び出しの外側の殻で、各 check 本の中身は無編集が原則(AUTOPILOT の運用)。

## 並列化する場合に必要になる改修(今回はやらない)

- ポートの動的割り当て(各本の空きポート実測・`check-all.mjs` からの環境変数渡し)は **R130 で実装済み**のため、残作業から除外した。
1. Playwright の Chromium を同時に何個立てるかの上限を決める(Windows のメモリ次第。`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績あり)。
2. 見返りは最大で 4分→1分程度だが、フレークの切り分けが難しくなるコストと引き換えになる。

## リンク切れ検査(R22/R34)が何を見ているか

- `docs/check.mjs:131` の正規表現 `attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g` は `src` も `href` も拾うため、**iframe の src も検査対象に入っている**(`demo/hotel-page.html:212` の埋め込みiframeも含む)。
- `docs/check.mjs:165` が `resolved.pathname` を使ってパスを取り出すため、**クエリ文字列は自動的に落ちて叩かれる**。実測: `demo/hotel-page.html:212` の相対src `../index.html?fixture=kusatsu&embed=1&bg=fff7e6` を `new URL(raw, url)` で解決すると `href` = `https://teer-tee.github.io/yadotabi/index.html?fixture=kusatsu&embed=1&bg=fff7e6`、`startsWith(BASE)` = `true`、`pathname` = `/yadotabi/index.html`、`.replace(/^\/yadotabi\//, '')` 後 = `index.html`。よって実際に HEAD される先は常に `index.html` であり、`?hotel=` 付きで叩いて Overpass を誘発する事故は構造上起きない(自分で node 実行して再現確認済み)。
- `docs/check.mjs:143` の `internalPaths` は `Set` のため、同じパス(`index.html`)への重複登録は1回のリクエストに畳まれる。
- **穴として残っている点(無害・今は直さない)**: `demo/hotel-page.html:224` の `<pre class="tag-example">` 内にある見本コード用の**絶対URL**(`https://teer-tee.github.io/yadotabi/?hotel=...`)も、`docs/check.mjs:151` の絶対URL分岐 `raw.startsWith(BASE)` に該当してしまい抽出される。実測: このURLを `new URL()` で解決すると `pathname` = `/yadotabi/`、置換後は空文字列になり `checkLink(page, '' || 'index.html')`(`docs/check.mjs:200`)で `index.html` として叩かれる。クエリは落ちるため今回のケースは無害だが、`<pre>` に実在しないパスの見本URLを書くと将来**偽のNGが出る**可能性がある。`docs/check.mjs` のロジックは変更していない(注記のみ)。

- **(R150)** `docs/check.mjs` は集計行の後、500ms(`SLOW_MS`)以上かかった項目を列挙する(2000ms以上は「かなり遅い」と注記、失敗判定はしない)。平均比(N倍)は不採用: 平均自体がコールド/ウォームで20ms〜135ms(実測6.7倍)swingし、速い日は誤検知・遅い日(コールド時は平均がbimodal分布の谷に落ちる)は見逃す、逆向きに壊れる基準だったため。

## 撮影ファイルの命名と保持方針(R92)

- 命名は `<ISO日時>_<ラベル>_<mobile|desktop>.png`(既に統一されている)。
- `screenshots/` は `.gitignore` 済みでリポジトリには入らない(ローカルのディスクだけを消費する)。
- 古いものは `node scripts/archive-shots.mjs`(ドライラン・件数と容量を確認) → `node scripts/archive-shots.mjs --apply`(実行)で `screenshots/archive/` へ**移動**する。移動なので元に戻せる(削除はしない)。既定のしきい値は「今日から2日より前」で `--days=N` で変更可。
- 消してよいと判断したときだけ、みのるんが手で `screenshots/archive/` ごと消す(自動削除の仕組みは作らない)。
- 目安: 月に1度 `node scripts/archive-shots.mjs --apply` を回すと `screenshots/` 直下が肥大しすぎない。

## この表が古くなっていないかの確認方法(R106、R135で補強)

- `node scripts/check-all.mjs` の実行結果の本数(冒頭または末尾の総数表示)と、この文書の `^| check` で始まる表行の数(`grep -c "^| check" docs/CHECKS.md`。docs/check.mjs の行も含む)を突き合わせる。
- 一致しなければ、`scripts/check-all.mjs:17` の `SCRIPTS` 配列と本ファイルの表を名前ベースで比較し、増減分をこの表にも反映する。
- **(R135追加)本数の比較は総数だけでなく、節見出しに書いた本数(「サーバを立てる◯本」等)にも行う**。節見出しの数字・節内の表の行数・`grep -l ensureServer` / `grep -l playwright` の実測本数の3つが一致しているか確認すること。R135では表の行数は合っていたのに見出しの本数だけ古いままになっており、総数一致の確認だけでは見つからなかった。
- **(R135追加)記述と実装の対応も見る**。「並列化できない理由」「必要な改修」など理由・手順を書いた節は、`grep -rn "PORT = 3000" scripts/` や `grep -rn "ensureServer\|findFreePort" scripts/lib/server.mjs` を実際に流し、書かれている技術的理由が現在のコードと矛盾していないかを確認する。本数だけ合わせて理由の文章を放置すると、存在しない仕組みを前提にした説明が生き残る(R135で発覚した事故はこのパターン)。
- **(R212追加・実例)** 検査を32本まで増やす過程で、1行目の見出し・節見出し(「サーバを立てる◯本」「不要な◯本」)・表そのものが揃って古いままになっていた(`check-bundle`・`check-osmfallback`の2本が表から漏れていた)うえ、所要目安も1サイクル前の値(322.5s)のままだった。この確認方法どおりに `grep -c "^| check"` と `SCRIPTS` 配列を突き合わせて発見・修正した。
