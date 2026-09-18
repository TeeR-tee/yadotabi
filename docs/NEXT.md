# NEXT — R137 「公式」2文字の裏にあるドメインを見せる

- タスクID: **R137**
- 難易度: **sonnet**(既存の `openingHoursText()`/`.feedcard__hours` と同じ型の写経。判断が要るのは「置き場所」1点だけ)
- 所要目安: 40〜60分(実装15分 + 撮影と目視20分 + check-all 約5分)

## 目的

情報が薄いカードを、**既に取得済みのデータだけ**でもう一段救う。R136 で営業時間を出したが、**無要約カードはまだ 67枚**ある。そのうち **24枚は公式サイトのURLを持っているのに、画面には「公式」という一律2文字しか出ていない**。どこへ飛ぶか分からないリンクは押されない。ドメインを見せれば「本物の公式だ」と分かって押せるようになる。

## 実測で判明した前提(すべて計画役が 2026-09-18 に fixture 4エリアで実測)

### 1. 無要約カードの現在地(R136 適用後・上位30枚×4エリア=120枚)

| エリア | 無要約 | うち記事あり | うち記事なし | 無要約かつ公式サイトあり | 公式サイトあり(全体) |
|---|---|---|---|---|---|
| kusatsu | 13 | 2 | 11 | **7** | 9/30 |
| hakone | 18 | 6 | 12 | **6** | 6/30 |
| dogo | 19 | 8 | 11 | **4** | 6/30 |
| beppu | 17 | 10 | 7 | **7** | 11/30 |
| 合計 | **67** | 26 | 41 | **24** | **32/120** |

### 2. 使われていないフィールドは `website` ただ1つ(grep の突き合わせ結果)

`assets/geo.js:769` 付近が spot に載せるフィールドを全列挙して、engine.js / app.js での出現回数を数えた:

| フィールド | engine.js | app.js | 状態 |
|---|---|---|---|
| `website` | 11 | **0** | ← **これが今回の対象**。engine は `buildLinks` で href に入れるが、app は生の URL を一度も読んでいない |
| `openingHours` | 5 | 2 | R136 で解決済み |
| `wikipediaTitle` | 10 | 4 | R123/R124 で使用済み |
| `wikidataId` | 7 | 4 | R124 で使用済み |
| `categoryLabel` | 5 | 10 | 表示済み |
| `distanceM` | 21 | 2 | R54 で表示済み |
| `hasWikipedia` | 0 | 0 | geo 内部のみ(engine は source で判定)。表示価値なし |
| `fame`(sitelinks/monthlyViews) | 0 | 0 | **表示しない**(下の却下理由を参照) |

### 3. 実際の値の例(無要約カード24枚のうち代表)

```
kusatsu #16 温泉図書館            -> https://www.town.kusatsu.gunma.jp/www/contents/1486453585239/index.html
kusatsu #27 草津聖バルナバ教会    -> https://nskk-kitakanto.org/facilities/gunma/kusatsu-christ/
kusatsu #29 環境体験アミューズメント -> https://www.ktr.mlit.go.jp/sinaki/sinaki00009.html
hakone  #10 神奈川県立生命の星・地球博物館 -> https://nh.kanagawa-museum.jp/
hakone  #13 箱根湯寮              -> https://www.hakoneyuryo.jp/
hakone  #21 箱根町立郷土資料館    -> https://www.town.hakone.kanagawa.jp/www/contents/1100000002051/index.html
dogo    #24 萬翠荘                -> https://www.bansuisou.org/
beppu   #16 別府地獄めぐり        -> https://www.beppu-jigoku.com/
beppu   #21 やまなみの湯          -> https://www.hyotan-onsen.com/   ← 名前と運営が違うことがドメインで初めて分かる
beppu   #29 龍巻地獄              -> http://www.beppu-jigoku.com     ← http のみ・末尾スラッシュ無し
```

`www.` あり/なし・`http`/`https`・長いパス付き、が実データに全部いる。**パスとクエリは捨て、`www.` を剥がしたホスト名だけを出す**。

### 4. fixtures に残っているタグは14種だけ(電話・入場料・車椅子は**存在しない**)

`scripts/slim-fixtures.mjs` の `KEEP_TAG_KEYS` により R14 で slim 済み。4エリアの `overpass.elements` に実在するタグキーを全数えした結果:

```
name:4370  leisure:2146  amenity:1604  historic:787  wikidata:732  tourism:697
name:ja:511  natural:332  wikipedia:323  website:172  opening_hours:120
contact:website:90  man_made:57
```

→ `phone` / `fee` / `wheelchair` / `start_date` / SNS タグは **1件も無い**。これらの案は fixtures を触らない限り不可能なので、今回は検討対象外。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — `linkRowHtml()`(831行付近)と `cardHtml()`(956行付近)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` — `.feedcard__hours`(R136 で追加した節)のすぐ近くに1ブロック追加
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs` — (r137) 節を追加(既存ケースは1件も削らない)

## 実装方針

1. `app.js` に `officialDomainText(url)` を新設する。`openingHoursText()` と**まったく同じ型**にする:
   - `new URL(url)` で解析し、失敗したら `null` を返す(try/catch)。
   - `hostname` を取り、先頭の `www.` だけを剥がす。空になったら `null`。
   - **推測で書かない**: 解析できなかったものは黙って何も出さない。
2. 置き場所は **`.feedcard__links` の直後に独立1行**(`.feedcard__official` 淡色・`⧉ <ドメイン>`)を第一候補とする。
   - **チップ内に `公式 hakoneyuryo.jp` と入れる案は、実装前に mobile 375px で撮って確認してから判断すること**。R56 がチップ5個を1行に収めるため padding と font-size を詰めた経緯があるので、**ほぼ確実に折り返す**。折り返したら即座に独立1行案へ倒し、撮り比べの結果を NIGHTLOG に残す。
   - `linkRowHtml()` が返す href・`target`・`rel`・ラベル文字列 `公式` は**変更しない**(既存検査と R51 の並び順を壊さない)。
3. `style.css` に `.feedcard__official { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` を `.feedcard__hours` と同じ形で足す。長いドメインでも**絶対に2行にしない**。
4. `?embed=1` でも出す(R136 と同じ扱い。埋め込み先でも「どこの公式か」は同じだけ価値がある)。
5. **公式サイトが無いカードには何も足さない**(88枚は1pxも変わらない)。

## 却下した案とその理由

| 案 | 却下理由(すべて実測に基づく) |
|---|---|
| 電話番号・入場料・車椅子対応・建設年・公式SNS をタグから出す | **fixtures に1件も存在しない**(上の実測表)。`slim-fixtures.mjs` の keep-list 14種に入っておらず、R14 で恒久的に落とされている。出すには fixtures 再生成が必要 = **禁止範囲**。 |
| `coordinates` の無い wiki 記事40件を救って要約と写真を出す | `geo.js:1022` の変更が必要なので**今回の禁止範囲**。しかも実測で上位30枚に届くのは **dogo #10 愛媛大学ミュージアム 1枚だけ**で費用対効果が低い。**R138 として起票のみ**した。 |
| `fame.sitelinks` / `fame.monthlyViews`(人気度)をカードに出す | engine/app とも使用0件だが、**fixture モードでは常に null**(`enrichFame` は Wikidata と Wikipedia の PV API を叩くため。fixture 経由では埋まらない)。本番でしか出ない行は撮影で検証できず、**外部API 0回**の制約とも衝突する。 |
| `hasWikipedia` を出す | 意味は `source` と `wikipediaTitle` で既に画面に反映済み(R123/R124)。重複。 |
| OSM の生タグ(`historic=milestone` 等)から細かいサブ種別を出す | `geo.js:242 CATEGORY_RULES` が既に22種を個別ラベルにしており(`記念碑`/`遺跡`/`山頂`/`湧水`/`展望・景観` …)、**画面に出ている `categoryLabel` がそのサブ種別そのもの**。新しい情報は1文字も増えない。 |
| 「Wikipediaに記事がありません」の文言を消す・言い換える | R83/R123 が「正直に書く」方針で決めた文言で、消すと空欄になり情報が減る。**今回は上に情報を1行足す**のが正しい向き。 |
| 「今開いているか」をドメインから推測する等 | R136 と同じ理由で禁止。推測は書かない。 |

## 完了条件

1. 4エリアで**公式サイトを持つ実測32枚**(うち無要約24枚)にドメイン行が出る。
2. 残り**88枚には1行も増えない**(高さが1pxも変わらない)。
3. mobile 375px でカード高さの増加が **1行ぶん(24px以内)**に収まる。
4. `.feedcard__links` の全チップの `offsetTop` が**変更前後で同値**(=R56 の「5個が1行」を壊していない)。
5. `www.town.hakone.kanagawa.jp` のような長いホストでも **1行に収まり折り返さない**(ellipsis で切れてよい)。
6. `?embed=1` でも同じく出る。
7. `scripts/check-nosummary.mjs` に (r137) 節を追加(出る例・出ない例・不正URLで黙って消える例)。**既存ケースは1件も削らない**。
8. `node scripts/check-all.mjs` が **29本全緑(exit 0)**。

## 検証手順

1. `node --check assets/app.js`
2. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅 1280)。**撮影URLと幅**:
   - `http://127.0.0.1:3000/?fixture=beppu` — mobile 375x812 / desktop 1280x900(公式あり11枚で一番多い)
   - `http://127.0.0.1:3000/?fixture=kusatsu` — mobile 375x812(無要約かつ公式あり7枚)
   - `http://127.0.0.1:3000/?fixture=hakone` — mobile 375x812(`town.hakone.kanagawa.jp` の長いホストの確認)
   - `http://127.0.0.1:3000/?fixture=kusatsu&embed=1` — mobile 375x812
3. 撮った画像を **Read で開いて目視**し、文字崩れ・重なり・はみ出し・2行化・チップ行の折り返し増加が無いことを確認する。
4. Playwright で `.feedcard__links a` の `offsetTop` を変更前後で比較し、全件同値であることを数値で確認する。
5. `node scripts/check-nosummary.mjs`(単体)
6. `node scripts/check-all.mjs` → **29本全緑(exit 0)を必須とする**。
7. 外部API 0回(fixture のみ)。

## 変更禁止範囲

- **rank の重み・閾値**(公式サイトの有無は既に加点材料だが一切触らない。表示だけ)
- **`assets/geo.js`** と **`fixtures/*.json`**(既に必要なデータが入っている)
- **入力UIの追加**(入力ゼロ原則)
- リンクの href / `target` / `rel` / ラベル文字列(`公式`・`行き方`・`Instagram`・`TikTok`・`YouTube`)
- 外部API・ライブラリの追加

## 終わったら

1. `docs/ROADMAP.md` の R137 を **`- [x] 2026-09-18 R137 …`** に書き換える。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-18 R137 <一言>` の見出しを付けて**3行**(やったこと / 見た目の確認結果 / 次)を追記する。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. **報告は簡潔に**(長文の報告書を書かない)。
