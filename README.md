# やどたび (v3)

**What this is**: Yadotabi is a static, mobile-first web app that suggests nearby sights around a hotel from just its coordinates — no user input required. **How to try**: open `https://teer-tee.github.io/yadotabi/`, or add `?fixture=kusatsu` to see a demo with no external API calls. **No API keys needed**: it only uses free public APIs (OpenStreetMap / Overpass / Wikipedia), at zero cost.

<table>
  <tr>
    <td align="center"><img src="docs/shots/state-a.jpg" width="240" alt="地図から宿を選ぶ画面"><br>①宿を選ぶ</td>
    <td align="center"><img src="docs/shots/state-b.jpg" width="240" alt="周辺スポットのカードが並ぶフィード画面"><br>②周辺が流れてくる</td>
    <td align="center"><img src="docs/shots/embed.jpg" width="240" alt="予約サイト風ページに埋め込んだ様子"><br>③他サイトに埋め込める</td>
  </tr>
</table>

宿を選ぶだけ。ボタンも設定もなし。地図の宿ピンをタップするか、検索欄に名前を打って候補をタップするだけで、その宿の周辺のおすすめスポットが写真つきカードでどんどん流れてくるスマホファーストの静的Webアプリです。泊数や移動手段を選ばせたり、「行った!」を押させたりする操作は一切ありません。

## 起動方法

1. `start-server.bat` をダブルクリックする
2. 自動でブラウザが開き、`http://localhost:3000` が表示される
   (開かない場合は手動でブラウザを開いてこのURLにアクセスしてください)

※ 初回はNode.jsのパッケージ `serve` を一時的にダウンロードするため、少し時間がかかることがあります。

## 使い方

宿を選ぶ入口は3つあります。どれを使っても、選んだ瞬間に周辺提案フィードの画面に切り替わります。

1. **地図の宿ピンをタップする**: 最初に開くと地図(初期表示は草津温泉)が出て、表示範囲内の宿・旅館が自動でピン表示されます。地図を動かすとその範囲の宿を取り直します。ピンをタップするだけで選択完了です。
2. **検索欄に打って候補をタップする**: 上部の検索欄に宿名やエリア名を打つと、打つそばから候補が一覧で出ます。宿の候補をタップすれば選択完了、地名の候補をタップすると地図がそこへ寄ります(選択にはなりません)。検索欄をフォーカスすると、直前に選んだ「最近の宿」も候補として出ます。
3. **URLで直接指定する**: `?hotel=<緯度>,<経度>,<宿名>` を付けてアクセスすると、その宿を選んだ状態で直接フィード画面が開きます。`?q=<エリア名>` を付けると、そのエリア名で検索して地図を寄せた状態(宿の選択はしない)で開きます。`?fixture=hakone`(または `kusatsu` / `dogo`)を付けると、外部APIを叩かずに保存済みの固定データでフィード画面を再現します(撮影・検証用)。

その他の操作:
- 画面上部の「草津」「伊香保」「箱根」などの**エリアチップ**をタップすると、その温泉地へ地図が飛びます。
- フィード画面の左上の「←」で地図(宿を選ぶ画面)に**戻る**ことができます。
- フィード内のカードが車で1時間を超える距離の場合は、フィードには出さず「**もっと遠く**」という折りたたみに静かにまとめられます。
- 車で60分以内でも遠いものはフィードの後方に並びます。○△×のような合否表示はありません。

**他サイトへの埋め込み(`?embed=1`)**: `?embed=1` を `?hotel=` と一緒に付けると、検索欄・エリアチップ・宿を選ぶ地図・戻るボタンを隠し、**小地図と提案フィードだけ**の表示になります。宿の予約ページに「周辺の見どころ」として iframe で貼る用途を想定しています(高さは親側の iframe が決めます)。

```html
<iframe src="https://teer-tee.github.io/yadotabi/?embed=1&hotel=36.6226,138.5960,草津温泉"
  style="width:100%;max-width:420px;height:720px;border:1px solid #ddd" title="やどたび"></iframe>
```

`?embed=1` だけで宿の指定が無いときは、通常どおり宿を選ぶ画面が出ます(空白になりません)。ローカルでの見え方は `demo/embed-check.html` で確認できます。

営業用デモ: `demo/hotel-page.html`(本番URL https://teer-tee.github.io/yadotabi/demo/hotel-page.html )。予約サイト風の架空の宿ページに埋め込みモードを iframe で置いた1枚で、予約サイト運営者への説明資料として使えます。

## 仕組み(かんたん解説)

- **宿の取得**: [Overpass API](https://overpass-api.de/)(OpenStreetMapのデータを検索できるサービス)を使い、地図の表示範囲内にあるホテル・旅館・ゲストハウスなどを取得してピン表示しています。
- **候補検索**: 検索欄に打った文字は [Nominatim](https://nominatim.openstreetmap.org/)(OpenStreetMapの無料ジオコーディングサービス)に投げて、宿名・地名の候補を即時に取得しています。
- **周辺スポットの取得**: 宿を選ぶと、Overpass APIで周辺の観光地・施設情報を、日本語版Wikipediaの周辺記事検索(geosearch)で近くの記事とその写真・要約を、それぞれ並行して取得し、1つの候補リストに統合しています。Wikipedia側は1回のgeosearchでは取り切れない範囲を補うため、同じ中心から半径3km/6km/10kmの同心円3段に分けて呼び、pageidで重複を除いてマージしています(本番のみ。fixtureモードは保存済みデータをそのまま使うため1回)。片方のAPIが失敗しても、取れた方だけでフィードを作ります。
- **段階描画**: OSM側の解決が先に終わった時点で最初のカードを先に出し、Wikipedia側の到着を待たせません(`?slow=osm800,wiki1500` のようにURLパラメータで遅延を指定すると、誰でもこの段階描画を再現できます)。
- **重複マージ**: 表記違いで別々に取れた同一地点(例: 「湯畑源泉」と「湯畑」)は1件にまとめ、短い方の名前を代表として残します。OSM要素の `wikipedia`/`wikidata` タグがあればそれも使ってWikipedia側と突き合わせます。ただし名前が一部一致するだけでは同一視せず、差分が別施設を示す語(足湯・バスターミナル等)なら別物として区別しています。
- **除外ルール**: 学校・病院・役所・気象台・停留場・信号場など観光対象ではない候補は名前から判定して除外しています。「記念館・資料館・美術館・博物館・道の駅・公園・神社・寺・城・滝」等で終わる名前は誤って除外されないよう先に保護判定してから除外ルールを適用します(OSM側・Wikipedia側の両方に適用)。
- **提案エンジン(`engine.js`)**: 「**集める(collect)→並べる(rank)→整形する(present)**」の3段構成になっています。collectでOSMとWikipediaの候補を集めて重複を1つにまとめ、rankでスコア順に並べ替え、presentで写真・1行要約・徒歩/車の分数・外部リンク付きのカードに整形します。
  - **正直な注意点**: `rank()` は現状まだ暫定実装です。Wikipediaに記事や写真がある場所、公式サイトがある場所を優先的に上位へ出すロジックのため、結果はどうしても有名な観光地に偏ります。「まだ知られていない穴場を見つけて出す」ためのアルゴリズムは今後の研究課題であり、`rank()` はそのために差し替えやすいよう1関数に閉じ込めてあります。
- **受動ログ**: 「行った!」のような操作は求めず、どのカードがタップされたか・どこまでスクロールされたかを端末内の `localStorage`(`yado.passive.v1`、上限200件)にだけ記録しています。送信は一切しません。詳細は `docs/passive-log.md` を参照してください。

すべて無料のオープンデータ・サービスを使っており、npm installやビルドは不要です。ブラウザで `index.html` を開くだけで動く素のHTML/CSS/JavaScriptで作られています。

## URLパラメータ一覧

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

## ファイル構成

- `index.html` — 画面のHTML本体。地図で選ぶ「状態A」とフィードを見る「状態B」の2状態を1画面に持つ。
- `assets/app.js` — 画面本体。状態管理・地図表示・検索/エリアチップ/URLの3入口・フィード描画を担当する。
- `assets/geo.js` — 宿の取得・宿候補検索・周辺スポット取得・Wikipedia周辺記事取得などの外部API呼び出しとキャッシュを担当する。
- `assets/engine.js` — 提案エンジン本体。`collect`(集める)→`rank`(並べる)→`present`(整形する)の3段で候補をカードに変換する。
- `assets/style.css` — 画面全体のレイアウト・カードなどのスタイル。
- `assets/ui.css` — 検索欄・チップ・ボタンなど共通UI部品のスタイル。
- `assets/tokens.css` — 色・余白・フォントサイズなどのデザイントークン(共通の値の置き場)。
- `scripts/` — 開発用の検査スクリプト群(`check-*.mjs` と `check-all.mjs`)、および固定データを作る `make-fixture.mjs` など。
- `fixtures/` — `?fixture=` で使う保存済みの外部API応答データ(草津・箱根・道後の3エリア)。
- `demo/` — 営業用デモページ(`hotel-page.html` など)や埋め込み確認用HTML。
- `docs/` — 計画書・研究ノート・自動継続ループの規約(AUTOPILOT/NEXT/NIGHTLOG/ROADMAP)・死活チェックスクリプトの置き場。

## 無料APIのマナー

このアプリは無料の公共APIに支えられています。使いすぎるとサービス側に迷惑がかかり、最悪アクセス禁止(BAN)になるので、次のマナーを守って使ってください。

- **Nominatim**: 1リクエスト/秒を超えないこと(連続検索を高速で繰り返さない)。
- **Overpass API**: 広い範囲や複雑すぎるクエリ(重いクエリ)を投げないこと。
- **OSM地図タイル**: 大量アクセス・自動巡回はしないこと。
- 混雑時は画面に「地図サーバーが混雑しています」というメッセージが出ます。Overpassが混雑(429/504)を返したときは3秒後に自動で1回だけ再試行し、それでも駄目ならWikipediaだけで提案を出します(画面が空になることはありません)。
- 同僚やもっと多くの人に使ってもらってアクセス数が増えてきたら、地図タイルなどを商用サービス(有料)に切り替えることを検討してください。

本番の死活チェックは GitHub Actions で毎日自動実行しています(`.github/workflows/check.yml`)。

## GitHub Pages 公開手順(初心者向け)

同僚に触ってもらうために、無料でWeb公開できる「GitHub Pages」を使います。PowerShellで以下を実行してください。

1. GitHubで空のリポジトリ `yadotabi` を作成する(READMEなどは追加しない「Empty repository」で作成)
2. このフォルダでリモートを設定してpushする

   ```powershell
   git remote add origin https://github.com/<あなたのGitHubユーザー名>/yadotabi.git
   git push -u origin main
   ```

3. GitHubのリポジトリページで `Settings` > `Pages` を開く
4. `Source` を `Deploy from a branch` にし、ブランチを `main` / フォルダを `(root)` にして `Save`
5. 数分待つと `https://<あなたのGitHubユーザー名>.github.io/yadotabi/` でアクセスできるようになる

### 更新するとき

コードを直したら、次の2つのコマンドだけでOKです。

```powershell
git add -A
git commit -m "変更内容を1行で"
git push
```

### 同僚に共有するときの注意

「最近の宿」の記録や検索キャッシュは各自の端末の `localStorage` にしか保存されません。同僚に公開URLを共有しても、あなたの記録が見えたり、記録がみんなで共有されたりすることはありません(それぞれの端末で個別に記録されます)。

## 開発者向け

`node scripts/check-all.mjs` を実行すると、`scripts/check-*.mjs` 12本と `docs/check.mjs` の計13本を1コマンドで直列実行し、結果を表(PASS/FAIL・所要時間)で確認できます。1本でも失敗すると exit code 1 で終了します。一部の検査は内部でPythonの `python -m http.server` を一時起動するため、Python 3 が必要です。

## v1 からの変更点

- ホテル名・泊数・移動手段を入力させるUIをすべて廃止。宿を選んだ瞬間に提案が出る仕組みに変更(入力ゼロ)。
- プラン作成ロジックの `planner.js` と「行った!」記録の `visits.js` を削除。プラン作成は提案エンジン `engine.js` の `rank()` に統合。
- 「定番/発見」「行った!」ボタンなどの○△×的な合否表示を廃止。遠いものは「もっと遠く」に静かに回すだけにした。

## 今後(計画v3/研究ノート参照)

詳細は計画書 `08_計画v3_ホテルを選んだら出る.md` と `09_研究ノート` を参照してください。

- **穴場アルゴリズムの研究**: 現状の `rank()` が有名どころに偏る問題を継続的に研究し、差し替えを検討する。
