# NEXT: R56 リンクチップの見た目調整(5個を1行に収める)

## 選定理由(1行)
前サイクル R51 の申し送り「ラベル短縮・順序変更では折り返しが解消せず、チップの合計幅が主因」を受け、幅そのものを詰める唯一残った手段(padding/font-size)を撮り比べで決着させるため。

## 目的
mobile 375px で 5個のリンクチップ(行き方 / 公式 / Instagram / TikTok / YouTube)が **1行**に収まること。
現状は `?fixture=kusatsu` 1位「光泉寺」が 4個+YouTube 1個で2行になり、カード下端に間延びした余白ができている。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` ← **今回の主対象。原則ここだけ**
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(R56 を `[x] 2026-09-16` に)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行追記)

## 現状の実測値(計画役が確認済み。これを出発点にすること)
- `assets/style.css:424` `.feedcard__links { display:flex; flex-wrap:wrap; gap:10px 8px; margin-top:var(--sp-1); }`
- `assets/style.css:430` `.feedcard__link { position:relative; padding:5px 10px; border:1px solid var(--c-border); border-radius:var(--r-full); font-size:var(--fs-xs); font-weight:600; color:var(--c-text-sub); text-decoration:none; }`
- `assets/style.css:441` `.feedcard__link::after { ... height:44px; }` ← **R13 のタップ領域44px。絶対に維持**
- `assets/tokens.css:44` `--fs-xs: 0.75rem;`(=12px)。**トークンは触らない**(他所に波及するため、`.feedcard__link` 側で直接 px 指定する)
- ラベル生成は `assets/app.js:738` `linkRowHtml(card)`(747〜751行が Instagram / TikTok / YouTube)。**今回 app.js は編集しない**
- 幅の予算: 375px − `.feedcard__body` の左右 padding(`var(--sp-4)` ×2)− カード外側余白。実測は Playwright で `.feedcard__links` の clientWidth を取って NIGHTLOG に残すこと。

## 実装方針(3案を撮り比べてから1案を採用)
`.feedcard__link` に対してのみ変更する。SNS のラベル文字列は**変更禁止**(`scripts/check-passive.mjs:94` が `hasText: 'Instagram'` に依存)。

- **案A(padding のみ)**: `padding: 5px 10px` → `padding: 4px 8px`、`gap: 10px 8px` → `10px 6px`。
- **案B(padding + font-size)**: 案A に加えて `font-size: 11px`(トークンではなく直書き)。
- **案C(最小手)**: `gap` の横だけ `8px → 5px` と `padding` の左右だけ `10px → 8px`(font-size と縦 padding は不変)。

いずれも `::after { height: 44px }` は**そのまま残す**(見た目が縮んでもタップ判定は44pxを維持できるのがこの方式の利点)。
3案を `?fixture=kusatsu` mobile で撮影し、1行に収まる中で**最も文字が大きい案**を採用する。全案とも収まらなかった場合のみ、案Bをさらに `padding:3px 7px` まで詰めて再撮影し、それでも駄目なら「不採用・理由を NIGHTLOG に記録して ROADMAP の R56 を未完のまま残す」こと(無理な縮小はしない)。

## 完了条件(検証可能)
1. **375px で `.feedcard__link` が1行**: Playwright で 1位カードの全 `.feedcard__link` の `offsetTop` を取り、**全て同値**であること(5個のカードで確認。kusatsu 1位「光泉寺」は公式ありで5個)。数値を NIGHTLOG に書く。
2. `node scripts/check-a11y.mjs` が全件 OK(リンクチップの判定領域が 44px のまま)。
3. `node scripts/check-all.mjs` が **18本すべて PASS・exit 0**。
4. 長い名前・チップ4個のカード(hakone 1位「早雲寺」= 公式なし4個)でも崩れていないこと。

## 検証手順
1. `node scripts/check-all.mjs`(変更前の基準を取る)
2. 案A/B/C を順に当てて `?fixture=kusatsu` mobile を3枚撮影 → **Read で目視**して1行化を確認
3. 採用案を確定したら `?fixture=kusatsu` / `?fixture=hakone` / `?fixture=dogo` の mobile 3枚 + `?fixture=kusatsu&embed=1` mobile 1枚を撮影して Read で目視(文字の潰れ・チップ同士の接触・はみ出し・コンソールエラー0件)
4. `node scripts/check-a11y.mjs` → `node scripts/check-all.mjs` の順で実行
5. 撮り比べ3案の結果(どの案が何行になったか)を NIGHTLOG に表か箇条書きで残す ← **次サイクルへの申し送りとして必須**

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js`(rank・重み・閾値・収集ロジック)
- `fixtures/*.json`(再生成しない。Overpass を叩かない)
- **SNS チップのラベル文字列**(`Instagram` / `TikTok` / `YouTube` / `行き方` / `公式`)と `assets/app.js:738 linkRowHtml()` の構造・並び順
- `assets/tokens.css` の `--fs-xs` など共通トークン
- `.feedcard__link::after { height: 44px }`
- `scripts/check-*.mjs` の既存本体(検査の中身は書き換えない)
- git stash / reset --hard / checkout でのファイル復元

## 難易度・所要目安
sonnet / 20〜30分(CSS 3行の変更 + 撮影7枚 + check-all 約1分)

## 仕上げ
実装が終わったら**まず先にコミット**(1行の日本語メッセージ)して push。報告は簡潔に(長文の報告書を書かない)。
