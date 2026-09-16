# NEXT: R108 `?q=` の入力値を案内文に出す際の長さ上限

- **タスクID**: R108
- **難易度**: sonnet(1関数に1行足す + 検査1件追加)
- **所要目安**: 20〜30分

## 目的
`?q=` に長い文字列を入れると、その全文がそのまま `.mapnote` の案内文に入り、375px で地図の大半を黒い帯が覆う。実ユーザーが目にする見た目の崩れなので、入力値を先頭20字+「…」に切って1〜2行に収める。

## 実測で判明した前提(計画役が Playwright で計測・撮影済み)
- `assets/app.js:426-429` `noQueryHitText(q)` は `'「' + q + '」は見つかりませんでした。エリアチップか検索から選べます。'` を返すだけで**長さを一切切っていない**。
- 呼び出し元は `assets/app.js:1684` の `if (!results.length) { setMapNote(noQueryHitText(q)); return; }`。手前の `app.js:1678` `if (q.length >= 2)` は**下限**のみで上限なし。
- 表示先 `setMapNote()` は `assets/app.js:392-400`。`els.mapNote.textContent = text` なので **HTML エスケープは不要**(既に textContent 経由。escapeHtml を足さないこと)。
- `.mapnote` の CSS は `assets/style.css:224-244`。`max-width: calc(100% - var(--sp-6))` + `white-space: normal` + `overflow-wrap: anywhere` のため**横にはみ出さない代わりに縦に無限に伸びる**。
- **375x812 での実測(Nominatim を `page.route()` で `[]` に差し替え、外部API 0回)**:

| `?q=` の字数 | `.mapnote` 高さ | 地図高さ | 占有率 |
|---|---|---|---|
| 20字 | 114px | 642px | 18% |
| 50字 | 172px | 642px | 27% |
| 100字 | 250px | 642px | 39% |
| 200字 | 426px | 642px | 66% |

  幅は常に 188px・行高 19.5px 固定。100字で撮影して目視したところ、**地図中央に縦長の黒い塊が出て草津の地図がほぼ読めない**状態だった(撮影ファイルは一時確認用のため削除済み。作業役は実装前後で撮り直すこと)。
- 20字に切った場合の文言は全 50 文字(= 20 + 「」+ 固定部30字)で、上表の「20字」行どおり **114px / 6行相当**に収まる。これを上限とする。
- `scripts/check-hotelparam.mjs:176-218` に R105 の `checkQueryNoHit(browser, q, label)` が既にあり、`page.route('**nominatim.openstreetmap.org**')` で `[]` を返す方式で `.mapnote` の可視と本文一致を見ている。呼び出しは `scripts/check-hotelparam.mjs:322`。
- **未確認**: `?q=` に絵文字やサロゲートペアを入れたときの `slice(0,20)` の挙動(文字化けの可能性)。実害は小さいので今回は追わず、必要なら NIGHTLOG に1行残すだけでよい。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`

## 実装方針
1. `assets/app.js:426` の `noQueryHitText` の直前に定数を1つ置く:
   `var QUERY_ECHO_MAX = 20; // R108: 案内文に出す入力値の上限(20字で .mapnote が 114px/地図の18%に収まる実測値)`
2. `assets/app.js:427-429` の関数本体の先頭に1行:
   `var shown = q.length > QUERY_ECHO_MAX ? q.slice(0, QUERY_ECHO_MAX) + '…' : q;`
   として `'「' + shown + '」は…'` を返す。切る基準は**文字数のみ**(R42 の句点ロジックは要約用なので流用しない)。
3. `app.js:428` の後半「エリアチップか検索から選べます。」と `app.js:424` の `NO_HOTEL_TEXT` は **R94 で文言を揃えた資産なので変更しない**。
4. `scripts/check-hotelparam.mjs` の `checkQueryNoHit` は `expectedText`(`:191`)を `q` そのものから組み立てているため、**長い `q` を渡すと必ず落ちる**。同ファイル内に短い専用関数を足すか、`checkQueryNoHit` に「期待文字列を組み立てる際も同じ切り詰めを行う」処理を入れる方式のどちらかを選ぶ(既存17件の `page.goto` 回数は減らさないこと)。
5. `scripts/check-hotelparam.mjs:322` の直後に、100字の `q` を渡すケースを**1件だけ**追加し、`.mapnote` の `textContent.length` が **51以内**(20字+「」2字+固定部30字を上限とし、「…」1字分の余裕)であることを検査する。

## 完了条件
- `?q=` に100字を入れても `.mapnote` の本文が51文字以内、375px での高さが **120px 以下**になる。
- `?q=` が19字以下のときは従来どおり**全文がそのまま出る**(「…」が付かない)。
- `?q=` が0件でないとき(通常の地名検索)の挙動は一切変わらない。
- `git diff --stat -- assets/style.css index.html fixtures demo` が**空**(CSS もアプリの他部分も触らない)。

## 検証手順
1. `node --check assets/app.js`
2. 撮影(いずれも外部API 0回。Nominatim は `page.route()` で `[]` に差し替える Playwright スクリプトを一時ファイルで作ってよい。撮影後、一時スクリプトは消すこと):
   - `http://127.0.0.1:3000/?q=<100字>` — **375x812(mobile)**: 黒い帯が2行程度に収まり地図が読めること
   - `http://127.0.0.1:3000/?q=<100字>` — **1280x900(desktop)**
   - `http://127.0.0.1:3000/?fixture=kusatsu` — **375x812**: デグレ確認(カード30枚・文字崩れなし)
   保存した画像を **Read で開いて目視**すること(保存しただけで「目視した」と書かない)。
3. `node scripts/check-hotelparam.mjs` 単体で全 pass / 0 fail
4. **`node scripts/check-all.mjs` が 28本中28本全緑**(必須)

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**
- rank の重み・閾値・カテゴリ減点は**変更不可**
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは**0回**
- `NO_HOTEL_TEXT` と案内文の後半「エリアチップか検索から選べます。」の文言変更は不可
- `scripts/check-passive.mjs:94` の `hasText: 'Instagram'` に依存する箇所は触らない

## 終わったら
1. `docs/ROADMAP.md` の R108 の行を `- [x] 2026-09-16 R108 …` に更新
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記(やったこと / 見た目の確認結果 / 次)。ファイル先頭に新しい節を作らないこと
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
