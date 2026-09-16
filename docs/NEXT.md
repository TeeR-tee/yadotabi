# NEXT — R127 日本語UIに英語名だけのカードが出る

- **タスクID**: R127
- **難易度**: sonnet
- **所要目安**: 30〜45分
- **外部API**: **0回**(作業役は本番URLを叩かない。撮影は全て `?fixture=` で行う)

## 目的

日本語UIの提案カードに、英語名だけのスポットが混ざるのをやめる。利用者には何の施設か分からず、要約も写真も無いため情報量がゼロのカードになっている。

## 実測で判明した前提(計画役が本番の実データで確認済み)

**本番実データ**: `https://teer-tee.github.io/yadotabi/?hotel=35.6262,134.8055,城崎温泉ごと地湯`(fixture の無い城崎温泉)を撮影したところ、**22位に「Kinosaki Ropeway」**(カテゴリ「観光名所」・徒歩3分・車1分・164m・要約なし・写真なしのプレースホルダ)が出た。実体は現地の「城崎ロープウェイ」。1位〜6位(温泉寺本堂・四所神社・城崎麦わら細工伝承館・玄武洞・来日岳ほか)は正しく日本語で、固定データで直した問題(閉鎖済み施設・他社の宿・カテゴリ誤判定・「記事がありません」の誤表示)の再発は**実データでも確認されなかった**。

**R114 との違い**: R114 は「小田原城」と「Odawara Castle」のような日英**重複**の統合を解いた。今回は**対になる日本語記事が存在しない**英語名の OSM 単独候補で、統合先が無いためそのまま生き残る別の穴。

**fixture でも再現する**(作業役はこれだけで検証できる)。`fixtures/*.json` の `overpass.elements` でラテン文字のみの名前は **41件**(kusatsu 0 / hakone 19 / dogo 2 / beppu 20)。うちカードに到達しているのは **3件**:

| エリア | 位置 | 名前 | OSMタグ | 距離 | 要約/画像/公式 | source |
|---|---|---|---|---|---|---|
| hakone | **cards 17位(可視)** | **Ajisai Bridge** | `{"name":"Ajisai Bridge","tourism":"attraction"}` | 240m | × / × / × | osm |
| beppu | more 1位 | Tsuruya | `{"name":"Tsuruya","natural":"spring"}` | 3617m | × / × / × | osm |
| beppu | more 29位 | OAB Garden Studio Five | `{"leisure":"garden","name":"OAB Garden Studio Five"}` | 11357m | × / × / × | osm |

**安全性の根拠**: 41件すべてが `wikipedia` / `wikipedia:ja` / `wikidata` タグを**1つも持たない**ことを実測済み。よって「要約も画像も無く source=osm のまま」という条件を併せれば、この3件だけを正確に落とせる。

**最重要の落とし穴**: dogo 10位「松山城」は OSM 側が `{"historic":"castle","name":"Matsuyama Castle","opening_hours":"Mo-Su 09:00-17:00","website":"https://matsuyamajo.jp"}` で、R114 の統合により日本語記事へ寄せられて **`source=both`・公式サイト○** になっている。**統合の前に名前で落とすと、この公式サイトリンクごと消える**。必ず統合の後に判定すること。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(本体の変更はここだけ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針

1. `engine.js` に判定ヘルパを1つ足す。日本語文字(ひらがな `\u3040-\u309F` / カタカナ `\u30A0-\u30FF` / 漢字 `\u4E00-\u9FFF`、長音符 `\u30FC` を含む)が名前に1文字も無いことを見る。**全角英数や記号だけで日本語と誤判定しないこと**。
2. 落とす条件は**4つのAND**(1つでも欠けると誤爆する):
   - `item.source === 'osm'`(統合されなかった単独候補)
   - 表示名に日本語文字が1つも無い
   - 要約(extract / summary)が無い
   - `wikipediaTitle` も `wikidataId` も無い
3. **挿入位置は `engine.js:1057-1060` の R80 昇格パス(`item.source = 'both'` にするループ)の直後**。統合(`merged` 構築・`mergeIntoOsm`)より後であることが必須。`merged` から該当要素を除くフィルタを1本足すだけ。
4. `isExcludedName` / `isExcludedArticle` には**入れない**(あれらは統合より前に走るため、松山城の公式サイトを巻き込む)。
5. 画像の有無は条件に入れなくてよい(要約なし+記事タグなしで既に十分絞れている)。

## 完了条件

- hakone cards から「Ajisai Bridge」が消え、beppu more から「Tsuruya」「OAB Garden Studio Five」が消える。
- **dogo 10位「松山城」が `source=both`・公式サイト○ のまま残る**(最重要の回帰確認)。
- `dump-rank` の4エリア差分が、上記3件の除去と以降の繰り上がり**だけ**であること。繰り上がった候補は全件目視し、廃止施設・他社の宿・非観光対象が無いことを確認する。
- kusatsu は完全無差分のはず(ラテン名0件)。
- カード30枚が維持されること。

## 検証手順

1. `node --check assets/engine.js`
2. `node scripts/dump-rank.mjs <area>` を4エリアで変更前後に取り、差分を突き合わせる(特に dogo 松山城の行)。
3. `scripts/check-engine.mjs` にケースを追加(落とす3件 + **残す対照として松山城の統合結果** + 日本語名のOSM単独候補1件)。既存ケースは1件も削らない。
4. **`node scripts/check-all.mjs` が 29本全緑(exit 0)** ← 必須。
5. 撮影して目視: `?fixture=hakone` mobile(17位が入れ替わり、帰属表示「Leaflet | © OpenStreetMap」が右上に読め、ピンの重なり・文字崩れ・はみ出しなし)と `?fixture=dogo` mobile(松山城のデグレ確認)の2枚。画像を Read で開いて確認すること。

## 変更禁止範囲

- **rank の重み・閾値は変更不可**。
- **`assets/geo.js` と `fixtures/*.json` は変更不可**(再生成もしない)。
- `git stash` / `git reset` / `git checkout` でファイルを戻す操作は**禁止**。
- **作業役は外部API 0回**(本番URLを叩かない。撮影は全て `?fixture=`)。
- 既存の検査ケースを削って通さない。

## 終わったら

1. `docs/ROADMAP.md` の R127 を `[x] 2026-09-16` に。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に `### 2026-09-16 R127 <一言>` の見出しを付けて3行追記(やったこと / 見た目の確認結果 / 次)。
3. **先にコミット** → `git push`。
4. 報告は簡潔に(長文の報告書を書かない)。
