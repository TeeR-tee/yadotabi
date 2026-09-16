# NEXT — R95 fixture の鮮度の目安と再取得手順を docs/FIXTURES.md に明文化

- **タスクID**: R95
- **難易度**: sonnet(文書のみ・コード変更なし・外部API 0回)
- **所要目安**: 20〜30分

## 目的

4 fixture の `meta.generatedAt` は R45 でヘッダーバッジに表示されるようになったが、「**何日経ったら古いと見なすか・そのとき何をするか**」が誰にも決まっていない。将来 fixture が古くなったとき、慌てて Overpass を連打してレート事故を起こさないための運用手順を先に文書化しておく。

## 実測で判明した前提(このサイクルで確認済み)

1. **`docs/FIXTURES.md` は85行・10見出しで、「鮮度」に触れた節は1つも無い**。見出しは `目的 / 対象エリア表 / far 実測表 / 実行方法 / エリアを増やす手順 / 保存される meta / Overpass のマナー / 既存 fixture は原則再生成しない方針 / buildOverpassQuery の同期注意 / タグの軽量化`(`grep -n '^##'` で実測)。「エリアを**増やす**手順」はあるが「既存を**取り直す**手順」が無い、という非対称が本件の正体。
2. **4 fixture の `meta.generatedAt` 実測値**(`node -e` で各 JSON を読んで確認):

   | area | generatedAt (UTC) | osmRadiusM | overpass.elements 件数 |
   |---|---|---|---|
   | kusatsu | 2026-09-15T18:05:50.632Z | 15000 | 189 |
   | hakone | 2026-09-15T19:15:17.398Z | 30000 | 4186 |
   | dogo | 2026-09-15T22:10:54.623Z | 15000 | 463 |
   | beppu | 2026-09-16T03:53:36.731Z | 15000 | 667 |

   4件とも 2026-09-15〜16 の**同一日生成**で、現時点(2026-09-16)では全く古くない。よって**今回は再取得の必要が実際には無い**(= 手順だけ先に書いておく純粋な予防タスク)。
3. **`generatedAt` の生成元は `scripts/make-fixture.mjs:205`** の `generatedAt: new Date().toISOString()`。表示側は `assets/app.js:1525` が `json.meta.generatedAt` を読み、`assets/app.js:995` の `formatFixtureDate()` でローカル `YYYY-MM-DD` に変換して `app.js:151` の `fixtureGeneratedAt` に入れる。バッジ表示は撮影でも確認済み(「固定データ 2026-09-16 取得」)。
4. **keep-list は自動適用される**。`scripts/make-fixture.mjs:14` が `import { slimOverpassElements } from './slim-fixtures.mjs';` しており保存直前に通す。よって**再取得後に `slim-fixtures.mjs` を手動実行する必要は無い**(ROADMAP R95 の (d) は実測どおり正しい)。
5. `scripts/dump-rank.mjs` は `node scripts/dump-rank.mjs <area>` で、fixture 経由のみ・外部API 0回(冒頭コメント1-10行目に明記)。before/after 比較の道具として使える。
6. `scripts/` には check-*.mjs が27本存在し、`node scripts/check-all.mjs` が27本全緑なのが現在の完了条件。

**未確認**: 「OSM の観光施設が実際にどの程度の頻度で変化するか」は統計を取っていない。よって下記の「半年」は**根拠のある推定値ではなく運用上の目安**であり、その旨を文書にも正直に書くこと(このプロジェクトの正直さ方針)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md` ← **これ1本のみを編集**

## 実装方針

`docs/FIXTURES.md` の **`## 既存 fixture は原則再生成しない方針`(64行目)の直前**に、新しい節 `## 鮮度の目安と再取得の手順(R95)` を挿入する。既存の「原則再生成しない方針」節と自然につながる位置なので、64行目より後ろに置かないこと。

節に書く内容は次の4点(ROADMAP R95 の (a)〜(d) に対応):

- **(a) 判断基準**: 目安は**半年**。理由は「OSM の観光施設(神社・寺・美術館・展望台等)は年単位でしか動かず、短くしすぎると Overpass を無駄に叩くだけになる」。ただし半年は統計ではなく運用上の目安である旨を1行添える。**半年未満でも再取得してよい例外**を明記する: `assets/geo.js` の `buildOverpassQuery()` を変更したとき(fixture と本番で候補が食い違うため。既存の「`buildOverpassQuery` の同期注意」節と相互参照する)。現在の4 fixture の `generatedAt` は上表のとおり全て 2026-09-15〜16 なので、**次の見直し目安は 2027-03 頃**と具体的に書く。
- **(b) 再取得のマナー**: Overpass は**各エリア1回まで・1サイクル1エリアまで**(既存の「Overpass のマナー」節と同じ制約なので、重複して書かずにその節へのリンクで済ませる)。429/504 が出たら待たずに日を改める。半径が `FALLBACK_RADIUS_M` に落ちて成功した場合は採用しない。
- **(c) 再取得後に必須の確認**(順序つきリスト):
  1. `node scripts/dump-rank.mjs <area>` を**再取得の前後**で取り、カード枚数・上位の並びの差分を全件目視する(差分が出るのは正常。消えた観光スポットが無いかを見る)
  2. `?fixture=<area>` を mobile で撮影して目視(カード30枚・番号ピン判読可)
  3. `node scripts/check-all.mjs` が**27本全緑**
  4. 差分の要点を `docs/NIGHTLOG.md` に記録する
- **(d) keep-list は手動実行不要**: 上記の実測4のとおり `make-fixture.mjs:14` が `slim-fixtures.mjs` を import して保存直前に自動適用するため、`node scripts/slim-fixtures.mjs` を別途走らせる必要は無い(既存の「タグの軽量化」節への相互リンクを置く)。

あわせて `## 保存される meta`(53行目)の `generatedAt` の説明に、「鮮度の目安と再取得の手順」節への相対リンクを1行足す(取得日を見て古いと気づいた人が手順へ辿れるようにするため)。

**このサイクルでは Overpass を叩かない**。fixture ファイルは1バイトも変更しない。

## 完了条件

- `docs/FIXTURES.md` に `## 鮮度の目安と再取得の手順(R95)` 節が64行目より前に存在し、(a)〜(d) の4点が全て書かれている
- `## 保存される meta` から新節への相対リンクが1本ある
- `git diff --stat -- assets fixtures scripts index.html demo` が**空**(文書のみの変更であることの機械確認)
- `git status -sb` で変更が `docs/FIXTURES.md` / `docs/ROADMAP.md` / `docs/NIGHTLOG.md` の3本のみ
- `node scripts/check-all.mjs` が **27本全緑**

## 検証手順

```
cd "C:\workspace\claude\旅行先用サイト\yadotabi"

# 1) 文書のみであることの機械確認
git diff --stat -- assets fixtures scripts index.html demo   # 空であること
grep -n '^##' docs/FIXTURES.md                                # 新節の位置を確認

# 2) デグレ確認撮影(fixture のみ・外部API 0回)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile
```

- 撮影URL: `http://127.0.0.1:3000/index.html?fixture=kusatsu`、幅 **mobile(375px)1枚のみ**(画面変更が無いためデグレ確認のみ)。撮った PNG は必ず Read で開いて目視し、カード30枚・番号ピン判読可・文字崩れなし・コンソールエラー0件を確認する。
- 最後に **`node scripts/check-all.mjs` が27本全緑**(必須)。`check-nohotels.mjs` / `check-history.mjs` は過去に `ERR_NO_BUFFER_SPACE` で一過性 FAIL した前例があるので、落ちたら単体で再実行して緑なら通しでもう1度回す。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**変更不可**
- rank の重み・閾値は**変更不可**
- `git stash` / `git reset` / `git checkout` によるファイルの巻き戻しは**禁止**
- **外部API 0回**(Overpass / Wikipedia / Nominatim を一切叩かない)
- `scripts/check-*.mjs` の既存の検査内容は減らさない
- `.gitignore` は変更しない

## 終わったら

1. `docs/ROADMAP.md` の R95 の行を `- [x] 2026-09-16 R95 …` に変更
2. `docs/NIGHTLOG.md` の「## サイクル記録」に**3行**追記(やったこと / 見た目の確認結果 / 次)
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. 報告は簡潔に(長文の報告書を書かない)
