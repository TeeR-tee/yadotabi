# 次の1タスク: R107 first-card の ms を check に記録し、遅くなったら気づけるようにする

- タスクID: **R107**
- 難易度: **sonnet**
- 所要目安: 30〜45分
- 外部API: **0回**(fixture のみ)

## 目的

`?perf=1` で「最初のカードが描かれるまでの ms」は既に測れているのに、`check-all.mjs` の27本は誰もこの値を見ていない。
今後の改修で体感速度が落ちても気づけないので、(a)値をログに残し (b)明らかに遅くなったら落ちる緩いしきい値検査を足す。

## 実測で判明した前提(2026-09-16 計画役が Playwright で実測)

- `assets/app.js:160-204` が perf 計測の実体。`?perf=1` のときだけ `perfOn = true`(`app.js:1493`)。
- **値の読み取り方は2通りとも使える**(実測済み):
  1. **console**: `app.js:184-185` が `'[perf] ' + label + ' ' + ms + 'ms'` を `console.log` する。Playwright の `page.on('console', ...)` で `[perf] first-card-painted 24ms` として取れる。
  2. **DOM**: `app.js:188-196` が `div#perf-box` を body 末尾に作り、`textContent` が
     `stage:osm 12ms | stage:wiki 18ms | stage:done 21ms | first-card-painted 24ms` になる。
     `page.textContent('#perf-box')` で取れる。**window 変数への露出は無い**(`perfLines` はクロージャ内のローカル)。
  - → **app.js は無変更でよい**(計測値は既に2経路で外から読める)。
- **実測値**(`http://127.0.0.1:3000/index.html?fixture=kusatsu&perf=1`、mobile 375x812、3回):
  | 回 | stage:osm | stage:wiki | stage:done | **first-card-painted** |
  |---|---|---|---|---|
  | 1 | 12ms | 18ms | 21ms | **24ms** |
  | 2 | 11ms | 18ms | 21ms | **25ms** |
  | 3 | 11ms | 18ms | 21ms | **24ms** |
  - **中央値 24ms**、ばらつき ±1ms。fixture はネットワークを使わないので極めて安定。
  - `[perf] fixture-loaded 4ms` は `app.js:1564` の別系統(perfT0 基準ではない)なので**検査対象にしない**。
- `perfMarkFirstCard()`(`app.js:200`)は `requestAnimationFrame` 後に打つので、`.feedcard` が DOM に出た直後にすぐ読むと `#perf-box` にまだ `first-card-painted` が入っていないことがある。**`page.waitForFunction` で `#perf-box` の textContent に `first-card-painted` が含まれるまで待つこと**(固定 `waitForTimeout` は R89 の方針に反するので使わない)。
- `scripts/check-r5.mjs` は **Node の `vm` で engine.js を直接動かす純ロジック検査**でブラウザを立てない(Playwright も import していない)。**ここに追記するのは構造的に不可能**。
- `scripts/check-sample.mjs:20` は Playwright を `file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` から import し、自前で `python -m http.server 3000` を spawn して finally で kill する作りで、この作りをそのまま踏襲できる。

## 実装方針

**`scripts/check-firstcard.mjs` を新設する**(check-r5 は vm ベースで入れられず、check-sample は「サンプル導線」の検査で関心が違うため)。
作りは `scripts/check-sample.mjs:20-40` のヘッダ(playwright import・PORT/BASE・`ok()`・`isPortOpen()`)をそのまま踏襲する。

検査内容:

1. `?fixture=kusatsu&perf=1` を mobile(375x812)で開き、`.feedcard` を待ってから
   `page.waitForFunction(() => (document.querySelector('#perf-box')||{}).textContent?.includes('first-card-painted'))` で待つ。
2. `#perf-box` の textContent から `/first-card-painted (\d+)ms/` で ms を取り出す。
3. **必ず `console.log` で実値を出す**(例: `  [perf] first-card-painted = 24ms (上限 200ms)`)。これが本タスクの主目的。
4. **緩いしきい値検査**: `ms <= FIRST_CARD_MAX_MS` を `ok()` で判定する。
   - **`FIRST_CARD_MAX_MS = 200`** とする。実測中央値 24ms の **約8倍**。
   - 指示にあった「中央値の2倍(=48ms)」は**採らない**。理由: 24ms という絶対値が小さすぎて、CI やローカルの GC・初回 JIT の揺らぎ数十 ms でそのまま赤くなる。R33/R46/R103 の「揺らぎで赤くしない」方針に沿い、**桁が変わったら気づく**水準に置く。この判断理由をコード冒頭コメントに書くこと。
5. ついでに `stage:osm <= stage:wiki <= stage:done <= first-card-painted` の単調性も `ok()` で見る(段階描画が壊れたら気づける・追加コストゼロ)。
6. `?fixture=kusatsu`(**perf 無し**)で `#perf-box` が **0件**であることを確認する(`?debug=1` と同じ「フラグが無ければ何も作らない」の担保)。
7. コンソールエラー0件(`msg.type() === 'error'` が0)。

`scripts/check-all.mjs:13-40` の `SCRIPTS` 配列に **`'scripts/check-firstcard.mjs',`** を1行足す(アルファベット順で `check-feednote.mjs` と `check-geo.mjs` の間)。**28本目**になるので、`check-all.mjs:2` の冒頭コメント「26本 + docs/check.mjs の計27本」を「27本 + docs/check.mjs の計28本」に直す。
`docs/CHECKS.md` の表にも1行足し、本数表記(27本など)を28本に更新する(R106 で実体と一対一に揃えた資料なのでズレを残さない)。

## 対象ファイル(絶対パス)

- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-firstcard.mjs`
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(配列1行+コメント本数)
- 変更: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(表1行+本数表記)
- 参考(読むだけ・変更しない): `assets\app.js:160-204`, `scripts\check-sample.mjs`

## 完了条件

1. `node scripts/check-firstcard.mjs` が PASS し、**実測 ms が標準出力に数値で出ている**。
2. `node scripts/check-all.mjs` が **28本全緑**・exit 0。
3. **`node scripts/check-firstcard.mjs` を連続5回回して5回とも PASS**(しきい値のフレーク無し)。
4. `git diff --stat -- assets index.html fixtures demo` が**空**(アプリ本体は無変更)。
5. `?fixture=kusatsu` mobile のデグレ確認撮影1枚を目視(文字崩れ・重なりなし)。

## 検証手順

```
node scripts/check-firstcard.mjs                # 実値が出て PASS
for i in 1 2 3 4 5; do node scripts/check-firstcard.mjs; done   # 5回とも PASS
node scripts/check-all.mjs                      # 28本全緑
git diff --stat -- assets index.html fixtures demo   # 空であること
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile
```

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**。
- rank の重み・閾値は**変更不可**。
- `assets/app.js` は**原則無変更**(上記のとおり計測値は console と `#perf-box` の2経路で既に外から読めるため、追加は不要)。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- 外部API **0回**(fixture のみ。Overpass/Nominatim/Wikipedia を叩かない)。
- 既存 check 本の検査内容を**減らさない**。

## 終わったら

1. `docs/ROADMAP.md` の R107 行を `- [x] 2026-09-16 R107 …` に。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行(やったこと / 見た目の確認結果 / 次)を追記。**ファイル先頭に新しい節を作らない**。
3. **先にコミット**(1行の日本語メッセージ) → `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
