# NEXT — R91 README の `?demo=` 値一覧を実装に合わせる(文書のみ)

- タスクID: **R91**
- 難易度: **sonnet**(文書のみ・コード変更なし・外部API 0回)
- 所要目安: 20〜30分(うち check-all.mjs が約4分)

## 目的

README の `?demo=` 値一覧が実装と2件ズレている確定ドリフト。README はユーザーが最初に読む文書なので、
「書いてある通りに試したら動かない/書いていない値が実在する」状態を放置しない。
ついでに各値がどの検査スクリプトから使われているかを載せ、将来その値を消してよいか判断できるようにする。

## 実測で判明した前提(計画役が grep/Read で確認済み)

1. `assets/app.js` の `?demo=` 実装は **12値**。`demo === '...'` の全マッチ行:
   - `app.js:1453` `far`
   - `app.js:1454` `zoomout` / **`initpos`** → `demoNoSaveView = true`
   - `app.js:1455` `suggest` / `recent` / `recentmix` / `zoomout` / **`initpos`** → `demoStateA = true`
   - `app.js:1456` `passive`
   - `app.js:1457` `imgfail`
   - `app.js:1458` **`portrait`** → `demoPortrait = true`
   - `app.js:1462` `nohotels`
   - `app.js:1467` `autozoom`(`fetchHotelsInBbox` をダミーに差し替え)
   - `app.js:1485` `hoteltip`(同上・宿6件)
   - 重複して現れる行(`1550` autozoom / `1568` suggest / `1583` recent / `1593` recentmix / `1617` zoomout)は
     同じ値の第2分岐で、新しい値ではない。
2. **表に無い2値**:
   - `initpos` — `app.js:1454`+`1455`。`scripts/check-initpos.mjs` が使用中。
   - `portrait` — `app.js:147`(`var demoPortrait`。コメント「先頭3枚を縦長ダミー画像に差し替える」)、
     `app.js:853` `var isPortraitDemo = demoPortrait && index < 3;`、`app.js:1458`。
     `scripts/check-imgfail.mjs` が使用中(R62 の縦長写真見切れ確認用)。
     **未確認**: 400x800 という具体的サイズは ROADMAP 本文の記述で、`app.js:853` 周辺のダミーURL生成コードは
     計画役は未読。作業役が `app.js:850-870` を読んで実際の寸法を確認してから表の文言を書くこと。
3. README 側の現状(行番号は実測):
   - `README.md:118` `### \`?demo=\`の値一覧`
   - `README.md:120` `10個すべて \`assets/app.js\` の \`demoStateA\` 系分岐で完結し、外部APIは叩きません。`
     → **「10個」が誤り**。加えて `autozoom`/`hoteltip` は `demoStateA` 系ではなく
       `fetchHotelsInBbox` の差し替えなので、「demoStateA 系分岐で完結し」という説明自体も不正確。
   - `README.md:121` 空行 / `122` ヘッダ行 `| 値 | 何が再現されるか |` / `123` 区切り行 `|---|---|`
   - `README.md:124`〜`133` がデータ行10本(124 `far` 〜 133 `hoteltip`)
   - `README.md:134` 空行 / `135` `## ファイル構成`
4. 各値を使っている `scripts/check-*.mjs`(grep 実測):

   | 値 | 使用している検査 |
   |---|---|
   | `far` | check-a11y.mjs:47 / check-feednote.mjs:109 |
   | `zoomout` | check-chipcurrent.mjs / check-keyboard.mjs / check-sample.mjs |
   | `suggest` | check-chipcurrent.mjs / check-recent.mjs |
   | `recent` | check-initpos.mjs / check-recent.mjs |
   | `recentmix` | check-a11y.mjs:46 / check-recent.mjs:90 |
   | `passive` | **なし**(grep で検査スクリプトからのヒット0件) |
   | `imgfail` | check-imgfail.mjs |
   | `initpos` | check-initpos.mjs |
   | `portrait` | check-imgfail.mjs |
   | `nohotels` | check-autozoom.mjs / check-nohotels.mjs |
   | `autozoom` | check-autozoom.mjs |
   | `hoteltip` | check-hoteltip.mjs |

   `passive` だけ検査ゼロだが、**これは削除提案ではない**(F3 受動ログの目視用入口として実在する)。
   表には「なし(目視専用)」と正直に書く。
5. `README.md:113` の `?demo=` 行(パラメータ表側)は「下記『`?demo=`の値一覧』参照」で値を列挙していないため修正不要。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` ← **変更するのはこの1ファイルのみ**
- 読むだけ: `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(850-870・1440-1500行)

## 実装方針(行番号つき)

1. `README.md:120` の本文を差し替える。「10個」→「12個」にするだけでなく、
   `demoStateA` 系に限らない旨も含めて1〜2文で書き直す。例:
   「12個すべて `assets/app.js` の `?demo=` 分岐で完結し、外部APIは叩きません(`autozoom` と `hoteltip` は
   宿の取得関数をダミーデータに差し替えることで再現しています)。」
2. `README.md:122-123` のヘッダを2列→**3列**にする(`| 値 | 何が再現されるか | 使っている検査 |` / `|---|---|---|`)。
3. `README.md:124-133` の既存10行すべてに3列目を追記する(上表の実測値をそのまま使う)。
4. 表に **2行追加**する。並び順は `app.js` の分岐順に近づけて、
   `initpos` は `zoomout` の直後(`README.md:125` の次)、`portrait` は `imgfail` の直後に置く。
   - `initpos` … 状態Aの初期位置の検査用(地図の保存位置を復元せず状態Aで開く。`zoomout` と同じ2フラグが立つ)
   - `portrait` … カード先頭3枚の写真を縦長ダミー画像に差し替え、縦長写真の見切れを確認する
5. 表以外の README の記述・用語・見出しは変えない(R73 の方針を踏襲し、用語は置き換えず補足のみ)。

## 完了条件

- `README.md` の `?demo=` 表が **12行**(`far` `zoomout` `initpos` `suggest` `recent` `recentmix` `passive` `imgfail` `portrait` `nohotels` `autozoom` `hoteltip`)ある。
- 表が3列になり、全12行に3列目(使っている検査、または「なし(目視専用)」)が入っている。
- `README.md:120` 相当の本文から「10個」が消え、`autozoom`/`hoteltip` が demoStateA 系でない旨が分かる。
- `git diff --stat` の変更が **`README.md` と `docs/ROADMAP.md` と `docs/NIGHTLOG.md` の3ファイルだけ**
  (`assets/` `fixtures/` `scripts/` `index.html` `demo/` の diff が空であること)。

## 検証手順

1. `cd C:\workspace\claude\旅行先用サイト\yadotabi`
2. 表に書いた12値が実在することを再確認: `grep -n "demo === '" assets/app.js`
3. `node docs/check.mjs`(README の画像リンク検査を含む。README を触ったので必ず通す)
4. **`node scripts/check-all.mjs` 27本全緑・exit 0(必須)**
5. デグレ確認の撮影1枚(文書のみの変更だが規約5の視覚検証を満たすため):
   `node C:\workspace\tools\shot\shot.mjs "https://teer-tee.github.io/yadotabi/?fixture=kusatsu" --mobile`(375px)
   → 撮った PNG を Read で開き、カード30枚・番号ピン判読可・文字崩れ/重なり/はみ出しなし・コンソールエラー0件を目視。
   (push 前なので本番URLは旧版のままでよい。ローカル確認したい場合は `scripts/` のサーバ方式でも可)
6. `git diff --stat -- assets fixtures scripts index.html demo` が **空** であることを確認。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は **一切触らない**(読むのも app.js のみで足りる)。
- rank の重み・閾値・`CATEGORY_*` 定数は変更しない。
- `git stash` / `git reset` / `git checkout` によるファイル復元操作は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは **0回**。fixture 再生成もしない。
- `assets/app.js` を編集しない(今回は読むだけ。実装と表がズレていたら**表の側を実装に合わせる**)。
- 実装されていない値を表に書かない(R52 と同じ方針。必ず grep で実在確認してから書く)。

## 終わったら

1. `docs/ROADMAP.md` の R91 行を `- [x] 2026-09-16 R91 ...` に更新する。
2. `docs/NIGHTLOG.md` の「## サイクル記録」に3行追記(やったこと / 見た目の確認結果 / 次)。
   「次」には残りのバックログ R89・R92・R93・R94・R95 を列挙する。
3. **先にコミット**(1行の日本語メッセージ。例: `R91 READMEの?demo=値一覧を実装の12値に合わせ検査列を追加`)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない。3〜5行)。
