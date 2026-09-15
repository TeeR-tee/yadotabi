# NEXT — R41 README の「仕組み」節を現状に合わせて更新(文書のみ・コード変更なし)

**選定理由**: 一晩で仕組みが大きく変わった(段階描画・重複マージ・除外ルール・同心円 geosearch・fixture 3エリア・受動ログ・埋め込み・check-all)のに README の説明が初期のままで、R4 の自動リトライ実装後も「自動リトライはしません」と**事実と逆のことが書いてある**。本番URLを見た人が最初に読む文書なので、他の残タスク(R11/R14/R19/R28/R37/R39/R40)より誤情報の実害が大きい。コード変更ゼロでリスクも最小。

## 対象ファイル(この2つ以外は編集禁止)

- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(完了済み項目の畳み込みのみ)

## 実装方針

書く前に必ず読むこと: `README.md` 全文、`assets/app.js` / `assets/geo.js` / `assets/engine.js` の**先頭コメント**、`docs/AUTOPILOT.md`、`docs/NIGHTLOG.md`(特に R5・R17・R18・R20・R35・R36・R31・R38 の節)。**実物を読んで事実だけを書く。誇張・未実装機能を書かない。**

### A. 「仕組み(かんたん解説)」節の更新(README.md:48〜56)

現状に足りていない/誤っている点を、以下の事実ベースで書き直す。

1. **周辺スポットの取得**: Wikipedia geosearch は R20 で**同じ中心の同心円3段(半径 3/6/10km)**に分けて引き、pageid で重複排除してマージする方式になった(呼び出し上限あり)。fixture 経路は従来どおり1回。「50件上限を回避するため」と書くのは**やめる**(NIGHTLOG R20 の実測で、箱根では 34件で頭打ちであり 50件上限は現在再現しない)。正しくは「1回の geosearch では取り切れない範囲を補うため」程度に留める。
2. **段階描画**: R5 で collect が OSM の解決時点で先に "osm" 段を発火するようになり、Wikipedia を待たずに最初のカードが出る(実API相当の遅延で 1535ms → 834ms)。`?slow=osm800,wiki1500` で誰でも再現できることも1行。
3. **重複マージ**(R17): 表記違いで割れた同一地点(湯畑源泉→湯畑、草津山 光泉寺→光泉寺 等)を `mergeOsmDuplicates` で1件に寄せ、代表名は短い方を残す。OSM 要素の `wikipedia`/`wikidata` タグも使って Wikipedia と突き合わせる。
4. **誤併合の防止**(R18): 名前の包含だけでは同一視せず、差分が施設語(足湯・バスターミナル等)なら別物と判定する。
5. **除外ルール**(R35): 学校・病院・役所・気象台・停留場・信号場など観光対象でない候補を名前ベースで落とす。**誤爆防止に「記念館・資料館・美術館・博物館・道の駅・公園・神社・寺・城・滝」等の末尾は保護側を先に評価する**。OSM 側・Wikipedia 側の両方に適用。
6. **受動ログ**(F3): カードのタップ・スクロール到達位置を `localStorage` の `yado.passive.v1` に**端末内だけで**記録し、**送信はしない**(上限200件)。詳細は `docs/passive-log.md`。「今後」節に残っている受動ログ・埋め込みモードの項目は**実装済みなので「今後」から外す**。
7. **残すこと(必須)**: 「`rank()` は暫定実装で結果が有名どころに偏る」「認知外の穴場を出すアルゴリズムは研究課題(`09_研究ノート`)で、`rank()` は差し替え前提の1関数」の2点は**現在も事実なので必ず残す**。

### B. URL パラメータ一覧節を新設(README.md「使い方」の後ろが自然)

app.js の実装(1090〜1280行あたり)と**一致**させ、以下を**全て**表で載せる。

| パラメータ | 実装上の値 |
|---|---|
| `?hotel=` | `緯度,経度,宿名`(名前省略可、既定の見出しは「この宿の周辺」) |
| `?q=` | エリア名で検索し地図を寄せる(宿の選択はしない。該当エリアチップを強調) |
| `?fixture=` | `kusatsu` / `hakone` / `dogo` の3種。外部APIを一切叩かない |
| `?embed=1` | `?hotel=` か `?fixture=` と併用したときだけ有効 |
| `?slow=` | `osm800,wiki1500` 形式。段階描画の撮影用(上限10000ms) |
| `?perf=1` | 各段の所要時間を画面最下部と console に出す |
| `?simulate=` | `overpass504`(Overpass だけ混雑) / `empty`(提案0件) |
| `?demo=` | `far` / `suggest` / `recent` / `recentmix` / `zoomout` / `passive` / `imgfail` の7種 |

※ `?demo=` の値は必ず app.js を grep して確認してから書く(推測で書かない)。

### C. 事実と食い違っている記述の修正

- **「自動リトライはしません」(README.md:75)は誤り**。R4 で Overpass の 429/504 は3秒後に1回だけ再試行し、それでも駄目なら Wikipedia だけで提案を出す(画面は空にならない)。正しく書き直す。
- **「開発者向け」節(README.md:112)の「10本」は現在13本**(`scripts/check-*.mjs` は13ファイル、check-all は13本を直列実行)。実際に `ls scripts` で数えてから書く。
- ファイル構成節に `scripts/`・`fixtures/`・`demo/`・`docs/` の1行説明を足す(現在 `assets/` と `index.html` しかない)。

### D. docs/ROADMAP.md の畳み込み

`[x] 2026-09-16` の完了済み項目を **「## 完了(2026-09-16)」節**に移して1箇所にまとめる。**未完了の `[ ]` 項目(R2-1 / R11 / R14 / R19 / R28 / R37 / R39 / R40 / R41)は本文の元の位置・元の文面のまま残す**(R41 は完了後に `[x]` にする)。項目の文面は書き換えない・削除しない。

## 完了条件(検証可能)

1. README の URL パラメータ一覧が app.js の実装と一致し、`fixture` / `simulate` / `demo` / `embed` / `hotel` / `q` / `slow` / `perf` の**8つを全て網羅**している。
2. `node docs/check.mjs` が全項目 OK・exit 0(README 画像リンク検査 = `docs/shots/state-a.jpg` / `state-b.jpg` / `embed.jpg` の3行を含む)。
3. `node scripts/check-all.mjs` が13本全 PASS・exit 0。
4. `git diff --stat -- assets fixtures index.html demo scripts` が**空**(コード無変更の証明)。
5. README に残っている「暫定 rank は有名どころに偏る」「認知外アルゴリズムは研究中」の2文が消えていない(grep で確認)。
6. ROADMAP の未完了項目が9件そのまま残っている(R41 のみ `[x]` 化)。

## 検証手順

1. `node docs/check.mjs` → 全 OK・exit 0。
2. `node scripts/check-all.mjs` → 13本 PASS。
3. `git diff --stat -- assets fixtures index.html demo scripts` が空であること。
4. 画面変更なしのため**撮影は省略してよい**(その旨を NIGHTLOG に明記する)。
5. `docs/NIGHTLOG.md` に3行(やったこと/確認結果/次)を追記 → コミット → push。

## 変更禁止範囲

`assets/` 配下の全ファイル、`fixtures/` 配下、`index.html`、`demo/`、`scripts/` 配下。**コードは1行も触らない。**

## 難易度・所要目安

sonnet / 20〜30分(README 精読10分・執筆10分・検証5分)。
