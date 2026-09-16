# NEXT: R70 `?fixture=random`(+サンプル導線に「おまかせ」)

## 選定理由(1行)
R64 は各 check 本の Playwright 絶対パス import を Linux 対応させる横断改修が要り 1 サイクルに収まらない、R40 は Overpass を叩く生成タスクで検証が重い。R70 は変更が app.js 2 か所・外部 API 0 回・既存 check に追記するだけで、初見の人が「土地によって出るものが違う」と気づける導線が増えるため。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(主変更)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-sample.mjs`(検査追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(完了マーク)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行追記)
- 必要なら `C:\workspace\claude\旅行先用サイト\yadotabi\README.md` のパラメータ表(R52)に `random` を1行足す

## 実装方針(実物の関数名・行番号つき)

### 1) `?fixture=random` の解決(app.js)
- `fixtureNameFromUrl(params)` は **app.js:1311**。現在は `/^[a-z0-9_-]+$/` を通れば文字列をそのまま返す。`random` もこの正規表現を通ってしまい、`fetch('fixtures/random.json')`(**app.js:1474**)が 404 → catch(**app.js:1495**)で通常動作にフォールバックする。つまり今は「黙って状態Aになる」。
- 方針: `fixtureNameFromUrl()` の **return 直前**に「`raw === 'random'` なら固定候補リストから1つ選んで返す」分岐を足す。`Math.random()` 1行。
  ```
  if (raw === 'random') { … FIXTURE_AREAS[Math.floor(Math.random()*FIXTURE_AREAS.length)] … }
  ```
- 候補リストは **app.js:1622-1627 の `SAMPLE_LINKS`** が既に `kusatsu/hakone/dogo` を持っているので、これを唯一の出典にする(二重管理を作らない)。`SAMPLE_LINKS` は `renderSampleLinks()` の直前にあり `fixtureNameFromUrl()` より後ろに定義されているが、`var` 宣言の関数スコープ巻き上げではなく**実行順**が問題になる。`fixtureNameFromUrl()` が呼ばれるのは `init()` 以降なので、モジュール最上位で `SAMPLE_LINKS` の代入は済んでいる(問題なし)。念のため実装時に `node --check` だけでなく実際に `?fixture=random` を開いて確認すること。
- 候補が 0 件のとき(将来 `SAMPLE_LINKS` を空にした場合)は `null` を返し、既存どおり通常動作へフォールバックする。
- 注意: `fixtureNameFromUrl()` は **app.js:1466(hasTarget 判定)**・**app.js:1632(renderSampleLinks の hideSamples 判定)**・**app.js:1854** からも呼ばれる。`random` のたびに `Math.random()` が回ると呼び出しごとに違うエリアが返り、`fetch` するエリアと表示判定がずれる恐れがある。**必ず「1回解決したら同じ結果を返す」ようにキャッシュする**(モジュール変数 `resolvedRandomFixture` を1つ置き、初回の解決結果を覚える)。これが本タスク唯一の落とし穴。

### 2) サンプル導線に「おまかせ」を足す(app.js)
- `renderSampleLinks()` は **app.js:1628-1639**。`SAMPLE_LINKS.map()` で `<a href="?fixture=…">` を並べている。
- その `.join('')` の**後ろ**に `<a href="?fixture=random">おまかせ</a>` を1本連結する(`SAMPLE_LINKS` 配列自体には入れない。入れると 1) の候補に `random` が混ざって自己参照になる)。
- 押すたびに違うエリアが出るのが狙いだが、素の `<a>` 遷移で毎回ページが読み直されるので追加処理は不要。
- `hideSamples`(embed 中・fixture 中は非表示)の既存挙動はそのまま。

### 3) 検査の追加(scripts/check-sample.mjs)
- 末尾の `main()`(サーバ起動 → `chromium.launch()` → 4 ケース)に **5 つ目**を足す。既存 `withPage()` ヘルパを使う。
- 新ケース「f. `?fixture=random`」:
  - `/?fixture=random` を開き 1500ms 待つ → `#feed-title` のテキストが `草津温泉` / `箱根湯本` / `道後温泉` の**いずれか**であること(ラベルは `fixtures/*.json` の `meta.label`。実装前に `grep -o '"label":"[^"]*"' fixtures/*.json` で実文字列を確認すること)。
  - `.feedcard` が 30 枚あること。
  - コンソールエラー 0 件。
  - `.samples` が不可視であること(fixture 中なので)。
- 既存ケース a の「サンプルリンクが3本」は **4本に変わる**ので、その `ok(count === 3, …)` を `count === 4` に直し、4本目の href が `fixture=random` を含むことを 1 行足す。
- `check-all.mjs` への登録は不要(`scripts/check-sample.mjs` は既に 25 本目のリストに入っている)。

## 完了条件(検証可能)
1. `?fixture=random` を 5 回開くと、`#feed-title` が kusatsu/hakone/dogo のラベルのいずれかになり、**2 種類以上が出る**(全部同じなら乱数かキャッシュの実装ミス)。
2. `?fixture=random` の1回の読み込み中に、ヘッダーのエリア名・「固定データ」バッジ・カードの中身が**同一エリアで一致**している(1) のキャッシュが効いている証拠)。
3. 状態Aのサンプル導線が「サンプル: 草津の例 箱根の例 道後の例 おまかせ」の4本になり、375px で折り返しても文字切れ・はみ出しが無い。
4. `?fixture=kusatsu` / `?fixture=kusatsu&embed=1` では従来どおり `.samples` が非表示。
5. `?fixture=zzz`(存在しない)は従来どおり黙って状態Aへフォールバックする(デグレなし)。
6. `node scripts/check-all.mjs` が 25 本すべて PASS・exit 0。
7. 外部 API 呼び出し 0 回(fixture のみ)。

## 検証手順(撮影+目視)
- `node --check assets/app.js`
- 撮影(すべて fixture / demo。外部 API 0 回):
  - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=random" --mobile` を **3 枚**(エリアが変わることを画像で確認)
  - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=zoomout" --mobile`(サンプル導線4本の折り返し確認)、同 desktop 1 枚
  - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile`(デグレ確認)
- 画像を **Read で開いて目視**し、文字崩れ・重なり・はみ出し・空白の異常が無いことを確認する。
- `node scripts/check-all.mjs` が 25/25 PASS。
- コミット(1行の日本語)→ `git push`。

## 変更禁止範囲
- `assets/engine.js` の rank の重み・閾値・除外ルール、`assets/geo.js`、`fixtures/*.json`(再生成しない)。
- `SAMPLE_LINKS` の既存3件のラベル・fixture 名(`check-sample.mjs` が依存)。
- `.feedcard__link` のラベル文字列(`check-passive.mjs:94` が `Instagram` に依存)。
- 既存 check 本のうち `check-sample.mjs` 以外は無編集。
- `git stash` / `reset --hard` / `checkout` によるファイル復元は禁止。

## 難易度・所要目安
難易度: 小。所要目安 25〜40 分(実装 10 分・撮影と目視 10 分・check-all 約 3 分半・記録とコミット 10 分)。
