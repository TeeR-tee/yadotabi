# NEXT: R129 スマホ横向きで提案が1枚も読めない(小地図が画面の6割)

- **タスクID**: R129
- **難易度**: sonnet
- **所要目安**: 25〜40分
- **種別**: CSS のみ(style.css の1メディアクエリ追加)+ 検査1本追加

## 目的

みのるんはスマホで本番URLを確認する。**端末を横に倒した瞬間、提案カードが1枚も読めなくなる**。
横向きの初期画面は「戻るボタン＋見出し」「番号ピンだらけの地図」「写真の上端82px」だけで、
**スポット名・カテゴリ・徒歩分数・要約が1文字も画面に出ない**。
「このサイトは何を見せてくれるのか」が横向きでは伝わらない状態を直す。

## 実測で判明した前提(Playwright・hasTouch:true / isMobile:true)

計測は `?fixture=kusatsu`(状態B)。すべて外部API 0回。

| 幅x高さ | topbar高 | .feedmap高 | 1枚目カードの top | カード高 | 画面内に見える高さ | 割合 |
|---|---|---|---|---|---|---|
| **812x375(横)** | 61px | **220px** | 293px | 475px | **82px** | **17%** |
| **667x375(横・SE)** | 61px | **220px** | 293px | 513px | **82px** | **16%** |
| 375x812(縦) | 61px | 220px | 293px | 371px | 371px | 100% |

- 横向きでは固定要素(topbar 61 + feedmap 220 = **281px**)が **375px の 75%** を食う。
- 撮影済み: `screenshots/2026-09-17_r129-landscape-fold_land812.png`(812x375 の初期画面)。
  目視すると写真の上端だけが覗いており、テキストは1文字も無い。
- 原因箇所は `assets/style.css:353-354`:
  ```
  .feedmap { height: 180px; width: 100%; background: var(--c-surface-2); }
  .feedmap--tall { height: 220px; }
  ```
  **ビューポート高さと無関係な固定px**。
- `assets/app.js:1352` が `els.feedMap.classList.toggle('feedmap--tall', state.cards.length >= 25)`。
  草津/箱根/道後/別府の4エリアはいずれも30枚なので**常に 220px が確定**する。
- `grep -n "@media" assets/style.css` の実測結果は **5本だけ**:
  285 / 547 / 688 = `prefers-reduced-motion`、614 = `min-width: 720px`、792 = `print`。
  **`max-height` も `orientation` も1本も無い**ので、横向き用の分岐は完全に未実装。
- 812x375 で `matchMedia('(max-height: 500px)').matches === true` を実測済み(この条件で拾える)。
- 縦向き(375x812)は `max-height:500px` に当たらないので**一切影響を受けない**。

### 参考: 同じ調査で見つかったが今回は対象外にするもの(起票も不要)
- タッチ操作は健全。375px の `hasTouch` 環境で、カード画像 tap → ライトボックスが開く
  (`body.is-lightbox` を実測)、番号バッジ tap → 該当ピンに `pin--flash` が付く、
  検索欄 tap → `input.pickbar__input` にフォーカス、クリア tap → 値が空、
  エリアチップ tap → `aria-current` 更新。**マウスで動いてタッチで動かない要素は0件**。
- 320px(iPhone SE)の状態Bは `documentElement.scrollWidth === 320` で横はみ出し0件
  (検出された5件はすべて Leaflet のタイル画像で、地図の内部実装上は正常)。
- 320px の状態Aで `.chips` が右にはみ出すが `overflow-x:auto` の横スクロールで意図通り、
  `.samples` も `overflow-x: auto`。設計どおりなので不具合ではない。
- カード画像は17枚すべて `loading="lazy"`、`naturalWidth === 0` の壊れ画像は0件。
- スクロール時 `.topbar` は `position: sticky` で上端固定、`.feedmap` は `relative` で
  一緒に流れる(仕様どおり)。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css` (唯一の変更対象)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-landscape.mjs` (新規作成)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-all.mjs` (30本目として登録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md` (表に1行・本数を29→30に)

## 実装方針

1. `assets/style.css` の `.feedmap--tall` の直後に、横向き専用のメディアクエリを1つ足す:
   ```css
   /* R129: 横向きスマホ(高さ500px以下)では固定要素が画面の75%を占め、
      カードのテキストが1文字も見えなくなるため地図を低くする。
      vh 単位は使わない(iOS Safari のアドレスバー伸縮で高さが揺れ、
      Leaflet の invalidateSize() が必要になるため) */
   @media (max-height: 500px) {
     .feedmap { height: 120px; }
     .feedmap--tall { height: 140px; }
   }
   ```
2. 値(120/140)は目安。**撮り比べて決めること**。条件は「812x375 で1枚目カードの
   スポット名(`.feedcard__title` 相当)の下端が画面内に入る」こと。
   140px なら cardTop = 61+140 = 201px となり、カードの上から 174px ぶんが見える計算。
   写真の高さ次第でタイトルが入らなければ 120px まで下げてよい。**100px より下げない**
   (ピンが潰れて番号が読めなくなる)。
3. `.feedmap` の高さを変えたら **Leaflet に `invalidateSize()` を呼ぶ必要があるか**を確認する。
   CSS のメディアクエリはページ読み込み時点で確定しているので、**回転せずに開いた場合は不要**。
   回転時のタイル欠けが撮影で見えたときだけ `app.js` に `orientationchange`/`resize` の
   ハンドラ追加を検討する(見えなければ `app.js` は無変更のままにし、その事実を NIGHTLOG に書く)。
4. `scripts/check-landscape.mjs` を新設(既存の `check-a11y.mjs` の雛形を流用):
   812x375 と 667x375 で `?fixture=kusatsu` を開き、
   **1枚目カードの画面内可視高さが 150px 以上**であることを検査する。
   ついでに 375x812(縦)でも測り、**縦の可視高さが変更前後で変わらない**ことも同時に検査する。

## 完了条件

- [ ] 812x375 と 667x375 で1枚目カードの可視高さが **82px → 150px 以上**になっている
- [ ] 812x375 の撮影で、1枚目カードの**スポット名の文字が画面内に読める**
- [ ] 375x812(縦)の `.feedmap` 高さが **220px のまま**(縦向きに影響ゼロ)
- [ ] 320x568(縦)でも `.feedmap` が 220px のまま(`max-height:500px` に当たらないこと)
- [ ] `scripts/check-landscape.mjs` が PASS し、`check-all.mjs` に30本目として登録済み
- [ ] `docs/CHECKS.md` の表に1行追加・本数表記を29→30に更新
- [ ] `node scripts/check-all.mjs` が **30本全緑**(R129 で1本増えるため。増やす前の基準は29本)

## 検証手順

すべてローカルサーバー(`start-server.bat` か `python -m http.server 3000`)+ 固定データ。**外部API 0回**。

1. 撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --width <幅> --height <高さ>`):
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **812x375**(横・変更後) — 必須。
     ファイル名は `screenshots/2026-09-17_r129-after-land812.png`。
     変更前の `screenshots/2026-09-17_r129-landscape-fold_land812.png` と並べて Read で目視比較する。
   - 同 **667x375**(横・iPhone SE 相当)
   - 同 **375x812**(縦・デグレ確認)
   - 同 **320x568**(縦・最小幅デグレ確認)
   - `http://127.0.0.1:3000/?fixture=hakone` を **812x375**(別エリアでも成立するか)
2. 画像を **Read で開いて目視**する。見る点: 文字崩れ・重なり・はみ出し・地図ピンの潰れ・
   attribution(Leaflet | OpenStreetMap)がカードに被っていないか。
3. `node scripts/check-landscape.mjs` が PASS。
4. **`node scripts/check-all.mjs` が 30本全緑**(必須)。

## 変更禁止範囲

- **rank の重み・閾値は一切変更しない**
- **`assets/geo.js` と `fixtures/*.json` は触らない**(再生成もしない)
- `assets/app.js` は原則無変更(方針3で回転時のタイル欠けが実際に撮影で確認できた場合のみ)
- `.feedmap` の `height` 以外のプロパティ(width/background/position)は変えない
- 既存の `check-*.mjs` の検査内容を減らさない
- **`git stash` / `git reset` / `git checkout` でファイルを戻す操作は禁止**
- **外部API 0回**(Overpass / Nominatim / Wikipedia を1回も叩かない)
- `vh` / `dvh` / `svh` 単位は使わない(理由は方針1のコメント参照)

## 終わったら

1. `docs/ROADMAP.md` の R129 行を **`- [x] 2026-09-17 **R129 ...**`** に書き換える
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に
   `### 2026-09-17 R129 横向きで提案が読めない問題を修正` の見出しを付けて**3行**追記
   (やったこと / 見た目の確認結果 / 次)
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. **報告は簡潔に**(長文の報告書を書かない。3〜5行)
