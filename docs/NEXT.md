# 次の1タスク: R99 `?hotel=` の緯度経度の範囲検査を足す

- **タスクID**: R99
- **難易度**: sonnet(変更は app.js 1行相当+検査追加。設計判断は計画役側で確定済み)
- **所要目安**: 20〜30分(うち check-all.mjs 27本で約4分)

## 目的

`?hotel=999,999,テスト` のような地球上に存在しない座標でも状態Bが開いてしまい、提案0件の画面だけが出てユーザーには理由が分からない。範囲外は「`?hotel=` が無かった」ことにして状態A(地図)へ黙ってフォールバックさせ、`?bg=` が既に取っている「不正値は厳格に弾いて黙って無視」の方針に揃える。

## 実測で判明した前提(計画役が今サイクルで確認)

- `assets/app.js:1333` `hotelFromUrl(params)`。本体は8行:
  - `:1334` `params.get('hotel')`、無ければ null
  - `:1336` `raw.split(',')`、`parts.length < 2` なら null
  - `:1338-1339` `parseFloat(parts[0])` / `parseFloat(parts[1])`
  - **`:1340` `if (!isFinite(lat) || !isFinite(lon)) return null;` ← ここに範囲検査が無い**(実測。`lat >= -90` 等の比較はファイル全体で0件)
  - `:1341` 名前は `parts.slice(2).join(',').trim()`
  - `:1342` `return { id:'url/'+lat+','+lon, name: name || 'この宿の周辺', lat, lon }`
- `hotelFromUrl()` の呼び出しは実測で5箇所: `app.js:1518`(hasTarget 判定) / `:1540`(hotel 取得) / `:1553`(embed 分岐) / `:1640`(`applyNormalEntryPoint` で urlHotel があれば `selectHotel()` して状態Aを飛ばす) / `:1910`。**null を返せば全箇所が「hotel 指定なし」経路に自然に落ちる**ので、呼び出し側の改修は不要(未確認な副作用は無いと判断したが、実装役は `:1518` と `:1553` の挙動を撮影で確かめること)。
- 比較対象の既存方針: `app.js:1391` `bgFromUrl()` は `/^[0-9a-fA-F]{6}$/` で厳格に検証し、外れたら `return null`(=黙って無視)。R99 はこれと同じ形。
- 下流の防御: `app.js:329` と `app.js:677` に `!isFinite(hotel.lat)` のガードはあるが、**範囲検査ではないため 999 は通過する**(実測)。
- `scripts/check-hotelparam.mjs` は206行。先頭の `checkTitle(browser, path, expectedTitle, label)` ヘルパ(`:60` 付近)で `#feed-title` の文言を見る作り。現在の検査は 1〜5 + a〜h。**単独27秒で27本中もっとも遅い本**(R55 実測)なので、追加ケースは3件に留めて増やしすぎないこと。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(1行の条件追加のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(検査3ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針

1. `assets/app.js:1340` の条件を、範囲外も null にする形へ広げる。定数を切り出さず、その場の比較で足りる:

   ```js
   // 地球上に無い座標(?hotel=999,999 など)は ?hotel= 無しと同じ扱いにして
   // 状態Aへ黙ってフォールバックする(?bg= の厳格検証と同じ方針。R99)
   if (!isFinite(lat) || !isFinite(lon)) return null;
   if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
   ```
   2行に分けて書くか1行にまとめるかは実装役の裁量。**境界値(±90 / ±180 ちょうど)は通す**(有効な座標なので `<` `>` であって `<=` `>=` にしない)。
2. 名前部分(`app.js:1341`)は**現状どおり何でも受ける**。表示するだけで害が無く、空なら `この宿の周辺` にフォールバック済み。
3. `scripts/check-hotelparam.mjs` に R99 の3ケースを追加。既存 1〜5 / a〜h のループやヘルパは**編集しない**(新しい呼び出しを足すだけ)。
   - `?hotel=999,138.5960,テスト` → 状態Aのまま(`#feed-title` が「この宿の周辺」にならない / 状態Bへ遷移していない)
   - `?hotel=36.6226,999,テスト` → 同上
   - `?hotel=abc,def,テスト` → 同上(従来の `isFinite` 経路が壊れていないことの回帰)
   - 併せて `?hotel=36.6226,138.5960,ちょうしゅくの宿`(正常値)が従来どおり状態Bを開くことを既存ケース4で担保していることを確認する。
   - 判定方法は実装役が決めてよいが、`#feed-title` の文言だけで見分けにくければ状態A側の要素(地図 `#map` の可視、`.chips` の可視など)の可視性で見る。ヘルパを1つ足すのは可。
4. ファイル冒頭のコメントブロック(`:160` 付近の「確認項目」)にも R99 の3行を追記する(既存の書式に揃える)。

## 完了条件

- `?hotel=999,999,テスト` を開くと状態A(地図+エリアチップ)が出る。状態Bは開かない。
- `?hotel=36.6226,138.5960,ちょうしゅくの宿` は従来どおり状態Bが開き、見出しが「ちょうしゅくの宿」。
- `?hotel=90,180,テスト`(境界値)は状態Bが開く(弾かれない)。
- `node scripts/check-hotelparam.mjs` が全PASS(既存項目を1つも減らさない)。
- `node scripts/check-all.mjs` が **27本全緑(exit 0)**。
- `git diff --stat` の対象が `assets/app.js` `scripts/check-hotelparam.mjs` `docs/` のみ。

## 検証手順

1. `node --check assets/app.js`
2. `node scripts/check-hotelparam.mjs`(単独27秒。先に単独で回す)
3. 撮影(すべて `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` / PC幅。外部API 0回を守るため fixture 併用または状態Aのみ):
   - `http://127.0.0.1:3000/?hotel=999,999,%E3%83%86%E3%82%B9%E3%83%88` を **mobile 375** — 状態Aが出ていること
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **mobile 375** — デグレ確認(カード30枚・番号ピン判読可・文字崩れ無し・コンソールエラー0件)
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **desktop 1280** — 同上
   - 撮った画像は必ず Read で開いて目視する
4. `node scripts/check-all.mjs` → **27本全緑**

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**。
- rank の重み・閾値・カテゴリ減点は**変更不可**。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- 外部API(Overpass / Nominatim / Wikipedia)の呼び出しは**0回**。撮影は fixture か状態Aのみ。
- 既存 `scripts/check-*.mjs` の**既存検査を減らさない**(追加のみ)。
- `bgFromUrl()` など他のURLパラメータの検証ロジックには触らない。

## 終わったら

1. `docs/ROADMAP.md` の R99 行を `- [x] 2026-09-16 R99 ...` に書き換える。
2. `docs/NIGHTLOG.md` の「サイクル記録」に3行追記(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
