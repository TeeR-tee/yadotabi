# FIXTURES.md — 固定データ(fixture)の作り方・再生成の判断基準

## 目的

`?fixture=<area>` は撮影・検証を外部API0回で回すための保存済み生レスポンスです。加工前の生JSONを保存し、ブラウザ側 `geo.js` の整形コードをそのまま通す前提で作られています(`scripts/make-fixture.mjs:1-9`)。

URLパラメータ全体の一覧は [README.md](../README.md#urlパラメータ一覧) の「## URLパラメータ一覧」節を参照してください。

ファイルサイズの実測表は [README.md](../README.md#fixtures-のファイルサイズ) の「fixtures のファイルサイズ」節を参照してください。

## 対象エリア表

`AREAS`(`scripts/make-fixture.mjs:19-28`)の実値です。

| area | ラベル | lat | lon | osmRadiusM | wikiRadiusM |
|---|---|---|---|---|---|
| kusatsu | 草津温泉 | 36.6226 | 138.5960 | 15000(既定) | 10000 |
| hakone | 箱根湯本 | 35.2324 | 139.1069 | 15000(既定・R176で30000から変更) | 10000 |
| dogo | 道後温泉 | 33.8520 | 132.7860 | 15000(既定) | 10000 |
| beppu | 別府温泉 | 33.2846 | 131.4914 | 15000(既定) | 10000 |
| kinosaki | 城崎温泉 | 35.6262 | 134.8055 | 15000(既定) | 10000 |

## far 実測表(R76+R19・2026-09-16)

`node scripts/dump-rank.mjs <area>` で各エリアの far(車60分超)を実測した結果(kinosaki は R81・2026-09-18 に追記)。far の実効距離しきい値は `FAR_DRIVE_MIN`(60分) × `DRIVE_M_PER_MIN`(500m/分) = **30,000m ちょうど**(`assets/engine.js:26,43`)。

| area | osmRadiusM | cards最遠 | far件数 | far最短 | far最遠 |
|---|---|---|---|---|---|
| kusatsu | 15000(既定) | 8075m | 0 | - | - |
| hakone | 30000→15000(R176) | 5732m | 10→**0**(R176) | 30003m | 30495m |
| dogo | 15000(既定) | 4476m | 0 | - | - |
| beppu | 15000(既定) | 5311m | 0 | - | - |
| kinosaki | 15000(既定) | 7557m | 0 | - | - |

**(2026-09-19 R176 追記)** hakone を 15000 に揃えたため、現在は**5エリアとも far は0件**になった。以下は R176 以前(hakone=30000)の記録として残す。

osmRadiusM=15000 の4エリアは収集半径がしきい値(30km)の半分しかないため far が構造上必ず0件になり、osmRadiusM=30000 の hakone だけ収集円の外周ぎりぎり(30,003m〜30,495mの薄い殻)にある候補が far として拾われる。つまり **far の件数はランキングの質ではなく `osmRadiusM` としきい値の大小関係だけで決まる**。詳細な考察と是正案は [09_研究ノート](../../計画書一式/09_研究ノート_認知外を提案するアルゴリズム.md) の「R76+R19 far の4エリア実測」節を参照。

## 実行方法

```
node scripts/make-fixture.mjs <area>
```

引数なしは `kusatsu` になります。出力先は `fixtures/<area>.json` です。

## エリアを増やす手順

1. `scripts/make-fixture.mjs` の `AREAS` に `{ lat, lon, label }`(必要なら `osmRadiusM`)を追加する。
2. `node scripts/make-fixture.mjs <area>` を**1回だけ**実行する。
3. `docs/check.mjs` の TARGETS に `fixtures/<area>.json` を追加する。
4. README の `?fixture=` の行と URLパラメータ表に area 名を追記する。
5. `?fixture=<area>` を mobile で撮影して目視する。

エリア名は `/^[a-z0-9_-]+$/` のみが有効です(`assets/app.js` の `fixtureNameFromUrl` と同じ検証)。

## 保存される meta

`area` / `label` / `lat` / `lon` / `osmRadiusM`(実際に成功した半径) / `wikiRadiusM` / `generatedAt`(ISO文字列)。`generatedAt` は画面ヘッダーの「固定データ」バッジに取得日として表示される(R45)ので、鮮度が古くなったことに気づけます。取得日を見て古いと感じたら [鮮度の目安と再取得の手順(R95)](#鮮度の目安と再取得の手順r95) を参照してください。

## Overpass のマナー(スクリプトの実装どおり)

- Wikipedia を先に取得し、Overpass は後で叩きます(Wikipedia 失敗時に Overpass を無駄打ちしないため・`scripts/make-fixture.mjs:619-620`)。
- Overpass が 429/504 を返したときは60秒待って最大2回再試行します(`RETRY_WAIT_MS=60000` / `MAX_RETRY=2`)。それでも駄目なら半径 4000m(`FALLBACK_RADIUS_M=4000`)に落として1回試します。
- **半径が落ちて成功した場合は fixture として採用せず日を改めます**(`meta.osmRadiusM` が意図と違う値で残るため)。
- 1サイクルあたりの生成は1エリアまでです。

## 鮮度の目安と再取得の手順(R95)

### (a) 判断基準

目安は**半年**。理由は、OSM の観光施設(神社・寺・美術館・展望台等)は年単位でしか動かず、これより短くすると Overpass を無駄に叩くだけになるからです。ただし**半年という数字は統計的根拠のある値ではなく、あくまで運用上の目安**です(観光施設の実際の変化頻度は未計測)。

半年未満でも再取得してよい例外が1つあります。**`assets/geo.js` の `buildOverpassQuery()` を変更したとき**は、fixture と本番で候補が食い違うため、期間に関わらずすぐに対象エリアを取り直してください(上の「[`buildOverpassQuery` の同期注意](#buildoverpassquery-の同期注意)」参照)。

現在の5 fixture の `generatedAt` はいずれも 2026-09-19 生成(全エリア同一日、実測済み)なので、**次の見直し目安は 2027-03 頃**です。

### (b) 再取得のマナー

既存の「[Overpass のマナー](#overpass-のマナースクリプトの実装どおり)」節の制約と同じです(各エリア1回まで・1サイクル1エリアまで、429/504は待たず日を改める、半径が `FALLBACK_RADIUS_M` に落ちて成功した場合は採用しない)。重複するのでここでは繰り返しません。

### (c) 再取得後に必須の確認

1. `node scripts/dump-rank.mjs <area>` を**再取得の前後**で取り、カード枚数・上位の並びの差分を全件目視する(差分が出ること自体は正常。消えた観光スポットが無いかを見る)
2. `?fixture=<area>` を mobile で撮影して目視(カード30枚・番号ピン判読可)
3. `node scripts/check-all.mjs` が**35本全緑**
4. 差分の要点を `docs/NIGHTLOG.md` に記録する

### (d) keep-list は手動実行不要

`scripts/make-fixture.mjs` は保存直前に `slim-fixtures.mjs` の `slimOverpassElements` を自動適用するため(「[タグの軽量化](#タグの軽量化r14keep-list)」節参照)、再取得後に `node scripts/slim-fixtures.mjs` を別途走らせる必要はありません。

## 既存 fixture は原則再生成しない方針

既存5エリアを取り直すと元データが変わり、カードの並び・枚数・写真が変わります。過去の撮影・検査(`scripts/check-*.mjs` の期待値、09研究ノートの順位記録)との比較ができなくなるため、**再生成は「上流のクエリを変えた」「データが明らかに古い」など理由があるときだけ**行います。実施する場合は前後で `node scripts/dump-rank.mjs <area>` を取ってカード枚数と上位の並びを差分比較し、NIGHTLOG に記録してください。

## `buildOverpassQuery` の同期注意

`scripts/make-fixture.mjs` のクエリは `assets/geo.js` の同名関数と**同一でなければなりません**(`scripts/make-fixture.mjs:58` のコメント)。片方だけ直すと fixture と本番で候補が食い違います。

---

## タグの軽量化(R14・keep-list)

Overpass は `out center tags;` で全タグを返すため、生の fixture には `assets/geo.js` が読まないキーが大量に混じる(hakone.json は元々838KB中444KBがタグ)。`scripts/slim-fixtures.mjs` が `KEEP_TAG_KEYS`(`export`)を単一の定義元として持ち、`scripts/make-fixture.mjs` はそれを `import` して保存直前に同じ処理を通す(keep-listの二重管理はしない)。

- keep-list(14種、geo.js を全読みして確定): `name` / `name:ja` / `tourism` / `historic` / `leisure` / `amenity` / `natural` / `man_made` / `wikidata` / `wikipedia` / `wikipedia:ja` / `website` / `contact:website` / `opening_hours`。加えて `wikipedia` で始まる全キーを前方一致で残す(`detectWikipedia()` の判定に合わせる)。
- `json.meta` / `json.wiki` / 要素の `type`/`id`/`lat`/`lon`/`center` には一切触れない。
- 既存 fixture を後から軽量化する手順: `node scripts/slim-fixtures.mjs [area]`(引数省略で5エリア全部)。**書き戻しは `JSON.stringify(json)`(第2・第3引数なし)** — pretty print すると逆に増える(hakone で 900KB→1056KB になった実測あり)。
- 実施前後で `node scripts/dump-rank.mjs <area>` を5エリア分取り、**差分ゼロ**を確認すること。差分が出たら落としたキーが実は使われているので keep-list に戻す。
- 2026-09-16 実施時のサイズ: kusatsu 65.3KB→55.5KB / hakone 900.1KB→585.7KB / dogo 117.1KB→93.7KB / beppu 172.7KB→122.7KB(dump-rank 差分ゼロ確認済み)。kinosaki は R81(2026-09-18)の生成時に軽量化込みで 86.2KB。
- 今後 `make-fixture.mjs` で新規生成する fixture は保存時に最初からこの keep-list を通るため、生成直後から軽量。

関連: R14(hakone.json 900KB の軽量化)・R19(far 分布)・R40(別府追加)はいずれもこの手順を前提にする。

---

## 固定データで検証できること・できないこと(R187・2026-09-19)

### 背景

2026-09-19の1日で、**固定データでは原理的に再現しない不具合が3件**見つかった。79コミット・20サイクルのうち本番を実際に触ったのは最後の6サイクルだけで、それ以外は固定データだけで「検証済み」としていた。3件とも「検証が甘かった」のではなく、**固定データの構造上そもそも見えない領域**だった。この節はその再発防止のために書く。

### 1. 固定データが実際に保存しているもの

`fixtures/<area>.json` の実際のキー(`kusatsu.json` で確認):

| キー | 中身 | 対応する geo.js の関数 |
|---|---|---|
| `meta` | `area`/`label`/`lat`/`lon`/`osmRadiusM`/`wikiRadiusM`/`generatedAt` | - |
| `overpass` | Overpass の生レスポンス(`{elements:[...]}`) | `fetchSpots` |
| `wiki` | Wikipedia geosearch の生レスポンス(`{query:{pages:{...}}}`) | `fetchWikiNearby` |
| `wikidataTitles` | Q番号→記事名の対応表 | `resolveWikipediaTitles` |
| `backlinks` | 記事名→被リンク数の表 | `fetchBacklinkCounts` |
| `parentExtract` | 親記事の本文(explaintext)の文字列 | `fetchParentMentions` |
| `parentImage` | 親記事の代表画像 `{url, file}` | `fetchParentMentions` |
| `parentTitle` | 昇格が起きたエリアだけ、採用後の親記事名(通常は無い) | `fetchParentMentions` |
| `wikiByTitle` | 記事名→`{extract,thumbnailUrl,pageid}` の表 | `fetchWikiByTitles` |

保存しているのは**加工前の生レスポンス**で、そこから先の整形(カテゴリ判定・重複統合・スコア計算)は本番と完全に同じコードを通る。つまり「APIが返した後の処理」は固定データでも本番と同じ経路で検証できる。

### `assets/geo.js` の `fixtureData` 分岐一覧(全11箇所・行番号は2026-09-24時点)

読んで確認した全分岐:

1. **L1275, L1391**(`fetchSpots`): fixture中は localStorage の読み書きをスキップ(本物データと混ざらないよう)。
2. **L1285**(`fetchSpots`): `fixtureData.overpass` があれば Overpass を叩かずそれを使う。
3. **L1421**(`resolveWikipediaTitles`): `fixtureData.wikidataTitles` の対応表を使い、Wikidata API を叩かない。
4. **L1528**(`fetchBacklinkCounts`): `fixtureData.backlinks` の表を使い、Wikipedia API(linkshere)を叩かない。
5. **L1841**(`parentArticleTitle`): fixture中は `fixtureData.meta.label` を**そのまま**親記事名として返す。本番は `hotel.displayName`(Nominatimの住所文字列)をカンマで分解して地名を抽出するロジックを通る。**この分岐が今回の不具合3の直接原因**(後述)。
6. **L1898, L1906**(`fetchParentMentions`): `fixtureData.parentExtract`/`parentImage`/`parentTitle` を使い、本文取得・R175の昇格判定(`promoteParentIfThin`)を丸ごとスキップする(make-fixture.mjs側で判定済みの結果を使う)。
7. **L2229**(`parentAreaKey`): `fixtureData.meta.area` をエリア名としてそのまま使う。本番は候補の画像ファイル名から推測するロジックを通る。
8. **L2346**(`fetchHotelsInBbox`): fixture中は空配列を返す(地図上の宿ピンは出さない)。
9. **L2467, L2510, L2597**(`fetchWikiNearby`): fixture中は localStorage を使わず、`fixtureData.wiki.query.pages` を1回流すだけ(半径ループ・continueを回さない)。
10. **L2647**(`fetchWikiByTitles`): `fixtureData.wikiByTitle` の表を使う。
11. **L2939**(`enrichFame`): fixture中は Wikidata(sitelinks)/pageviews を一切取得せず即座に返す。**ただし、この分岐が効く前に `enrichFame` 自体がどこからも呼ばれていない**(`assets/geo.js:2937` に定義、`:2996` で export しているだけで、呼び出しは0件。実測 2026-09-24)。そのため **fixture かどうかに関わらず本番でも `fame` は常に null** で、この行の分岐は現状どの経路からも実行されない。**呼ぶかどうか(R225)は順位とリクエスト数に影響するため判断待ち**。

### 2. ★固定データでは検証できないもの(これが本題)

#### (a) 速度(APIの応答時間・タイムアウト・リトライ)
固定データはローカルJSONを1回読むだけで、fetchそのものが発生しない。本番でOverpassが平均30秒かかる、Nominatimが1秒スロットルで直列化される、といった**体感速度・タイムアウトの発火・リトライの動き**は固定データでは一切再現しない。`TIMEOUT_OVERPASS_MS`(25秒)を変えても固定データの動作は1ミリ秒も変わらない。

#### (b) APIの失敗時の挙動(429/504・縮退モード・フォールバック)
`?simulate=overpass504` で疑似的に失敗させることはできるが、これは「常に失敗する」という単純なシミュレーションであり、**実際のOverpass/Wikipedia/Nominatimが返す本物の429/504・タイムアウト・部分的な失敗**とは別物。特に「Overpassだけ落ちてWikipediaは生きている」「一部バッチだけ失敗する」といった**部分的な混雑**は本番でしか起きない。

#### (c) 住所の解析(Nominatimの結果を使う経路)
`parentArticleTitle`(geo.js L1840〜)は fixture 中は `meta.label` を直接返すため、**本番専用の「`hotel.displayName` をカンマ分解して地名を抽出する」ロジックを一度も通らない**。道路名を除外する処理(R186)・都道府県で打ち切る処理・「温泉」を補う処理は、fixture では検証できず、必ず実在の宿名を本番のNominatimに投げて確認する必要がある。

#### (d) 宿名に依存する処理(`isHotelItself` など)
`engine.js` の `isHotelItself`(L1249)は宿名と候補名を正規化して比較する。**固定データの宿名は `meta.label + '(固定データ)'`**(例:「草津温泉(固定データ)」)であり、実在のどの宿の名前とも一致しない特殊な文字列。そのため「親記事(草津温泉)が候補に混ざったときに宿自身として誤判定されて消える」という不具合(不具合2)は、固定データでは**宿名が偶然衝突しないため再現しない**。実在の宿名(例:「ホテル一井」)で確認しないと発見できない。

#### (e) キャッシュ(localStorageの状態に依存する処理)
`fetchSpots`/`fetchWikiNearby` は fixture 中は localStorage を読み書きしない(L1275/1391/2467/2597)。つまり**キャッシュのTTL切れ・古い形式(`CACHE_FORMAT_VERSION`)の破棄・容量超過時の退避(`evictOldest`)・R181の粗いキー救済**は固定データでは一切動かない。本番で「古いキャッシュが残っていて結果が変わる」事故は、固定データでは構造的に起こりようがない。

#### (f) その他、geo.js/engine.js を読んで見つけたもの
- `parentAreaKey`(geo.js L2228): fixtureでは `meta.area` を直接使うが、本番は候補画像のファイル名から推測するロジック(3件以上の共通語を拾う)を通る。推測が外れるケースは fixture では絶対に発生しない。
- `enrichFame`(geo.js L2937): **これは固定データの制約ではありません**。`enrichFame` は定義(`:2937`)と export(`:2996`)だけで**どこからも呼ばれておらず**(実測 2026-09-24)、**fixture でも本番でも `fame`(Wikidataのsitelinks数・月間ページビュー)は常に null** です。したがって fame 起因の並び順の変化は、固定データに限らず**現状どの経路でも起きません**。**呼ぶかどうか(R225)はみのるんの判断待ち**で、今は文書側だけを実態に合わせてあります。
- `fetchHotelsInBbox`(geo.js L2344): fixtureでは空配列固定。地図上の他の宿ピン表示は固定データでは絶対に見えない。
- Nominatimの`suggestHotels`(打鍵候補)・`geocodeHotel`(検索欄からの確定)は、そもそも fixture 分岐が無く**常に本番APIを叩く別経路**なので、固定データを使っていても「宿を検索する」操作自体は毎回本物のNominatimを叩いている。ここは固定データの範囲外というより「常に本番」の領域。

### 3. 本番でしか確認できないことの確認手順

1. **Chromeのブラウザ自動化**(`mcp__claude-in-chrome__*`)で `https://teer-tee.github.io/yadotabi/` を開き、宿検索欄に実在の宿名を入力して結果画面まで進める。`read_console_messages` でエラー・警告を、`read_network_requests` でOverpass/Nominatim/Wikipediaへの実リクエストと応答時間を確認する。
2. **どの宿で試すべきか**: 実在の宿名を使うこと。2026-09-19の検証で使ったのは「ホテル櫻井」「富士屋ホテル」「杉乃井ホテル」「ホテル一井」など。固定データの宿名(「草津温泉(固定データ)」のような `label + '(固定データ)'`)では(d)(c)の不具合は再現しない。
3. **必ずlocalStorageをクリアしてから試す**: DevToolsまたは `mcp__claude-in-chrome__javascript_tool` で `localStorage.clear()` を実行してからページを再読み込みする。2026-09-19に、古いキャッシュが残っていたために結果が変わった実例がある(前述(e))。
4. **1回の確認で確定としない**: 2026-09-19、R183が3宿で「直った」と確認したものが、R185で再現しなかった実例がある。Overpassの応答は毎回同じとは限らず(429/504・部分失敗・順序のゆらぎ)、**複数回・複数宿で確認してから完了とする**こと。
5. 確認する観点: 表示までの体感時間、候補の並び(親記事が混ざって消えていないか)、親記事名の抽出結果(道路名で壊れていないか)、429/504時の縮退表示、コンソールエラーの有無。

### 4. 今日の3件の記録

| # | 不具合 | 何が起きたか | なぜ固定データで見えなかったか |
|---|---|---|---|
| 1 | 本番で平均30秒かかる | 本番のOverpassクエリが実測で30秒前後かかり、体感が遅い | 固定データは`overpass`キーの生JSONを即座に読むだけで、fetch自体が発生しない。API応答時間という概念が固定データには存在しない |
| 2 | 親記事が候補に混ざり湯畑が沈む | 親記事(草津温泉)自身が候補の1件としてOverpass/Wikipediaに含まれることがあり、`isHotelItself` の判定に本来引っかからないはずが、固定データでは宿名が「草津温泉(固定データ)」という特殊文字列だったため偶然 `isHotelItself` に一致して消えていた。本番の実在宿名(例:ホテル一井)では一致せず、親記事がそのまま候補に残って湯畑を押しのけて上位に出た | 固定データの宿名(`meta.label + '(固定データ)'`)が、たまたま親記事名と正規化後に一致する特殊ケースになっており、実在の宿名では起きない誤判定の「隠蔽」が起きていた |
| 3 | 住所の道路名で親記事名が壊れる | 本番で草津の宿を検索すると、Nominatimの`displayName`が「◯◯ホテル, しゃくなげ通り, 草津町, ...」のように宿名の次に道路名を挟むことがあり、旧ロジックだと「しゃくなげ通り温泉」という実在しない記事名を作ってしまい、親記事による加点がエリア全体で効かなくなっていた(R186で道路名を飛ばす修正済み) | `parentArticleTitle`(geo.js L1840)は fixture 中は `meta.label` を直接返すため、**住所文字列(`displayName`)をカンマ分解して地名を抽出する経路そのものを一度も通らない**。この経路は本番のNominatim応答でしか実行されない |

**教訓**: 固定データは「APIが返した後の整形・スコア計算ロジック」を高速かつ無料で検証するための仕組みであり、**「APIをどう呼ぶか」「APIの応答をどう解析するか」「宿固有の文字列(名前・住所)がロジックにどう作用するか」は原理的に検証できない**。大きな変更のあとは必ず本番で実在の宿を使って確認すること。
