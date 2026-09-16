# NEXT — R47 提案の作り方を1行で明かす(フィード末尾の注記)

**選定理由**: 残候補のうち R14/R19/R40 は fixture 再生成や Overpass 呼び出しを伴い外部APIのマナー上リスクが高く、R48/R51 より先に「順位の根拠を隠していない」ことを示す R47(計画書08の正直さ方針)を選ぶ。表示のみ・ロジック無変更で最も安全。

- 難易度: **sonnet**
- 所要目安: 40〜60分(実装15分 + 新規テスト15分 + check-all 約60秒 + 撮影/目視)

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (追記: `noteHtml()` 新設 + `renderFeed()` 内で描画)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` (1行: `#feed-note` コンテナ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (末尾に `.feednote` 系を追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-feednote.mjs` (**新規**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` (リストに1行追加 → 17本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` (完了記録)

## 実装方針

### 1. 置き場所(実物の構造を確認済み)

`index.html:63-67` は現在この順:

```
<div class="feed" id="feed-list"></div>
<div id="feed-more" hidden></div>
<div id="feed-far" hidden></div>
```

この **`#feed-far` の直後**に `<div id="feed-note" hidden></div>` を1行足す。
つまり「カード → もっと見るボタン → もっと遠く → 注記」の順になり、
ROADMAP が求める「far の後、または『もっと見る』の後」の両方を自動的に満たす
(far が0件でも more が展開済みでも、常にフィードの一番下に来る)。

### 2. `assets/app.js`

- `farHtml()`(app.js:815-828)の**直後**に `noteHtml()` を新設する。
  内容は固定文字列を返すだけ。スポットが0件のとき(`state.cards.length === 0`)は
  空文字を返して「提案を作れませんでした」/0件カードの下に付けない。
- `renderFeed()`(app.js:858)の中、`farHtml` を入れている
  app.js:907-913 のブロックの**直後**に以下を足す:

```
var note = loading ? '' : noteHtml(state.cards.length);
if (els.feedNote) { els.feedNote.hidden = !note; els.feedNote.innerHTML = note; }
```

  読み込み中(`loading`)は出さない。`state.stage === 'error'` の早期 return
  (app.js:879-887)より後なので、エラー時は自動的に出ない。**ただし** その early return の
  中で `els.feedFar.hidden = true` と並べて `if (els.feedNote) els.feedNote.hidden = true;`
  を足しておくこと(前回描画の残りが残らないように)。
- `els` の登録(app.js:1596 付近の `feedStatus:` と同じオブジェクト)に
  `feedNote: document.getElementById('feed-note'),` を追加。

### 3. 文言(事実のみ・本番に無いページへリンクしない)

```
この提案は、周辺の地図情報(OpenStreetMap)とWikipediaから、宿からの距離と
種類の多様性で並べた暫定版です。有名な場所が下に来ることがあります。
```

+ 続けてリンク1本:
`<a href="https://github.com/TeeR-tee/yadotabi#仕組みかんたん解説" target="_blank" rel="noopener">くわしい仕組み</a>`

- `docs/09_研究ノート` は**このリポジトリに存在しない**(`docs/` にあるのは
  AUTOPILOT/NEXT/NIGHTLOG/ROADMAP/check.mjs/og.jpg/passive-log.md のみ)ため、
  ROADMAP 本文の「研究ノートへのリンク」は**不採用**とし、README の
  「仕組み(かんたん解説)」節(README.md:48。rank が暫定であることを正直に書いた
  段落が既にある)へ GitHub 上で飛ばす。この差し替え理由を NIGHTLOG に1行残すこと。
- 「暫定版」「下に来ることがある」は README:48 節の記述と一致しており事実。誇張・謝罪の語は入れない。

### 4. 埋め込み(`?embed=1`)でも**出す**

埋め込み先の宿ページにとっても「この並びは暫定」と明示されている方が誠実で、
やどたび側の免責にもなる。`body.is-embed` で隠す CSS は**書かない**。
高さは1〜2行増えるだけで、iframe は既存どおり縦スクロールする(R48 で別途対応予定)。

### 5. `assets/style.css`

末尾に追記。淡色・小さめ・タップ領域確保:

- `.feednote { margin: 4px 16px 24px; font-size: 12px; line-height: 1.7; color: var(--muted 相当の淡色トークン); }`
  (色は `tokens.css` の既存変数を使い、新しい色は定義しない。`.far__summary`(style.css:509)
  付近の既存の淡色指定に合わせること)
- `.feednote a { color: inherit; text-decoration: underline; display: inline-flex; align-items: center; min-height: 44px; }`
  ← **44px は必須**(check-a11y の追加対象にするため)。`min-height` を付けても
  周囲の余白が膨らみすぎないよう、`.feednote` の `margin-bottom` で調整する。
- フォーカスリングは既存の `:focus-visible` 方針(style.css:570 付近)に合わせる。

## 変更禁止範囲

- `assets/engine.js`(rank の重み・閾値・除外ルール・truncate)
- `assets/geo.js`
- `fixtures/*.json`(再生成しない。Overpass/Wikipedia を1回も叩かない)
- 既存の `scripts/check-*.mjs` の中身(check-all.mjs のリスト1行追加のみ可)

## 完了条件(検証可能)

1. `scripts/check-feednote.mjs`(新規、check-more.mjs の作り・ポート3000の自前サーバ起動を踏襲)が全PASS:
   - `?fixture=kusatsu` で `#feed-note` が hidden でなく、`.feedcard` 30枚の**下**に位置する
     (`getBoundingClientRect().top` が最後の `.feedcard` より大きい)
   - 注記テキストに「暫定版」「OpenStreetMap」「Wikipedia」が含まれる
   - `#feed-note a` の href が `https://github.com/TeeR-tee/yadotabi#` で始まる
   - `#more-btn` を click して60枚に展開した後も `#feed-note` が最下部にある
   - `?fixture=hakone&demo=far` で `#feed-far`(details)より下に `#feed-note` がある
   - `?fixture=kusatsu&embed=1` でも `#feed-note` が表示される(hidden でない)
   - `?fixture=kusatsu&simulate=empty` では `#feed-note` が hidden(0件時は出さない)
   - コンソールエラー0件
2. `scripts/check-a11y.mjs` の `TARGETS`(check-a11y.mjs:23-30)に
   `{ selector: '#feed-note a', label: '提案の作り方リンク' }` を1件追加し、
   44px 以上で全件OK・exitCode 0(※ TARGETS 配列への1行追加は「中身の編集」に該当しないので可)
3. `node scripts/check-all.mjs` が **17本全PASS・exit 0**
4. `node --check assets/app.js` 通過

## 検証手順(外部API 0回)

```
node scripts/check-all.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile --full
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1" --mobile --full
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone&demo=far" --mobile --full
```

撮った画像を **Read で開いて目視**し、次を確認する:

- 注記がフィード最下部に1〜3行で収まり、カード・far の枠と重なっていない
- mobile 375px で右端で文字が切れていない・「くわしい仕組み」が単語の途中で折り返していない
- リンクが本文と識別できる(下線)が、目立ちすぎてカードより強くなっていない
- embed 版でも同じ見え方で、iframe 幅からはみ出していない
- カード30枚・番号ピン判読可のデグレなし

## 記録

- `docs/ROADMAP.md` の R47 行を `- [x] 2026-09-16 R47 ...` にする
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)。
  「研究ノートへのリンクを README へ差し替えた理由」と「embed でも出す判断の理由」を必ず含める
- コミット→`git push`(1行の日本語メッセージ)
