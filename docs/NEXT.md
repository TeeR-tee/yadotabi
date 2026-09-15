# NEXT: R32 検索候補への「最近見た宿」の統合

選定理由: 残候補(R11/R14/R19/R28残/R31/R32)のうち、R32 だけが実際のユーザー導線(0タップでの再訪)を太らせる機能改善で、かつ実装範囲が app.js の状態A周辺に閉じていて engine/rank に一切触らずに済むため。

## 現状(計画役が app.js を実読した事実)

- `showRecent()` (assets/app.js:465-480) … `getRecent()` の履歴を `act:'hotel'` / `icon:'🕘'` / `sub:'最近見た宿'` の行に変換して `renderSuggest()` に渡す。**空欄フォーカス時のみ**呼ばれる。
- `runSuggest()` (assets/app.js:482-533) … 2文字未満なら `showRecent()`(フォーカス中)か `hideSuggest()`。2文字以上は `YadoGeo.suggestHotels(q)` の結果だけで `rows` を作り直して `renderSuggest(rows)` する。
  → **つまり2文字打った瞬間に「最近」は完全に消える**(ROADMAP R32 の「消えるなら残す」に該当。統合が必要)。
- `renderSuggest(rows)` (assets/app.js:446-463) … `rows` を `.suggest__item` のボタン列に描くだけ。**セクション見出しの概念が無い**。
- クリック委譲 (assets/app.js:1300-1315) … `suggestItems[dataset.index]` を引いて `act==='hotel'` なら `selectHotel`、`'jump'` なら地図移動。**`data-index` は rows 配列の添字なので、見出し行を rows に混ぜると添字がずれる**。見出しはボタンにせず別要素にするか、`act:'head'` 行を描画だけ非ボタンにすること。
- 撮影用ダミー (assets/app.js:1179-1203) … `demo=suggest` は候補4件+jump 1件、`demo=recent` は最近3件。**どちらも `renderSuggest()` を直接呼ぶ固定配列**なので、統合後の見え方を撮るにはここも更新が要る。
- `getRecent()` (assets/app.js:308-311) / `pushRecent()` (313-325) / `LS_RECENT='yado.recent.v3'` (55) … 履歴の実体。**保存側のロジックは変更しない**。

## 対象ファイル(絶対パス)

- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js  (主)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css (セクション見出しのスタイルのみ)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-recent.mjs (新規・機械検査)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs (新規検査を実行リストに追加)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs (撮影URLに統合後の画面を1つ足す。セレクタ表は変えない)
- C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md / docs\NIGHTLOG.md (記録)

## 実装方針

1. `renderSuggest(rows)` に**見出し行**を通せるようにする。`row.act === 'head'` のときだけ `<div class="suggest__head" role="presentation">ラベル</div>` を出し、**`data-index` を振らない**(=クリック委譲の `closest('.suggest__item')` に当たらないので既存の添字ロジックが壊れない)。`suggestItems` には従来どおり rows をそのまま入れてよい(見出し行も配列には残るが、押せないので参照されない)。
2. `recentRows(limit)` を新設(`showRecent` から切り出し)。`getRecent().slice(0, limit)` を `act:'hotel'` 行に変換して返す純粋関数にする。`showRecent()` はこれを使って書き直す(空欄フォーカス時は**最近だけ**。見出し「最近見た宿」を先頭に付けるかは任意だが、付けるなら `sub` の「最近見た宿」は冗長になるので消すこと)。
3. `runSuggest()` の2文字以上の分岐で、`rows` を組み立てたあと**先頭に最近の一致分を差し込む**:
   - `recentRows(RECENT_MAX)` のうち `name` に `q` を含むもの(`normalizeName` があるならそれ経由、無ければ `indexOf(q) >= 0` の素朴な部分一致で可)を最大3件。
   - 候補側(`rows`)に**同名の宿が既にある場合は最近側を落とす**(重複表示の防止)。
   - 一致が1件以上あれば `{act:'head', name:'最近見た宿'}` → 最近行 → `{act:'head', name:'検索結果'}` → 候補行 の順に連結。一致0件なら**見出しを出さず従来どおり候補だけ**(見出しだけ浮くのを避ける)。
   - 「見つかりませんでした」「検索できませんでした」の分岐でも、最近の一致があればその行は残す(0タップ導線を切らないため)。
4. `applyDemoStateA()` の `demo=recent` を「空欄フォーカス+最近だけ」の現行のまま維持しつつ、**`demo=recentmix` を新設**して「入力『草津』+最近2件(見出し付き)+候補3件+jump」の統合後の姿を撮れるようにする(`demoStateA = true` の判定行 app.js:1122 にも追加すること)。
5. style.css に `.suggest__head`(小さめ・`--c-muted` 系・左右 padding は `.suggest__item` と揃える・`min-height` は指定しない=44px 検査の対象外)。**`.suggest__item` の高さ・padding は一切触らない**(R13 の 44px を維持するため)。

## 完了条件(検証可能)

- 新規 `node scripts/check-recent.mjs` が全 PASS(check-chipcurrent.mjs の作りを踏襲し、Nominatim を `page.route` で fulfill してモックする):
  1. `?demo=recentmix` で `.suggest__head` が2個、テキストが「最近見た宿」「検索結果」
  2. 同画面で `.suggest__item` の1件目が 🕘 の最近行、その後に候補行が続く(DOM順)
  3. `.suggest__head` には `data-index` が無く、クリックしても `state.view` が `select` のまま変わらない
  4. 候補行(最近でない方)をクリックすると従来どおり状態Bへ遷移する(既存の委譲が壊れていない)
  5. `?demo=recent`(空欄)では `.suggest__head` が0個か1個で、候補行は最近だけ
  6. `?demo=suggest`(最近なし)では `.suggest__head` が0個(見出しが浮かない)
  7. コンソールエラー0件
- `node scripts/check-all.mjs` が**12本すべて緑**(check-recent.mjs を追加した状態)。
- `node scripts/check-a11y.mjs` で `.suggest__item` が全画面 44px 以上のまま(統合後の画面を対象URLに追加しても OK)。
- `node scripts/dump-rank.mjs kusatsu` が**差分ゼロ**(engine 無傷の証明)。

## 検証手順(撮影)

1. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=recentmix" --mobile` … 統合後の候補ドロップダウン。見出し2本・最近行・候補行が1枚に写ること。
2. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=recent" --mobile` … 空欄フォーカス時(最近だけ)のデグレ確認。
3. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=suggest" --mobile` … 最近なし時に見出しが出ていないこと。
4. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` … 状態Bのデグレなし。
5. 4枚とも Read で目視し、文字崩れ・重なり・はみ出し・行高のばらつきが無いことを確認する。**R2-1(候補がエリアチップに重なる)は朝の相談で保留中の別件なので、行数が増えて重なりが目立っても今回は直さない**(NIGHTLOG に一言だけ書く)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` … 一切触らない。
- `pushRecent()` / `LS_RECENT` のキー名と保存形式 … 触らない(既存の履歴が読めなくなる)。
- `.suggest__item` の高さ・padding・`.chip` 周り … R13 の 44px とチップ行のレイアウトを壊さない。
- R2-1 の「候補とチップの重なり」の方針変更 … 朝の相談待ち。

## 難易度・所要目安

- 難易度: sonnet(builder-sonnet)
- 所要目安: 実装 20分 + check-all 約1分 + 撮影目視 10分 = **35〜45分**
