# NEXT: R88 埋め込み高さ通知の上限値を実測にもとづく値へ下げる

- **タスクID**: R88
- **難易度**: sonnet(受信サンプルの数値と注記の変更のみ。ロジック新規実装なし)
- **所要目安**: 20〜30分(うち実測の再確認に10分)

## 目的

`?embed=1` の高さ通知(R48)の受信側上限が暫定の `100000px` のままで、実質「上限なし」。
営業先の親ページに置くサンプルコードなので、異常値が来たときに親ページのレイアウトを壊さない
現実的な上限に下げる。**ただし下げすぎると正規の伸長を弾いて二重スクロールが復活する**ため、
実測値に安全マージンを掛けた値にする。

## 実測で判明した前提(計画役がこのサイクルで測定)

### 1. ROADMAP 本文の「例 20000px」は**採用不可**(事実誤認)

計画役が Playwright で4エリア×2幅の実測を取った(外部API 0回・fixture のみ・`index.html?fixture=<area>&embed=1` を
トップレベルで開き `Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))` を読む
= `app.js:1417-1420` の送信側と同一式)。

| エリア | 幅 | カード30枚 | 「もっと見る」展開後(60枚) |
|---|---|---|---|
| kusatsu | 375 (mobile) | 11991 | **23471** |
| kusatsu | 1280 (desktop) | 17348 | **34075** |
| hakone | 375 | 12020 | 23500 |
| hakone | 1280 | 17333 | 33973 |
| dogo | 375 | 11968 | 23471 |
| dogo | 1280 | 17171 | 33832 |
| beppu | 375 | 11991 | 23471 |
| beppu | 1280 | 17392 | 34031 |

**実測の最大値は 34075px(kusatsu desktop・60枚展開後)。** 20000px にすると mobile 30枚(約12000px)は通るが、
**「もっと見る」展開後は全エリア・全幅で弾かれて iframe が伸びなくなる**(= R48 で解決した二重スクロールが再発する)。

さらに `docs/NIGHTLOG.md:344` に、R48 の作業役が当時まさに同じ罠を踏んだ記録が残っている:
「60枚展開後の実測が22309pxと想定より大きく、NEXT.md指定の上限20000だと正規の伸長まで弾いてしまうため上限を100000に引き上げた」。
今回の実測(23471px)とほぼ一致しており、**同じ判断を2度繰り返さないこと**。

### 2. desktop のほうが mobile より高くなる(直感と逆)

`assets/style.css:619` の `body.is-embed .view--feed { max-width: 720px; }` により、
埋め込みは幅が広くてもカードが1カラムのまま最大720pxで中央寄せされる。
一方で幅が広がるとカード内の写真領域が縦に伸びるため、**desktop のほうが約1.45倍高くなる**。
上限は mobile ではなく desktop 基準で決める必要がある。

### 3. 送信側は無変更でよい

`assets/app.js:1411-1425` `postHeightToParent()` が送信側。`rAF` で丸め、`lastSentHeight` と同値なら送らない。
`assets/app.js:1428-1436` `startHeightObserver()` が `document.body` を ResizeObserver 監視。
どちらも上限を持たない(= 上限は受信側だけの責務)。**この2関数は触らない。**

### 4. 受信側の実体は demo/hotel-page.html の2箇所にある(同じコードが2つ)

- `demo/hotel-page.html:236` … `<pre class="tag-example">` 内の**エスケープされた表示用コピー**(`&lt;` `&gt;` `&amp;&amp;`)
- `demo/hotel-page.html:250` … `</body>` 直前の**実際に動いているスクリプト**

どちらも同一行 `if (typeof height !== 'number' || !isFinite(height) || height < 100 || height > 100000) return;`。
`demo/hotel-page.html:228` に「受信スクリプトの実物はこのページの `</body>` 直前(下記)にあります。
このページのソースをそのままコピーしてお使いいただけます」と明記しているので、**2箇所を必ず同じ値に揃える**こと。
片方だけ直すと営業資料として矛盾する。

### 5. R90 は既に実装済み(未確認だったが今回確認した)

`demo/hotel-page.html:213` に `loading="lazy"` が既にある。R90 は実質完了しているので、
このサイクルの余力で ROADMAP の R90 を `[x] 2026-09-16 (既に実装済みだったことを実測で確認)` に倒してよい(コード変更なし)。

### 6. 未確認

- 上限を超えた値が実際に飛んでくる条件(バグ・悪意ある子フレーム等)は再現していない。上限は「保険」であり、通常運用で発火しない想定。
- 「もっと見る」を2回以上押せるか(実測では `#more-btn` は1クリックで消えた = 30→60 の1段のみ)。60枚が現状の上限。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\demo\hotel-page.html` … **唯一の変更対象**
- (参照のみ・変更禁止)`C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`
- (参照のみ)`C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-embedheight.mjs`

## 実装方針

1. `demo/hotel-page.html:250`(実スクリプト)の `height > 100000` を **`height > 60000`** に変える。
   - 根拠: 実測最大 34075px の約1.76倍。将来 fixture が増えて70枚・80枚になっても余裕があり、
     かつ「画面何十個分」という明らかな異常値(10万px)は弾ける。
   - 下限 `height < 100` は現状のまま維持する。
2. `demo/hotel-page.html:236`(`<pre>` 内の表示用コピー)の `height &gt; 100000` も **`height &gt; 60000`** に揃える。
   エスケープを壊さないこと(`&gt;` のまま)。
3. 実スクリプト側の該当行の直上に、根拠を残す1行コメントを足す:
   `// 上限60000px: 実測の最大は kusatsu desktop の60枚展開後で34075px(2026-09-16)。その約1.8倍を保険の上限にする。`
   `<pre>` の表示用コピーにも同趣旨の1行を入れてよい(営業先が数字の意味を読めるように)。
4. `demo/hotel-page.html:226` 付近の `.sales-note-extra` の説明文に、上限がある旨を1行足すかは作業役の判断でよい。
   足すなら「受信スクリプトは 60000px を超える高さは無視します(異常値で親ページが壊れるのを防ぐため)」程度。
5. **`app.js` は1行も変えない。** `git diff --stat -- assets` が空であることを確認する。

## 完了条件

- `demo/hotel-page.html` の上限値が2箇所とも `60000` で一致している(`grep -c "60000" demo/hotel-page.html` が 2 以上)。
- `100000` が `demo/hotel-page.html` から消えている(`grep -c "100000" demo/hotel-page.html` が 0)。
- `git diff --stat -- assets fixtures scripts index.html` が空(変更は demo/ と docs/ のみ)。
- `node scripts/check-all.mjs` が **27本全緑**(exit 0)。
- デモページで iframe が従来どおり中身の高さまで伸び、二重スクロールが出ない。

## 検証手順

1. `node --check` は HTML なので不要。代わりに `grep -n "60000\|100000" demo/hotel-page.html` で2箇所の一致を目視。
2. 撮影(外部API 0回。撮影URLはローカルサーバ `http://127.0.0.1:3000` を自分で立てるか、`check-embedheight.mjs` と同じ方式で):
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/demo/hotel-page.html" --mobile --full`(幅375)
   - `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/demo/hotel-page.html"`(幅1280 デスクトップ)
   - 撮った画像を **Read で開いて目視**し、iframe 内に二重スクロールバーが無いこと・カードが最後まで出ていることを確認する。
3. 「もっと見る」展開後も伸びることの機械確認: `node scripts/check-embedheight.mjs` 単体を先に回す
   (項目2「#more-btn クリック後に iframe の高さがさらに増える」が、上限を下げても PASS のままであることが本タスクの核心)。
4. `node scripts/check-all.mjs` → **27本全緑・exit 0**(必須)。
   フレークで落ちたら該当1本を単体再実行し、その後もう一度通しで全緑を確認する
   (`check-nohotels` / `check-history` が `ERR_NO_BUFFER_SPACE` で一過性に落ちる既知事例あり)。

## 変更禁止範囲

- `assets/engine.js` / `assets/geo.js` / `fixtures/*.json` は**一切触らない**。
- rank の重み・閾値・カテゴリ減点は**触らない**。
- `assets/app.js` の送信側(`postHeightToParent` / `startHeightObserver`)は**無変更**。
- 既存 `scripts/check-*.mjs` の**検査内容を減らさない**。
- `git stash` / `git reset` / `git checkout` によるファイル復元は**禁止**。
- **外部API 0回**(Overpass / Wikipedia / Nominatim を叩かない。fixture とローカルサーバのみ)。

## 終わったら

1. `docs/ROADMAP.md` の R88 を `[x] 2026-09-16` に。**R90 も `[x] 2026-09-16` に**(上記5の通り実装済みを確認したため、理由を1行添える)。
2. `docs/NIGHTLOG.md` の「## サイクル記録」に**3行**追記(やったこと / 見た目の確認結果 / 次)。実測表の数値を1つは残すこと。
3. **先にコミット**(1行の日本語メッセージ)。
4. `git push`。
5. **報告は簡潔に**(長文の報告書を書かない)。
