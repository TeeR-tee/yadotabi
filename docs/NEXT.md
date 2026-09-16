# NEXT: R74 サンプル導線チップの折り返しを解消し、チップ行と同じ横スクロールに寄せる

## なぜこれを選んだか(1行)
最新スクリーンショット `screenshots/2026-09-16T03-59-14_localhost_3000_demo_zoomout_mobile.png` を目視したところ、375px で `.samples` が既に**2行に折り返し「おまかせ」だけが下に落ち、44px の空白帯が地図を押し下げている**のを実測で確認できたため(R40 の別府追加でリンクが5本になり顕在化)。初見の人が最初に見る画面の実害であり、`style.css` だけで直せる。

## 現状(実測・推測ではない)
- `index.html:44` … `<div class="samples" id="sample-links" hidden></div>`(中身は JS 生成)
- `assets/app.js:1635` `SAMPLE_LINKS` … kusatsu / hakone / dogo / beppu の **4件**(R40 で beppu 追加済み)
- `assets/app.js:1641` `renderSampleLinks()` … `<span class="samples__label">サンプル:</span>` + 4本の `<a>` + 末尾に `<a href="?fixture=random">おまかせ</a>` を出力。**合計6要素**(ラベル1+リンク5)
- `assets/style.css:183` `.samples { display:flex; align-items:center; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); font-size: var(--fs-xs); }`
- `assets/style.css:192` `.samples a { display:inline-flex; align-items:center; min-height:44px; padding:2px 4px; ... }`
- 崩れの原因は2つの合わせ技: (1) `flex-wrap: wrap` が5本を収めきれず改行、(2) 各 `<a>` が `min-height:44px`(R13 のタップ領域)なので、2行目に1本落ちるだけで**行全体が 44px+gap ぶん背が伸びる**。スクリーンショットでは「おまかせ」の行がほぼ空白に見える。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` … **このファイルのみ変更**
- 検証で使うだけ(無変更): `scripts\check-a11y.mjs` / `scripts\check-sample.mjs` / `scripts\check-all.mjs`

## 実装方針
`.chips`(`style.css:146`)が既に確立している横スクロールの型に `.samples` を寄せる。`.chips` は
`overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch;` +
`mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);` +
`.chips::-webkit-scrollbar { display:none; }` という構成なので、同じものを `.samples` に適用する。

1. `style.css:183` の `.samples` から **`flex-wrap: wrap` を削除**し、代わりに以下を足す。
   - `overflow-x: auto;`
   - `scrollbar-width: none;`
   - `-webkit-overflow-scrolling: touch;`
   - `-webkit-mask-image` と `mask-image` を `.chips` と同じ 24px 右端フェードで指定
2. `.samples::-webkit-scrollbar { display: none; }` を1行追加(`.chips::-webkit-scrollbar` の書き方に合わせる)。
3. 横スクロール中に要素が潰れないよう、`.samples__label`(`style.css:191`)と `.samples a`(`style.css:192`)の両方に
   `flex: 0 0 auto;` と `white-space: nowrap;` を足す(`.chip` が `flex:0 0 auto; white-space:nowrap;` でやっているのと同じ理由)。
4. `min-height: 44px` は **絶対に下げない**(R13 のタップ領域44px、`check-a11y.mjs:34` が `.samples a` を検査対象にしている)。
5. PC幅の扱い: `style.css:588` のメディアクエリで `.pickbar__row, .chips { max-width:560px; margin-left:auto; margin-right:auto; }` としているので、**`.samples` も同じ 560px 中央寄せの対象に加える**(加えないとPCで `.samples` だけ左端に張り付いて `.chips` と縦線が揃わない)。加えた結果ずれるようなら加えない判断でよいが、どちらにしたか NIGHTLOG に理由を1行残す。

> 注: `flex-wrap: wrap` を消すと mask の右端フェードで最後の「おまかせ」が薄くなるが、これは `.chips` で既に受け入れている表現なので同じ扱いでよい。指で横に送れることが伝わればよい。

## 完了条件(検証可能)
1. 375px 幅・`?demo=zoomout` で、**`.samples` の全子要素(`.samples__label` と5本の `.samples a`)の `offsetTop` が全て同値**であること(=1行に収まっている)。Playwright か DevTools で数値を取って NIGHTLOG に貼る。
2. 同条件で `.samples` の `scrollWidth > clientWidth` であること(=収まらない分は横スクロールで送れる)。
3. `.samples` 要素自体の高さが、修正前の約2行ぶんから**1行ぶん(おおむね44〜52px)に減っている**こと。before/after の数値を両方記録する。
4. `node scripts/check-a11y.mjs` が全件OK(特に `.samples a` のタップ領域が5本とも44px以上)。
5. `node scripts/check-sample.mjs` が全項目PASS(リンク5本・fixture中と embed 中は不可視・random が動く、の既存挙動を壊していない)。
6. `node scripts/check-all.mjs` が **25本全PASS・exit 0**。
7. `git diff --stat` が **`assets/style.css` の1ファイルのみ**であること(JS・HTML・fixtures に差分が無いこと)。

## 検証手順(撮影+目視)
外部API は0回。すべて固定データ/デモパラメータで完結する。

1. **before を撮る**(修正前に1枚): `?demo=zoomout` mobile。既存の 03-59-14 の画像でも代用可だが、R40 後の現状を撮り直す方が確実。
2. style.css を修正。
3. **after を撮る**:
   - `?demo=zoomout` mobile(375px) … 主目的。サンプル行が1行に収まり、地図の上端が上に戻っていること
   - `?demo=zoomout` desktop … PC幅でチップ行とサンプル行の左端が揃っているか(方針5の判断材料)
   - `?fixture=kusatsu` mobile … `.samples` は非表示のはずなのでデグレ確認(カード30枚・番号ピン1〜30判読可)
   - `?fixture=kusatsu&embed=1` mobile … 埋め込みでも `.samples` が出ていないこと
4. 撮った画像を **Read で開いて目視**し、(a)サンプル行が1行 (b)右端にフェードが見える (c)検索欄・エリアチップ・地図と重なっていない (d)文字が切れていない、を確認する。
5. `node scripts/check-all.mjs` を回して25本全緑を確認してからコミット・push。

## 変更禁止範囲
- `assets/engine.js` の `rank` / `baseScore` / 重み / 閾値 / 除外ルール
- `assets/geo.js` 全般(`CATEGORY_RULES`・`buildOverpassQuery`・半径定数を含む)
- `fixtures/*.json`(再生成しない。Overpass は1回も叩かない)
- `scripts/check-*.mjs` の**中身**(実行するだけ)
- `.samples a` の `min-height: 44px`(R13 のタップ領域)
- `SAMPLE_LINKS` の中身・順序・ラベル文字列(`check-sample.mjs` が5本を前提にしている)
- `assets/app.js` / `index.html`(今回は CSS のみで解決する。もし CSS だけで無理だと判明したら、そこで手を止めて NIGHTLOG に理由を書き ROADMAP に差し戻すこと)

## 難易度・所要目安
- 難易度: **低**(CSS 数行。`.chips` に完成形の前例があるため写すだけ)
- 所要目安: 実装5分 + 撮影・目視10分 + check-all 約4分 = **20分程度**

## 補足: これが終わったら次に回る候補
- R77(状態Bのカードに「全◯件」を出すか検討・撮り比べ)… ユーザーに見える改善の次点
- R76(4エリアの far 件数比較表)… 文書のみ・R19 の判断材料
- R75(fixtures サイズ表)/ R72(check 並列化不可の明文化)… 文書のみ
