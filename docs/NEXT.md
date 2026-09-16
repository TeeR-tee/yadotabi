# NEXT: R94 状態Aの案内文3種類の粒度を揃える

- **タスクID**: R94
- **難易度**: sonnet(文言変更＋検査2本の更新のみ。ロジック変更なし)
- **所要目安**: 25〜40分(うち check-all.mjs 約4分)

## 目的
状態A(地図画面)でユーザーが最初に見る案内文が3種類あり、**1つ目だけ「次にどうすればよいか」が書かれていない**。
やどたびは入力ゼロ原則のため、行き止まりに見える文言は「壊れている?」という誤解に直結する。文言を揃えて、
どの状態でも次の入口(エリアチップ・検索)が見えるようにする。

## 実測で判明した前提(2026-09-16 計画役が grep/Read で確認)

### 案内文の全文と出る条件

| # | 行 | 全文 | 出る条件 |
|---|---|---|---|
| A | `assets/app.js:407` | `この範囲には宿が見つかりませんでした` | `demoStateA` かつ `demoNoHotels`(= `?demo=nohotels`)。撮影専用の再現経路 |
| B | `assets/app.js:444` | `この範囲には宿が見つかりませんでした`(**Aと完全同一文字列**) | 実取得で `hotels.length === 0` かつ自動ズームアウト(R44)が使えない/使い終わった後 |
| C | `assets/app.js:456` | `宿ピンの取得が混雑中です。検索やエリアチップから選べます。` | `err.overpassBusy`(Overpass 429/504) |
| D | `assets/app.js:616` | name=`見つかりませんでした` / sub=`別の名前で探してみてください` | 検索候補が0件(`.mapnote` ではなく `renderSuggest` の行) |

- C と D は「次の行動」を持つが、**A/B だけが持たない**。ROADMAP R94 本文の記述と実測は一致した。
- 同じ `setMapNote()` の他の文言(参考・今回は変更しない): `app.js:410/416/453` `ズームすると宿が出ます`、
  `app.js:421` `宿を探しています…`、`app.js:439` `もう少し広い範囲で探しています…`、`app.js:458` `宿を取得できませんでした`。
- A と B は**同一の文字列リテラルが2箇所に手書きされている**(定数化されていない)。

### 文言を検査している check(先に grep 済み。更新必須)

| ファイル:行 | 現在のアサーション |
|---|---|
| `scripts/check-nohotels.mjs:10`(コメント), `:81` | `text === 'この範囲には宿が見つかりませんでした'` |
| `scripts/check-autozoom.mjs:119` | 同上(ケース3 `?demo=nohotels`) |
| `scripts/check-autozoom.mjs:150` | 同上(ケース4 ドラッグ後の通常0件バナー) |
| `scripts/check-autozoom.mjs:182` | `text === '宿ピンの取得が混雑中です。検索やエリアチップから選べます。'`(C。**変更しないので触らない**) |

→ **A/B の文言を変えると check-nohotels 1箇所・check-autozoom 2箇所が FAIL する。実装と同時に必ず直す。**

### 未確認
- `?demo=autozoom` で B が「自動ズームアウト後にも出る」ことを目視した記録は無い(check-autozoom ケース4は機械検査のみ)。撮影で確かめること。

## 統一後の文言案(実装者はまず撮影して最終決定してよい。変えるなら理由を NIGHTLOG に書く)

推奨: **A・B とも同一の**
```
この範囲には宿のデータがありません。エリアチップか検索から選べます。
```
- 根拠: C(`混雑中です。検索やエリアチップから選べます。`)と同じ「状況。次の入口。」の2文構成で粒度が揃う。
- 「見つかりませんでした」→「宿のデータがありません」に変えるのは、やどたびが**OSM のデータを見ているだけ**で
  「宿が存在しない」と断定はできない、というプロジェクトの正直さ方針に沿うため(ROADMAP R94 本文の案と同じ)。
- **ユーザーに促す語は既存の入口のみ**: 「エリアチップ」「検索」。新しい操作(泊数入力・絞り込み等)は一切足さない。
- A と B を同一文言にしてよいか: 実装者が `?demo=nohotels` と `?demo=autozoom` の撮影2枚を見て判断する。
  分けるべきと判断した場合のみ B を `もう少し広げて探しましたが、宿のデータがありませんでした。エリアチップか検索から選べます。`
  とし、その理由を NIGHTLOG に残す(既定は同一文言)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(407 行・444 行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nohotels.mjs`(10 行コメント・81 行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-autozoom.mjs`(119 行・150 行)

## 実装方針
1. `assets/app.js` の `loadHotelsInView()` の直前(`app.js:401` の上)に定数を1つ置く。
   同一リテラルの二重管理を断つのが目的で、行数はコメント込み3行以内。
   例: `var NO_HOTEL_TEXT = 'この範囲には宿のデータがありません。エリアチップか検索から選べます。';`
2. `app.js:407` と `app.js:444` の `setMapNote('この範囲には宿が見つかりませんでした')` を
   `setMapNote(NO_HOTEL_TEXT)` に置き換える(2箇所)。**他の setMapNote は1行も変更しない。**
3. `scripts/check-nohotels.mjs:81` と `scripts/check-autozoom.mjs:119` `:150` の期待文字列を新文言に更新。
   `check-nohotels.mjs:10` のコメントも揃える。**検査の項目数は減らさない**(比較する文字列を差し替えるだけ)。
4. `scripts/check-autozoom.mjs:182`(混雑文言 C)は**変更しない**。

## 完了条件
- `app.js` 内に `この範囲には宿が見つかりませんでした` が0件(`grep -n` で確認)。
- 新文言が `app.js` の定数1箇所にのみ存在し、`setMapNote(NO_HOTEL_TEXT)` が2箇所。
- `node --check assets/app.js` が通る。
- `node scripts/check-all.mjs` が **27本全緑**(exit 0)。
- 撮影2枚を目視し、375px で新文言が3行に落ちない/`.mapnote` が地図やチップ行と重ならないこと。

## 検証手順
```
node --check assets/app.js
node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/index.html?demo=nohotels" --mobile
node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/index.html?demo=autozoom" --mobile
node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/index.html?demo=nohotels" --desktop
node scripts/check-nohotels.mjs
node scripts/check-autozoom.mjs
node scripts/check-all.mjs
```
- 撮影URL: `?demo=nohotels`(A) と `?demo=autozoom`(B)。幅は mobile 375px 必須、desktop は A の1枚のみでよい。
- 撮影は `?demo=` 経由なので **外部API 0回**。本番URLでの撮影は不要。
- デグレ確認に `?fixture=kusatsu` mobile を1枚(カード30枚・番号ピン判読可・コンソールエラー0件)。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**不可**。
- rank の重み・閾値・カテゴリ減点は**不可**。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API **0回**(Overpass/Wikipedia/Nominatim を一切叩かない)。
- `scripts/check-autozoom.mjs:182` の混雑文言、`ズームすると宿が出ます` 系の文言、`app.js:616` の検索候補0件文言は今回の対象外。

## 終わったら
1. `docs/ROADMAP.md` の R94 を `- [x] 2026-09-16 R94 …` に更新
2. `docs/NIGHTLOG.md` の「## サイクル記録」に3行追記(やったこと / 見た目の確認結果 / 次)
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
