# NEXT: R9 別エリアの fixture を追加する(箱根)

担当: builder-sonnet / 難易度: sonnet で可 / 所要目安: 25〜40分

## なぜこれを選んだか(1行)
R2-1 は朝の相談(判断待ち)で選べず、R2-3 は「遠い土地を含む fixture」が前提なので、その前提を作る R9 を先にやると視覚QAの幅(草津以外で崩れないか)と R2-3 の実データ far 確認の両方が一度に前進するため。

## 対象ファイル(絶対パス)
- C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs (引数化)
- C:\workspace\claude\旅行先用サイト\yadotabi\fixtures\hakone.json (新規・生成物)
- C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js (fixture のタイトルのハードコード解消。それ以外は触らない)
- C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs (任意・下の「余力があれば」参照)

## 実装方針(実物を読んだ上での具体指示)

### 1. make-fixture.mjs の引数化
現状は 18〜24 行目で `AREA='kusatsu' / LAT / LON / OSM_RADIUS_M=15000` を定数直書きし、`main()` の末尾 191〜195 行で `fixtures/<AREA>.json` に書いている。ここを次のように変える。
- ファイル上部に**座標テーブル**を置く(定数を消すのではなく、テーブルから引いて同じ変数名に代入する形にすると、下流のコード=buildOverpassQuery/fetchWiki/main をほぼ触らずに済む):
  ```
  const AREAS = {
    kusatsu: { lat: 36.6226, lon: 138.5960, label: '草津温泉' },
    hakone:  { lat: 35.2324, lon: 139.1069, label: '箱根湯本' }
  };
  ```
  (箱根湯本駅まわりの座標。多少ずれても fixture としては問題ない)
- 実行引数を読む: `const AREA = (process.argv[2] || 'kusatsu').trim();` 未知の名前なら使える名前一覧を出して `process.exit(1)`。
- **名前バリデーションを app.js と揃える**: app.js の `fixtureNameFromUrl`(834〜841行)は `/^[a-z0-9_-]+$/` しか通さない。生成側もこの正規表現で弾くこと(ここがずれると「生成できたのに ?fixture= で読めない」事故になる)。
- `LAT/LON` は `AREAS[AREA]` から取る。`meta` に `label` も足す(下記 app.js で使う)。`meta.area` は AREA のまま。
- **OSM_RADIUS_M を 15000 のままにしない**: R2-3 のとおり far のしきい値は engine.js の `FAR_DRIVE_MIN = 60`(車60分≒30km)なので、収集半径15kmでは far が構造上必ず0件になる。hakone は `osmRadiusM` を **30000**(30km)にして生成すること。実装は AREAS のエントリに `osmRadiusM` を持たせ、未指定なら 15000 にフォールバックする形が安全(kusatsu.json を再生成しないため)。WIKI_RADIUS_M は 10000 のままでよい。
  - 注意: 半径30kmだと Overpass の応答が重くなる。既存の再試行(60秒待ち×2 → `FALLBACK_RADIUS_M=4000` へ縮小)がそのまま効くが、フォールバック半径が 4000 だと far が出ないので、**混雑でフォールバックまで落ちたら「far 確認は今回できなかった」と NIGHTLOG に書いて次へ進む**(何度も叩き直さない。AUTOPILOT 規約4)。
- ヘッダーのコメント(1〜9行目)の実行方法を `node scripts/make-fixture.mjs <area>` に直す。

### 2. 生成の実行(外部API はこの1回だけ)
`node scripts/make-fixture.mjs hakone` を **1回だけ**実行する。Overpass 1回(+混雑時の再試行)と Wikipedia 数回のみ。成功したら `fixtures/hakone.json` の `meta`(area/lat/lon/osmRadiusM)と elements/pages の件数をログに残す。失敗(混雑で最後まで通らない)なら半径を下げて再生成せず、ROADMAP の R9 を未完了のまま残して NIGHTLOG に理由を書いて終える。

### 3. app.js のタイトルのハードコード解消
889 行目が `name: '草津温泉(固定データ)'` の直書きなので、hakone を開いても「草津温泉」と出てしまう。ここだけ直す:
```
name: (json.meta && json.meta.label ? json.meta.label : fixtureName) + '(固定データ)',
```
`meta.label` が無い既存の kusatsu.json でも `'kusatsu(固定データ)'` になるだけで壊れないが、見栄えのため **kusatsu.json の meta にも `"label": "草津温泉"` を手で1キー足してよい**(JSONの他の部分は絶対に書き換えない)。app.js の変更はこの1箇所のみ。`fixtureNameFromUrl` のバリデーションは変更不要(既に `hakone` を通す)。

## 完了条件
1. `node scripts/make-fixture.mjs hakone` で `fixtures/hakone.json` が生成され、`meta.area === 'hakone'` / `meta.osmRadiusM === 30000` になっている。
2. `node scripts/make-fixture.mjs` (引数なし)が従来どおり kusatsu を対象にする(=既存運用を壊さない)。不正な名前(例 `Hakone!`)はエラー終了する。
3. `?fixture=hakone` でヘッダーが「箱根湯本(固定データ)」になり、カードが並ぶ。`?fixture=kusatsu` は「草津温泉(固定データ)」のまま。
4. `node --check assets/app.js` と `node --check scripts/make-fixture.mjs` が通る。
5. 撮影画像を Read で目視して崩れなし。

## 検証手順(撮影は全て固定モード=外部API 0回)
- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile` と desktop 幅の2枚。
- far 節の確認: `?fixture=hakone` のページを下までスクロールした状態(既存の far-open 撮影と同じやり方)で1枚。**「もっと遠く(車1時間以上)」の節が実データで出るか**を見る。出ていれば R2-3 を `[x]` にしてよい(NIGHTLOG に件数を書く)。出ていなければ R2-3 は未完了のまま残し、「半径30kmでも far 0件だった」事実を NIGHTLOG に書く。
- デグレ確認: `?fixture=kusatsu` mobile 1枚(カード枚数・ピン番号が従来どおりか)。
- Read で見る観点: ヘッダー文字列が箱根になっているか / カード見出しとカテゴリ行の折り返しに欠け・重なりが無いか / 小地図の番号ピンが箱根の地形(谷沿いに細長い)でも判読できるか(草津と密集の仕方が違うので R7/R8 の nudgeOverlaps が効いているかの実地テストになる) / far 節のリンク行で施設名と `🚗◯分` が泣き別れていないか。
- 最後に `node docs/check.mjs`(本番死活。全項目 OK・終了コード0)。

## 変更禁止範囲
- `assets/geo.js` / `assets/engine.js` / `assets/style.css` / `index.html` / `demo/` 配下は触らない(fixture の読み込み経路は既に汎用なので変更不要)。
- `fixtures/kusatsu.json` の再生成は禁止(`label` の1キー追加のみ可)。
- `FAR_DRIVE_MIN` などエンジンのしきい値は変えない(今回は「収集半径を広げて far を見る」であって、しきい値の調整は別タスク)。
- ユーザー入力を増やす変更は一切しない(AUTOPILOT 規約3)。
- git stash / reset --hard / checkout でのファイル復元は禁止。

## 余力があれば(任意・やらなくてよい)
`docs/check.mjs` の 20 行目の対象に `fixtures/hakone.json` を足し、57 行目と同様に `meta.lat` を確認する。追加しない場合も完了条件は満たす。
