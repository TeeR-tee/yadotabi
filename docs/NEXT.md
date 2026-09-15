# NEXT: R12 OGPメタタグ(SNS/LINE共有カード対応)

判断理由: 現状 index.html にも demo/hotel-page.html にも og:/twitter: タグが1つも無く、本番URLをLINEやXに貼っても白いリンクのままで「何のサイトか」が伝わらない。数行の追加で公開物の価値に直結し、視覚崩れのリスクもゼロなので最優先。

難易度: sonnet / 所要目安: 15〜25分

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` (head のみ)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\og.png` (新規・コミットする画像)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` (R12 を `[x] 2026-09-16` に)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` (3行追記)

## 実装方針

### 1. og:image 用の画像を用意する
- 素材は既存スクリーンショット `screenshots\2026-09-15T19-37-30_127.0.0.1_3000_fixture_kusatsu_simulate__f4-empty_mobile.png` (320KB) ではなく、**内容が伝わる `screenshots\2026-09-15T19-37-38_127.0.0.1_3000_fixture_kusatsu_f4-normal_mobile.png`(カードが並んでいる画面)** を使う。
- ただし縦長モバイル画面のままだと OGP カードで上下が切られる。**上部から横幅いっぱい・縦は幅の約0.52倍(=OGP推奨 1.91:1 に近い横長)を切り出す**か、横長キャンバス(1200x630)の中央にスクショを縮小配置する。
- 外部サービス・有料ツールは禁止。Node 標準だけでは画像加工できないので、**`node C:\workspace\tools\shot\shot.mjs` で新規に撮り直すのが最も簡単**。推奨: `?fixture=kusatsu&embed=1` をデスクトップ幅で撮ると地図+カードが横長に収まる。shot.mjs にビューポート指定オプションがあればそれで 1200x630 相当を狙う。無ければ既存のデスクトップ撮影を流用してよい。
- 保存先は `docs\og.png`。**200KB以下**にすること(超える場合は撮影解像度を下げる/PNG最適化。ImageMagick 等が無ければ撮影時の幅を小さくして調整)。
- 画像が用意できないと判断したら、**og:image だけ省略して title/description/url/type だけで完了してよい**(このタスクの本体はテキストメタ)。その場合その旨を NIGHTLOG に書く。

### 2. index.html の `<head>` にメタタグを追加
既存の `<title>やどたび - 宿を選ぶだけ</title>` の直後に、以下を追加する(値は例、日本語はそのまま可):

- `<meta name="description" content="...">` — 「宿を選ぶだけで、まわりの見どころが並びます。入力は不要。」程度の1文(全角60字以内)
- `<meta property="og:type" content="website">`
- `<meta property="og:site_name" content="やどたび">`
- `<meta property="og:title" content="やどたび - 宿を選ぶだけ">`
- `<meta property="og:description" content="(description と同文)">`
- `<meta property="og:url" content="https://teer-tee.github.io/yadotabi/">`
- `<meta property="og:image" content="https://teer-tee.github.io/yadotabi/docs/og.png">`
  - **絶対URLにすること**(相対パスだと LINE/X のクローラが解決できない場合がある)
- `<meta property="og:image:width" content="1200">` / `height` — 実寸に合わせる
- `<meta property="og:image:alt" content="やどたびの画面。宿のまわりの見どころがカードで並ぶ">`
- `<meta name="twitter:card" content="summary_large_image">`
- `<meta name="twitter:title" content="...">` / `twitter:description` / `twitter:image`(og と同値)
- ついでに `<link rel="canonical" href="https://teer-tee.github.io/yadotabi/">` も入れてよい

注意: og:url / og:image は本番の GitHub Pages サブパス `/yadotabi/` を含む絶対URL。ローカル(127.0.0.1:3000)では画像が解決できないが正常。

### 3. demo/hotel-page.html は今回いじらない
営業デモは共有対象ではないので対象外。head への追記は index.html のみ。

## 完了条件
1. push 後、以下がすべて1行以上ヒットする(反映に数分かかるので失敗したら1〜2分待って再実行):
   ```
   curl -s https://teer-tee.github.io/yadotabi/ | grep og:
   ```
   → `og:type` `og:title` `og:description` `og:url` (+ og:image を入れたなら og:image)が出ること
2. `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://teer-tee.github.io/yadotabi/docs/og.png` が `200` で、サイズが **204800 以下**であること(og:image を入れた場合のみ)
3. `node docs\check.mjs` が全項目OK・終了コード0
4. 画面のデグレが無いこと(下記の検証手順)

## 検証手順
1. ローカルサーバを起動し、`node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile` を撮って Read で目視。**カード30枚・番号ピン判読可・ヘッダー「草津温泉(固定データ)」**が従来どおりであること(head へのメタ追加なので見た目は不変のはず。変わっていたらタグの書き間違い)。
2. `?demo=zoomout` の mobile も1枚撮り、チップ行と地図が従来どおりであること。
3. コミット → push。
4. 上の「完了条件」の curl 2本と `node docs\check.mjs` を実行し、出力をそのまま NIGHTLOG に貼る。

## 変更禁止範囲
- `assets\app.js` `assets\geo.js` `assets\engine.js` `assets\*.css` — **一切触らない**(今回は head のテキスト追加のみ)
- `fixtures\*.json` — 触らない
- `demo\hotel-page.html` `demo\embed-check.html` — 触らない
- `index.html` の `<body>` 以降 — 触らない
- git stash / reset --hard / checkout でのファイル復元 — 禁止
- 有料API・外部OGP画像生成サービス — 禁止(コスト0円原則)

## 終わったら
- ROADMAP の R12 行を `- [x] 2026-09-16 R12 ...` にする
- NIGHTLOG に「やったこと / 見た目の確認結果 / 次」の3行を追記(curl 出力を含める)
- **先にコミット・push してから、報告は簡潔に**(長文の報告書を書かない)
