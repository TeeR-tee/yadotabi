# NEXT — R13 アクセシビリティ最低限(タップ44px / aria / フォーカス / reduced-motion)

判断理由: R2-1 は朝の相談待ち、F3/S1 は文書寄り、R10/R11/R14/R15/R16 は見た目の変化が小さいか計測が主。R13 は**撮影で目に見えて確認でき、スマホの実使用(指で押せるか)に直結する**ので最優先。

難易度: sonnet / 所要目安: 40〜60分

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` ← 主戦場(サイズ・フォーカス・reduced-motion)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js` ← aria-label / role の付与のみ(ロジック変更なし)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` ← 必要なら `lang`/landmark の補い(ほぼ不要のはず)

**変更禁止**: `assets/tokens.css`(色トークンは一切いじらない。必要なら style.css 側で上書き)、`assets/geo.js`、`assets/engine.js`、`fixtures/`、`demo/`、`scripts/`。

---

## 現状の実測値(計画役が測った。ここを直す)

タップ領域(style.css の実値):

| 対象 | セレクタ | 現在の高さ | 判定 |
|---|---|---|---|
| 戻るボタン | `.topbar__back` | `36px × 36px` 固定 | ✗ 44px 未満 |
| エリアチップ | `.chip` | `padding:6px 14px` + fs-sm(13px)×line-height ≒ **31〜32px** | ✗ |
| リンクチップ | `.feedcard__link` | `padding:5px 10px` + fs-xs(12px) ≒ **28〜29px** | ✗ |
| 検索候補の行 | `.suggest__item` | `padding:12px`(sp-3)+ icon line-height 1.4 ≒ **49px** | ○ 維持 |
| もっと遠くの開閉 | `.far__summary` | `padding:12px 16px` + 13px ≒ **46px** | ○ 維持 |
| もっと遠くの各リンク | `.far__item a` | インライン、行高 1.7×13px ≒ **22px** | ✗ |
| 地図の番号ピン | `iconSize:[24,24]`(app.js) | 24px | ✗(※下記の方針参照) |

コントラスト比(計画役が計算済み。**ほぼ問題なし**なので配色変更は不要):

- 本文 `--c-text #1a1a23` on `#ffffff` = **17.27:1** ○
- 補足 `--c-text-sub #5c5c6b` on `#ffffff` = **6.57:1** / on `--c-bg #f7f7f9` = **6.14:1** ○
- ダーク `#a2a2b0` on `#1c1c24` = **6.71:1** ○
- ピン文字 白 on primary `#5048e5` = **6.18:1** ○
- `--c-text-faint #9494a3` = **2.99:1** ✗ だが用途は placeholder と無効状態のみ(WCAG 1.4.3 の対象外)。**触らない**。
- → 結論: **コントラストは対応不要**。NIGHTLOG に「計算して全て 4.5:1 以上だった(faint はプレースホルダ専用のため対象外)」と数値付きで書けばこの項目は完了。

---

## 実装方針

### 1. タップ領域 44px(style.css のみ)

原則: **見た目の大きさは極力変えず、当たり判定だけ広げる**。カードの高さが暴れると R2 で整えた版組が崩れるため。

- `.topbar__back`: `width/height: 44px` に(丸ボタンなので見た目も自然に大きくなる。矢印の font-size はそのまま)。
- `.chip`: `min-height: 44px` + `display: inline-flex; align-items: center;` にして padding は `6px 14px` のまま。→ 横スクロール行の高さが 32→44px に増えるので、**チップ行の下の地図が縮むだけで崩れないこと**を撮影で確認する。
- `.feedcard__link`: 見た目を太らせたくないので **擬似要素で当たり判定を広げる**。
  ```
  .feedcard__link { position: relative; }
  .feedcard__link::after {
    content: ""; position: absolute; left: 0; right: 0;
    top: 50%; transform: translateY(-50%); height: 44px;
  }
  ```
  さらに `.feedcard__links { gap: var(--sp-2); }` だと隣接チップの当たり判定が重なるので **`gap` を `10px 8px`**(縦を少し広げる)にして、縦に折り返した2段目と当たり判定が食い合わないようにする。※`::after` の重なりが気になるなら代わりに `.feedcard__link { min-height: 44px; display: inline-flex; align-items: center; }` でもよい。**どちらか一方を選び、選んだ理由を NIGHTLOG に1行書く**。
- `.far__item a`: `display: inline-flex; align-items: center; min-height: 44px;` (リスト行の縦間隔 `gap: var(--sp-2)` はそのまま)。
- 地図ピン(`iconSize:[24,24]`): **見た目は変えない**。24px のままだと R8 で苦労した密集分離が壊れるため。ピンは「地図を見るための目印」で主たる操作導線ではない(カードから辿れる)ので、**サイズ変更はせず ROADMAP の R13 完了メモに「ピンは意図的に 24px 維持」と残す**。代わりに 3 の aria-label を付ける。

### 2. aria / role(app.js)

- 番号ピン(app.js 829行付近, `pin--spot`): `L.marker(..., { icon: icon, title: c.name, ... })` に加え、`alt` 相当として divIcon の html を
  `'<span role="img" aria-label="' + escapeHtml((i+1) + '番 ' + c.name) + '">' + (i+1) + '</span>'` にする(`escapeHtml` は既存関数)。
- 宿ピン(353行・817行付近): 同様に `aria-label="宿 " + h.name`(817行は `hotel.name`)。
- カード(`cardHtml`, 626行付近): `<article class="card feedcard" ...>` に `tabindex="0" role="button" aria-label="<施設名> の詳細"` を付ける…**のはやりすぎ**。カード内にすでに個別リンクがあるので、**`<article>` は据え置き**にし、代わりに `.feedcard__no`(現在 `aria-hidden="true"`)はそのままでよい。→ **この項目は「番号ピンと宿ピンの aria-label 追加のみ」に留める**。
- `#feed-map` / `#map`(index.html): 地図コンテナに `role="region" aria-label="周辺の地図"` / `aria-label="宿をさがす地図"` を付ける。
- `#feed-status`(進捗・混雑告知): `role="status" aria-live="polite"` を index.html に追加。読み込み進行が読み上げられる。

### 3. フォーカスリング(style.css)

`ui.css` の `:focus-visible { box-shadow: var(--focus-ring) }` は効いているが、**背景が白いチップ/リンクでは 3px の淡い影が埋もれる**。style.css で強めに上書きする:

```
.chip:focus-visible,
.feedcard__link:focus-visible,
.topbar__back:focus-visible,
.suggest__item:focus-visible,
.far__summary:focus-visible,
.far__item a:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;
  box-shadow: none;   /* ui.css の影と二重にしない */
}
```
※`outline` は角丸に追従するので `border-radius` の再指定は不要。

### 4. prefers-reduced-motion(style.css 末尾)

既存は `.skel` のシマーだけ止めている。追加で:

```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Leaflet のズームアニメは `map.setView(..., {animate:false})` で既に抑えている箇所があるが、**JS 側は触らない**(R8 の fitBounds 修正に触れるリスクがあるため)。

---

## 完了条件(検証可能)

1. **タップ44px の機械検査**: `scripts/check-a11y.mjs` を新規作成し、Playwright で `?fixture=kusatsu`(状態B)と `?demo=zoomout`(状態A・チップ)を 375px 幅で開き、
   `.topbar__back` / `.chip` / `.feedcard__link` / `.suggest__item` / `.far__summary` / `.far__item a` それぞれについて
   `el.getBoundingClientRect().height`(リンクチップは `::after` を使った場合は当たり判定の高さ)を全件測り、**44 未満が1件もない**ことを判定して OK/NG を1行ずつ出力、NG があれば `exitCode = 1`。
   ※Playwright が入っていなければ `node -e` + 既存の撮影ツールでは測れないので、**`scripts/check-a11y.mjs` は撮影ツールと同じ仕組み(`C:\workspace\tools\shot\shot.mjs` が使っているブラウザ)を流用**すること。それも無理なら DOM 計測を `page.evaluate` 相当で行う簡易版でよい。手計算で代用しない。
2. **コントラスト**: 上表の数値を NIGHTLOG に転記(再計算して一致することだけ確認)。新たに 4.5:1 を割る色を**増やしていない**こと。
3. `node --check assets/app.js` が通る。
4. コンソールエラー 0 件。
5. デグレなし: `?fixture=kusatsu` mobile でカード30枚・番号ピン 1〜30 判読可。

## 検証手順(撮影と目視)

`node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅で以下を撮り、**Read で開いて目視**:

1. `?fixture=kusatsu` mobile + desktop — カード30枚・リンクチップの折り返しが1段増えていないか、カード高さが暴れていないか、番号ピン 1〜30 が従来どおり判読できるか。
2. `?demo=zoomout` mobile — チップが 44px になったことで**検索欄とチップ行の間隔が間延びしていないか**、チップの文字が上下中央に来ているか、右端フェードが残っているか、地図が縮んだだけで潰れていないか。
3. `?demo=suggest` mobile — 候補行の見た目が変わっていないこと(既に44px超なので無変更のはず)。
4. `?fixture=hakone&demo=far` mobile — 「もっと遠く」の各行が 44px になって行間が開くので、**10件が縦に間延びしすぎていないか**。間延びが醜ければ `min-height: 44px` ではなく `padding-block: 11px` で調整してよい。
5. `?fixture=kusatsu&embed=1` mobile — 埋め込み枠でチップ高の変更が無関係なこと(状態A非表示)を確認。
6. 最後に `node docs/check.mjs` を実行して全項目 OK・exit 0。

## 記録とコミット

- `docs/ROADMAP.md` の R13 を `- [x] 2026-09-16 R13 ...` にし、「ピンは 24px を意図的に維持」「コントラストは計算上すべて合格だった」を1行追記。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果(測った高さの before→after を数値で) / 次)。
- コミット → `git push`。コミットメッセージは1行の日本語。
