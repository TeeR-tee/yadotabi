# NEXT: R128 ブラウザの「進む」で状態Bに戻れず、そのあと「戻る」が1回効かなくなる

- **タスクID**: R128
- **難易度**: sonnet
- **所要目安**: 30〜45分
- **外部API**: 0回(`?fixture=kusatsu` と `?demo=nohotels` のみ)

## 目的

R58 が `history.pushState` で「端末の戻る → 状態A」を実現したが、**対になる「進む」を一切扱っていない**。
その結果、(a) 進むを押しても提案画面が戻ってこない、(b) そのあと戻るを押しても1回分だけ何も起きない、
という「素朴に壊れて見える」挙動になっている。スマホの戻る/進むは日常的に使われるので実ユーザー影響が大きい。

## 実測で判明した前提(すべて計画役が Playwright で再現済み)

### 現状のコード

- `assets/app.js:119-120` — `var historyPushed = false;`(状態Bへの push 済みフラグ)
- `assets/app.js:743-746` — `selectHotel()` の末尾。`if (!state.embed && !historyPushed) { history.pushState({ yado: 'feed' }, '', location.href); historyPushed = true; }`
- `assets/app.js:778-789` — `goBack()`。末尾で `historyPushed = false;` に戻している
- `assets/app.js:794-800` — `goBackFromUi()`。`historyPushed` が真なら `history.back()`、偽なら直接 `goBack()`
- `assets/app.js:2030-2034` — **問題の箇所**。popstate ハンドラが以下の3行しかない:
  ```js
  global.addEventListener('popstate', function () {
    if (state.embed) return;
    if (state.view === 'feed') goBack();
    // 既に状態Aならブラウザが勝手に離脱するのが正しい挙動
  });
  ```
  → **状態Aにいるときに前方の `{yado:'feed'}` エントリへ進んだ場合が無条件に素通りする。**
- `assets/app.js:104-114` — `state` に直前の宿を保持する場所は無い(`goBack()` が `state.hotel = null` にする)

### 再現手順(実測ログそのまま)

`?fixture=kusatsu&demo=nohotels` を 375x812 で開き、以下を順に実行:

| # | 操作 | `history.length` | `history.state` | `YadoApp.getState().view` |
|---|---|---|---|---|
| 0 | 初期(fixtureで自動的に状態B) | 3 | `{"yado":"feed"}` | feed |
| 1 | `YadoApp.selectHotel({name:'宿A',lat:36.6226,lon:138.596})` | 3 | `{"yado":"feed"}` | feed |
| 2 | `page.goBack()` | 3 | `null` | select |
| 3 | **`page.goForward()`** | 3 | **`{"yado":"feed"}`** | **select ← バグ1** |
| 4 | `selectHotel({name:'宿B',...})` | **4 ← バグ2(履歴汚染)** | `{"yado":"feed"}` | feed |
| 5 | `page.goBack()` | 4 | `{"yado":"feed"}` | select |
| 6 | `page.goBack()` | 4 | `null` | **select のまま ← 戻るが1回効かない** |
| 7 | `page.goBack()` | — | — | `about:blank`(ようやく離脱) |

- **バグ1**: #3 で `history.state` は `{yado:'feed'}` に進んでいるのに、画面は状態Aのまま(`#view-select` 表示・`#view-feed` hidden)。
- **バグ2**: #3 の時点で `historyPushed` が `false`(#2 の `goBack()` が倒した)なので、#4 で**2枚目の feed エントリを push** する(3→4)。その結果 #5→#6 で「戻るを押しても画面が変わらない回」が1回挟まる。
- 撮影済み: `screenshots/2026-09-17_r128-forward-stuck_mobile.png`(#3 の状態。進んだのに状態Aのまま)

### 確認済みで壊れていないもの(今回いじらない)

- 状態A → 宿選択 → 戻る、を3回繰り返しても `history.length` は増えない(二重push防止は正しく効いている)
- `#back-btn` クリックでも `popstate` 経由で正しく状態Aへ戻る
- `?embed=1` では `history.length` が変化しない(`app.js:744` の `!state.embed` ガードが効いている)
- 4つの入口(`?hotel=` 直接 / `?fixture=` 自動 / `selectHotel()` 再選択)はいずれも**同じ宿なら同じ提案30枚**(草津で全て一致)
- 「最近見た宿」(`yado.recent.v3`)は選択のたび正しく先頭へ積まれる(実測: 宿C/宿B/宿A/草津温泉)
- コンソールエラー0件

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(本体)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-history.mjs`(検査の追加)

## 実装方針

1. **直前の宿を覚える**: `goBack()` が `state.hotel = null` する前に、モジュール内変数(例 `lastHotel`)へ退避する。`state` の形は変えない(`check-*.mjs` が `getState()` の形に依存しているため)。
2. **popstate を `history.state` で分岐させる**(`app.js:2030-2034` を書き換え):
   - `state.embed` なら従来どおり即 return。
   - `history.state && history.state.yado === 'feed'` かつ `state.view === 'select'` → **前方へ進んだ場合**。`lastHotel` があれば `selectHotel(lastHotel)` 相当で状態Bを描き直す。無ければ何もしない(従来どおり)。
   - それ以外で `state.view === 'feed'` → 従来どおり `goBack()`。
   - **注意**: 進む復帰で `selectHotel()` をそのまま呼ぶと `pushState` が走って履歴がさらに増える。復帰経路では push しないこと(下の 3 で構造的に防ぐ)。
3. **`historyPushed` を `history.state` から導出して二重pushを構造的に消す**: `selectHotel()` の push 判定を `if (!state.embed && !(history.state && history.state.yado === 'feed'))` に変える。こうすると #4 の「既に feed エントリの上にいるのに push する」が起きない。あわせて `goBack()` の `historyPushed = false` と `goBackFromUi()` の分岐も同じ導出に揃える(`historyPushed` 変数そのものを消してよい)。
4. `?embed=1` では 1〜3 のいずれも一切効かないこと(既存の `state.embed` ガードを緩めない)。

## 完了条件

- 上の再現表の #3 で `YadoApp.getState().view === 'feed'`・`#view-feed` が表示・カード30枚に戻る。
- 上の再現表の #4 で `history.length` が **3 のまま**(汚染しない)。
- 上の再現表の #5 の戻る **1回**で `about:blank` へ離脱する(「効かない戻る」が無い)。
- `?embed=1` で `history.length` が変化しない(既存検査が引き続き PASS)。
- `scripts/check-history.mjs` に「進むで状態Bへ復帰する」「進んだ後に宿を選び直しても history.length が増えない」の2ケースを**追加**する(既存ケースは1件も削らない)。
- `node --check assets/app.js` が OK。
- `git diff --stat -- assets/engine.js assets/geo.js fixtures` が**空**。

## 検証手順

1. `node --check assets/app.js`
2. `node scripts/check-history.mjs`(既存 + 追加ケースが全 PASS)
3. 撮影(いずれも外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`(375x812)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --desktop`(1280x900)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&embed=1" --mobile`(375x812)
   撮った画像を **Read で開いて目視**し、カード30枚・帰属表示「Leaflet | © OpenStreetMap」が右上に読める・文字崩れ/重なり/はみ出しなしを確認する。
4. **`node scripts/check-all.mjs` が 29本全緑(exit 0)** ← 必須

## 変更禁止範囲

- `rank` の重み・閾値は**不可**
- `assets/geo.js`・`fixtures/` は**不可**(`git diff --stat` が空であること)
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- 外部API(Overpass / Wikipedia / Nominatim)は **0回**
- 既存 `scripts/check-*.mjs` の検査項目を**減らさない**(追加のみ)
- OSM 帰属表示の表示状態・文言・CSS は無変更

## 終わったら

1. `docs/ROADMAP.md` の R128 行を `- [x] 2026-09-16` に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-16 R128 進む/戻るの履歴を修復` の見出しを付けて**3行**追記する
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
