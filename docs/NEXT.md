# NEXT: R57 + R59(カード画像の alt をスポット名に / 検索欄のクリアボタン)

**選定理由**: 残るバックログのうち R14・R19・R40 は fixture 再生成(Overpass 呼び出し)を伴い、R55 は計測が主目的、R60 は地図ピン設計に踏み込む。R57 と R59 はどちらも数行で完結し、機械検査で完了を確認でき、既存の描画ロジックに一切触らないため1サイクルにまとめて安全に入る。

難易度: **sonnet** / 所要目安: **20〜30分**(実装10分・テスト追加10分・撮影と check-all 10分)

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-a11y.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-imgfail.mjs`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 変更禁止範囲

`assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**一切触らない**。rank の重み・除外ルール・カードの並びは変更しない。

---

## R57: カード画像の alt をスポット名にする

### 実物確認(計画役が確認済み)

`app.js:796` の `cardHtml(card, index)` 内、**`app.js:800`**:

```
? '<img class="feedcard__img" src="' + escapeHtml(imgSrc) + '" alt="" loading="lazy" ' +
```

現状 `alt=""`(空)で確定。画像なし時は `placeholderHtml()`(app.js:780)が `.feedcard__ph` を返す分岐。

### 実装方針

`alt=""` を `alt="<スポット名>の写真"` に変える。`card.name` を `escapeHtml()` に通すこと(既存の `card.name` 出力は app.js:813 と同じ扱い)。

- **セレクタは変えない**: `class="feedcard__img"` はそのまま維持する。`scripts/check-imgfail.mjs:98` が `.feedcard__img` の count を見ているので、クラス名・属性順を崩さない。`data-cat` / `data-emoji` / `loading="lazy"` も残す(app.js:1595 の error 委譲がこれらを使う)。
- `card.name` が空のときは `alt="スポットの写真"` 等にフォールバックせず、単に空にならないよう `escapeHtml(card.name || 'スポット') + 'の写真'` とする。
- 画像なしカード(`.feedcard__ph`)は `<span aria-hidden="true">` の絵文字のみで、今回は対象外(変更しない)。

---

## R59: 検索欄のクリアボタン(×)

### 実物確認(計画役が確認済み)

- `index.html:35-39`: `.pickbar__search` > `input#search-input.input.pickbar__input` + `div#suggest-list.suggest`。
- `style.css:48`: `.pickbar__search { position: relative; }` — **すでに relative なので × を absolute で重ねられる**。`.pickbar__input { width: 100% }`(style.css:54)。
- `app.js:1544-1555`(`bindEvents()` 内): `input` / `focus` / `keydown(Escape)` の3ハンドラ。
- `app.js:484` `hideSuggest()`、`app.js:496` `renderSuggest()`。
- `app.js:1684` `els.searchInput` / `app.js:1685` `els.suggest` の取得箇所。

### 実装方針

1. **index.html:38 の直後**(input と `#suggest-list` の間)に追加:
   `<button type="button" class="pickbar__clear" id="search-clear" aria-label="検索欄を空にする" hidden>×</button>`
2. **app.js:1684 付近** の `els` に `searchClear: document.getElementById('search-clear')` を追加。
3. **app.js に純粋寄りの関数 `syncSearchClear()` を新設**(`hideSuggest()` の近く、app.js:484 の手前あたり):
   ```
   els.searchClear.hidden = !(els.searchInput.value.length > 0);
   ```
   (`trim()` は使わない。空白1文字でも「入力がある」として消せる方が自然)
4. **呼び出し箇所**(ここが要点):
   - `app.js:1544` の `input` ハンドラ内、`runSuggest()` の後に `syncSearchClear()`。
   - **`applyDemoStateA()`(app.js:1420)の `suggest` / `recent` / `recentmix` の各分岐で `els.searchInput.value = ...` した直後にも `syncSearchClear()` を呼ぶ**。撮影用デモは `value` を直接代入していて `input` イベントが飛ばないため、これを忘れると `?demo=suggest` で × が出ない(= 撮影で確認できない)。`demo=recent` は value が `''` なので × は出ない(正しい)。
   - `app.js:1486` 付近の `?q=` 反映箇所でも value を入れているので、同様に `syncSearchClear()` を呼ぶ。
5. **クリック時の挙動**(`bindEvents()` の検索欄ブロックに追加):
   ```
   els.searchClear.addEventListener('click', function () {
     els.searchInput.value = '';
     hideSuggest();
     syncSearchClear();
     els.searchInput.focus();
   });
   ```
   フォーカスは検索欄に戻す(候補は開き直さない = `showRecent()` は呼ばない)。
6. **document の click ハンドラ(app.js:1558-1562)に例外を足す**: 現状 `els.suggest.contains(e.target) || e.target === els.searchInput` 以外で `hideSuggest()` するが、× 自身のハンドラで既に閉じているので追加は必須ではない。ただし `e.target === els.searchClear` も除外条件に足しておくと順序依存が消えて安全。
7. **style.css に `.pickbar__clear` を追加**(`.pickbar__input` の直後、style.css:54 付近):
   - `position: absolute; right: 4px; top: 50%; transform: translateY(-50%);`
   - `width: 44px; height: 44px;`(**タップ領域44pxを実寸で満たす**。`.feedcard__link` のような `::after` 方式は不要)
   - `display: flex; align-items: center; justify-content: center;`
   - `background: none; border: 0; cursor: pointer; color: var(--c-text-sub)` 等、既存トークンを使う
   - `z-index` は `.suggest`(style.css:57 の absolute)より下でよいが、input より上になるよう確認する
   - **input の右 padding を 44px 分広げる**(`.pickbar__input` に `padding-right: 48px` 相当)。長い入力が × の下に潜らないこと。ただし `.input` 共通クラスを壊さないよう `.pickbar__input` 側だけで指定する。
   - `:focus-visible` のアウトラインは既存方針(style.css:569 付近の強調)に合わせる。

**入力ゼロ原則との整合**: × は入力を**増やさず取り消す**だけの操作なので原則に反しない(ROADMAP R59 の記述どおり)。

---

## 完了条件(すべて機械/目視で検証可能)

1. `scripts/check-imgfail.mjs` に **「`.feedcard__img` の `alt` が全件空でなく、対応するカードの `.feedcard__name` のテキストを含む」** ケースを追加し PASS(先頭3枚は `.feedcard__ph` に差し替わるため、**4枚目以降の残った `.feedcard__img`** を対象にする。`?fixture=kusatsu`(demo無し)ページでも全30枚を検査する)。
2. `scripts/check-imgfail.mjs` の既存13項目が引き続き全 PASS(`.feedcard__img` セレクタが壊れていないこと)。
3. `scripts/check-a11y.mjs` の `TARGETS`(check-a11y.mjs:23)に `{ selector: '.pickbar__clear', label: '検索クリアボタン' }` を追加し、`?demo=suggest` ページで 44px 以上で PASS。`?demo=zoomout`(入力なし)では要素が hidden なので**計測対象0件でもスキップ扱いになり NG にならない**ことを確認する(なっていなければ hidden を除外する分岐を足す)。
4. `scripts/check-recent.mjs` または `scripts/check-chipcurrent.mjs`(実在する方。無ければ check-a11y に集約)に、**× のケース**を追加:
   - `?demo=suggest` で `#search-clear` が visible
   - × をクリックすると `#search-input` の value が `''`、`#suggest-list` が hidden、`document.activeElement` が `#search-input`
   - `?demo=recent`(value が空)で `#search-clear` が hidden
5. `node scripts/check-all.mjs` が **全本 PASS・exit 0**(本数は現状から増減しない想定。新規スクリプトを足した場合は `check-all.mjs` に登録して本数を1つ増やす)。
6. `node --check assets/app.js` が通る。

## 検証手順(撮影)

1. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=suggest" --mobile` — **× が検索欄の右端に見え、候補リスト・エリアチップと重なっていない**ことを Read で目視。
2. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` — カード30枚・番号ピン1〜30判読可でデグレなし(R57 は表示が変わらないので**見た目が前回と同じ**ことが合格)。
3. `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?demo=recent" --mobile` — × が**出ていない**ことを目視。
4. コンソールエラー0件。
5. 外部APIは叩かない(全て fixture / demo)。

## 記録とコミット

- `docs/ROADMAP.md` の R57・R59 を `[x] 2026-09-16` に。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)。
- **実装が終わったらまず先にコミットし、報告は簡潔に**(長文の報告書を書かない)。コミットメッセージは1行の日本語。`git push` まで行う。
- git stash / reset --hard / checkout でファイルを戻す操作は禁止。
