# NEXT: R30 fixture 3エリア目「道後温泉(dogo)」の追加

判断理由: 未完了は R11/R14/R19/R28/R30〜R34。草津=山間の温泉地・箱根=谷/都市近郊に対し、道後は**市街地に隣接した温泉地**で候補密度と重複(松山城・道後公園など)の出方が違うため、除外ルール・重複マージ・番号ピン分離の視覚QAの幅が一番広がる。R19(far の分布是正)の検証素材にもなり、make-fixture.mjs は既に引数化済みで実装コストが小さい。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-fixture.mjs` — `AREAS` テーブルに1行追加
- `C:\workspace\claude\旅行先用サイト\yadotabi\fixtures\dogo.json` — **新規生成物**(スクリプト実行で作られる)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs` — `TARGETS` と meta.lat 判定に dogo.json を追加
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\09_研究ノート*.md` — 実験ログに観察を1段落(ファイル名は `docs/` を ls して実物を確認すること)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` — 完了記録

## 実装方針(実物を読んでから書くこと)
1. `scripts/make-fixture.mjs` の `AREAS`(現在 kusatsu / hakone の2件)に1行追加する:
   `dogo: { lat: 33.8520, lon: 132.7860, label: '道後温泉' }`
   - `osmRadiusM` は**指定しない**(既定 15000m)。箱根の 30km は R19 で「far が境界に固まる」問題の原因として係争中なので、草津と同じ 15km で素直に取る。
   - 名前 `dogo` は `/^[a-z0-9_-]+$/` を満たすので、`assets/app.js` の `fixtureNameFromUrl`(app.js:1069 付近、同じ正規表現で検証し `fetch('fixtures/' + name + '.json')` するだけ)は**無変更で通る**。app.js は触らない。
   - ヘッダー名は `json.meta.label` 参照済みなので「道後温泉(固定データ)」が自動で出る。
2. `node scripts/make-fixture.mjs dogo` を**1回だけ**実行(Overpass 1回 + Wikipedia continue 最大4回)。
   - Overpass が 429/504 のときはスクリプト内蔵の 60秒×2 再試行に任せ、それでも駄目なら**このサイクルは中止**して NIGHTLOG に記録し、別タスクへ移ること(半径 4000m フォールバックで妥協した fixture は作らない)。
3. `docs/check.mjs` の `TARGETS` 配列(docs/check.mjs:12-22)に `'fixtures/dogo.json'` を足し、58行目付近の
   `if (path === 'fixtures/kusatsu.json' || path === 'fixtures/hakone.json')` の条件に dogo.json を加える(3つ並べるより `path.startsWith('fixtures/')` に直す方が素直)。
4. `node scripts/dump-rank.mjs dogo` を実行し、上位30件と far 10件を 09研究ノートの実験ログに貼って**1段落**観察を書く。着目点: (a) 市街地なので飲食店・学校・企業などの除外が効いているか、(b) 道後温泉本館 / 道後温泉 / 道後公園 などの重複がマージされているか誤併合していないか、(c) far の分布が箱根のように境界に固まっていないか(15km 半径なら far 0件もありうる。その事実自体が R19 の材料)。

## 完了条件(すべて検証可能)
- [ ] `fixtures/dogo.json` が生成され、`meta.area === 'dogo'` / `meta.label === '道後温泉'` / `meta.lat` / `meta.osmRadiusM === 15000` を持つ
- [ ] `?fixture=dogo` で**カードが10枚以上**描画される(草津30枚には届かなくてもよいが、10枚未満ならデータ不足としてログに理由を書く)
- [ ] ヘッダーが「道後温泉(固定データ)」になっている
- [ ] mobile / desktop とも文字崩れ・重なり・はみ出しなし、番号ピンが判読可能
- [ ] `docs/check.mjs` に dogo.json のチェックが入り、**ローカル実行で全項目 OK・exit 0**(本番URLの dogo.json は push 前なので 404。**push 後に必ず再実行して緑を確認**すること)
- [ ] `node scripts/dump-rank.mjs dogo` がエラーなく表を出力する
- [ ] `?fixture=kusatsu` / `?fixture=hakone` にデグレなし(カード30枚・ピン1〜30判読可)

## 検証手順
1. `node scripts/make-fixture.mjs dogo`(外部API はこの1回のみ)
2. `node scripts/dump-rank.mjs dogo` → 出力を 09研究ノートへ
3. 撮影(すべて fixture なので外部API 0回):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile`
   - 同 URL を desktop 幅で1枚
   - デグレ確認に `?fixture=kusatsu` mobile を1枚
4. 撮った画像を **Read で開いて目視**(崩れ・重なり・はみ出し・ピンの潰れ)。崩れがあれば同サイクルで直す。直せなければ ROADMAP に起票。
5. `node docs/check.mjs` / `node scripts/check-engine.mjs` / `check-a11y.mjs` / `check-more.mjs` を実行し全緑を確認
6. ROADMAP の R30 を `[x] 2026-09-16` に、NIGHTLOG に3行追記 → コミット → `git push` → push 後に `node docs/check.mjs` 再実行

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / rank の重み・閾値・カテゴリ多様性ルール — **一切触らない**
- `fixtures/kusatsu.json` / `fixtures/hakone.json` の**再生成は禁止**(R14 の軽量化タスクと衝突する)
- `assets/app.js`(fixture 名検証は既存のまま通るので変更不要)
- 外部API呼び出しは make-fixture の1回まで。追加調査で Overpass を叩き直さない
- git stash / reset --hard / checkout でのファイル復元は禁止

## 難易度・所要目安
- 難易度: **sonnet**(既存の R9「箱根追加」と同型。差分は座標1行 + check.mjs 数行)
- 所要目安: 25〜40分(うち Overpass 待ちが最大10分)
