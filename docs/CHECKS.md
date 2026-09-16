# CHECKS.md — `scripts/check-all.mjs` が回す28本の一覧と並列化できない理由

この表は `scripts/check-all.mjs` の `SCRIPTS` 配列(`check-all.mjs:14`)と**一対一で一致させること**。check 本を増減したらこの表も同じコミットで直す。

## 対象範囲

`node scripts/check-all.mjs` は `scripts/check-*.mjs` の27本と `docs/check.mjs` の1本、計28本を `spawnSync` で直列に呼ぶだけの外側の殻です。各 check 本の中身はこのタスクでは無編集(AUTOPILOT の運用どおり)。

## サーバを立てる24本(ポート3000占有・全て Playwright あり)

`spawn('python', ['-m','http.server','3000','--bind','127.0.0.1'])` を実行し `finally` で `kill()` する構成です。

| 本名 | 何を検査するか |
|---|---|
| check-a11y | アクセシビリティ(aria-label 等) |
| check-attrib | 出典・ライセンス表記の有無 |
| check-autozoom | 地図の自動ズーム挙動 |
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
| check-lightbox | 画像ライトボックス表示 |
| check-more | 「もっと見る」展開挙動 |
| check-nohotels | 宿0件画面(`?demo=nohotels`)の案内文と、タイル読込失敗時の案内(R101) |
| check-nosummary | Wikipedia 記事が無いカードの代替1行の表示 |
| check-passive | 受動ログ(localStorage `yado.passive.v1`)の記録内容 |
| check-pinflash | カードの番号バッジをタップすると小地図の該当ピンが光ること(R10) |
| check-recent | 検索候補に「最近見た宿」が見出し付きで統合されること(R32) |
| check-sample | サンプル導線チップの表示・件数 |

所要目安(R55 実測・NIGHTLOG 2026-09-16 R60+R55、当時20本時点): 合計 **162.8s**、最遅 **check-hotelparam 27.9s**、次点 **check-feednote 12.3s**、僅差で **check-attrib 12.1s**。現在は27本。
R89(2026-09-16)実測: `check-hotelparam` は固定待ちを条件待ちに置換して 33.9s→8.4s(中央値、41 pass/0 fail一致)。27本(check-all.mjs)の合計は **221.2s**、最遅は `check-embedbg 18.2s` に交代(hotelparam は最遅から外れた)。

## サーバもPlaywrightも不要な3本 + docs/check.mjs

| 本名 | 何を検査するか |
|---|---|
| check-engine | `engine.js` の除外・併合・要約ロジックの単体テスト |
| check-geo | `geo.js` の同心円リング収集ロジック(fetchをスタブ) |
| check-r5 | 段階描画の発火順 |
| docs/check.mjs | 本番URLへのGET・応答時間・ファイルKB・リンク切れ検査(他3本と違い、ローカルではなく本番URLへのHTTPアクセスのためサーバ不要)。R109: 埋め込みタグの sandbox/referrerpolicy が3箇所で一致しているか |

## 並列化できない理由

- 23本が同じ**ポート3000**を `--bind 127.0.0.1` で占有します。同時に2本走らせると後発が `EADDRINUSE` で即死します。
- `check-all.mjs` は `spawnSync` による直列呼び出しの外側の殻で、各 check 本の中身は無編集が原則(AUTOPILOT の運用)。ポートを外から変える口がありません。

## 並列化する場合に必要になる改修(今回はやらない)

1. 各本の `const PORT = 3000` を `Number(process.env.YADO_PORT) || 3000` にする(23ファイルの1行修正)。
2. `check-all.mjs` が本ごとに空きポートを割り当てて環境変数で渡す。
3. Playwright の Chromium を同時に何個立てるかの上限を決める(Windows のメモリ次第。`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績あり)。
4. 見返りは最大で 4分→1分程度だが、フレークの切り分けが難しくなるコストと引き換えになる。

## リンク切れ検査(R22/R34)が何を見ているか

- `docs/check.mjs:131` の正規表現 `attrRe = /(?:src|href)\s*=\s*"([^"]+)"/g` は `src` も `href` も拾うため、**iframe の src も検査対象に入っている**(`demo/hotel-page.html:212` の埋め込みiframeも含む)。
- `docs/check.mjs:165` が `resolved.pathname` を使ってパスを取り出すため、**クエリ文字列は自動的に落ちて叩かれる**。実測: `demo/hotel-page.html:212` の相対src `../index.html?fixture=kusatsu&embed=1&bg=fff7e6` を `new URL(raw, url)` で解決すると `href` = `https://teer-tee.github.io/yadotabi/index.html?fixture=kusatsu&embed=1&bg=fff7e6`、`startsWith(BASE)` = `true`、`pathname` = `/yadotabi/index.html`、`.replace(/^\/yadotabi\//, '')` 後 = `index.html`。よって実際に HEAD される先は常に `index.html` であり、`?hotel=` 付きで叩いて Overpass を誘発する事故は構造上起きない(自分で node 実行して再現確認済み)。
- `docs/check.mjs:143` の `internalPaths` は `Set` のため、同じパス(`index.html`)への重複登録は1回のリクエストに畳まれる。
- **穴として残っている点(無害・今は直さない)**: `demo/hotel-page.html:224` の `<pre class="tag-example">` 内にある見本コード用の**絶対URL**(`https://teer-tee.github.io/yadotabi/?hotel=...`)も、`docs/check.mjs:151` の絶対URL分岐 `raw.startsWith(BASE)` に該当してしまい抽出される。実測: このURLを `new URL()` で解決すると `pathname` = `/yadotabi/`、置換後は空文字列になり `checkLink(page, '' || 'index.html')`(`docs/check.mjs:200`)で `index.html` として叩かれる。クエリは落ちるため今回のケースは無害だが、`<pre>` に実在しないパスの見本URLを書くと将来**偽のNGが出る**可能性がある。`docs/check.mjs` のロジックは変更していない(注記のみ)。

## この表が古くなっていないかの確認方法(R106)

- `node scripts/check-all.mjs` の実行結果の本数(冒頭または末尾の総数表示)と、この文書の `^| check` で始まる表行の数(`grep -c "^| check" docs/CHECKS.md`。docs/check.mjs の行も含む)を突き合わせる。
- 一致しなければ、`scripts/check-all.mjs:14` の `SCRIPTS` 配列と本ファイルの表を名前ベースで比較し、増減分をこの表にも反映する。
