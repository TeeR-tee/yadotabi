# NEXT — R76+R19 far の実測表を作り、30km境界集中の構造を数字で示す

**判断理由**: 残候補(R14/R19/R64/R72/R75〜R78)のうち、R76 は「文書のみ・外部API0回・4 fixture が全部揃った今だからできる」かつ R19 の判断材料そのものなので、2件まとめて1サイクルで閉じるのが最も効率がよい(R64 は無料枠の確認でユーザー判断が要り、R14 は fixture 再生成で Overpass を叩くリスクがある)。

---

## ゴール

1. 4エリア(kusatsu / hakone / dogo / beppu)の far を `dump-rank` で実測し、1つの表にまとめる(R76)。
2. 「far は収集半径の関数でしかない」仮説が4エリアで成り立つかを数字で判定し、R19 の是正案を研究ノートに書く(R19 の**調査完了**まで。rank も far 判定の**閾値変更も今回はしない**)。
3. コード変更は **`FAR_DRIVE_MIN` の意味づけコメント整理 + README 注記のみ**に留める。

## なぜ「境界集中」が起きるのか(計画役の事前調査・実物の行番号つき)

- `assets/engine.js:33` `var FAR_DRIVE_MIN = 60;`(車60分超が far)
- `assets/engine.js:26` `var DRIVE_M_PER_MIN = 500;`(車は直線500m/分)
- したがって **far の実効距離しきい値 = 60 × 500 = 30,000m ちょうど**。
- `assets/engine.js:944-959` `present()` が `card.driveMin > FAR_DRIVE_MIN` で `far.push()`、`far.slice(0, MAX_FAR)`(`MAX_FAR = 10`、engine.js:31)。
- 一方 `scripts/make-fixture.mjs:18-23` の `AREAS` は
  - kusatsu / dogo / beppu = `osmRadiusM` 未指定 → `scripts/make-fixture.mjs:37` の既定 **15000**
  - hakone のみ **30000** を個別指定
- **つまり far しきい値(30,000m)は hakone の収集半径と完全に一致し、他3エリアの収集半径の2倍**。よって
  - 15km エリアでは far は**構造上必ず0件**(30km 超の候補がそもそも fixture に入っていない)
  - hakone だけ far が出るが、出るのは **30,000m〜30,000m+α の極薄い殻の中の候補だけ**なので境界に張り付く
- これが R19 の言う「far が30km境界付近に不自然に固まっている」の正体。**バグではなく定数の噛み合わせ**である点を、推測でなく実測値で示すのが今回の成果。

## 対象ファイル(絶対パス)

編集する:
- `C:\workspace\claude\旅行先用サイト\計画書一式\09_研究ノート_認知外を提案するアルゴリズム.md`(末尾「6. 実験ログ」に `### 2026-09-16 R76+R19 far の4エリア実測` を追記。`## 7. 未解決の問い` の**前**に入れること)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md`(「対象エリア表」の直後に far 実測表を追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(開発者向け節に「far の閾値は 60分×500m/分＝30km で、収集半径と独立に決まっている」旨の注記2〜3行)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(**26〜33行目のコメントのみ**。`FAR_DRIVE_MIN` の直上に「実効距離 = FAR_DRIVE_MIN × DRIVE_M_PER_MIN = 30km。make-fixture の osmRadiusM と噛み合っていない点は docs/FIXTURES.md 参照」を1〜2行。**値は変更しない**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R76 と R19 を `[x] 2026-09-16` に。R19 は「調査完了・閾値変更は見送り」と理由を本文に追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行)

読むだけ:
- `assets/engine.js:26-33`(定数)、`assets/engine.js:930-961`(`present()`)
- `scripts/make-fixture.mjs:18-40`(`AREAS` と `OSM_RADIUS_M`)
- `scripts/dump-rank.mjs:100-160`(far 表の出し方)

## 実装方針(手順)

1. 4エリアぶん実測する。**1本ずつ直列で**(dump-rank は自前でポート3000にサーバを立てるため同時実行不可):
   ```
   node scripts/dump-rank.mjs kusatsu > %TEMP%\far_kusatsu.md
   node scripts/dump-rank.mjs hakone  > %TEMP%\far_hakone.md
   node scripts/dump-rank.mjs dogo    > %TEMP%\far_dogo.md
   node scripts/dump-rank.mjs beppu   > %TEMP%\far_beppu.md
   ```
   外部APIは0回(全て fixture 経由)。出力先はスクラッチパッドでよい(リポジトリに生ログを足さない)。
2. 各エリアの far 節から **件数 / 最短距離 / 最遠距離 / 距離の分布**を読み取る。`far` 表の距離列をそのまま使う。
3. 次の5列の表を作る:

   | area | osmRadiusM | far件数 | far最短 | far最遠 |
   |---|---|---|---|---|

   これに **cards 最遠**も1列足すと「30km の壁」が一目で分かるので推奨(dump-rank の cards 表の最下行から取る)。
4. 表から仮説を判定して1行で書く。想定される結論は「**far の件数はランキングの性質ではなく `osmRadiusM` と `FAR_DRIVE_MIN×DRIVE_M_PER_MIN` の大小関係だけで決まる**」。**実測が想定と違ったらそのまま事実を書くこと**(数字を結論に合わせない)。
5. R19 の是正案を研究ノートに**案として**書く(実装はしない)。最低3案を並べ、それぞれの副作用も書く:
   - 案A: `FAR_DRIVE_MIN` を収集半径の80%相当に下げる(15km エリアなら 24分)→ far が出るようになるが cards が痩せる
   - 案B: fixture の `osmRadiusM` を4エリアとも 30000 に揃える → hakone と同条件になるが hakone.json が 900KB なので他3つも肥大(R14 と衝突)
   - 案C: far の定義を「距離の絶対値」ではなく「そのエリアの候補距離分布の上位X%」に変える → 土地によらず必ず far が出るが、実装が rank 側に踏み込む
   - 各案に「今回採らない理由」を必ず添える。**どれを採るかはみのるんの判断**なので NIGHTLOG の「朝の相談」にも1件起票する。
6. `assets/engine.js` はコメント追記のみ。**`FAR_DRIVE_MIN` / `DRIVE_M_PER_MIN` / `MAX_FAR` の値は変えない**。
7. `node --check assets/engine.js` → `node scripts/check-all.mjs`(25本・約4分)→ コミット → push。

## 完了条件(検証可能)

- [ ] 4エリアの far を実測した数字が、`docs/FIXTURES.md` と研究ノートの両方に同じ値で載っている(片方だけは不可)
- [ ] 表に `osmRadiusM` 列があり、hakone=30000 / 他3つ=15000 と far 件数の対応が読み取れる
- [ ] 「far の実効距離 = 60分 × 500m/分 = 30km」の算出根拠が、`engine.js` の行番号つきで研究ノートに書いてある
- [ ] R19 の是正案が3案以上・各案の副作用つきで書かれ、「今回は実装しない」と明記されている
- [ ] `git diff` で `assets/engine.js` の変更が**コメント行のみ**であること(`git diff assets/engine.js` を目視。`FAR_DRIVE_MIN` の値に差分が出ていたらやり直し)
- [ ] `git diff --stat -- fixtures scripts assets/app.js assets/geo.js style.css` が**空**
- [ ] `node scripts/check-all.mjs` が 25本全PASS・exit 0
- [ ] `?fixture=kusatsu` と `?fixture=hakone&demo=far` を mobile で撮影し Read で目視、デグレなし(コメント追記だけなので変化が無いことの確認)

## 検証手順

```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node --check assets/engine.js
git diff assets/engine.js
git diff --stat -- fixtures scripts assets/app.js assets/geo.js
node scripts/check-all.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone&demo=far" --mobile
```
撮影した2枚は必ず Read で開いて目視すること(撮っただけの報告は不可)。

## 変更禁止範囲

- `rank()` の重み・閾値・カテゴリ多様性減点(`assets/engine.js`)
- `FAR_DRIVE_MIN` / `DRIVE_M_PER_MIN` / `MAX_FAR` / `MAX_CARDS` の**値**
- `fixtures/*.json`(再生成しない。Overpass を1回も叩かない)
- `scripts/make-fixture.mjs` の `AREAS`(半径を変えない)
- `scripts/check-*.mjs` の既存本体
- git stash / reset --hard / checkout でのファイル復元

## 難易度・所要目安

- 難易度: **sonnet**(調査と文書化が主。判断の分かれ目は NEXT.md で潰してある)
- 所要目安: dump-rank 4本で約5分 + 表作成と文書化15分 + check-all 4分 + 撮影目視5分 = **約30分**
