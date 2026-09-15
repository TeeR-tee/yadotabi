# NEXT — R42 カード要約の「…」を句点優先で切る

**選定理由**: R2-1 は朝の相談待ち、R14/R19/R40 は Overpass を叩く(fixture 再生成)必要があり無料APIのマナー上サイクル内に収めにくい。R42 は engine.js の1関数 + テストだけで完結し、3 fixture で目視比較でき、外部API 0回で回せるため。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\assets\engine.js` (実装)
- `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\check-engine.mjs` (テスト追加・既存1件の修正)

## 現状(実物を読んだ結果)
- `assets/engine.js:36` `var SUMMARY_MAX_CHARS = 120;`
- `assets/engine.js:289-296` 要約整形の本体:
  ```js
  /** 文字列を最大長で切って「…」を付ける。null/空文字は null。 */
  function truncate(text, maxChars) {
    if (typeof text !== 'string') return null;
    var s = text.trim();
    if (!s) return null;
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + '…';
  }
  ```
- 呼び出しは1か所だけ: `assets/engine.js:820`
  `summary: truncate(stripCoordPrefix(item.summary), SUMMARY_MAX_CHARS),`
- 前段の `stripCoordPrefix()` は `assets/engine.js:281`。**触らない**(座標除去はそのまま先に効かせる)。

## 実装方針
1. `truncate()` を「上限手前の最後の句点で切る」方式に変える。関数名は `truncate` のまま(呼び出し側 engine.js:820 は無変更)。
2. ロジック:
   - `s.length <= maxChars` なら従来どおりそのまま返す(「…」なし)。
   - そうでなければ `head = s.slice(0, maxChars)` の中で**最後の「。」の位置** `idx = head.lastIndexOf('。')` を取る。
   - `idx >= 0 && (idx + 1) >= Math.floor(maxChars * 0.6)`(=120字なら72字以上)なら `s.slice(0, idx + 1)` を返す。**この場合「…」は付けない**(文として完結しているため)。
   - 条件を満たさない(句点が無い/前すぎる)ときは従来どおり `s.slice(0, maxChars) + '…'`。
3. 閾値 `0.6` は `var SUMMARY_SENTENCE_MIN_RATIO = 0.6;` のような名前付き定数にして `SUMMARY_MAX_CHARS` の近く(engine.js:36 付近)に置き、コメントで「短すぎる要約を避けるための下限」と書く。
4. `rank()` / `baseScore()` / 重み・閾値・カテゴリ多様性・除外ルール・`stripCoordPrefix` は**一切触らない**。`truncate` は表示整形専用で順位に影響しないことを確認してから進めること(engine.js:820 の present 段でしか呼ばれない)。

## 完了条件(検証可能)
- [ ] `node --check assets/engine.js` 通過。
- [ ] `node scripts/check-all.mjs` が **14本全 PASS(exit 0)**。
- [ ] `scripts/check-engine.mjs` の**既存アサーション** `scripts/check-engine.mjs:119`
  `ok(saino.summary.length === 121 && saino.summary.endsWith('…'), ...)`
  は新仕様で成立しなくなる可能性が高い。実際の値を確かめ、**期待値を新仕様に合わせて書き直す**(無効化・削除はしない)。
- [ ] 新規テストを最低5ケース追加:
  1. 上限以下 → そのまま(「…」なし)
  2. 上限超で 60%以降に句点あり → その句点までで終わり、末尾が「。」で「…」を含まない
  3. 上限超で句点が 60%より手前にしかない → 従来どおり 120字+「…」(長さ121)
  4. 句点が1つも無い長文 → 従来どおり 120字+「…」
  5. 句点がちょうど境界(maxChars 直前/直後)にあるケースの off-by-one
- [ ] `node scripts/dump-rank.mjs kusatsu` / `hakone` / `dogo` の**並び順に差分が無い**こと(要約文面だけが変わる。順位が動いたら実装が rank に触れている証拠なので差し戻す)。

## 検証手順(撮影+目視)
1. ローカルサーバを立て、外部APIなしで以下を mobile で撮影(`node C:\workspace\tools\shot\shot.mjs <URL> --mobile`):
   - `?fixture=kusatsu`(1位 光泉寺)
   - `?fixture=hakone`(1位 早雲寺)
   - `?fixture=dogo`(1位 伊佐爾波神社)
2. 撮った3枚を **Read で開いて目視**し、次を確認して NIGHTLOG に書く:
   - 1位カードの要約が**文の途中で切れていない**(末尾が「。」か、句点が無いケースだけ「…」)
   - 要約が極端に短くなっていない(1行しか出ないカードが増えていないか)
   - カード30枚・番号ピン1〜30 判読可・文字崩れ/重なり/はみ出しなし・コンソールエラー0件
3. 余裕があれば before/after の1位要約文を NIGHTLOG に1行ずつ並べて比較を残す。

## 変更禁止範囲
- `rank()` / `baseScore()` / 重み・閾値・カテゴリ多様性の減点(engine.js)
- `assets/geo.js` 全体
- `fixtures/*.json`(再生成しない。Overpass / Wikipedia を**叩かない**)
- `stripCoordPrefix()` と `COORD_PREFIX_RE`

## 難易度・所要
- 難易度: **sonnet**
- 所要目安: 25〜40分(実装10分 / テスト10分 / check-all 約1分 / 撮影・目視10分 / コミット+push)

## 仕上げ
- `docs/ROADMAP.md` の R42 を `[x] 2026-09-16` にする。
- `docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)を追記。
- コミット→`git push`(1行の日本語メッセージ)。
