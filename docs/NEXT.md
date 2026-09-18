# NEXT — R136 営業時間をカードに出す(engine が捨てていた OSM データの救出)

- **タスクID**: R136
- **難易度**: sonnet(写経4箇所 + 整形関数1つ + 表示1行。設計判断は本書で確定済み)
- **所要目安**: 40〜60分(うち check-all が約5分)

## 目的

宿の客がカードを見て「**今から行って開いているか**」を判断できるようにする。
これは提案の見た目の話ではなく、**宿を出る直前の人にとって要約より価値が高い唯一の事実**。

## 実測で判明した前提(作業役は自分でも数え直すこと)

計画役が 2026-09-18 に fixture 4エリア(外部API 0回)で実測した数字:

1. **4エリア120枚のカードのうち 44枚(37%)が、要約欄に「言い訳」しか書いていない**
   - 文言は `Wikipediaに記事がありません。地図の情報だけで表示しています。`(`app.js:885 NO_SUMMARY_TEXT`)。内訳 kusatsu 12 / hakone 12 / dogo 12 / beppu 8
   - mobile 375x812 実測でカード高さ **371〜373px**(通常カードと同じ)、うち **196px は絵文字1個の灰色プレースホルダ**
   - 撮影: `screenshots/planner-dogo-low_mobile.png`(dogo 17位「愛媛道後足湯カフェ 坊っちゃん」が画面をほぼ占有して「灰色の箱・名前・徒歩1分・言い訳1行・リンク4本」しか出していない)

2. **その同じカードの OSM 要素は営業時間を持っている** — 椿の湯 `Mo-Su 06:30-23:00` / 熱乃湯 `Mo-Su 09:30-16:30` / 温泉図書館 `Tu-Su 09:00-16:30` / 御座之湯 `Mo-Su 08:00-21:00`。fixture にそのまま入っている(`scripts/slim-fixtures.mjs:38` の keep-list に `opening_hours` が既にある)

3. **geo.js は既に運んでいて、engine.js が黙って捨てている** ← 本タスクの核心
   - `assets/geo.js:633-639 pickOpeningHours()` が抽出し、`geo.js:769` で `openingHours` として spot に載せている
   - しかし `grep -n "openingHours" assets/engine.js` = **0件**。engine が1回も読んでいない
   - → **geo.js も fixtures も一切触らずに** 表示できる

4. **上位30枚で `opening_hours` を持つカードは 4エリア合計 18枚**
   - kusatsu 5(#5 尻焼温泉 川風呂 `24/7`・#6 大滝乃湯・#14 熱乃湯・#15 温泉図書館・#25 御座之湯)
   - hakone 4(#10 生命の星・地球博物館・#13 箱根湯寮・#21 箱根町立郷土資料館・#28 強羅公園 `09:00-17:00`)
   - dogo 4(#9 愛媛大学ミュージアム `10:00-16:30`・#10 松山城・#24 萬翠荘・#27 椿の湯)
   - beppu 5(#2 別府タワー `09:30-21:30`・#12 浜脇温泉・#15 別府地獄めぐり・#16 うみたまご・#19 大分香りの博物館)
   - このうち **8枚が上記(1)の「言い訳しか無いカード」**

5. **書式は揺れる。4エリアの fixture 内に 86通り(kusatsu 11 / hakone 39 / dogo 13 / beppu 23)** — `24/7` / `09:00-17:00` / `Mo-Su 09:00-21:00` / `Mo-Su 09:00-17:00; We off` / `10:00-21:00; Tu[2] off` / `Su-Th 10:00-19:00; Fr-Sa 10:00-20:00` / `Dec-Jan Mo-Su 09:00-16:30; Feb-Jul …`(松山城・季節分岐)

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針

### (A) engine.js — `website` とまったく同じ経路で運ぶ(写経4箇所)

`website` が既に通っている道をなぞるだけ。行番号は実装前に自分で `grep -n` し直すこと。

1. `engine.js:768`(`fromOsmSpot`)— `website: spot.website || null,` の隣に
   `openingHours: spot.openingHours || null,` を足す
2. `engine.js:867`(wiki 側の item 生成)— `website: null,` の隣に `openingHours: null,`
3. `engine.js:989`(`mergeOsmDuplicates`)— `var website = base.website || item.website || null;` と同じ形で
   `var openingHours = base.openingHours || item.openingHours || null;` を作り、
   `:1007` の `base.website = website;` の隣に `base.openingHours = openingHours;`
4. `engine.js:1327` 付近(`present()` のカード組み立て)— `source: item.source || 'osm',` の近くに
   `openingHours: item.openingHours || null,` を足す

**`mergeIntoOsm`(`engine.js:1021`)は無改変でよい** — osmItem を base にして返すため `openingHours` は自然に生き残る(計画役が確認済み)。**R80 の wiki 昇格パス(`engine.js:1057` 付近)も触らない**(wiki 単独候補は元々 `openingHours` を持たない)。

### (B) 整形関数 — `app.js` に `openingHoursText(raw)` を1つ新設

**「今開いているか」の判定は絶対にしない。ライブラリも追加しない。**
やることは「読める日本語に直して1行に収める」だけ。

1. `raw` が文字列でなければ `null` を返す
2. `24/7` は `'24時間'` を返して終わり
3. `;` で分割し、**先頭の1区間だけ**を採る。2区間以上あったことを覚えておく
4. 先頭区間から `HH:MM-HH:MM`(1つ以上、`,` 区切りも可)を取り出す。**取り出せなければ `null` を返す**
5. 曜日は `Mo Tu We Th Fr Sa Su` → `月 火 水 木 金 土 日` に置換し、`Mo-Su` は `月〜日` の形にする。
   曜日が付いていない区間(`09:00-17:00`)は曜日を出さない
6. **月名(`Dec-Jan` 等)が先頭にあるものは `null` を返す**(松山城の1件。季節で変わるものを1区間だけ出すと嘘になる)
7. 時刻は先頭の `0` を落として読みやすくする(`09:00-17:00` → `9:00-17:00`)
8. 3 で2区間以上あったら末尾に ` ほか` を付ける

例(**作業役が自分で実測して確認すること**):
- `Mo-Su 06:30-23:00` → `月〜日 6:30-23:00`
- `Mo-Su 09:00-17:00; We off` → `月〜日 9:00-17:00 ほか`
- `09:00-17:00` → `9:00-17:00`
- `24/7` → `24時間`
- `Dec-Jan Mo-Su 09:00-16:30; Feb-Jul …` → `null`(出さない)

**解釈できなかった文字列は黙って行ごと出さない。** 推測で書かないのがこのプロジェクトの正直さ方針。

### (C) app.js — `cardHtml()` の `.feedcard__meta` の直後に1行

```
openingHoursText(card.openingHours)
  ? '<p class="feedcard__hours">⏰ ' + escapeHtml(text) + '</p>'
  : ''
```
`.feedcard__meta` の `</p>` の後、`summary` の前に置く。**`?embed=1` でも出す**(埋め込み先の宿ページの客こそ営業時間を必要とする。R48 の高さ通知は `ResizeObserver` なので自動追従する)。

### (D) style.css — `.feedcard__summary` の近くに小さく

`.feedcard__hours { margin:0; font-size: var(--fs-sm); color: var(--c-text-sub); font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`
`white-space:nowrap` + `ellipsis` で**絶対に2行にしない**(高さが暴れない不変条件)。

## 却下した案とその理由

- **「営業中/営業時間外」を判定して出す** — 却下。`opening_hours` は記法が86通りあり、`Tu[2] off`(第2火曜休)や季節分岐まである。誤判定で「営業中」と出して閉まっていたら実害が出る。判定ライブラリ(opening_hours.js)の追加はコスト0円原則とライブラリ追加禁止に反する。
- **素の文字列をそのまま出す** — 却下。松山城の `Dec-Jan Mo-Su 09:00-16:30; Feb-Jul …` は mobile 375px で3行に折り返しカード高さが暴れる。`Mo-Su` という英語略号は日本語UIで読めない。
- **全区間を出す(`; ` を改行に変える)** — 却下。同上の高さ問題。「ほか」で省略し、正確な全文が要る人は既にある「公式」リンクへ行ける。
- **要約が無いカードを候補から落として枚数を減らす** — 却下。R79〜R133 で候補集合はさんざん絞り込んであり、湯畑・筆塚・振鷺閣など**要約は無いが行く価値のある正当なスポット**を巻き込む。問題はカードの枚数ではなく**1枚あたりの情報量**。
- **R125(OSM の `wikipedia=` タグから要約を取りに行く)を先にやる** — 却下。`geo.js` の変更・fixtures 再生成・外部API呼び出し増の3点でみのるんの承認が要る(朝の相談に起票済み)。本タスクは**同じ「情報量が足りない」という課題に、承認なしで・変更禁止範囲を一切侵さずに**当たれる部分。
- **カテゴリの偏りを直す / rank を触る** — 却下。rank の重み・閾値は変更不可。実測でもカテゴリ内訳は4エリアとも12〜14種に散っており偏っていない。
- **プレースホルダ(196px)を小さくして言い訳カードを詰める** — 却下(今回は見送り)。高さは揃っている方がスクロールのリズムが良く、`?debug=1` の撮影比較の基準も変わる。まず情報を足す方が効果が大きい。

## 完了条件

1. 4エリアの `?fixture=<area>` で、**上位30枚のうちちょうど18枚**(kusatsu 5・hakone 4・dogo 4・beppu 5)に時刻行が出る。**残り102枚には1行も増えない**(数値は作業役が自分で数え直して NIGHTLOG に書く)
2. 松山城(dogo #10)には**出ない**こと(季節分岐のため `null` に倒れる)を実測で確認する
3. mobile 375px でカード高さの増加が **1行ぶん(24px以内)**に収まり、折り返し・はみ出しが1件も無い
4. `?fixture=kusatsu&embed=1` でも時刻行が出る
5. `scripts/check-engine.mjs` に `(r136)` 節を追加(整形の正常系5例 + `null` に倒す例2つ + engine が `openingHours` をカードまで運ぶこと)。**既存ケースは1件も削らない**
6. `node scripts/check-all.mjs` が **29本全緑**(exit 0)

## 検証手順

1. `node --check assets/engine.js && node --check assets/app.js`
2. `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` を変更前後で突き合わせ、**順位と顔ぶれが完全に無差分**であること(表示だけの変更なので候補集合は1件も動いてはいけない)
3. 撮影(すべて `--mobile` = 375x812 と PC幅 1280x900 の両方):
   - `http://127.0.0.1:<port>/?fixture=kusatsu`(#5 尻焼温泉 川風呂 `24時間`・#6 大滝乃湯 が見える位置まで)
   - `http://127.0.0.1:<port>/?fixture=dogo`(**#27 椿の湯** = 言い訳カードに時刻が付いた代表例。**#10 松山城には出ていないこと**も同じ撮影で確認)
   - `http://127.0.0.1:<port>/?fixture=beppu`(#2 別府タワー)
   - `http://127.0.0.1:<port>/?fixture=kusatsu&embed=1`
4. 撮影画像を **Read で開いて目視**し、文字崩れ・重なり・はみ出し・アイコンずれ・空白の異常が無いことを確認する
5. `node scripts/check-engine.mjs`(既存の pass 数が減っていないこと)
6. **`node scripts/check-all.mjs` が 29本全緑(exit 0)** ← 必須

## 変更禁止範囲

- **rank の重み・閾値は変更不可**(営業時間をスコアに混ぜない。表示だけ)
- **`assets/geo.js` は変更不可**(必要なデータは既に `:769` で運ばれている)
- **`fixtures/*.json` は変更不可・再生成もしない**(`opening_hours` は既に keep-list に入っている)
- **入力UI(入力欄・設定・選択・チュートリアル)の追加は禁止**(入力ゼロ原則)
- **ライブラリ追加禁止**(opening_hours.js 等)
- **`git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止**
- **外部API 0回**(fixture のみで完結する)
- **数値は作業役が自分で実測して書く**(本書の 44枚・18枚・86通り・371px 等は計画役の実測値。鵜呑みにせず数え直し、違っていたら自分の実測値を採って NIGHTLOG にその旨を書く)

## 終わったら

1. `docs/ROADMAP.md` の R136 を **`- [x] 2026-09-18 R136 …`** に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」の末尾に、
   `### 2026-09-18 R136 <一言>` の見出しを付けて **3行**(やったこと / 見た目の確認結果 / 次)追記する
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. **報告は簡潔に**(長文の報告書を書かない)
