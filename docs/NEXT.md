# NEXT: R123 「Wikipediaに記事がありません」が事実と違うカード26枚を正しい表示に直す

- タスクID: **R123**
- 難易度: **sonnet**(表示のみ+engine.js 2行。除外ルール・rank は一切触らない)
- 所要目安: 40〜60分(実装15分 + 26件の全件確認 + 撮影 + check-all 29本で約5分)

## 目的

やどたびの売りは「作りかけを隠さない正直さ」なのに、**カードが事実と違う文を出している**。
R83 で足した代替文を要約が無いカード全部に出しているため、**Wikipedia 記事が確実に存在する
有名観光地のカードにまで「Wikipediaに記事がありません」と表示されている**。
嘘をやめて、実際に持っている情報(記事はあるが本文が無い)に合った1行へ差し替える。

## 実測で判明した前提(計画役が Playwright で4エリア実測・2026-09-16)

### 原因の経路

1. `assets/engine.js:1053-1060`(R17 の救済): OSM 要素が `wikipedia` / `wikidata` タグを
   持つと、Wikipedia 記事本文と突き合わせできなくても `item.source = 'both'` にする。
   コメントにも「写真・要約は無いままで、付くのは SOURCE_BOTH の加点だけ」と明記されている。
2. `assets/app.js:876`
   `var NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';`
3. `assets/app.js:912-914`
   ```js
   var summary = card.summary
     ? '<p class="feedcard__summary">' + escapeHtml(card.summary) + '</p>'
     : '<p class="feedcard__summary feedcard__summary--none">' + escapeHtml(NO_SUMMARY_TEXT) + '</p>';
   ```
   → `card.summary` が空かどうかしか見ておらず、**記事の存在を示す `wikipedia` タグの有無を見ていない**。

### 件数(cards 上位30枚。カッコ内は more 側)

| エリア | 要約なし | うち**誤表示**(記事はある) | 正しい表示(真に OSM 単独) | more の誤表示 |
|---|---|---|---|---|
| kusatsu | 12/30 | **2** | 10 | 0 |
| hakone | 17/30 | **6** | 11 | 10 |
| dogo | 20/30 | **8** | 12 | 6 |
| beppu | 17/30 | **10** | 7 | 5 |
| 計 | 66 | **26** | 40 | 21 |

### 影響を受ける候補の全件リスト(cards 26件・順位は現状)

kusatsu
- 7位 大滝乃湯 (wikipedia=なし / wikidata=Q53675517)
- 13位 日晃寺 (wikipedia=なし / wikidata=Q135416971)

hakone
- 10位 神奈川県立生命の星・地球博物館 (wikipedia=神奈川県立生命の星・地球博物館)
- 15位 小田原城天守閣 (wikipedia=小田原城)
- 16位 小田原城址公園 (wikipedia=小田原城址公園)
- 23位 小田原フラワーガーデン (wikipedia=小田原フラワーガーデン)
- 25位 聖岳 (wikipedia=なし / wikidata=Q31515962)
- 29位 強羅公園 (wikipedia=強羅公園)

dogo
- 9位 愛媛大学ミュージアム (wikipedia=愛媛大学ミュージアム)
- 10位 松山城 (wikipedia=松山城 (伊予国))
- 12位 勝山 (wikipedia=城山 (松山市))
- 13位 城山公園 (wikipedia=城山公園 (松山市))
- 14位 坂の上の雲ミュージアム (wikipedia=坂の上の雲ミュージアム)
- 15位 媛彦温泉 (wikipedia=媛彦温泉)
- 21位 勝岡山 (wikipedia=なし / wikidata=Q31699675)
- 24位 萬翠荘 (wikipedia=萬翠荘)

beppu
- 13位 浜脇温泉 (wikipedia=浜脇温泉)
- 15位 別府海浜砂湯 (wikipedia=別府海浜砂湯)
- 16位 別府地獄めぐり (wikipedia=別府地獄めぐり)
- 17位 大分マリーンパレス水族館「うみたまご」 (wikipedia=なし / wikidata=Q11432633)
- 20位 大分香りの博物館 (wikipedia=大分香りの博物館)
- 21位 やまなみの湯 (wikipedia=ひょうたん温泉)
- 25位 高崎山 (wikipedia=なし / wikidata=Q11669749)
- 27位 大平山 (wikipedia=大平山 (大分県))
- 29位 龍巻地獄 (wikipedia=なし / wikidata=Q135237478)
- 30位 城島高原パーク (wikipedia=なし / wikidata=Q3196520)

26件中 **18件は `wikipedia` タグに記事タイトルそのものが入っている**(残り8件は wikidata のみ)。

### 要約本文の補充は今回は不可(調査済み)

`wikipedia` タグのタイトルを fixture の geosearch 50件と突き合わせた実測:
kusatsu 10件中3件一致 / hakone 250件中10件 / dogo 31件中9件 / beppu 32件中4件。
**上の26件の本文は fixture に入っていない**ので、本文を出すには Wikipedia API の追加呼び出しが必要。
今回は外部API 0回なので**本文の補充はしない**。文言の是正だけを行う。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(876行付近・912-914行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(**1197 `toCard()` の返り値に2フィールド足す1〜2行のみ**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`(文言・件数の依存を更新)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`

## 実装方針

1. `engine.js:1197 toCard()` の返り値に `wikipediaTitle: item.wikipediaTitle || null,` と
   `wikidataId: item.wikidataId || null,` を足す。**これだけ**。rank・除外・present には触らない。
2. `app.js:876` の隣に2本目の文言を置き、`app.js:912-914` を3分岐にする:
   - 要約あり → 従来どおり
   - 要約なし + `card.wikipediaTitle || card.wikidataId` あり →
     「Wikipediaに記事はありますが、要約をここに出せていません。」程度の**事実だけの1行**
     (謝罪や推測を書かない。R83 の方針を踏襲)
   - 要約なし + どちらも無い → 従来の `NO_SUMMARY_TEXT`
3. クラスは `.feedcard__summary--none`(淡色)を両方に付けたままにし、**CSS は1行も変えない**
   (見た目の差は出さない。文言だけの是正)。区別が要る場合のみ `data-*` 属性で足す。
4. `card.wikipediaTitle` を**画面に出さない**(記事名を出すと「押せそう」に見えてリンクが無いのは不親切。
   出すかどうかは次サイクル以降の判断とし、NIGHTLOG の「朝の相談」に1行残す)。

## 完了条件

- 上記26件すべてが新しい文言になり、真に OSM 単独の40件は `NO_SUMMARY_TEXT` のままであること
  (4エリアを1件ずつ突き合わせて確認する。誤爆0件)
- `more` 側21件も同じ判定で切り替わること
- 要約ありのカードは1枚も文言が変わらないこと
- `?fixture=` 4エリアの cards が30枚のまま・順位が1つも変わらないこと(`dump-rank` 差分ゼロ)
- `scripts/check-nosummary.mjs` を更新し、**3種類(要約あり / 記事あり要約なし / 真に記事なし)の
  件数と文言**を機械検査すること(既存の検査項目は1本も削らない)

## 検証手順

1. `node --check assets/app.js` と `node --check assets/engine.js`
2. `node scripts/dump-rank.mjs kusatsu|hakone|dogo|beppu` を変更前後で比較し**差分ゼロ**を確認
3. 撮影(すべて fixture・外部API 0回):
   - `http://127.0.0.1:3000/?fixture=dogo` を **mobile(375px)** — 10位松山城の文言を確認
   - `http://127.0.0.1:3000/?fixture=beppu` を **mobile(375px)** — 16位別府地獄めぐり・17位うみたまご
   - `http://127.0.0.1:3000/?fixture=hakone` を **desktop(1280px)** — 15位小田原城天守閣・折り返し確認
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **mobile(375px)** — デグレ確認
   撮影は `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` / PC幅。画像を Read で開いて
   **文字崩れ・重なり・はみ出し・2行になって詰まっていないか**を目で確認する。
4. `node scripts/check-nosummary.mjs` 単独で全PASS
5. **`node scripts/check-all.mjs` が 29本全緑(exit 0)** ← 必須

## 変更禁止範囲

- **rank の重み・閾値は変更不可**(`engine.js` の `WEIGHT` / `CATEGORY_PENALTY` / 各しきい値)
- **除外ルールは変更不可**(今回は除外の話ではない)
- `assets/geo.js` と `fixtures/*.json` は変更不可(再生成もしない)
- `engine.js` の変更は **`toCard()` の返り値に2フィールド足すことだけ**に限る
- `assets/style.css` は変更しない(文言のみの是正)
- **外部API 0回**(Overpass / Nominatim / Wikipedia を1回も叩かない。撮影は全て `?fixture=`)
- **git stash / reset --hard / checkout でファイルを戻す操作は禁止**

## 終わったら

1. `docs/ROADMAP.md` の R123 を `[x] 2026-09-16` に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記
   (やったこと / 見た目の確認結果 / 次)。ファイル先頭に新しい節を作らない
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. **報告は簡潔に**(長文の報告書を書かない)
