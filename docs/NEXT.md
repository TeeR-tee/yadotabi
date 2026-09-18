# NEXT — R140 情報ゼロ35枚の「同じ絵文字をもう一度言うだけ」の64px帯を畳む

- タスクID: **R140**
- 難易度: 小〜中(CSS 2ブロック + app.js の分岐1〜2行)
- 所要目安: 40〜60分(実装15分 + 4エリア実測と撮影25分 + check-all 29本 約5分)

## 目的

R139 で「情報が何も無い35枚」の `.feedcard__media` を 196px → 64px に詰めた。面積は減ったが、**その64pxが出しているものは、すぐ40px下のカテゴリ行とまったく同じ絵文字1個だけ**であることが今回の本番実測で判明した。帯を残す理由は番号バッジの置き場だけなので、**バッジを body 側へ移して帯そのものを畳む**。

## 実測で判明した前提(計画役が本番 https://teer-tee.github.io/yadotabi/ で測定・2026-09-18)

Playwright / mobile 375x812 / isMobile+hasTouch / `?fixture=<4エリア>`:

| エリア | 全カード | bare | 絵文字が重複 | 帯の高さ | bareカード高さ | 非bareカード高さ | scrollHeight |
|---|---|---|---|---|---|---|---|
| kusatsu | 30 | 6 | **6/6** | 64px | 238px | 371/401/407/437px | 11706px |
| hakone | 30 | 10 | **10/10** | 64px | 238px | (同上の範囲) | 11067px |
| dogo | 30 | 11 | **11/11** | 64px | 238px | 371/401/407/437px | 10847px |
| beppu | 30 | 8 | **8/8** | 64px | 238px | 371/407/437/460px | 11514px |
| **合計** | 120 | **35** | **35/35 (100%)** | — | — | — | — |

- 重複の判定方法: `.feedcard__ph` の `textContent` と `.feedcard__meta` の `textContent` の先頭を突き合わせ、**35枚すべてで `meta.startsWith(ph)` が true**(誤差0件)。
- 実例(全て実測): dogo #16 商店街 → 帯 `📷` / カテゴリ行 `📷 観光名所`。dogo #30 御幸寺山 → 帯 `⛰` / カテゴリ行 `⛰ 山`。beppu 野口児童公園 → 帯 `🌳` / `🌳 公園`。beppu 水害碑 → 帯 `🗿` / `🗿 記念碑`。beppu ワンダーラクテンチ動物園 → 帯 `🦁` / `🦁 動物園`。
- 35枚の要約欄は**全件が同一の1文**(`Wikipediaに記事がありません。地図の情報だけで表示しています。`)、リンクチップは全件4本。つまり帯以外に減らせる要素は無い。
- 帯が残す価値のある唯一の中身は `.feedcard__no`(番号バッジ)。実測で **全カード min-width 24px / height 24px**、タップ領域は `.feedcard__no::after` の 44x44px で担保されている(`assets/style.css:462-470`)。
- 35枚 × 64px = **2240px** が現状「同じ字を2回言うため」に使われている。

### 本番(実データ)でも R136/R137/R139 が正しく効いていることを確認済み

`?hotel=35.6262,134.8055,城崎温泉ごと地湯`(fixture の無いエリア・実API)で mobile 実測:
- 営業時間行: 5枚(城崎美術館 `⏰ 月〜日 9:00-16:30`、鴻の湯 `⏰ 7:00-23:00 ほか`、城崎マリンワールド、御所の湯 `⏰ 金〜水 7:00-23:00`、まんだら湯 `⏰ 木〜火 15:00-23:00`)
- 公式ドメイン行: 4枚(`kinosaki-onsenji.jp` 2枚、`marineworld.hiyoriyama.co.jp`、`genbudo-park.jp`)
- bare(64px帯): 19枚 / 非bare の `.feedcard__media` は全件196px / コンソールエラー **0件**
- 撮影: `screenshots/planner-r140-prod-kinosaki_mobile.png`(1枚目)、`screenshots/planner-r140-prod-kinosaki-scroll_mobile.png`(#4〜#6。同じ絵文字が縦に2つ並ぶのが見える)
- `node docs/check.mjs` = **29件 全OK / 総計3732ms / 平均129ms / 合計1482.6KB**(本番の健全性に問題なし)

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(`cardHtml()` 1023行付近の `isBare`、1025-1028行の `<article>` 組み立て)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(438-444行の `.feedcard--bare` 2ブロック、446-470行の `.feedcard__no` は参考)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`((r140) 節の追加のみ。既存ケースは1つも削除しない)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(完了記録)

## 実装方針

1. `cardHtml()` の `isBare` 判定は**そのまま使う**(R139 の条件を変えない)。
2. `isBare` が真のときだけ、`.feedcard__media` の中身から `.feedcard__ph`(絵文字)を出さず、**番号バッジを `.feedcard__body` の左上に絶対配置する**。実装の形は2案あり、**作業役が実測で選んで理由を NIGHTLOG に1行書く**:
   - 案1: `isBare` のとき `<div class="feedcard__media">` ごと出さず、バッジを `.feedcard__body` の先頭に入れる(`.feedcard--bare .feedcard__body { position:relative; padding-top: … }` で名前行とバッジがぶつからないよう詰める)。
   - 案2: `.feedcard--bare .feedcard__media { height:0; overflow:visible }` にして帯を潰し、バッジだけ既存の絶対配置のまま body の上に重ねる。
   - どちらでも **DOM 上のバッジの `data-no` / `aria-label` / クラス名は変えない**(番号ピン連動 `check-pinflash.mjs` と `check-a11y.mjs` が依存しているため)。
3. CSS の追加セレクタは **`.feedcard--bare` 配下に限る**。`.feedcard__media` / `.feedcard__ph` / `.feedcard__no` の素のセレクタは1文字も触らない(85枚が動く)。
4. `?embed=1` でも同じ挙動になること(専用の分岐は書かない)。
5. `@media print`(`style.css:852`)と `.feedcard--skeleton`(`:587`)は `.feedcard--bare` と無関係なので触らない。壊していないことを撮影で確認する。

## 却下した案とその理由

- **帯に距離や徒歩分数を出す**: すでに `.feedcard__meta` に `🚶徒歩2分 · 🚗車1分 · 94m` が出ており、今と同じ重複を作り直すだけ。
- **帯の背景色だけ変える / 絵文字を小さくする**: 面積は1pxも減らず、重複も残る。
- **bare カードを候補から外す**: R139 で既に却下済み(湯畑・グローバルタワー・道後ハイカラ通りなど、データが薄いだけの一級の行き先が35枚に多数)。rank も触らない。
- **番号バッジを消す**: 地図のピンとの対応が切れる。R139 でも「絶対に消さない」と決めている。
- **カテゴリ行の絵文字のほうを消す**: カテゴリ行は85枚と共通の要素なので、消すと写真ありカードまで変わる(本タスクの「85枚無改変」に反する)。

## 完了条件

1. 4エリア(kusatsu/hakone/dogo/beppu)で bare **35枚**のカード高さが **238px から下がる**(目標 180px 前後。作業役が実測値を NIGHTLOG に書く)。
2. 非 bare **85枚**の `.feedcard__media` 高さ・カード高さが**変更前と完全一致**する(196px / 371・401・407・437・460px)。
3. `.feedcard__no` が **全120枚**で可視かつ `::after` のタップ領域 44x44px を保つ(`check-a11y.mjs` 継続全OK)。
4. mobile 375x812 の1画面に入る bare カードが **3枚 → 4枚以上**になる(撮影2枚を並べて確認)。
5. `?fixture=kusatsu&embed=1` でも同じこと。
6. `scripts/check-nosummary.mjs` に **(r140) 節**を追加(例: 「bare カードに `.feedcard__ph` が存在しないこと」「非 bare の `.feedcard__ph` はこれまで通り存在し44pxのままであること」「全カードで `.feedcard__no` が1つ存在すること」)。**既存ケースの削除は0件**。
7. `node scripts/check-all.mjs` が **29本全緑(exit 0)**。

## 検証手順

1. `node --check assets/app.js`
2. 撮影(すべて `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` / PC幅は `--width 1280`):
   - `http://127.0.0.1:<port>/?fixture=dogo` **mobile 375**(bare が最多の11枚。1画面の枚数を数える)
   - `http://127.0.0.1:<port>/?fixture=beppu` **mobile 375**
   - `http://127.0.0.1:<port>/?fixture=kusatsu` **mobile 375**(写真ありカードが無改変であること)
   - `http://127.0.0.1:<port>/?fixture=hakone` **desktop 1280**
   - `http://127.0.0.1:<port>/?fixture=kusatsu&embed=1` **mobile 375**
   画像を `Read` で開いて、文字崩れ・重なり・はみ出し・番号バッジの欠けや名前行との衝突・空白の異常が無いことを**目で**確認する。
3. Playwright で4エリアの実測値(bare件数・bareカード高さ・非bareカード高さ・`.feedcard__no` の有無と `::after` サイズ)を**自分で数え直し**、上の表と突き合わせる。
4. `node scripts/check-all.mjs` → **29本全緑(exit 0)** を確認。落ちたら同サイクルで直す。

## 変更禁止範囲

- **rank の重み・閾値**(順位は1つも動かさない。表示面積だけの変更)
- **`assets/geo.js`**・**`fixtures/*.json`**(1バイトも触らない)
- **入力UIの追加禁止**(入力欄・設定・チュートリアルを増やさない)
- **外部APIの呼び出しは 0回**(Overpass / Nominatim / Wikipedia を一度も叩かない。検証は全て `?fixture=` で行う)
- **`.feedcard--bare` 以外のセレクタを CSS に書かない**(85枚を動かさないための構造的な保証)
- **`.feedcard__no` の `data-no` / `aria-label` / クラス名は変更しない**
- **本 NEXT.md の数値は計画役の実測値だが、作業役は自分で実測し直して NIGHTLOG に自分の数値を書くこと**(過去サイクルで想定と実測が1〜2枚ずれた例が2回ある)

## 終わったら

1. `docs/ROADMAP.md` の R140 行を **`- [x] 2026-09-18 R140 …`** にする。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の**末尾**に、`### 2026-09-18 R140 <一言>` の見出しを付けて **3行**(やったこと / 見た目の確認結果 / 次)を追記する。**ファイル先頭に新しい節を作らない**。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. 報告は簡潔に(長文の報告書を書かない)。
