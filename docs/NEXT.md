# NEXT: R87 状態Bのスケルトン(読み込み中の骨組み)の見た目確認

- **タスクID**: R87
- **難易度**: sonnet
- **所要目安**: 25〜40分
- **前提**: 外部API 0回。fixture のみ。

## なぜ R86 ではなく R87 なのか(計画役の実測)

ROADMAP の推奨は R86(「もっと見る」押下時のスクロール位置飛び)だったが、**計画役が Playwright で実測した結果 R86 の前提が誤りだったため今回は選ばない**。

実測(`?fixture=kusatsu`、ローカルサーバ、`#more-btn` を `scrollIntoView({block:'center'})` してから click):

| 幅 | 押す前 scrollY | 押した後 scrollY | 差 | カード枚数 |
|---|---|---|---|---|
| mobile 375x812 | 11213 | 11213 | **0px** | 30 → 60 |
| desktop 1280x900 | 13936 | 13936 | **0px** | 30 → 60 |

押下前に画面内に見えていたカード番号は `["29","30"]`、押下後は `["29","30","31"]` で、**31番が押したボタンのあった位置にそのまま現れる**。先頭へ飛んでいない。

理由も実測で判明した。ROADMAP は「`renderFeed()` が `els.feedList.innerHTML` を丸ごと書き換えるから飛ぶ」と書いているが、
- `assets/app.js:1057` の `els.feedList.innerHTML = html;` は**追記される 31〜60 枚目より上(既存30枚)の高さを変えない**ため、上のコンテンツの総高さが不変 = スクロール位置がずれない。
- 「もっと見る」ボタンは `feedList` の中ではなく**別コンテナ `#feed-more`**(`assets/app.js:1062-1066`)にあり、ハンドラ(`assets/app.js:1851-1858`)も `renderFeed()` を呼ぶだけでスクロール操作を一切しない。
- `window.scrollTo(0,0)` は `assets/app.js:1311`(状態A→Bの遷移時)にしか無く、「もっと見る」経路では走らない。

よって R86 は**実装不要**。作業役は R86 を「調査の結果ズレないことを実測で確認したので対処不要」として ROADMAP に記録すること(下の完了条件参照)。

## 目的(R87)

`renderFeed()` の読み込み中分岐で実カードの後ろに積まれるスケルトン(骨組み)を**まだ一度も撮影していない**ので、実際に目で見て崩れが無いかを確認する。崩れていれば style.css のみで直し、問題なければ「確認した」事実を NIGHTLOG に残して閉じる。

## 実測で判明した前提

- `skeletonHtml()` は `assets/app.js:760-772`。`SKELETON_COUNT = 4`(`assets/app.js:59`)枚を出す。1枚は `.feedcard--skeleton` の中に `.feedcard__media.skel` 1つ + `.skel--line.skel--w70` / `.skel--line.skel--w40` / `.skel--line` の3本。
- 積む箇所は `assets/app.js:1054` の `if (loading) html += skeletonHtml();`。`loading` は `assets/app.js:1037` で `stage` が `loading|osm|wiki` のとき真。
- 「もっと見る」は読み込み中は出さない(`assets/app.js:1062` の `loading ? '' : moreHtml(...)`)ので、スケルトンと同時には出ない。
- CSS は `assets/style.css:526-546`。`.skel` に `animation: skel-shimmer 1.4s ease infinite`(:531-533)、`.feedcard--skeleton .feedcard__media` は `aspect-ratio: 16 / 9`(:535)、`.skel--line` は `height:14px`(:536)、`.skel--w70` は `height:18px`(:537)。
- **`prefers-reduced-motion: reduce` でシマーを止める指定は既に `assets/style.css:544-546` に `.skel { animation: none; }` として存在する**(ROADMAP の項目(c)は既存実装の確認になる見込み。未確認: 実際に効いているかは撮影で見ること)。
- 遅延注入は `?slow=osm800,wiki1500`。読み取りは `assets/app.js:1354-1360`(`slowDelaysFromUrl`)→ `assets/app.js:1448-1449` で `YadoGeo.setSlowDelays()`、注入は `assets/geo.js:1278` 付近。fixture と併用できる(R15 で実装済み)。
- 実カードの高さは写真ありカードで概ね一定だが、**写真なしカード(kusatsu にも一定数ある)は `.feedcard__media` が絵文字プレースホルダになる**ため、スケルトンの 16/9 メディアと高さが揃うとは限らない。未確認: 実際の差分px は撮影で測ること。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(崩れていた場合のみ変更)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`

## 実装方針

1. まず**撮影して目視**。コードは見てから変える。変更ゼロで閉じる結末も正解。
2. 見るべき点:
   - (a) 骨組み1枚の高さが実カード1枚と大きく違って、Wikipedia 到着時に画面がガタッと飛ばないか。`.feedcard--skeleton` の実高さと直前の実カードの実高さを `getBoundingClientRect().height` で数値でも取り、NIGHTLOG に両方の px を書く。
   - (b) 骨組みと実カードの境目が分かるか(骨組みが実カードに見えて「壊れた要約」と誤解されないか)。
   - (c) `prefers-reduced-motion: reduce` でシマーが止まるか。Playwright なら `browser.newContext({ reducedMotion: 'reduce' })`、撮影スクリプトで指定できなければ DevTools 相当が使えないので、`getComputedStyle(el).animationName` が `none` になることを一時スクリプトで数値確認してよい(その場合も通常撮影1枚は撮る)。
3. 直す場合の許容範囲は **`assets/style.css:526-546` のブロック内の数値(height / aspect-ratio / margin)だけ**。`skeletonHtml()` の DOM 構造・`SKELETON_COUNT`・`renderFeed()` のロジックは変えない(ロジック無変更が ROADMAP の条件)。
4. `.skel` の `animation: none;`(:545)は削除・変更しない。

## 完了条件

- `?fixture=kusatsu&slow=osm800,wiki1500` の mobile / desktop でスケルトンが写った撮影が `screenshots/` に残っている(最低2枚)。
- 上記 (a)(b)(c) の3点について、**実測値または目視の結論**が NIGHTLOG に書かれている(「問題なし」だけでなく骨組みと実カードの高さ px を必ず併記)。
- 崩れていた場合は style.css のみで修正し、修正後の撮影も残す。崩れていなければ style.css は無変更で `git diff --stat -- assets` が空。
- **`node scripts/check-all.mjs` が 27本全緑**(必須)。
- ついでに R86 を「実測により対処不要」として ROADMAP に記録する(この NEXT.md の実測表を1〜2行に要約して ROADMAP の R86 本文末尾に追記し、`[x] 2026-09-16` にする)。コードは書かない。

## 検証手順

```
# 撮影(外部API 0回)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&slow=osm800,wiki1500" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu&slow=osm800,wiki1500"
# デグレ確認(スケルトンが消えた通常状態)
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile

node --check assets/app.js
node scripts/check-all.mjs      # 27本全緑が必須
```

- ローカルサーバは `start-server.bat`、またはプロジェクト直下で `python -m http.server 3000`。
- 撮影タイミングがシビア(osm800ms / wiki1500ms の間しかスケルトンが出ない)なので、捕まえられないときは `?slow=osm3000,wiki6000` のように遅延を伸ばしてよい(パラメータの値を変えるだけで実装は変えない)。
- 撮影した画像は必ず Read で開いて目視する。数値だけで済ませない。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は変更不可。
- rank の重み・閾値は変更不可。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止。
- 外部API 0回(Overpass / Wikipedia を叩かない。fixture のみ)。
- 既存 `scripts/check-*.mjs` の検査内容を減らさない。

## 終わったら

1. `docs/ROADMAP.md` の R87 を `[x] 2026-09-16` に(R86 も上記のとおり `[x] 2026-09-16` + 実測要約を追記)。
2. `docs/NIGHTLOG.md` のサイクル記録に3行(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
