# NEXT(次の1タスク) — R39 固定データバッジ + R28 残作業

**判断理由**: 本番URLの `?fixture=` を同僚が触ったとき「本物のAPIではない」と一目で分かる安全策で、表示のみ・ロジック無変更・撮影が固定モードだけで完結するため夜間に最も安全に回せる(R11/R14/R19/R40 は rank や fixture 再生成に触れるため夜向きではない)。

難易度: **sonnet** / 所要目安: 25〜40分(実装15分・撮影と検査20分)

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`(topbar にバッジ要素を1つ追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(`.topbar__badge` を追加。`.topbar` は 240行目〜、`.topbar__title` は 265行目〜)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(fixture 見出しと demo パース)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(バッジのケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nohotels.mjs`(**新規**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs`(13行目〜のリストに check-nohotels を追加 → 14本)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針(実物の行番号つき)

### A. R39 固定データバッジ

1. **見出しから括弧書きを外す**: `app.js:1177` 付近、fixture 読み込み成功後の `hotel` 生成で
   `name: (json.meta && json.meta.label ? json.meta.label : fixtureName) + '(固定データ)'`
   となっている。この `+ '(固定データ)'` を削り、`meta.label` をそのまま宿名にする。
   `?hotel=` 併用時は従来どおり `hotelFromUrl(params)` 側を優先(この行は通らない)。
2. **バッジ表示のフラグ**: `applyEntryPoint()` 内 `var fixtureName = fixtureNameFromUrl(params);`(`app.js:1162`)の直後ではなく、**fixture の fetch が成功して `YadoGeo.setFixture(json)` を呼べた分岐の中**でバッジを立てる(読み込み失敗時は通常動作にフォールバックするため、バッジも出してはいけない)。モジュールスコープに `var isFixtureMode = false;`(`demoImgFail` 等が並ぶ 131〜136行目の近く)を足し、成功分岐で `true` にしてから `selectHotel(hotel)` を呼ぶ。
3. **描画**: 見出しを書いている `app.js:805` の `els.feedTitle.textContent = hotel.name || '';` の直後で
   `els.feedBadge.hidden = !isFixtureMode;` とする。`els` の定義は `app.js:1477` 付近(`feedTitle: document.getElementById('feed-title')` の隣)に `feedBadge: document.getElementById('feed-badge')` を追加。
   `hidden` 属性の付け外しだけにし、`style.display` は使わない。
4. **HTML**: `index.html:53〜55` の `.topbar` 内、`<h1 class="topbar__title" id="feed-title"></h1>` の**直後**に
   `<span class="topbar__badge" id="feed-badge" hidden>固定データ</span>` を置く。
   見出しは `overflow:hidden; text-overflow:ellipsis`(style.css:265〜)なので、バッジは `.topbar` の flex 直下の兄弟にして `flex: 0 0 auto` で潰れないようにする。
5. **CSS**: `.topbar__badge` を `.topbar__title` の定義の後に追加。淡色・小さめ(例: `font-size: var(--fs-sm)` 相当、`padding: 2px 8px`、`border-radius: var(--r-full)`、`background: var(--c-surface-2)`、`color: var(--c-text-sub)` など**既存トークンのみ**を使う。新しい色は足さない)。`white-space: nowrap`。タップ対象ではないので 44px ルールの対象外(a11y 検査のセレクタには追加しない)。
6. **埋め込みモードでも出す**: `body.is-embed` は `.topbar__back` を隠すが `.topbar` 自体は残る。埋め込み用CSS(style.css 末尾の埋め込み節)でバッジを隠していないことを確認し、隠す指定を足さない。

### B. R28 残作業(`?demo=nohotels`)

1. **パース**: `app.js:1154〜1160` の demo 分岐群に `if (demo === 'nohotels') { demoStateA = true; demoNoHotels = true; }` を追加。モジュール変数 `var demoNoHotels = false;` を 131〜136行目のコメント群に1行コメント付きで追加。
2. **0件文言の再現**: `loadHotelsInView()`(`app.js:373`)の先頭にある `if (demoStateA) { ... }` 分岐(375〜381行目)の中で、`demoNoHotels` のときは
   `hotelLayer.clearLayers(); setMapNote('この範囲には宿が見つかりませんでした'); return;`
   とする(ズーム不足の分岐より先に評価する)。文言は本番経路 `app.js:396` の
   `setMapNote(hotels.length ? '' : 'この範囲には宿が見つかりませんでした')` と**完全一致**させること(コピペする)。外部APIは一切叩かない。
3. **混雑トーストとの優先順位**: 0件文言(`この範囲には…`)と混雑文言(`宿ピンの取得が混雑中です。…`)は `setMapNote` が同じ1枠を上書きする排他表示。`?demo=nohotels` と `?simulate=overpass504` を同時指定したら混雑側が勝つ(catch が後)という現状のままでよい。NIGHTLOG に1行この事実を書くだけで、コードは変えない。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**一切触らない**(rank の重み・閾値・カテゴリ多様性も同様)。
- 既存の `check-*.mjs` の**既存アサーション**は書き換えない(ケース追加のみ)。
- `?fixture=` 無しの通常動作に見た目の差分を出さない(バッジは `hidden` のまま)。

## 完了条件(検証可能)

1. `?fixture=kusatsu` で見出しが **「草津温泉」**(括弧書きなし)になり、その右に「固定データ」バッジが出る。
2. `?fixture=kusatsu&embed=1` でもバッジが出る(戻るボタンは従来どおり非表示)。
3. `?hotel=...`(fixture 無し)ではバッジが `hidden` のまま出ない。
4. `scripts/check-hotelparam.mjs` にケース追加: (a) `?fixture=kusatsu` で `#feed-badge` が可視かつ本文が「固定データ」、(b) `#feed-title` の本文に `固定データ` を**含まない**、(c) `?fixture=kusatsu&embed=1` でも可視、(d) `?hotel=` のみでは不可視。判定は `el.hidden` ではなく `offsetParent !== null` か `getComputedStyle().display` まで確認する(classList だけ見て満足しない)。
5. `scripts/check-nohotels.mjs`(新規・Playwright、`check-chipcurrent.mjs` の作りを踏襲): `?demo=nohotels` で `.mapnote` が可視かつ本文が「この範囲には宿が見つかりませんでした」と一致、宿ピンが0個、外部APIへの fetch が0回(`page.route` か `request` イベントで overpass/wikipedia ドメインへの発火が無いこと)、コンソールエラー0件。
6. `scripts/check-all.mjs` のリストに `scripts/check-nohotels.mjs` を追加し、**14本すべて PASS・exit 0**。
7. `node scripts/check-a11y.mjs` が従来どおり全OK(バッジ追加でタップ領域が壊れていない)。
8. `node --check assets/app.js` 通過。

## 検証手順(撮影・外部API 0回)

1. `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=kusatsu" --mobile`
2. `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?fixture=kusatsu&embed=1" --mobile`
3. `node C:\workspace\tools\shot\shot.mjs "http://localhost:3000/?demo=nohotels" --mobile`
4. 3枚を **Read で開いて目視**: バッジが宿名を押し出して見出しが途中で切れていないか、バッジの文字が枠からはみ出していないか、戻るボタン・宿名・バッジの3つが1行に収まっているか、`?demo=nohotels` の `.mapnote` が Leaflet の帰属表示や地図の縁と重なっていないか。崩れたら同サイクルで直す。
5. `node scripts/check-all.mjs` が緑。
6. `node scripts/dump-rank.mjs kusatsu` が**変更前と差分ゼロ**(engine/geo に触れていない証明)。

## 記録とコミット

- `docs/ROADMAP.md` の R39 と R28 を `[x] 2026-09-16` に。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)+ 混雑トーストとの優先順位の1行。
- **実装が終わったらまず先にコミット→push**。報告は簡潔に(長文の報告書を書かない)。
