# FIXTURES.md — 固定データ(fixture)の作り方・再生成の判断基準

## 目的

`?fixture=<area>` は撮影・検証を外部API0回で回すための保存済み生レスポンスです。加工前の生JSONを保存し、ブラウザ側 `geo.js` の整形コードをそのまま通す前提で作られています(`scripts/make-fixture.mjs:1-9`)。

URLパラメータ全体の一覧は [README.md](../README.md#urlパラメータ一覧) の「## URLパラメータ一覧」節を参照してください。

## 対象エリア表

`AREAS`(`scripts/make-fixture.mjs:18-23`)の実値です。

| area | ラベル | lat | lon | osmRadiusM | wikiRadiusM |
|---|---|---|---|---|---|
| kusatsu | 草津温泉 | 36.6226 | 138.5960 | 15000(既定) | 10000 |
| hakone | 箱根湯本 | 35.2324 | 139.1069 | 30000(個別指定) | 10000 |
| dogo | 道後温泉 | 33.8520 | 132.7860 | 15000(既定) | 10000 |
| beppu | 別府温泉 | 33.2846 | 131.4914 | 15000(既定) | 10000 |

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

`area` / `label` / `lat` / `lon` / `osmRadiusM`(実際に成功した半径) / `wikiRadiusM` / `generatedAt`(ISO文字列)。`generatedAt` は画面ヘッダーの「固定データ」バッジに取得日として表示される(R45)ので、鮮度が古くなったことに気づけます。

## Overpass のマナー(スクリプトの実装どおり)

- Wikipedia を先に取得し、Overpass は後で叩きます(Wikipedia 失敗時に Overpass を無駄打ちしないため・`scripts/make-fixture.mjs:178-180`)。
- Overpass が 429/504 を返したときは60秒待って最大2回再試行します(`RETRY_WAIT_MS=60000` / `MAX_RETRY=2`)。それでも駄目なら半径 4000m(`FALLBACK_RADIUS_M=4000`)に落として1回試します。
- **半径が落ちて成功した場合は fixture として採用せず日を改めます**(`meta.osmRadiusM` が意図と違う値で残るため)。
- 1サイクルあたりの生成は1エリアまでです。

## 既存 fixture は原則再生成しない方針

既存3エリアを取り直すと元データが変わり、カードの並び・枚数・写真が変わります。過去の撮影・検査(`scripts/check-*.mjs` の期待値、09研究ノートの順位記録)との比較ができなくなるため、**再生成は「上流のクエリを変えた」「データが明らかに古い」など理由があるときだけ**行います。実施する場合は前後で `node scripts/dump-rank.mjs <area>` を取ってカード枚数と上位の並びを差分比較し、NIGHTLOG に記録してください。

## `buildOverpassQuery` の同期注意

`scripts/make-fixture.mjs` のクエリは `assets/geo.js` の同名関数と**同一でなければなりません**(`scripts/make-fixture.mjs:51-52` のコメント)。片方だけ直すと fixture と本番で候補が食い違います。

---

関連: R14(hakone.json 900KB の軽量化)・R19(far 分布)・R40(別府追加)はいずれもこの手順を前提にする。
