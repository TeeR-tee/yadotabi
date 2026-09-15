# NEXT — R15 撮影用の遅延パラメータ `?slow=osm800,wiki1500`

**選定理由**: R5 で直した段階描画(OSM先出し)は現在 A/B のとき手で遅延を入れないと確認できず、退行しても気づけない。URLパラメータ化すれば毎サイクルの撮影2枚だけで段階描画の生死を目視でき、fixture と併用できて外部API 0回・コスト0円・ユーザー判断不要で、入力ゼロ原則にも触れない。(R11 は「検討」段階で判断が要る、R14/R19 は fixture/rank に踏み込む、R21 は文書のみで効果が薄い)

- **難易度**: sonnet
- **所要目安**: 30〜45分

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\geo.js` (1246行) — 遅延の注入口
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` (1375行) — `?slow=` の読み取り
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-geo.mjs` (232行) — テスト追加

## 実装方針(実物の関数名・行番号つき)

### 1. geo.js に遅延の保持と注入を足す

既に `delay(ms)` が **327行** に定義済み(`function delay(ms) { return new Promise(...) }`)なので、新たなユーティリティは作らない。

**83行** の `function setSimulateBusy(v) { simulateBusy = !!v; }` の直後、`OVERPASS_RETRY_WAIT_MS`(86行)の手前に、`simulateBusy` と同じ形のモジュール変数を追加する:

```
var slowDelays = { osm: 0, wiki: 0 };
function setSlowDelays(d) { ... }   // 数値でない/負の値は 0 に丸める
```

注入は2箇所だけ。**どちらも fixture 分岐の内側・外側の両方を通る位置に置く**(fixture と併用できることが R15 の条件):

- `fetchSpots`(**665行**〜): **680行** の `var data = null;` の直前に `if (slowDelays.osm > 0) await delay(slowDelays.osm);` を1行入れる。キャッシュ参照(675〜679行)より後に置くこと。前に置くとキャッシュヒット時まで遅くなる。
- `fetchWikiNearby`(**873行**〜): **919行** の `if (fixtureData) {` の直前に `if (slowDelays.wiki > 0) await delay(slowDelays.wiki);` を1行入れる。ここなら fixture 経路(919〜922行)も実API経路(else 側の同心円ループ)も等しく遅延する。

公開APIは **1241行** の `setSimulateBusy: setSimulateBusy,` の隣に `setSlowDelays: setSlowDelays,` を1行足す。

### 2. app.js に `?slow=` の読み取りを足す

**1080行** から始まる `applyEntryPoint()` の中。`?simulate=overpass504` の分岐(**1084〜1086行**)と同じ書き方で、「撮影・目視QA専用の入口」コメント(1087行)より下、`if (params.get('perf') === '1') perfOn = true;`(**1088行**)の近くに置く。

`fixtureNameFromUrl`(**1062行**)に倣って小さなパーサ関数 `slowDelaysFromUrl(params)` を新設する:

- 値の形式は `osm800,wiki1500`。`,` で分割し、各片を `/^(osm|wiki)(\d{1,5})$/` で検証する。
- 一致しない片は**黙って無視**する(不正値でも通常動作にフォールバックする既存方針と揃える)。
- 両方0なら `YadoGeo.setSlowDelays` を**呼ばない**。`osm` だけ・`wiki` だけの指定も有効。
- 上限は 10000ms 程度でクランプ(タイプミスで撮影が止まらないように)。

呼び出しは `if (slow && typeof YadoGeo.setSlowDelays === 'function') YadoGeo.setSlowDelays(slow);`。

### 3. check-geo.mjs にケース追加

**206〜218行** の「ケース5: fixture モード不変」の作りをそのまま踏襲する(`loadGeo()` + fetch モック + `geo.setFixture(...)`)。末尾の集計(**229行** の `console.log('\n' + pass + ...)`)の手前に新ケースを足す:

- `setSlowDelays({wiki: 120})` した fixture モードで `fetchWikiNearby` の所要が 100ms 以上かかり、かつ **外部 fetch は 0回**のままであること。
- `setSlowDelays` を呼ばない(または `{osm:0,wiki:0}`)ときは所要が 50ms 未満で、既存ケース5と同じ件数・同じ先頭要素が返ること(**パラメータ無しなら完全に不変**の証明)。

## 変更禁止範囲

- `assets/engine.js` — 1行も触らない(rank / baseScore / カテゴリ多様性 / isSamePlace)
- `fixtures/*.json` — 再生成も編集もしない
- ランキングの重み・閾値、`present()` の件数
- `?slow=` が無いときの挙動(遅延0で `await` すら通らないこと)

## 完了条件(検証可能)

1. `?fixture=kusatsu`(slow 無し)のカードが**30枚**・番号ピン1〜30・並び順とも従来どおり(デグレなし)。
2. `?fixture=kusatsu&slow=osm300,wiki3000` を `--wait 1500` で撮ると、**OSM由来のカード(写真なし)だけ**が出ている。
3. 同URLを `--wait 5000` で撮ると、**Wikipedia由来の写真・要約が入った**通常の画面になっている。
4. `node scripts/check-geo.mjs` が既存34件+追加ケースすべて pass。
5. `node scripts/check-engine.mjs`(111件)・`check-r5.mjs`(15件)・`check-a11y.mjs`・`check-more.mjs`・`check-passive.mjs`・`check-pinflash.mjs`・`node docs/check.mjs` すべて従来どおり pass。
6. `node --check assets/geo.js` / `assets/app.js` 通過、コンソールエラー0件。
7. `node scripts/dump-rank.mjs kusatsu` が**差分ゼロ**(engine/fixture 無傷の証明)。

## 検証手順(撮影2枚+目視)

```
node C:\workspace\tools\shot\shot.mjs "<BASE>/?fixture=kusatsu&slow=osm300,wiki3000" --mobile --wait 1500
node C:\workspace\tools\shot\shot.mjs "<BASE>/?fixture=kusatsu&slow=osm300,wiki3000" --mobile --wait 5000
```

2枚とも **Read で開いて目視**し、NIGHTLOG に「1枚目は写真なしカードのみ/2枚目は写真入り」と**差が出たことを明記**する。差が出なければ段階描画が壊れているか遅延が効いていないので、同サイクルで原因を特定する(報告だけで終わらせない)。

加えてデグレ確認として `?fixture=kusatsu`(slow 無し)mobile を1枚撮り、カード30枚・崩れなしを目視する。外部API呼び出しは**全工程で0回**(fixture のみ)。
