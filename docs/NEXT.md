# NEXT — R40 fixture 4エリア目「別府」の追加

**判断理由**: 残候補5件のうち R14/R19 は既存 fixture の再生成(Overpass 再実行)が前提で今サイクルの禁止事項に触れ、R64 は Actions 無料枠の確認と各 check 本の import パス改修で1サイクルに収まらない。R40 は Overpass 1回・新規ファイル追加のみで既存 fixture を壊さず、R19(far 分布)と R71(写真割合)の材料にもなるため選定した。

- 難易度: sonnet
- 所要目安: 25〜40分(うち Overpass 1回の生成で数分)
- 外部API: **Overpass 1回・Wikipedia 1系統のみ**(`node scripts/make-fixture.mjs beppu` の1回だけ)。撮影は全て fixture で0回。

---

## 対象ファイル(絶対パス)

1. `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs` — AREAS に beppu を追加
2. `C:\workspace\claude\旅行先用サイト\yadotabi\fixtures\beppu.json` — 生成される新規ファイル
3. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs` — TARGETS に1行
4. `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — SAMPLE_LINKS に1件
5. `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-sample.mjs` — **件数アサーションの更新(必須)**
6. `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md` — エリア表に1行
7. `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` — 3か所(29行目・108行目・144行目)
8. `C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md` — 観察を1段落(**親リポジトリ管理**)

---

## 実装方針(実物を読んだ上での指示)

### (1) make-fixture.mjs の AREAS(`scripts/make-fixture.mjs:18-22`)

現状は3行のオブジェクト。ここに1行足すだけ。

- キー `beppu` / `lat: 33.2846` / `lon: 131.4914` / `label: '別府温泉'`
- `osmRadiusM` は**指定しない**(既定 15000 が `:36` の `AREAS[AREA].osmRadiusM || 15000` で効く)。別府は市街地型で密度が高く、箱根の 30000 を真似ると要素数が膨らんで hakone.json(900KB)と同じ肥大問題(R14)を新規に作ることになるため。
- `buildOverpassQuery`(`:54-73`)・`fetchWiki`(`:127-176`)・`main`(`:178-210`)は**一切触らない**。

実行は `node scripts/make-fixture.mjs beppu` を**1回だけ**。429/504 で `FALLBACK_RADIUS_M=4000` に落ちて成功した場合は、`docs/FIXTURES.md:45` の方針どおり**その結果を採用せず日を改める**(ROADMAP に残して他タスクへ)。

### (2) docs/check.mjs の TARGETS(`docs/check.mjs:12-22`)

`'fixtures/dogo.json',` の次に `'fixtures/beppu.json',` を追加するだけ。JSON 妥当性と `meta.lat` の検査は `:88` の `path.startsWith('fixtures/')` 分岐が自動で拾うので**分岐の変更は不要**。

### (3) app.js の SAMPLE_LINKS(`assets/app.js:1635-1639`)

```
var SAMPLE_LINKS = [
  { fixture: 'kusatsu', label: '草津の例' },
  { fixture: 'hakone',  label: '箱根の例' },
  { fixture: 'dogo',    label: '道後の例' }
];
```
ここに `{ fixture: 'beppu', label: '別府の例' }` を追加する。これだけで:
- R63 のサンプル導線チップが4本+「おまかせ」の計5本になる
- R70 の `?fixture=random`(`:1314-1326` の `fixtureNameFromUrl`)が **beppu も抽選対象に含む**(`SAMPLE_LINKS` から選んでいるため自動)

`fixtureNameFromUrl` の正規表現 `/^[a-z0-9_-]+$/`(`:1316`)は `beppu` を通すので**バリデーションの変更は不要**。`renderSamples`(`:1643-1650`)も配列を map しているので変更不要。

### (4) check-sample.mjs の件数アサーション(**ここを忘れると check-all が赤くなる**)

`scripts/check-sample.mjs:77` に
```
ok(count === 4, 'a. サンプルリンクが4本', count);
```
があり、SAMPLE_LINKS を4件にすると**リンクは5本**になってここが FAIL する。`count === 5` / メッセージ「サンプルリンクが5本」に直し、あわせて `:81-84` の並びに
```
ok(hrefs.some((h) => (h || '').includes('fixture=beppu')), 'b. 4本目が fixture=beppu を含む', hrefs);
```
を追加(既存の「4本目が fixture=random」は「5本目」に文言修正)。
`checkSampleClickNavigates`(`:90-110`)は `.samples a` の**先頭**をクリックし `#feed-title === '草津温泉'` を期待しており、草津は先頭のままなので**変更不要**。
`:134` の `?fixture=random` 検査は「3エリアのいずれか」を見ているので、**beppu も許容値に加える**こと(ファイル冒頭コメント `:11-15` の説明文も同時に更新)。

### (5) 文書(コード変更なし)

- `docs/FIXTURES.md:13-17` の表に `| beppu | 別府温泉 | 33.2846 | 131.4914 | 15000(既定) | 10000 |` を追加。`:11` の行番号参照(`make-fixture.mjs:18-22`)が `18-23` にずれるので直す。
- `README.md:29` の「`?fixture=hakone`(または `kusatsu` / `dogo`)」に `beppu` を追加。
- `README.md:108` のパラメータ表の値欄を `kusatsu / hakone / dogo / beppu / random` にし、説明の「3エリアから」を「4エリアから」に。
- `README.md:144` の「草津・箱根・道後の3エリア」を「草津・箱根・道後・別府の4エリア」に。

### (6) 09 研究ノート(親リポジトリ)

`C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md` の末尾に**1段落**。観察の軸は「市街地+海沿い」という新条件:
- `node scripts/dump-rank.mjs beppu` の上位30件を貼り、**海側(東)に候補が無く陸側に偏る**かどうか
- 市街地型の公共施設混入が R35 の除外ルールで落ちているか(道後との比較)
- far(車1時間以上)の件数 — 草津0件・道後0件・箱根10件に対して別府がどうなるか(**R19 の材料**)

コミットは**このファイルだけ**を `git -C C:/workspace add "claude/旅行先用サイト/計画書一式/09_研究ノート_認知外を提案するアルゴリズム.md"` → commit。親リポジトリで他のファイルを add しないこと。

---

## 完了条件(すべて検証可能)

1. `fixtures/beppu.json` が存在し、`meta.area === 'beppu'` / `meta.label === '別府温泉'` / `meta.osmRadiusM === 15000` / `meta.generatedAt` がある
2. `?fixture=beppu` でカードが **10枚以上**(道後と同程度の30枚を期待。10枚未満なら座標か半径を疑い、再生成せず NIGHTLOG に事実を記録して相談へ)
3. `node scripts/check-all.mjs` が **25本全緑・exit 0**(check-sample の件数修正込み)
4. `node docs/check.mjs` が全OK・exit 0(beppu.json 行を含む)。※本番未 push の間は beppu.json 行だけ 404 になるので、**push 後にもう一度**実行して緑を確認する
5. `node scripts/dump-rank.mjs beppu` が上位30件を出力する
6. ヘッダーが「別府温泉」+「固定データ YYYY-MM-DD 取得」バッジ
7. `?fixture=kusatsu` / `?fixture=hakone` / `?fixture=dogo` が**従来どおり**(カード枚数・1位カード名が不変)

## 検証手順(撮影+目視)

`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅で撮り、画像を Read で開いて目視する。

1. `?fixture=beppu` mobile — カード枚数・番号ピンが判読できるか・文字崩れ/はみ出し
2. `?fixture=beppu` desktop — 同上
3. `?demo=zoomout` mobile — サンプルチップが**5本**に増えて**横スクロールで全部読めるか**(ここが今回いちばん崩れやすい。1行に収まらず改行して他要素に被るなら NIGHTLOG に記録し、幅の調整は別タスクに切る)
4. `?fixture=kusatsu` mobile — デグレなし確認
5. コンソールエラー0件を各画面で確認

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` — **一切触らない**(rank の重み・閾値・除外ルール・Overpass クエリすべて)
- `fixtures/kusatsu.json` / `hakone.json` / `dogo.json` — **再生成禁止**(Overpass を叩き直さない)
- `make-fixture.mjs` の `buildOverpassQuery` / `fetchWiki` / `fetchOverpass` / `main`
- 既存 check 本の検査ロジック(件数アサーションと beppu 追記以外)
- `style.css` — サンプルチップの幅調整は今回やらない(3の撮影で問題が出たら起票のみ)
