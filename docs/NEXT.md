# NEXT — R105 `?q=` が0件のとき無言で既定位置のまま止まる問題

- タスクID: **R105**
- 難易度: **sonnet**(表示のみ・変更は app.js 数行 + check 1本にケース追加)
- 所要目安: 25〜35分

## 目的
`?q=<存在しない地名>` で本番URLを開くと、地図が既定位置(草津)のまま何の説明も出ない。
検索欄から同じ語を打ったときは「見つかりませんでした / 別の名前で探してみてください」が出るのに、
URL 経由の同じ失敗だけ無言という**非対称**を解消する。ユーザーに新しい操作は求めない(表示が1行増えるだけ)。

## 実測で判明した前提(2026-09-16 計画役が実コードを読んで確認)
| 経路 | 場所 | 現状の挙動 | 文言 | 表示先 |
|---|---|---|---|---|
| URL `?q=` | `assets/app.js:1664 applyNormalEntryPoint()` 内、`app.js:1677` の `YadoGeo.suggestHotels(q).then(...)` | `app.js:1678` が **`if (!results.length \|\| state.view !== 'select') return;`** で**黙って return**。`flyTo` も `setMapNote` も呼ばれない | **無し** | **無し**(地図は `DEFAULT_VIEW` のまま) |
| 検索欄 | `assets/app.js:601 runSuggest()` 内、`app.js:641` | `rows` が空なら `act:'none'` の行を1件だけ組み立てて `renderSuggest()` | `name:'見つかりませんでした'` / `sub:'別の名前で探してみてください'` | **検索欄下のドロップダウン**(`renderSuggest`) |

- `setMapNote()` の実体は `app.js:392`。`els.mapNote`(`.mapnote`)の `hidden` と `textContent` を切り替えるだけ。**`textContent` なので HTML は解釈されない**(= `escapeHtml` は不要。ROADMAP 本文の「`escapeHtml` を通すこと」は `textContent` 経由では不要と実測で判明。手動で足しても害はないが、二重エスケープで `&amp;` が見えるので**付けないこと**)。
- R94 で統一済みの「状況。次にできること。」形式の既存定数:
  - `app.js:424` `NO_HOTEL_TEXT = 'この範囲には宿のデータがありません。エリアチップか検索から選べます。'`
  - `app.js:414` `TILE_ERROR_TEXT = '地図の背景画像を読み込めませんでした。ピンと提案はそのまま使えます。'`
  どちらも「2文・句点区切り・後半が次の行動」。今回もこの形に揃える。
- `scripts/check-nohotels.mjs` を grep した結果、`.mapnote` の本文を**完全一致**で見ている箇所が2つ(`check-nohotels.mjs:81` が `NO_HOTEL_TEXT`、`:116` が `TILE_ERROR_TEXT`)。**どちらも `?demo=nohotels` 経由で `?q=` は使っていない**ので、R105 の追加で既存検査が壊れることはない(= 検査側の修正は不要)。
- `?q=` の実検索は `assets/geo.js:464 suggestHotels()` → `geo.js:357 searchNominatim()` で**必ず Nominatim を叩く**。`geo.js:707` 以降の fixture 分岐は Overpass/Wikipedia 側だけで、**suggestHotels には fixture の抜け道が無い**(未確認ではなく実測)。よって再現は Playwright の `page.route()` で `nominatim.openstreetmap.org` を空配列 `[]` で応答させる方式を採る(`check-nohotels.mjs:107` がタイル遮断で既に同じ手口を使っており前例がある)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(本体)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(検査ケースを1つ追加。**新規 check 本は作らない**)

## 実装方針
1. **定数を1つ足す**。`app.js:424` の `NO_HOTEL_TEXT` の直下に、同じ「2文」形式で:
   ```js
   // R105: ?q= の地名が1件も見つからないときの案内(R94 の「状況。次にできること。」形式)
   function noQueryHitText(q) {
     return '「' + q + '」は見つかりませんでした。エリアチップか検索から選べます。';
   }
   ```
   後半は `NO_HOTEL_TEXT` の後半と**完全に同じ文字列**にする(粒度と語彙を揃えるため。定数に切り出して両方から参照する形でもよいが、`NO_HOTEL_TEXT` を分割すると `check-nohotels.mjs:81` の完全一致が壊れるので、**`NO_HOTEL_TEXT` 自体は1文字も変えないこと**)。
2. **`app.js:1678` の早期 return を分岐に変える**。
   ```js
   YadoGeo.suggestHotels(q).then(function (results) {
     if (state.view !== 'select') return;
     if (!results.length) { setMapNote(noQueryHitText(q)); return; }
     flyTo(results[0].lat, results[0].lon, DEFAULT_VIEW.zoom);
   })
   ```
   - `state.view !== 'select'` の判定を**先に**出すこと(状態Bへ移った後に状態Aの `.mapnote` を書かないため)。
   - `setMapNote` は `textContent` なので `escapeHtml` は**通さない**(上の前提を参照)。
   - ヒットした場合の `flyTo` の後で `loadHotelsInView()` 相当が走り `setMapNote('')` で上書きされる既存経路は**変更しない**。
3. **`.catch` 側(`app.js:1679` の「失敗しても初期位置のままでよい」)は今回触らない**。通信失敗は0件とは意味が違い、文言も別(検索欄側は `app.js:648` で「検索できませんでした / 少し待ってからお試しください」)。将来の別タスク。
4. `?demo=` フラグの追加は**不要**(`page.route()` で再現できるため)。足さないこと。

## 完了条件
- `?q=` が0件のとき `.mapnote` が可視になり、本文が `「<入力値>」は見つかりませんでした。エリアチップか検索から選べます。` と一致する。
- `?q=` がヒットするときの挙動は従来どおり(`flyTo` して `.mapnote` にこの文言は出ない)。
- `git diff --stat` が `assets/app.js` と `scripts/check-hotelparam.mjs` の2ファイルのみ。
- `node --check assets/app.js` が通る。
- `node scripts/check-all.mjs` が **27本全緑**。

## 検証手順
1. `scripts/check-hotelparam.mjs` に**ケースを1つ足す**(新規 check 本は作らない)。既存の `checkStateA()` 群と同じ書き方で、`page.route('**nominatim.openstreetmap.org**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }))` を張ってから `?q=そんちょうざいしないちめい` を開き、
   - `.mapnote` が可視
   - 本文が上記文言と完全一致
   - `state.view` が状態Aのまま(`#map` が可視・`#feed-title` が「この宿の周辺」でない)
   - コンソールエラー0件
   の4点を `ok()` で検査する。既存の17件の `page.goto` と検査項目は**1つも減らさない**。
2. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` / PC幅):
   - `http://127.0.0.1:3000/?fixture=kusatsu` — mobile。デグレ確認1枚(状態Bが従来どおり)。
   - `http://127.0.0.1:3000/?demo=nohotels` — mobile。`.mapnote` の既存文言が壊れていないこと。
   - **`?q=` の実画面**は Nominatim を叩くので、上記1の Playwright スクリプト内で `page.screenshot()` を撮って `screenshots/` に保存し、それを Read で目視する(=外部API 0回)。
   - **実 API を使った確認は最大1回まで**。本番URL `https://teer-tee.github.io/yadotabi/?q=そんちょうざいしないちめい` を push 後に1回だけ開いて文言が出ることを確かめてよい(それ以上叩かない)。
3. 撮った画像を必ず Read で開き、文字崩れ・重なり・はみ出し・`.mapnote` が地図の外へはみ出していないかを目視する。
4. `node scripts/check-all.mjs` → **27本全緑**。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` — **変更不可**。
- rank の重み・閾値・カテゴリ減点 — **変更不可**。
- `NO_HOTEL_TEXT`(`app.js:424`)と `TILE_ERROR_TEXT`(`app.js:414`)の文字列 — **1文字も変えない**(既存検査が完全一致で依存)。
- `app.js:641` の検索欄側の文言 — 今回は変えない(表示先が違うため統一対象外。理由を NIGHTLOG に1行残すこと)。
- `check-all.mjs` の配列・他の check 本の中身 — **無編集**(今回は `check-hotelparam.mjs` にケースを足すだけ)。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作 — **禁止**。
- 外部API: Overpass/Wikipedia 0回。Nominatim は上記2の「本番URLで最大1回」のみ。

## 終わったら
1. `docs/ROADMAP.md` の R105 の行を `- [x] 2026-09-16 R105 …` に更新。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行(やったこと / 見た目の確認結果 / 次)を追記。**ファイル先頭に新しい節を作らない**。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
