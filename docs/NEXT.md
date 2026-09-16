# NEXT — R115 wiki単独候補のカテゴリ誤判定(名前の「温泉」に引きずられる)

- タスクID: **R115**
- 難易度: **sonnet**(変更は engine.js の1関数+定義表のみ。判断の材料は下に全部実測済み)
- 所要目安: 25〜35分(実装10分・4エリア dump-rank 比較10分・撮影と check-all 15分)

## 目的
`?fixture=kusatsu` の4位「草津温泉バスターミナル」と22位「草津温泉スキー場」が、
どちらもカードに**カテゴリ「温泉」**と表示されている。前者はバスターミナル、後者はスキー場で、
ユーザーには「温泉の候補」として並んで見える(R18 で写真・要約の誤併合は直ったが、ラベルは未修正)。

## 実測で判明した前提

### 誤判定はどこで起きているか(engine.js 側だけで直せる — geo.js は無関係)
- 誤判定の4件は**全て `source=wiki` 単独**。OSM 側の `geo.js:573 detectCategory()` / `CATEGORY_RULES`(`geo.js:242`)は
  一切通っていないので、**geo.js を変更する必要は無い**(変更不可の制約を満たす)。
- 該当箇所は engine.js の2つだけ:
  - **`assets/engine.js:230` `WIKI_CATEGORY_HINTS`** — Wikipedia 単独候補のカテゴリ推定表。
    `engine.js:232` の `{ category: 'hot_spring', label: '温泉', words: ['温泉'] }` がそのまま**名前に「温泉」を含めば温泉**にしている。
  - **`assets/engine.js:527` `guessWikiCategory(title, extract)`** — `engine.js:531-536` が**先に title を `indexOf` で走査**するため、
    「草津温泉バスターミナル」は1語目のループで `hot_spring` に確定し、extract は一度も読まれない。
    呼び出し元は `engine.js:553`(`fromWikiArticle`)の1箇所のみ。
- `castle`(`engine.js:233` `'城'`)も同じ構造の地雷だが、今回の実測では4エリアとも誤判定0件なので**今回は触らない**。

### extract は正解を持っている(実測・fixtures から直接抽出)
Wikipedia の冒頭文は必ず「〜は…である/…にある○○」と**自分が何であるか**を書いている。

| 候補 | 現ラベル | extract 冒頭(fixture 実値) | 正しい種別 |
|---|---|---|---|
| 草津温泉バスターミナル | 温泉 | 「…にある**バスターミナル**である。」 | 交通施設 |
| 草津温泉スキー場 | 温泉 | 「…に位置する**スキー場**。」 | レジャー |
| 冠山 (松山市) (dogo 7位) | 温泉 | 「…松山市の道後温泉にある小高い**山**。」 | 山 |
| 鶴見園 (beppu 10位) | 温泉 | 「…にかつて存在した**遊園地**。」 | 遊園地跡 |

### 修正で影響を受ける候補の全件(4エリア dump-rank 実測・cards+more)
**名前に「温泉」を含むが実際は温泉でない(=直したい4件)**
- kusatsu cards 4位 草津温泉バスターミナル / kusatsu cards 22位 草津温泉スキー場
- dogo cards 7位 冠山 (松山市)(名前に「温泉」は無く **extract 経由**で温泉になっている特殊例)
- beppu cards 10位 鶴見園(同じく extract 経由)

**カテゴリ「温泉」のまま残さねばならない(=誤爆させてはいけない5件)**
- kusatsu more 3位 花敷温泉(「…にある**温泉**。」)
- hakone cards 9位 天成園(「…にある**温泉ホテル**。」)
- hakone cards 10位 一の湯(「…老舗**温泉旅館**である。」)
- beppu cards 18位 杉乃井ホテル(「…大型リゾート**ホテル**」) ※ 温泉のままでも宿併設なので実害なし
- beppu cards 30位 大江戸温泉物語 別府清風(「…にある**温泉ホテル**である。」)

他カテゴリで `source=wiki` の候補(kusatsu 10/11位の国立公園、17位 常布の滝 等)は**語の当たり方が変わらないこと**を差分で確認する。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js`(**唯一の変更対象**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs`(ケース追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` / `docs\NIGHTLOG.md`(記録)

## 実装方針
`guessWikiCategory()`(`engine.js:527`)に、**title で当たった結果を extract で否認する経路**を1本足す(既存の走査順・戻り値の形は変えない)。

1. `engine.js:230` の `WIKI_CATEGORY_HINTS` の hot_spring 行に、**否認語 `deny`** を持たせる:
   `deny: ['バスターミナル', 'スキー場', '遊園地', '球技場', '駅', '空港', '学校']` 程度。
   他のカテゴリ行には `deny` を付けない(今回の対象外・誤爆源になる)。
2. `guessWikiCategory()` の **title 走査(`engine.js:531-536`)で当たったとき**だけ、
   `hint.deny` があれば `title` と `extract` の**先頭120字**に否認語が含まれるかを見て、
   含まれるなら**その hint を採らず次の hint へ進む**(全部落ちたら従来どおり `{category:'other', label:'スポット'}`)。
3. extract 走査(`engine.js:537-542`)側にも同じ否認を通す(「冠山」「鶴見園」はこちらの経路)。
   ただし `deny` 語が extract に出るのは「〜である/〜にある」の定義部分なので**先頭120字に限定**すること
   (末尾まで見ると「近くにスキー場がある」のような記述で正当な温泉記事を落とす)。
4. 上記だけで4件が `other`(ラベル「スポット」)に落ち、5件は温泉のまま残る。
   **新しいカテゴリ(交通施設・レジャー等)は作らない**(カテゴリ多様性の減点計算 `engine.js:959-972` に影響するため)。

## 完了条件
- 4エリアで `node scripts/dump-rank.mjs <area>` を修正前後で取り、差分が**次のとおり**であること:
  - **kusatsu**: 4位のラベルが `温泉`→`スポット`、22位のラベルが `温泉`→`スポット`。**more 3位 花敷温泉は `温泉` のまま**。
  - **dogo**: 7位「冠山 (松山市)」のラベルが `温泉`→`スポット`。
  - **beppu**: 10位「鶴見園」のラベルが `温泉`→`スポット`。**18位・30位は `温泉` のまま**。
  - **hakone**: **完全に無差分**(9位・10位が `温泉` のまま)。
- 順位の入れ替わりは起きてよい(カテゴリ多様性の減点 `engine.js:972` が動くため)が、
  **入れ替わったら全件を目視し、落ちた候補・上がった候補を NIGHTLOG に書く**こと。
- `scripts/check-engine.mjs` に「否認が効く4ケース」「温泉のまま残る5ケース」を追加。

## 検証手順
1. `node --check assets/engine.js`
2. 4エリア `node scripts/dump-rank.mjs <area>` の before/after 比較(上の完了条件どおりか)
3. 撮影(いずれも fixture・外部API 0回):
   - `http://127.0.0.1:3000/?fixture=kusatsu` を **mobile 375** と **desktop 1280**
   - `http://127.0.0.1:3000/?fixture=beppu` を **mobile 375**
   - 画像を Read で開き、4位・22位のカードのカテゴリラベルと文字崩れ・はみ出しを目視
4. **`node scripts/check-all.mjs` が 29本全緑**(必須)

## 変更禁止範囲
- **rank の重み・閾値は変更不可**(`WEIGHT` / `CATEGORY_FREE_SLOTS` / `CATEGORY_PENALTY` に一切触れない)
- **`assets/geo.js` は変更不可**(`CATEGORY_RULES` を含む)。**`fixtures/*.json` の再生成も不可**
- `git stash` / `git reset` / `git checkout` によるファイル復元は禁止
- **外部API 0回**(Overpass / Nominatim / Wikipedia を叩かない。撮影は全て `?fixture=`)
- 表示文言・CSS は変更しない(ラベル文字列は `WIKI_CATEGORY_HINTS` の既存 label をそのまま使う)

## 終わったら
1. `docs/ROADMAP.md` の R115 行を `- [x] 2026-09-16 R115 …` に更新
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に3行追記(やったこと / 見た目の確認結果 / 次)
3. **先にコミット**(1行の日本語メッセージ)
4. `git push`
5. **報告は簡潔に**(長文の報告書を書かない)
