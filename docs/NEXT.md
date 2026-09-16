# NEXT: R45 + R46(固定データバッジの生成日付 / check.mjs にレスポンスサイズ列)

判断理由: どちらも表示・記録のみでロジック変更ゼロ、かつ2件とも R14(fixture軽量化)の判断材料になる(いつのデータか・何KBか)。R2-1 は朝の相談待ち、R14/R19/R40 は Overpass 再取得が必要なので夜間に回さない。

難易度: **sonnet** / 所要目安: 30〜45分(check-all.mjs が約60秒かかるので検証時間込み)

---

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\app.js`(R45: バッジ描画)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html`(R45: バッジ要素に日付用の子要素を足す場合のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\style.css`(R45: 日付部分の小さめ配色)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-hotelparam.mjs`(R45 の検査ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\check.mjs`(R46)

## 変更禁止範囲(絶対に触らない)

- `assets/engine.js` / `assets/geo.js`(rank の重み・閾値・除外ルール・fixture 分岐)
- `fixtures/*.json`(再生成しない。Overpass は1回も叩かない)
- `scripts/make-fixture.mjs`(**generatedAt は既に 199行目で meta に入っており、kusatsu/hakone/dogo の3本とも保持済み**。確認済みなので触る必要なし。将来 generatedAt が無い fixture が来た場合は「日付を出さない」で済ませる)

---

## R45 実装方針(固定データバッジに生成日付)

現状の実物:

- `index.html:56` — `<span class="topbar__badge" id="feed-badge" hidden>固定データ</span>`
- `assets/app.js:847` — `renderFeed()`(842行〜)の中で `els.feedBadge.hidden = !isFixtureMode;` の1行だけ
- `assets/app.js:145` — `var isFixtureMode = false;`
- `assets/app.js:1261-1276` — `fetch('fixtures/' + fixtureName + '.json')` の `.then(function (json) {...})` で `json.meta` を検証し `YadoGeo.setFixture(json)` / `isFixtureMode = true` にしている。**ここで `json.meta.generatedAt` を保持する変数(例: `var fixtureGeneratedAt = '';`)に入れる**のが最短。`YadoGeo` から取り直す必要はない(geo.js は触らない)。
- `assets/style.css:283-291` — `.topbar__badge`(`--fs-sm` / `--c-surface-2` / `--c-text-sub` / `white-space: nowrap`)

手順:

1. `app.js:145` 付近に `var fixtureGeneratedAt = '';` を追加(コメント1行)。
2. `app.js:1267` の `.then(json)` 内、`isFixtureMode = true;` の直後で
   `fixtureGeneratedAt = formatFixtureDate(json.meta && json.meta.generatedAt);` とする。
3. `formatFixtureDate(iso)` を新設(`renderFeed()` の近くの純関数置き場でよい)。
   - 空・不正(`isNaN(d.getTime())`)なら `''` を返す。
   - `new Date(iso)` から**ローカル時刻**で `YYYY-MM-DD` を組み立てる(`toISOString()` はUTCに寄るので使わない。kusatsu の `2026-09-15T18:05:50.632Z` は JST では 2026-09-16 になり、NIGHTLOG の生成日と一致するのが正)。
4. `app.js:847` を、バッジ本文の組み立てに変える。日付がある時だけ後ろに小さく添える:
   - `els.feedBadge.hidden = !isFixtureMode;`(維持)
   - 日付ありなら `固定データ` + `<span class="topbar__badge__date">2026-09-16 取得</span>`、無しなら `固定データ` のみ。
   - **`innerHTML` を使うなら埋め込む値は `formatFixtureDate` が作った `YYYY-MM-DD` だけ**(fixture の生文字列をそのまま流し込まない)。`textContent` の2要素構成(`index.html` に空の `<span class="topbar__badge__date" id="feed-badge-date"></span>` を置き、`textContent` で入れて `hidden` を切り替える)の方が安全で、こちらを推奨。
   - `title` 属性にも同じ日付を入れてよい(任意)。
5. `style.css` の `.topbar__badge` 直後に `.topbar__badge__date { margin-left: 6px; opacity: .75; }` 程度。**バッジが伸びて `#feed-title` を押し出さないこと**(`.topbar__badge` は `flex: 0 0 auto` なので、mobile 375px で宿名が長い時に折り返さないか撮影で確認する)。

注意: `?fixture=` 以外(通常モード・`?hotel=` のみ)ではバッジ自体が `hidden` のままで、日付要素も出ない。既存の R39 のケース a〜d を壊さないこと。

## R46 実装方針(docs/check.mjs にレスポンスサイズ KB 列)

現状の実物(`docs/check.mjs`、全267行):

- `31行` `const timings = []; // { label, ms }`
- `33-40行` `async function timedFetch(label, url, options)` — `performance.now()` 差分を取り `timings.push({ label, ms })` して `{ res, ms }` を返す。**呼び出し元は4か所**: `checkTarget`(51行)、`collectLinks`(101行)、`checkLink`(162行・170行の HEAD/GET フォールバック)、`collectMarkdownLinks`(195行)。
- `257-263行` 集計行(`合計 N件 / 総計 Nms / 平均 Nms` と `最遅: ...`)

手順:

1. `timedFetch` の中で `res` のサイズを求める。**`res.body` を消費してはいけない**(呼び出し元が後で `res.text()` / `res.json()` する)。
   - `const len = Number(res.headers.get('content-length'));` を見る。有限で 0 以上ならそれを採用。
   - 取れない場合(`content-length` 欠落・HEAD 応答など)は `null` にして「本文長からの補完」は**呼び出し元で分かるところだけ**行う。具体的には `checkTarget` が既に `res.text()` 相当で本文を読んで `byteLength` を出している(83行の `${byteLength}バイト`)ので、そこで `recordBytes(path, byteLength)` のようなヘルパを呼んで `timings` の該当エントリに後追いで入れる。**無理に全件埋めない**(HEAD リンク検査はサイズ不明のままでよい)。
2. `timings` の要素を `{ label, ms, bytes }` に拡張。
3. 各成功行の detail に KB を併記する。例: `checkTarget` の 61行 `report(\`${path} (HTTP 200)\`, true, \`${ms}ms\`)` を `` `${ms}ms / ${kb}KB` `` に。`kb` は `(bytes/1024).toFixed(1)`、不明なら KB 部分を出さない。
4. 集計行の直後に**サイズの集計行を1行追加**:
   `合計サイズ NNN.NKB(計測できた M件) / 最大: fixtures/hakone.json 899.2KB`
   (`bytes` が取れたものだけを合計する。件数を併記して「全件ではない」ことを正直に出す)
5. **閾値での失敗判定は付けない**(`hasFailure` を触らない)。GitHub Actions のログに数字が残るのがゴール。

期待値の目安(ローカル実ファイル): `fixtures/hakone.json` 921,743バイト ≒ **900KB**、`dogo.json` ≒ 117KB、`kusatsu.json` ≒ 65KB。この3つが一目で並ぶことが R14 の材料になる。

---

## 完了条件(検証可能)

1. `scripts/check-hotelparam.mjs` に R45 のケースを追加し、全て PASS:
   - e. `?fixture=kusatsu` でバッジ本文に `/\d{4}-\d{2}-\d{2}/` にマッチする日付が含まれる
   - f. `?fixture=hakone` / `?fixture=dogo` でも同様に日付が出る(3 fixture とも `generatedAt` を持つ)
   - g. `?hotel=36.6226,138.5960`(fixtureなし)では日付要素も不可視(`offsetParent === null` か `getComputedStyle().display === 'none'` まで見る。既存 `checkBadgeVisible` の流儀に合わせる)
   - h. `#feed-title` は従来どおり「草津温泉」のまま(日付がタイトル側に混入していない)
2. `node docs/check.mjs` の出力に **KB 列**が出ており、`fixtures/hakone.json` の行に 900KB 前後が見えること。末尾に合計サイズ行があり、exit code 0。
3. `node scripts/check-all.mjs` が **16本全 PASS・exit 0**。
4. `node --check assets/app.js` 通過。

## 検証手順(撮影)

- `node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` を撮り、**Read で画像を開いて目視**:
  - ヘッダーが `← 草津温泉 [固定データ 2026-09-16 取得]` のように収まり、宿名が切れていない・バッジが2行に折り返していない・戻るボタンと重なっていない。
  - カード30枚・番号ピン判読可・コンソールエラー0件(デグレなし)。
- 余裕があれば `?fixture=hakone`(ラベル「箱根湯本」で宿名が長め)も mobile で1枚撮って、バッジが伸びた分の押し出しが無いことを確認する。
- 撮影は全て fixture モード = **外部API 0回**。

## コミット

作業が終わったら**先にコミット**(1行の日本語メッセージ)して `git push`。`docs/ROADMAP.md` の R45・R46 を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)を追記する。報告は簡潔に。
