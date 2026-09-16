# 受動ログ(passive log)

## 目的

将来 rank(engine.js の並び順ロジック)の重みを実データで検証するための材料。
**いまは送信も分析もしない。端末内(localStorage)にだけ黙って残す。** ユーザー操作を求めるUIは一切無い。

## キーと上限

- キー: `yado.passive.v1`
- 配列。1件 = 1レコード。上限 **200件**。超えたら先頭から捨てる(`slice(-200)`)。
- 保持期間: **90日**。`passivePush()` が書き込むたびに `t` が90日より古いレコードを落とす(`t` が無い/数値でないレコードは判断できないため残す)。
- 読み書きは `lsGet` / `lsSet`(app.js)を経由し、localStorage が使えない環境(プライベートモード等)では例外を握りつぶして何も記録しない。カード描画自体は落ちない。

## レコード形式

共通フィールド: `t`(Date.now() のミリ秒), `type`。

| type | 発生タイミング | フィールド |
|---|---|---|
| `view` | フィードの読み込みが `done` になった最初の1回(宿×カード枚数の組で重複防止) | `hotel:{id,name,lat,lon}`, `topIds`(上位10件の card.id 配列), `n`(全カード枚数) |
| `tap` | カード本体(リンク以外)をタップ | `hotelId`, `cardId`, `cardName`, `index` |
| `link` | カード内のリンク(Googleマップ・公式・Instagram等)をタップ | `hotelId`, `cardId`, `cardName`, `index`, `label`(リンクの表示文字列), `url` |
| `seen` | スクロールで新しいカードが画面に入ったとき(1秒 debounce・最大到達位置のみ) | `hotelId`, `maxIndex`(0始まりの最大到達 index) |

## 収集しないもの

- 個人情報は入れない。
- 位置情報の実測値(GPS等)は入れない。宿・カードの緯度経度は URL やフィードにもとから出ている公開情報なので可。
- 検索クエリの文字列は入れない。

## 対象外

- 「もっと遠く」(`.far__item a`, `els.feedFar` 側)のリンクタップは対象外。`feedList` のクリック委譲に乗らないため。

## 見る方法

- `?demo=passive` を付けて開くと、画面下部に直近10件のログボックスが表示される(フラグが無ければ何も生成されない)。
- DevTools のコンソールで `JSON.parse(localStorage['yado.passive.v1'])`。
