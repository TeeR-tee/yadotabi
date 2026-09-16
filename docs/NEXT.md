# NEXT: R124 R123 が作った「行き止まりの案内文」を塞ぐ

- **タスクID**: R124
- **難易度**: sonnet
- **所要目安**: 25〜35分
- **外部API**: 0回(全て `?fixture=` で作業する)

## 目的

R123 で「記事があるのに『記事がありません』と嘘をつく」のは直った。
しかし新しい文言のうち **リンクが1本も出ないカードが13件残っている**。

ユーザーから見ると「Wikipediaに記事はありますが、要約をここに出せていません。」とだけ書かれ、
**押せるものが何も無い**。R123 以前の「記事がありません」より始末が悪い行き止まりになっている。
これを塞ぐ。

## 実測で判明した前提(計画役が4エリアで確認済み)

### 原因(行番号つき)

`assets/app.js:916-919` が該当箇所。

```js
var hasArticle = !card.summary && (card.wikipediaTitle || card.wikidataId);
var wikipediaUrl = card.wikipediaTitle
  ? safeUrl('https://ja.wikipedia.org/wiki/' + encodeURIComponent(card.wikipediaTitle.replace(/ /g, '_')))
  : null;
```

- `hasArticle` の判定は `wikipediaTitle` **または** `wikidataId` を見ている。
- しかし `wikipediaUrl` は `wikipediaTitle` **だけ**から作っている。
- よって **`wikidata` タグはあるが `wikipedia` タグが無い候補**では
  `hasArticle === true` かつ `wikipediaUrl === null` になり、
  `app.js:922-927` の分岐で文言だけ出てリンクが付かない。

### 該当する候補の全件リスト(4エリア・上位60枚・実測13件)

上位30枚(`cards`)に出る7件 = **ユーザーが実際に見るもの**:

| エリア | 順位 | 名前 | wikidataId |
|---|---|---|---|
| kusatsu | 8 | 大滝乃湯 | Q53675517 |
| kusatsu | 14 | 日晃寺 | Q135416971 |
| hakone | 25 | 聖岳 | Q31515962 |
| dogo | 21 | 勝岡山 | Q31699675 |
| beppu | 18 | 大分マリーンパレス水族館「うみたまご」 | Q11432633 |
| beppu | 26 | 高崎山 | Q11669749 |
| beppu | 30 | 龍巻地獄 | Q135237478 |

「もっと見る」で出る `more` の6件(31〜60位):

| エリア | more内順位 | 名前 | wikidataId |
|---|---|---|---|
| hakone | 19 | 白山神社 | Q123044803 |
| hakone | 29 | 小田原文学館 | Q65263796 |
| beppu | 1 | 城島高原パーク | Q3196520 |
| beppu | 14 | 白池地獄 | Q135237476 |
| beppu | 26 | 暘谷城（日出城） | Q2969402 |
| beppu | 27 | 鬼山地獄 | Q135237475 |

### 実際の画面(撮影で確認済み)

`?fixture=beppu` mobile 375x812 の18位カードの実テキスト:

```
大分マリーンパレス水族館「うみたまご」
🐟 水族館   🚶 徒歩63分 · 🚗 車11分 · 5km
Wikipediaに記事はありますが、要約をここに出せていません。
[行き方] [公式] [Instagram] [TikTok] [YouTube]
```

要約行の中に `<a>` が1本も無い(R123 のリンクは `wikipediaUrl` が null のため出ていない)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(本体・`feedCardHtml()` 内)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`(検査追加)

## 実装方針

1. `app.js:917-919` のURL生成を**2段構え**にする。
   - `card.wikipediaTitle` があるとき: 従来どおり `https://ja.wikipedia.org/wiki/<記事名>`(**優先。変えない**)
   - 無くて `card.wikidataId` があるとき: **`https://www.wikidata.org/wiki/Special:GoToLinkedPage/jawiki/<Q番号>`**
     - これは Wikidata 公式の転送URLで、Q番号から日本語版Wikipediaの記事へそのまま飛ぶ。
     - **外部API 0回**(リンクを組み立てるだけ。叩かない)。
     - `safeUrl()`(`app.js:252`)は `/^https?:\/\//i` しか見ないホスト非依存の実装なので、そのまま通る。
2. Q番号は `/^Q[1-9][0-9]*$/` で**厳格に検証**する(`?bg=` の厳格検証と同じ方針)。
3. **形式が外れたら、リンクを出さないだけでなく文言も「記事がありません」側に落とす**。
   「記事はあります」と言った以上は必ず辿れること、を不変条件にする(嘘をつかない方針)。
   つまり `hasArticle` を「URLが作れたかどうか」で判定し直すのが最も素直。
4. リンクの属性は R123 と揃える(`target="_blank" rel="noopener"`)。リンク文言も `Wikipediaで見る` のまま。
5. `check-nosummary.mjs` に**不変条件の検査**を足す:
   「4エリアで `.feedcard__summary--none` が `HAS_ARTICLE_NO_SUMMARY_TEXT` を含むカードは、
   その `<p>` の中に `a[href]` を必ず1本持つ」。
   この検査があれば同じ行き止まりが二度と生えない。

## 完了条件

- [ ] 上表の cards 7件すべてで、要約行に `Wikipediaで見る` リンクが出る
- [ ] `wikipediaTitle` を持つカード(hakone 小田原城天守閣 15位など)のリンク先が**従来と同一**(デグレ0)
- [ ] 真に記事が無いカード(kusatsu 17位 熱乃湯・24位 湯畑など)は従来どおり「記事がありません」のまま
- [ ] `check-nosummary.mjs` の新検査が PASS
- [ ] `node --check assets/app.js` OK
- [ ] `node scripts/check-all.mjs` が **29本全緑**(exit 0)

## 検証手順

1. `node --check assets/app.js`
2. 撮影(いずれも幅 **375**(mobile)。撮影は `?fixture=` のみ・外部API 0回):
   - `http://127.0.0.1:3000/?fixture=beppu` → 18位「うみたまご」カード(**本命**。リンクが出たこと)
   - `http://127.0.0.1:3000/?fixture=kusatsu` → 8位「大滝乃湯」カード(2件目の確認)
   - `http://127.0.0.1:3000/?fixture=hakone` → 15位「小田原城天守閣」カード(**デグレ確認**。従来リンクが壊れていないこと)
   - 撮った画像は必ず Read で開いて、文字崩れ・重なり・折り返しの増加が無いことを目視する
3. `node scripts/check-nosummary.mjs`
4. `node scripts/dump-rank.mjs <4エリア>` で**順位が1件も動いていない**ことを確認(表示のみの変更なので動いたら実装ミス)
5. `node scripts/check-all.mjs` → **29本全緑**

## 変更禁止範囲

- **rank の重み・閾値は変更不可**
- **`assets/geo.js` 変更不可 / `fixtures/*.json` 変更不可(再生成もしない)**
- `assets/engine.js` は変更不要(`wikidataId` は R123 で既に `toCard()` が載せている。`engine.js:1216`)
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止
- **外部API 0回**(Overpass・Wikipedia・Wikidata を1回も叩かない。リンクは組み立てるだけ)
- 既存 check 本の検査項目を減らさない(足すのは可)

## 終わったら

1. `docs/ROADMAP.md` の R124 の行を `[x] 2026-09-16` にする
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記
   (やったこと / 見た目の確認結果 / 次)
3. **先にコミット**する(コミットメッセージは1行の日本語)
4. `git push`
5. **報告は簡潔に**(長文の報告書を書かない)

## 参考: 今回やらないと決めたこと

要約が無いカードのうち **32件は OSM の `wikipedia` タグで記事名が確定している**のに
本文を取りに行けていない(hakone 13 / dogo 12 / beppu 7)。
原因は `geo.js:924` の Wikipedia 取得が `generator=geosearch` しか使わず、
タグで名指しされた記事を `titles=` で直接引く経路が無いこと。
**geo.js と fixtures の両方の変更が要る**ため今回は着手せず、**R125 として ROADMAP に起票済み**。
