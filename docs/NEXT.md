# NEXT: F1 埋め込みモード `?embed=1`

**選定理由**: R1/R7/R8/R4/R3+R6 と5サイクル連続で品質・基盤系だったので、計画書08 v3.1 の本丸である「予約サイトに売れる部品」F1 に進む。F2(営業デモ)・F3(受動ログ)は F1 が土台なので順序上も先。

## 目的
やどたびを iframe で他サイト(宿の予約ページ)に埋め込める部品にする。`?embed=1` のとき、検索・エリアチップ・状態Aの地図・戻るボタンを消し、**小地図+提案フィードだけ**を出す。埋め込み側は `?embed=1&hotel=<lat>,<lon>,<名前>`(撮影時は `?embed=1&fixture=kusatsu`)を指定する。

## 前提・仕様
- `?embed=1` は **`?hotel=` または `?fixture=` と併用が前提**。どちらも無いときは通常動作にフォールバックする(状態Aが出る。真っ白にしない)。
- 高さは親側の iframe が決める。アプリ側で `100vh` を使わない(埋め込み時に二重スクロールになるため)。
- 外部リンクは今のまま `target="_blank" rel="noopener"`(assets/app.js `linkRowHtml` 480-483行)。iframe 内で親を乗っ取らないため、ここは**変えない**。
- 戻る先が無いので戻るボタンは隠す。`goBack` のコードは消さない(非埋め込みでは必要)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (946行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (416行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` (58行) — 変更は不要な見込み。必要なら最小限
- 新規 `C:\workspace\claude\旅行先用サイト\yadotabi\demo\embed-check.html`(ローカル確認用の最小ページ。営業デモ F2 とは別物)

## 実装方針(実物の行番号つき)

### 1. app.js: 埋め込み判定
- 状態オブジェクト `state`(85-92行)に `embed: false` を追加する。
- `fixtureNameFromUrl`(770-774行)の隣に `isEmbedFromUrl(params)` を新設。`params.get('embed') === '1'` で true。
- `applyEntryPoint()`(776行)の先頭、`simulate` 判定(781-783行)の直後で判定する:
  ```
  var params = ... (777行 既存)
  var embed = isEmbedFromUrl(params);
  var hasTarget = !!hotelFromUrl(params) || !!fixtureNameFromUrl(params);
  if (embed && hasTarget) { state.embed = true; document.body.classList.add('is-embed'); }
  ```
  `hasTarget` が false なら `state.embed` は立てない(= 通常動作)。fixture の fetch が失敗して `applyNormalEntryPoint` に落ちる経路(805-808行)では、`state.embed` を false に戻し `is-embed` クラスも外すこと。**空白画面を出さないのが最優先**。

### 2. app.js: render での隠し
- `render()`(735-747行)で、`state.embed` が true のときは `els.viewSelect.hidden` を常に true にする(状態Aは絶対に出さない)。
- 戻るボタンは DOM を消さず `els.backBtn.hidden = state.embed;` で隠す(`[hidden]` は style.css 18行で `display:none !important`)。
- 状態Aの地図生成 `ensureMap()`(init 928行)は、埋め込み時は呼ばない方が軽い。`init()`(909行)で `state.embed` はまだ決まっていない順序なので、**`applyEntryPoint` より前に embed 判定だけを行う小さな関数を init の先頭で呼ぶ**か、`ensureMap()` の呼び出しを `applyEntryPoint()` の後ろへ動かす。どちらか実装しやすい方でよいが、通常モードで地図が出なくなるデグレを起こさないこと。

### 3. style.css: 余白調整(最小限)
- `.view--feed`(185行)は `padding-bottom` のみなので基本そのまま使える。
- `@media (min-width: 720px)` の `.view--feed { max-width: 560px; margin: 0 auto; }`(410-413行)は、埋め込み枠が狭いときに中央寄せで余白が出る。埋め込み時は幅いっぱいにしたいので `body.is-embed .view--feed { max-width: none; }` を同メディアクエリ内に追加する。
- `body.is-embed { overflow-x: hidden; }` は既に body(7-15行)で効いているので追加不要。
- `.topbar`(187-197行)は `position: sticky; top: 0` のまま残す(タイトルは埋め込みでも見せてよい)。`env(safe-area-inset-top)` は iframe 内では 0 になるので害はない。
- 新規CSSは **末尾に「埋め込みモード」節をまとめて追記**し、既存セレクタの値は書き換えない。

### 4. demo/embed-check.html(新規・確認用)
- 素のHTML1枚。`<iframe src="../index.html?embed=1&fixture=kusatsu" style="width:100%;max-width:420px;height:720px;border:1px solid #ddd">` を1つ置くだけ。見出しに「埋め込み確認用(ローカル)」とだけ書く。凝らない。

## 完了条件
1. `?fixture=kusatsu&embed=1` で、検索欄・エリアチップ・状態Aの地図・戻るボタンが**一切見えない**。小地図と提案カードは通常どおり出る。
2. `?embed=1` 単独(hotel も fixture も無し)で通常の状態Aが出る(フォールバック)。
3. `?fixture=kusatsu`(embed 無し)が従来どおり動く(戻るボタンも出る)。**デグレゼロ**。
4. `demo/embed-check.html` を開くと iframe の中でフィードが動き、iframe 内で縦スクロールできる(親ページが二重スクロールにならない)。
5. `node --check assets/app.js` が通り、ブラウザのコンソールにエラーが出ない。
6. `node docs/check.mjs` が終了コード0。

## 検証手順
1. ローカルサーバを立てる(`start-server.bat` / 127.0.0.1:3000)。
2. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅):
   - `?fixture=kusatsu&embed=1` … mobile / desktop
   - `demo/embed-check.html` … mobile / desktop(iframe に収まっているか)
   - `?fixture=kusatsu` … mobile 1枚(デグレ確認)
3. 撮った画像を**必ず Read で開いて目視**する。見る点: 検索欄やチップの残骸が無いか / 戻るボタンが消えているか / 小地図の番号ピンが判読できるか / カードのリンクチップが折り返しで切れていないか / iframe の縁でカードが横にはみ出していないか。
4. 崩れがあれば同サイクルで直す。直せなければ ROADMAP の先頭に起票する。
5. push 後に本番 `https://teer-tee.github.io/yadotabi/?fixture=kusatsu&embed=1` を mobile で1枚撮って確認。

## 変更禁止範囲
- `assets/geo.js` / `assets/engine.js` は触らない(データ取得のロジックは今回無関係)。
- `linkRowHtml` の `target="_blank" rel="noopener"` を変えない。
- `nudgeOverlaps`(614行)/ `renderFeedMap`(674行)のピン配置ロジックを触らない(R7/R8 で直したばかり)。
- `fixtures/kusatsu.json`、`docs/check.mjs`、既存スクリーンショットは変更しない。
- git stash / reset --hard / checkout でのファイル復元は禁止。

## 難易度・所要目安
難易度: 中の下(URLパラメータ1つ + 表示の出し分け + 小さなCSS)。所要目安: 25〜40分。
