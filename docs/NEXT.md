# NEXT: R51 カードのリンクチップの並び順とラベルを決める

**選んだ理由**: R51 は最新スクリーンショット2枚で「4個+YouTube 1個だけ2行目」の折り返しが実際に確認でき、外部API 0回・fixture のみで3案を撮り比べできる純粋な表示タスクだから(R14/R19/R40 は Overpass を叩く必要があり、R52〜R55 は文書・計測で視覚的成果が小さい)。

難易度: **sonnet** / 所要目安: **10〜15分**

---

## 背景(事実確認済み)

- 現状のチップ順は `Googleマップ / 公式 / Instagram / TikTok / YouTube` の固定順。
- `screenshots/2026-09-16T00-43-09_..._fixture_kusats_mobile.png`(および `...00-43-05_...`)の1位カード「光泉寺」で、**1行目に4個・2行目に YouTube 1個だけ**落ちている。見た目として収まりが悪い。
- R38 で Googleマップのリンク先は既に「宿→スポットの経路(`maps/dir/?api=1&origin=...&destination=...`)」に変わっている。**ラベルだけが「Googleマップ」のまま**で、リンク先の意味と表示文字列がずれている。
- 「Googleマップ」は8文字、「行き方」は3文字。**ラベル短縮でチップ幅が大きく縮むので、5個が1行に収まる可能性がある**(これが本タスクの主眼)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — **主対象**
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` — R51 を `[x] 2026-09-16` に
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` — 3行 + 採否理由
- (必要なら)`C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` — 折り返し調整が必要になった場合のみ。原則さわらない

## 実装箇所(実物を読んで確認済み)

`assets/app.js` の **`function linkRowHtml(card)`(738行目〜758行目)** がチップ列を組み立てている唯一の場所。

```
738  function linkRowHtml(card) {
741    var gmap = safeUrl(links.gmap);
742    if (gmap) rows.push({ url: gmap, label: 'Googleマップ' });   ← ここが3案の分岐点
743    var official = safeUrl(links.official);
745    if (official) rows.push({ url: official, label: '公式' });
747    if (ig) rows.push({ url: ig, label: 'Instagram' });
749    if (tt) rows.push({ url: tt, label: 'TikTok' });
751    if (yt) rows.push({ url: yt, label: 'YouTube' });
754    return '<div class="feedcard__links">' + rows.map(...)
```

`rows.push` の順序がそのまま DOM 順=表示順。**push の順番と label 文字列を変えるだけ**で3案とも実現でき、他の関数に触れる必要はない。

## 実装方針: 3案を mobile で撮り比べて採否を決める

| 案 | 内容 | 期待 |
|---|---|---|
| **A(現状維持)** | `Googleマップ / 公式 / Instagram / TikTok / YouTube` | 比較のベースライン |
| **B(ラベル短縮)** | 742行の label を `'Googleマップ'` → **`'行き方'`** に変更。順序は現状のまま | 8文字→3文字でチップが縮み、5個が1行に収まるかを見る。R38 の経路リンク化とラベルの意味も一致する |
| **C(順序変更)** | 案B に加えて `公式` を先頭へ(`公式 → 行き方 → SNS3種`) | 公式サイトがあるスポットでは公式が最有用、という ROADMAP 本文の仮説の検証 |

**判断の優先順位**: (1) 5個が1行に収まる/2行目の孤立が解消されるか (2) 「行き方」がリンク先(経路案内)の意味と合っているか (3) タップ領域44pxが保たれるか。

**推奨は案B**。理由は、R38 で実装済みの経路リンクとラベルの意味が揃い、かつ折り返しの改善が同時に得られるため。ただし**撮影して実際に1行に収まらなければ案A維持でよい**(その場合も「行き方」への改名だけは意味の整合として採用する価値があるので、NIGHTLOG に理由を書いて判断すること)。案Cは「Googleマップ(行き方)を先頭のまま維持」という司令塔の方針とぶつかるので、**Bで折り返しが解決しないときの次善策**として扱う。

### 必ず守ること(壊れやすい箇所)

- **SNS3種のラベル文字列(`Instagram` / `TikTok` / `YouTube`)は絶対に変えない**。`scripts/check-passive.mjs:94` が `locator('a.feedcard__link', { hasText: 'Instagram' })` でラベル文字列に依存しており、変えるとテストが落ちる。
- チップの見た目(`.feedcard__link` のCSS)・リンク先URL・`::after` によるタップ領域44pxの仕組み(R13で導入)は変更しない。
- `card.links` を組み立てている側(engine.js)は触らない。**ラベルと push 順だけ**の変更に留める。

## 完了条件(すべて検証可能であること)

1. `node scripts/check-a11y.mjs` が**全件OK・exit 0**(リンクチップのタップ領域44pxが維持されている)。
2. `node scripts/check-all.mjs` が**18本中18本PASS・exit 0**。
3. **3案それぞれの mobile 撮影が `screenshots/` に残っている**(`?fixture=kusatsu` の1位カード「光泉寺」がチップ5個すべて持つので比較に最適)。ファイル名かNIGHTLOGで、どの画像がどの案かが分かること。
4. 採用案の撮影で**文字崩れ・チップのはみ出し・タップ領域の重なりが無い**ことを画像をReadして目視確認済み。
5. `docs/NIGHTLOG.md` に**3案の折り返し結果(何個目が2行目に落ちたか)と、なぜその案を採ったか**が書かれている。
6. `docs/ROADMAP.md` の R51 が `[x] 2026-09-16` になっている。
7. コミット → `git push` 済み。

## 検証手順

```
cd C:\workspace\claude\旅行先用サイト\yadotabi
node --check assets/app.js
# 3案それぞれで撮影(案を1つずつ app.js に当てては撮る)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/index.html?fixture=kusatsu" --mobile
# → 撮れた画像を Read で開いて1位カードのチップ行を目視(何行に分かれたか)
node scripts/check-a11y.mjs
node scripts/check-all.mjs
node scripts/dump-rank.mjs kusatsu   # 必要なら順位不変の確認(表示のみの変更なので変わらないはず)
```

デグレ確認として `?fixture=hakone` と `?fixture=kusatsu&embed=1` も1枚ずつ mobile 撮影し、埋め込み幅でもチップが崩れないことを見ること(埋め込みは幅が狭いので折り返しが増えやすい)。

## 変更禁止範囲

- `assets/engine.js`(rank の重み・閾値・除外ルール・リンク生成ロジック)
- `assets/geo.js`
- `fixtures/*.json`(再生成しない。Overpass を叩かない)
- `scripts/check-*.mjs` の既存検査の中身(今回は新規検査の追加も不要)
- SNS3種のラベル文字列(上記のとおり check-passive.mjs が依存)

## やらないこと

- チップのアイコン化・色分け・並べ替えアニメーション(スコープ外)
- 公式サイトが無いスポットでの代替リンク追加
- R54(「宿から◯km」表記)との同時実施。1サイクル=1タスク
