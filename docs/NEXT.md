# NEXT: R62 縦長写真の見切れ確認と `object-position` の判断

**選定理由**: 残候補のうち R14/R19/R40 は fixture 再生成(Overpass 呼び出し)が要り、R64 は無料枠の確認というユーザー判断を含むため夜間に選べない。R61 は localStorage 依存で検査が重い。R62 は表示のみ・外部API 0回・撮影で完結し、実データにも縦長が実在する(下記の実測)ので今サイクルに最適。

**難易度**: sonnet / **所要目安**: 30〜45分

---

## 背景(計画役の実測・2026-09-16)

- `assets/style.css:383-389` の実物:
  ```css
  .feedcard__media { position: relative; width: 100%; aspect-ratio: 16 / 9; background: var(--c-surface-2); }
  .feedcard__img { width: 100%; height: 100%; object-fit: cover; display: block; }
  ```
  → `object-position` は**未指定**なので既定の `50% 50%`(中央)。16:9 の枠に縦長画像を入れると**上下が均等に切られる**ため、被写体の頭(五重塔の相輪・人物の顔・看板の上部)が枠外に落ちる。
- fixtures の実データに縦長サムネイルは存在する(`thumbnail.height > thumbnail.width` を全走査):
  | エリア | サムネ総数 | 縦長 | 横長 |
  |---|---|---|---|
  | kusatsu | 46 | **3** | 43 |
  | hakone | 39 | **1** | 38 |
  | dogo | 47 | **1** | 46 |
  → 5/132(約4%)。稀だが確実に出るので「確認して閉じる」だけでは不十分。ただし実データの縦長は上位30枚に入るとは限らないので、**確実に再現できる `?demo=portrait` を足す**のが本タスクの主眼。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-imgfail.mjs`
- (必要なら)`C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`

## 実装方針

### 1. `?demo=portrait` を足す(app.js)

R23 で入った `?demo=imgfail` と**完全に同じ形**にする。

- `app.js:146` の `var demoImgFail = false;` の直下に `var demoPortrait = false;   // ?demo=portrait … 先頭3枚を縦長ダミー画像に差し替える` を追加。
- `app.js:1323` の `if (demo === 'imgfail') demoImgFail = true;` の直下に `if (demo === 'portrait') demoPortrait = true;` を追加。
- `app.js:801` の `cardHtml(card, index)` 内、現在の
  ```js
  var imgSrc = demoImgFail && index < 3 ? './__imgfail_test__.png' : card.imageUrl;
  ```
  を、portrait を先に評価する形へ。ダミーは **data: URI の SVG**(外部リクエスト0回)で、縦長(幅400 × 高さ800 = 高さ2倍)にし、**上部に被写体に見える目印**(例: 上から 60px の位置に横線と「▲ ここが頭」等)を描いて、切れたかどうかが撮影画像で一目で分かるようにすること。
  ```js
  var imgSrc = demoImgFail && index < 3 ? './__imgfail_test__.png'
             : (demoPortrait && index < 3 ? PORTRAIT_DATA_URI : card.imageUrl);
  ```
- `PORTRAIT_DATA_URI` はモジュール先頭付近の定数として置く。`safeUrl()` が `data:image/svg+xml` を通すか**必ず先に確認**し、通さないなら safeUrl は変更せず `imgSrc` の分岐側で media の HTML を直接組む(safeUrl の許可スキームを広げると XSS 面が緩むので触らない)。

### 2. `object-position` の判断(style.css)

**撮影してから決める**。先に CSS を変えない。

- まず現状(`center`)で `?fixture=kusatsu&demo=portrait` を mobile 撮影し、目印の「頭」が切れているか目視。
- 切れていれば `assets/style.css:389` の `.feedcard__img` に `object-position: center 30%;`(上寄せ)を足し、同じ URL で再撮影して比較。`top`(=0%)まで寄せると今度は足元が全く見えなくなるので、**`center 30%` あたりから試す**。
- 横長写真が大半なので、**横長のデグレが無いことが採用の必須条件**。`?fixture=kusatsu` / `hakone` / `dogo` の mobile を変更前後で撮り比べ、1位カードの構図が悪化していないことを確認する。悪化するなら**変更せず**「現状 center のままが最善」と NIGHTLOG に理由付きで残して閉じてよい(ROADMAP の R62 本文がその判断を許している)。

### 3. 機械検査(check-imgfail.mjs に追記)

既存の `scripts/check-imgfail.mjs`(13項目)に portrait のケースを追加する。新規ファイルは作らない。

- `?fixture=kusatsu&demo=portrait` を開き、先頭3枚の `.feedcard__media img` について:
  - `naturalHeight > naturalWidth` であること(= 実際に縦長画像が入っている)
  - 表示高さ(`getBoundingClientRect().height`)が3枚とも**同値**で、`.feedcard__media` の高さと一致すること(= 16:9 の枠が縦長画像に引き伸ばされていない)
  - `getComputedStyle(img).objectFit === 'cover'` であること
  - 4枚目以降は `naturalWidth >= naturalHeight`(差し替えが先頭3枚に限定されている)
- `?demo=` 無しの `?fixture=kusatsu` で先頭3枚が縦長ダミーに**なっていない**ことも1項目足す(デグレ検査)。

## 完了条件(すべて検証可能)

1. `node --check assets/app.js` が通る。
2. `node scripts/check-imgfail.mjs` が portrait の新規項目を含めて全 PASS。
3. `node scripts/check-all.mjs` が **21本全緑・exit 0**。
4. `?fixture=kusatsu&demo=portrait` の mobile 撮影画像を Read で目視し、先頭3枚のカード画像が縦長ダミーで枠を埋めており、文字崩れ・カード高さの乱れ・番号バッジの位置ずれが無いこと。
5. `?fixture=kusatsu` / `hakone` / `dogo` の mobile 撮影でデグレなし(カード30枚・番号ピン判読可・コンソールエラー0件)。
6. `object-position` を**変えた場合も変えなかった場合も**、判断理由を NIGHTLOG に1行以上残すこと(「切れていなかったので変更せず」も立派な成果)。

## 検証手順

```
node scripts/check-all.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&demo=portrait" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=dogo" --mobile
```
撮影した画像は**必ず Read で開いて目視**する(過去に「撮ったと報告したが画像が無い」事故が2回あった)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` は**一切触らない**(rank の重み・閾値・除外ルール・収集ロジック全て)。
- `fixtures/*.json` は**再生成しない・編集しない**(Overpass を叩かない)。
- `safeUrl()` の許可スキームを広げない。
- 既存の `?demo=imgfail` の挙動を変えない(check-imgfail の既存13項目が緑のままであること)。
- 既存 `scripts/check-*.mjs` のうち check-imgfail.mjs 以外は編集しない。

## 完了後

`docs/ROADMAP.md` の R62 行を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)を追記 → コミット → `git push`。
