# NEXT: R149 5エリア化の取りこぼしを6箇所まとめて塞ぐ

- タスクID: **R149**
- 難易度: 低〜中(検査の期待値更新4箇所 + 文書3箇所。ロジック改変なし)
- 所要目安: 40〜60分(うち `check-all` 1回が約1〜2分)

## 目的

城崎温泉(kinosaki)を5エリア目として追加したのに、**「エリアを列挙している箇所」が4エリアのまま残っている**。
とくに `check-nosummary.mjs` の3つの regression ガードが城崎を一度も開いていないため、
**城崎だけ品質の網が掛かっていない**。R145〜R148 の4サイクルは全て城崎で穴が見つかったエリアであり、
そこにガードが無いのは最も危険。あわせて文書の数字も古い。同種の作業なので**6件まとめて1サイクルで直す**。

## 実測で判明した前提(計画役が Playwright mobile 375x812 と dump-rank で測った)

### 漏れの一覧(ファイル名・行番号つき)

| # | 場所 | 現状 | 直す内容 |
|---|---|---|---|
| 1 | `scripts/check-nosummary.mjs:167` | `const AREAS = ['kusatsu','hakone','dogo','beppu']` | `'kinosaki'` を足して5エリアに。R124「行き止まりカード」検査が城崎を開くようにする |
| 2 | `scripts/check-nosummary.mjs:250-268` | `(r136) c.` 営業時間の総数ガードが `5/4/4/5=18` の**4エリア合計** | kinosaki を加えた5エリア合計に。期待値は**作業役の実測値** |
| 3 | `scripts/check-nosummary.mjs:291-311` | `(r137) c.` 公式ドメインの総数ガードが `9/7/5/11=32` の**4エリア合計** | 同上。kinosaki を加えた5エリア合計に |
| 4 | `README.md:95-103` | 「写真があるカードの割合」表が**4行**・草津の数字も古い(表 15件/50% vs 実測14件) | 5行にし、5エリアとも**作業役の実測値**に直す |
| 5 | `docs/FIXTURES.md:108` | 「`dump-rank` を**4エリア分**取り差分ゼロを確認」 | 「5エリア分」に直す |
| 6 | `docs/NIGHTLOG.md:9` | 朝のまとめ「触ってみるURL」が `?fixture=kusatsu / ?fixture=hakone` の2つだけ | `?fixture=kinosaki` を足す(1行の編集。過去のサイクル記録は1行も消さない) |

### 計画役の実測値(**参考。作業役は必ず自分で測り直して書くこと**)

`?fixture=<area>` を mobile 375x812 で開いて DOM を数えた値:

| area | .feedcard | .feedcard__hours | .feedcard__official | .feedcard--bare | 行き止まり |
|---|---|---|---|---|---|
| kusatsu | 30 | 5 | 9 | 7 | 0 |
| hakone | 30 | 4 | 7 | 9 | 0 |
| dogo | 30 | 4 | 5 | 11 | 0 |
| beppu | 30 | 5 | 11 | 8 | 0 |
| **kinosaki** | 30 | **4** | **4** | **8** | 0 |

`dump-rank` の上位30件で「画像有 ○」の枚数: 草津14 / 箱根11 / 道後10 / 別府11 / **城崎18**(城崎が5エリアで最多)。

### 漏れていなかった箇所(**確認済み・触らなくてよい**)

`scripts/make-fixture.mjs:20-25` AREAS(5件) / `scripts/slim-fixtures.mjs:61`(5件) /
`docs/check.mjs:20-24` TARGETS(5件) / `assets/app.js:1929-1934` SAMPLE_LINKS(5件) /
`scripts/check-sample.mjs:73-78`(6本・前サイクルで修正済み) / `scripts/check-attrib.mjs:185-189`(5件) /
`README.md:3,29,114` パラメータ表(5件) / `README.md:216-220` サイズ表(5行) /
`docs/FIXTURES.md:17-21` 対象エリア表・`:29-33` far 実測表(5行)。

**`assets/engine.js` のコメント中の「4エリア200記事」は変更しない** — それらは各ルールを実測した
**当時の記録**であり、R145/R148 が追記した「5エリア250記事」と併存しているのが正しい状態。

## 対象ファイル(絶対パス)

- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-nosummary.mjs`(#1〜#3)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(#4)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\FIXTURES.md`(#5)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(#6 + サイクル記録)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(完了マーク)

## 実装方針

1. **先に自分で実測する**。`?fixture=kinosaki` を含む5エリアを Playwright で開き、
   `.feedcard__hours` / `.feedcard__official` / `.feedcard--bare` / 行き止まりカードを数える。
   `dump-rank` 5エリアで「画像有 ○」も数える。**上の表は照合用で、書き込むのは自分の数字**。
2. `check-nosummary.mjs:167` の `AREAS` に `'kinosaki'` を追加。
   同ファイルはページを使い回す構造(`beppuPage` / `page`=dogo / `kusatsuPage` / `hakonePage`)なので、
   **kinosaki 用のページを1つ足して同じ形で開き、`finally` の前で `close()` するのを忘れない**。
3. `(r136) c.` と `(r137) c.` の合計計算に kinosaki の件数を加え、`ok()` の条件式・メッセージ・
   デバッグ出力オブジェクトを5エリアぶんに揃える。コメントに
   `2026-09-18 R149 実測: kusatsu …/ kinosaki … = 合計…` を1行残す。
4. README の表に城崎の行を足し、5行とも実測値に直す(割合は 30 で割った整数%)。
5. FIXTURES.md の「4エリア分」→「5エリア分」。
6. NIGHTLOG の「触ってみるURL」に城崎を1つ足す。

**やらないこと**: 新しい検査ファイルの追加、`check-nosummary` の既存ケースの削除、
engine/app/style の変更、カードの順位や枚数を動かす変更。

## 完了条件

1. 上記6箇所すべてが5エリアに揃っている(`grep -n "kinosaki" scripts/check-nosummary.mjs README.md docs/FIXTURES.md docs/NIGHTLOG.md` で確認できる)。
2. `check-nosummary` の3ガードが城崎を含み、期待値が**作業役自身の実測値**である。
3. 城崎の件数を1つずらした値を一時的に入れると**その検査が赤くなる**ことを1回だけ確かめる(ガードが効いている証拠。確認後は必ず正しい値に戻す)。
4. カードの順位・枚数が1つも動いていない(`dump-rank` 5エリアが作業前後で**完全無差分**)。
5. `node scripts/check-all.mjs` **29本全緑**。

## 検証手順

```
cd C:\workspace\claude\旅行先用サイト\yadotabi
for a in kusatsu hakone dogo beppu kinosaki; do node scripts/dump-rank.mjs $a > before-$a.txt; done
# (実測 → 編集)
for a in kusatsu hakone dogo beppu kinosaki; do node scripts/dump-rank.mjs $a > after-$a.txt; diff before-$a.txt after-$a.txt; done   # 全て差分ゼロ
node scripts/check-nosummary.mjs      # 単体で緑
node scripts/check-all.mjs            # 29本全緑
```

`before-*.txt` / `after-*.txt` は確認後に削除する(リポジトリに残さない)。

## 変更禁止範囲

- **rank の重み・閾値の変更禁止**(検査と文書だけ。カードの順位・枚数は1つも動かさない)。
- **`assets/geo.js`・`fixtures/*.json` の変更禁止**。
- **入力UIの追加禁止**(ユーザー入力ゼロの原則)。
- **外部API 0回**(全て `?fixture=` で行う)。
- **数値は作業役が自分で実測して書く**(この文書の表を写経しない)。
- `git stash` / `reset --hard` / `checkout` でファイルを戻す操作は禁止。

## 終わったら

1. `docs/ROADMAP.md` の R149 を **`[x] 2026-09-18`** に変える。
2. `docs/NIGHTLOG.md` の**ファイル末尾**の「## サイクル記録」節の末尾に
   `### 2026-09-18 R149 <一言>` の見出しを付けて3行(やったこと / 見た目の確認結果 / 次)を追記する。
   **ファイル先頭に新しい節を作らない**。
3. **先にコミット**する(1行の日本語メッセージ)。報告文を書く前にコミットすること。
4. `git push`。
5. **報告前に `git log --oneline -1` を実行して実際のハッシュを確認する**(推測で書かない)。
6. 報告は簡潔に。長文の報告書は書かない。
