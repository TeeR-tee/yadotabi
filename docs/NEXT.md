# NEXT — R68 `?embed=1` に背景色パラメータ `&bg=` を足す

判断理由: 残候補のうち R14/R19/R40 は fixture 再生成(Overpass)が絡んで無料APIのマナー上サイクル内で完結しにくく、R64 は Actions の課金確認という「みのるんの判断」が要り、R65/R66 は地図状態や新UIでデグレ範囲が広い。R68 は embed 限定・表示のみ・外部API 0回・検証が機械化しやすく、営業(予約サイトへの埋め込み)に直結するので今サイクル向き。

難易度: sonnet / 所要目安: 30〜45分(実装15分・検査本10分・撮影と目視10分)

## 対象ファイル(絶対パス)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js (変更)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css (変更・埋め込み節)
- C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html (変更・iframe の src に例を1つ)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-embedbg.mjs (新規)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs (新規本を1行登録)
- C:\workspace\claude\旅行先用サイト\yadotabi\README.md (パラメータ表に `bg` の1行を追加。R52 の表がある)
- C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md / docs\NIGHTLOG.md (完了記録)

## 変更禁止範囲
- assets\engine.js / assets\geo.js / fixtures\*.json は一切触らない
- 既存 check-*.mjs の中身は編集しない(check-all.mjs への登録行のみ可)
- 文字色・カード背景・チップ色は変更しない(コントラスト事故を避ける。暗色指定は今回対象外、理由は NIGHTLOG に残す)

## 実装方針(実物の行番号)
現状の実物:
- `app.js:1280-1283` `isEmbedFromUrl(params)` … `params.get('embed') === '1'` を返すだけ。
- `app.js:1285-1295` `setEmbed(on)` … `state.embed` と `document.body.classList.toggle('is-embed', on)`、embed 時に `startHeightObserver()`。
- `app.js:1332` `applyEntryPoint()` … `1393` で `fixtureName`、`1396` で `hasTarget`(hotel か fixture)、`1397` で `if (isEmbedFromUrl(params) && hasTarget) setEmbed(true);`。
- `app.js:1429-1430` fixture 読み込み失敗時に `setEmbed(false)` して通常動作へ落ちる経路がある。
- `app.js:1777-1779` init() 側にも embed 判定がある(`setEmbed(true)`)。
- `style.css:7-9` `body { background: var(--c-bg); }`、`--c-bg` は `tokens.css:24`(`#f7f7f9`)。`.view--feed` 自体に背景指定は無い(`style.css:288`)ので、**`--c-bg` を上書きすれば body と feed の両方の地色が一度に変わる**。

手順:
1. `isEmbedFromUrl` の直後に純粋関数 `bgFromUrl(params)` を新設する。
   - `params.get('bg')` を取り、先頭の `#` を1つだけ許して剥がす。
   - `/^[0-9a-fA-F]{6}$/` にマッチしたときだけ `'#' + hex` を返し、それ以外(空・3桁・7桁・`red`・`url(...)`・`;` 混入など)は `null` を返して**黙って無視**する。
   - ROADMAP 本文は3桁も許容と書いてあるが、**今回は6桁のみ**とする(依頼の指定。3桁を足すなら別タスク)。この差分の理由を NIGHTLOG に1行残すこと。
2. `setEmbed(on)` に第2引数 `bg` を足す(既定 `null`)。
   - `on && bg` のときだけ `document.documentElement.style.setProperty('--c-bg', bg)`。
   - それ以外(embed を切るとき含む)は `document.documentElement.style.removeProperty('--c-bg')`。`1429-1430` のフォールバック経路で地色が残らないこと。
   - CSS 変数経由にするのは、`body` の style を直書きするとダークモードや将来の `.view--feed` 背景と衝突するため。**値の検証は 1 の正規表現のみで行い、文字列連結で CSS に流すのはここだけ**(XSS/CSS インジェクション防止)。
3. 呼び出し2か所を差し替える: `app.js:1397` と `app.js:1777-1779` を `setEmbed(true, bgFromUrl(params))`(init 側は `initialParams`)にする。**embed でないときは `bgFromUrl` の結果を使わない**こと(`?bg=` 単独では何も起きない)。
4. `style.css` の埋め込み節(`599` 付近)に1行コメントを添えて `body.is-embed { background: var(--c-bg); }` を明示しておく(既に body 側で効くが、意図を読めるようにするため。新しい色指定は増やさない)。
5. `demo/hotel-page.html:212` の iframe src を `../index.html?fixture=kusatsu&embed=1&bg=fff7e6` にし、`.sales-notes`(`219` 付近の箇条書き)に「`&bg=fff7e6` で背景色を宿ページに合わせられます(6桁の16進のみ)」を1行足す。`223` の `<pre class="tag-example">` にも同じ形で `&amp;bg=fff7e6` を入れる。

## 完了条件(検証可能)
- `scripts/check-embedbg.mjs`(Playwright、既存本と同じポート3000の自前サーバ方式)が全項目 PASS:
  1. `?fixture=kusatsu&embed=1&bg=fff7e6` … `body` の computedStyle `background-color` が `rgb(255, 247, 230)`。
  2. 同上で `#fff7e6`(`%23` エンコード)でも同じ値になる。
  3. `?fixture=kusatsu&embed=1&bg=zzzzzz` / `&bg=fff` / `&bg=red` / `&bg=fff7e6;color:red` … いずれも既定色 `rgb(247, 247, 249)` のまま(=無視)。
  4. `?fixture=kusatsu&bg=fff7e6`(embed なし) … 既定色のまま(embed 以外では効かない)。
  5. `?fixture=kusatsu&embed=1&bg=fff7e6` で `documentElement.style.getPropertyValue('--c-bg')` が `#fff7e6`、無効値のときは空文字。
  6. カードは 30 枚のままで `.feedcard` の背景色が変わっていない(文字が読めなくなっていない)。
- `node scripts/check-all.mjs` が全本 PASS・exit 0(本数が1つ増えること)。
- `node --check assets/app.js` が通る。
- 外部API 0回(全て fixture)。

## 検証手順(撮影+目視)
1. `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=kusatsu&embed=1&bg=fff7e6" --mobile`(またはローカルサーバの実URL)で撮り、Read で目視。地色が淡いクリーム色になり、カード(白)・文字・リンクチップのコントラストが保たれていること。
2. `?fixture=kusatsu&embed=1`(bg なし)を mobile で撮り、従来と同じ地色・レイアウトであること(デグレなし)。
3. `demo/hotel-page.html` を mobile で撮り、iframe の中と親ページの地色が馴染んでいること・二重スクロールが出ていないこと(R48 の高さ通知が壊れていないこと)。
4. `?fixture=kusatsu`(通常)を mobile で撮り、カード30枚・番号ピン判読可・コンソールエラー0件。

## 記録
- ROADMAP の R68 行を `- [x] 2026-09-16 R68 ...` にする。
- NIGHTLOG に3行(やったこと / 見た目の確認結果 / 次)。3桁 HEX を許可しなかった理由と、文字色を変えない(暗色 bg はコントラスト事故になるため対象外)方針も添える。
- コミット(1行の日本語)→ `git push`。
