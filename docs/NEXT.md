# NEXT: R24 `?hotel=` の名前なし見出し + R21 README 英語1段落

判断理由: 残る未完了(R11/R14/R19/R21/R24/R25/R26)のうち、R24 は変更箇所が `hotelFromUrl` の既定名1箇所に閉じていて実物を確認済み・埋め込み設置(名前省略)にも効く最小確実タスクであり、同サイクルでコード変更ゼロの R21 を抱き合わせられるため。

---

## タスク1: R24 名前が無い/空の `?hotel=` で見出しを「この宿の周辺」にする

### 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(新規)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(完了印)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行)

### 実装方針(実物を読んで確認済み)
`assets/app.js` の `hotelFromUrl(params)`(**1053〜1063行**)が `?hotel=` のパース箇所。現状:

```
1061:    var name = parts.slice(2).join(',').trim();
1062:    return { id: 'url/' + lat + ',' + lon, name: name || 'この宿', lat: lat, lon: lon };
```

- 既に `parts.slice(2).join(',').trim()` で**空白トリム済み**、かつ `name || ...` で空文字・undefined(`parts.length===2` のとき `slice(2)` は `[]` → `''`)を弾いているので、**`'この宿'` を `'この宿の周辺'` に変えるのが変更の本体**。ロジックは触らない(R24 は文言のみの変更というバックログの定義通り)。
- 全角空白のみの名前(`?hotel=36.6,138.5,　`)は `String.prototype.trim()` が U+3000 も落とすので現状のままで空扱いになる。念のためテストで確認する。
- 見出しの描画は `renderFeed()`(**767〜770行**)の
  `els.feedTitle.textContent = hotel.name || '';`
  で、`textContent` 代入のため **escapeHtml は不要・かつ既存のエスケープ安全性はそのまま維持される**。ここは変更しない(変えると名前ありの経路に影響する)。
- `applyEntryPoint()`(**1105行〜**)は `hotelFromUrl(params)` の戻り値をそのまま `selectHotel()` に渡す(fixture 併用時は 1149行で `hotelFromUrl(params) || {fixture既定}` の形)。したがって **fixture+hotel 併用でも同じ既定名が効く**。ここも変更不要。
- 既定名の文字列は他所にハードコードされていないかを `grep -n "この宿" assets/ index.html demo/` で確認し、あれば一緒に直す(現状 app.js の1箇所のみの見込み)。

### 完了条件(検証可能)
1. `?hotel=36.6226,138.5960` → 見出しが **「この宿の周辺」**(空欄でも `undefined` でもない)
2. `?hotel=36.6226,138.5960,` (末尾カンマ・名前空) → 同じく「この宿の周辺」
3. `?fixture=kusatsu&embed=1&hotel=36.6226,138.5960` → 埋め込みでも見出しが「この宿の周辺」(検索欄・チップ・戻るボタンが出ないことも従来どおり)
4. 名前ありの通常経路は従来どおり: `?hotel=36.6226,138.5960,ちょうしゅくの宿` → 「ちょうしゅくの宿」
5. `?fixture=kusatsu`(hotel 無し)は従来どおり「草津温泉(固定データ)」でデグレなし
6. 新規 `node scripts/check-hotelparam.mjs` が上記1〜5を機械検査して全 PASS・exitCode 0
7. 既存テストが全緑: `node scripts/check-engine.mjs` / `check-more.mjs` / `check-a11y.mjs` / `check-passive.mjs` / `check-geo.mjs` / `check-r5.mjs` / `check-pinflash.mjs` / `check-imgfail.mjs` / `node docs/check.mjs` / `node --check assets/app.js`

### 検証手順(撮影+目視)
- `scripts/check-hotelparam.mjs` は既存 `scripts/check-a11y.mjs` / `check-more.mjs` の作り(Playwright + ローカルサーバ)を踏襲し、`#feed-title` の `textContent` を上記5パターンで読んで判定、コンソールエラー0件も見る。外部APIを叩かないよう fixture 併用パターン以外も `?hotel=` 単独では状態Bに入るだけなので Overpass を待たない実装にする(必要なら `simulate=empty` は使わず、タイトル確定を待つだけにする)。
- 撮影: `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` で
  (a) `?fixture=kusatsu&hotel=36.6226,138.5960`(名前なし)
  (b) `?fixture=kusatsu&embed=1&hotel=36.6226,138.5960`
  (c) `?fixture=kusatsu`(デグレ確認)
  の3枚。`screenshots/` に保存して **必ず Read で開いて目視**し、見出しの文字崩れ・はみ出し・2行落ち(「この宿の周辺」は6文字なので topbar で折り返さないはず)が無いことを確認する。
- 目視で崩れが出たら同サイクルで直す。直せなければ ROADMAP 先頭に起票。

### 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は一切触らない(`git diff --stat` で無変更を確認)。
- rank の重み・閾値・カテゴリ多様性は当然無変更。
- `renderFeed()` の見出し描画行(770行)と `escapeHtml` の扱いも変えない。

### 難易度・所要目安
- sonnet / 25〜40分(テスト新規作成と撮影込み)

---

## タスク2(同サイクルの小修正): R21 README に英語1段落

### 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`

### 実装方針
既存の日本語 README の冒頭(タイトル直後)か末尾に、英語の短い段落を1つ追加するだけ。3文構成:
1. **What this is** — 宿の座標だけを入口に、周辺の見どころをユーザー入力ゼロで提案する静的なモバイルWebアプリ。
2. **How to try** — `https://teer-tee.github.io/yadotabi/` を開く、または `?fixture=kusatsu` で外部APIなしのデモを見る。
3. **No API keys needed** — OpenStreetMap / Overpass / Wikipedia の公開APIのみ、コスト0円。

### 完了条件
- README.md に英語段落が入っている。日本語の既存記述は削らない。
- コード変更ゼロ(`git diff --stat` で README.md 以外に差分が無い)。
- `node docs/check.mjs` が引き続き全 OK。

### 変更禁止範囲
- README.md 以外のファイル。

### 難易度・所要目安
- sonnet / 5〜10分

---

## 仕上げ(作業役へ)
実装が終わったら**まず先にコミット**(1行の日本語メッセージ)して push。報告は簡潔に(長文の報告書を書かない)。ROADMAP の R24・R21 を `[x] 2026-09-16` にし、NIGHTLOG に3行(やったこと / 見た目の確認結果 / 次)を追記すること。
