# NEXT: R61 状態Aの地図初期位置を「最近見た宿」があればそこにする

**判断理由**: R40(別府 fixture)は Overpass を叩くうえ 900KB 級の JSON が増えて R14(軽量化)と衝突する。R61 は外部API 0回・localStorage だけで完結し、既存の `initialView()` に1分岐足すだけで「一度使った人が前回の続きから始まる」入力ゼロの体験改善になるため R61 を選ぶ。

**難易度**: sonnet / **所要目安**: 40〜60分(実装15分・新規check本15分・撮影と check-all 20分)

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` — 主対象
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-initpos.mjs` — 新規(機械検査)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` — 新規本の登録(22本目)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md` — 完了記録

## 現状(実物を読んだ結果)

- `app.js:20` `var DEFAULT_VIEW = { lat: 36.6226, lon: 138.5960, zoom: 14 };`(草津)
- `app.js:62` `var LS_RECENT = 'yado.recent.v3';` / `app.js:63` `var LS_MAPVIEW = 'yado.mapview.v3';`
- `app.js:322` `getRecent()` — `lsGet(LS_RECENT)` が配列ならそれを返す。要素は `app.js:329` の `pushRecent()` が作る `{ name, lat, lon, kind }`(先頭が最新)。
- `app.js:351` `initialView()` — **現在は `yado.mapview.v3` があればそれ、無ければ `DEFAULT_VIEW` の2分岐のみ**。ここが唯一の変更点。
- `app.js:359` `ensureMap()` が `initialView()` を呼び `L.map(...).setView([view.lat, view.lon], view.zoom)`(362行)。
- `app.js:1775` `init()` 内 `if (!state.embed) ensureMap();` → その後 `applyEntryPoint()`(1777行)。`?hotel=`/`?q=`/`?fixture=` は `applyEntryPoint()`(1325行)が後から `jumpTo()`(471行)や状態B遷移で上書きするので、**URL指定は自動的に優先される**(initialView 側で URL を見る必要はない)。
- `app.js:345` `saveMapView()` は `demoNoSaveView` のとき保存しない。

## 実装方針

`initialView()`(app.js:351)を次の3分岐にする。順序が仕様。

1. `yado.mapview.v3`(前回の地図位置)が有効ならそれを返す — **従来どおり最優先**。地図を自分で動かした人の意思を尊重するため。
2. mapview が無く、`getRecent()` の先頭に有効な `lat`/`lon` があれば `{ lat, lon, zoom: DEFAULT_VIEW.zoom }` を返す — **今回の追加**。ズームは既定のまま(ROADMAP 本文どおり)。
3. どちらも無ければ `DEFAULT_VIEW`。

補足:
- 有効判定は既存と揃えて `isFinite()` を使う。`getRecent()` は配列を保証しているが、要素が `null` や座標欠落の場合があるので先頭要素の存在チェックを入れる(`pushRecent` は座標を検証しているが、手で書き込まれた localStorage でも落ちないこと)。
- `ensureMap()` / `setView` の呼び方・`DEFAULT_VIEW` の値・`saveMapView()` は触らない。
- 埋め込み(`state.embed`)では `ensureMap()` 自体を呼ばないので影響なし。

### 撮影・検査用フラグ

`applyEntryPoint()`(app.js:1325 付近、`demo === 'recent'` の分岐が 1465 行にある)と同じ場所に `?demo=initpos` を追加する。
- `demoStateA = true` の対象に加える(外部API 0回・宿ピンを取りに行かない)。
- `demoNoSaveView = true` にして撮影が localStorage を汚さないようにする。
- **localStorage への投入は app.js 側では行わない**(既存の `demo=recent` が「保存された履歴を読まない」方針なのと整合させる)。テストは Playwright の `addInitScript` で `yado.recent.v3` を事前投入する。

### `scripts/check-initpos.mjs`(新規・既存 check 本に倣う)

Playwright で `?demo=initpos` を開き、最低5ケース:
1. `yado.recent.v3` に道後(33.8520, 132.7860)1件、`yado.mapview.v3` なし → 初期 center が道後(誤差 0.01 以内)・zoom が 14。
2. `yado.recent.v3` と `yado.mapview.v3` の両方あり → **mapview が勝つ**。
3. どちらも無し → `DEFAULT_VIEW`(36.6226, 138.5960)。
4. `yado.recent.v3` が `[]` / 壊れた JSON / 座標欠落要素 → `DEFAULT_VIEW` にフォールバックし例外を投げない。
5. `?q=箱根&demo=initpos`(または `?hotel=`)で recent があっても URL 指定が勝つ。
center は `YadoApp.getMap().getCenter()`(app.js:1791 で公開済み)から取る。

## 完了条件(検証可能)

- `node scripts/check-initpos.mjs` が全項目 PASS・exit 0。
- `node scripts/check-all.mjs` が 22本全 PASS・exit 0。
- `node --check assets/app.js` 通過。
- `?fixture=kusatsu` mobile の撮影でカード30枚・番号ピン判読可・コンソールエラー0件(デグレなし)。

## 検証手順(撮影+目視)

1. `node --check assets/app.js`
2. `node scripts/check-initpos.mjs` → 全PASS
3. `node scripts/check-all.mjs` → 22本全緑
4. 撮影(すべて外部API 0回):
   - `?demo=initpos`(recent を事前投入した状態での初期地図)mobile
   - `?fixture=kusatsu` mobile(デグレ確認)
   画像を Read で開き、文字崩れ・重なり・はみ出し・地図の空白がないことを目視する。
5. ROADMAP の R61 を `[x] 2026-09-16` に、NIGHTLOG に3行追記 → コミット → push。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は一切触らない。
- `DEFAULT_VIEW` の座標・ズーム値、`saveMapView()`、`jumpTo()`、`applyEntryPoint()` の既存分岐(`hotel`/`q`/`fixture`)のロジック。
- 既存 `scripts/check-*.mjs` の中身(`check-all.mjs` への1行登録のみ可)。
- rank の重み・閾値・除外ルール。
