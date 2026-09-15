# NEXT: R26 README にスクリーンショット3枚を貼る

**選定理由(1行)**: 残タスク R11/R14/R19 はいずれも rank・fixture の中身に踏み込む調査寄りで1サイクルに収まりにくいのに対し、R26 はコード無変更・見た目のリスクゼロで「本番URLを開く前に何のアプリか分かる」という公開価値が最も大きいため。

難易度: **sonnet** / 所要目安: **20〜30分**

---

## 目的

README の冒頭を見ただけで「地図から宿を選ぶ → 周辺スポットのカードが流れる → 他サイトに埋め込める」が伝わるようにする。GitHub リポジトリページと、英語段落を読む海外訪問者の両方に効く。

## 対象ファイル(絶対パス)

- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\shots\state-a.jpg`
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\shots\state-b.jpg`
- 新規: `C:\workspace\claude\旅行先用サイト\yadotabi\docs\shots\embed.jpg`
- 編集: `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`
- (必要なら)新規: `C:\workspace\claude\旅行先用サイト\yadotabi\scripts\make-shots.mjs`

## 実装方針

### 1. 3枚の撮り直し(既存 PNG の流用ではなく再撮影)

`screenshots/` の既存ファイルは 1〜6MB の PNG でサイズ過大なので、**Playwright で撮り直して JPEG 品質 75 で保存する**のが最も簡単(npm install 禁止のため、Playwright は既存スクリプトと同じく
`file:///C:/workspace/tools/shot/node_modules/playwright/index.mjs` を絶対パスで import する)。
`scripts/check-more.mjs` の「ローカルサーバーが無ければ自分で起動して最後に落とす」構造をそのまま流用してよい。

撮影仕様(3枚共通): `viewport { width: 375, height: 780 }`、`deviceScaleFactor: 1`(実寸のまま。拡大しない)、`page.screenshot({ type: 'jpeg', quality: 75, path: ... })`、フルページではなくビューポート内。地図タイルとカード画像の読み込みを待つため `waitForLoadState('networkidle')` か固定待機 2000ms を入れること。

| ファイル | URL | 写すもの |
|---|---|---|
| `docs/shots/state-a.jpg` | `http://127.0.0.1:3000/?q=草津温泉` | **状態A**: 地図に♨の宿ピンが実際に出ている状態。`?demo=zoomout`(ズーム不足バナー)は使わない。宿ピンが出ない/混雑した場合の代替は `?fixture=kusatsu&hotel=36.6226,138.5960` ではなく、**素の状態Aで宿ピンが出るまで最大2回だけ再試行**(外部APIは1サイクル2回までのマナー厳守)。それでも出なければ ROADMAP に起票して state-a は後回しにし、2枚で README を先に整える |
| `docs/shots/state-b.jpg` | `http://127.0.0.1:3000/?fixture=kusatsu` | **状態B フィード**: 見出し「草津温泉(固定データ)」+小地図の番号ピン+1枚目のカード(光泉寺)が入る構図 |
| `docs/shots/embed.jpg` | `http://127.0.0.1:3000/demo/hotel-page.html` | **埋め込みデモ**: 予約サイト風ページに iframe が載っている様子。宿名と「このお宿のまわり(やどたび)」見出しと iframe 内カードが1画面に入るよう `page.evaluate` で iframe 見出しの位置まで `scrollIntoView` してから撮る |

各ファイルは **150KB 以下**。超えたら quality を 70 → 65 と下げる(高さを縮めるのは最後の手段)。

### 2. README への貼り付け

貼る位置は **冒頭の英語段落(3行目)の直下、日本語の紹介文(5行目)の上**。HTML の `<table>` で横並び1行3列にする(GitHub は Markdown の画像を横並びにできないため)。

```html
<table>
  <tr>
    <td align="center"><img src="docs/shots/state-a.jpg" width="240" alt="地図から宿を選ぶ画面"><br>①宿を選ぶ</td>
    <td align="center"><img src="docs/shots/state-b.jpg" width="240" alt="周辺スポットのカードが並ぶフィード画面"><br>②周辺が流れてくる</td>
    <td align="center"><img src="docs/shots/embed.jpg" width="240" alt="予約サイト風ページに埋め込んだ様子"><br>③他サイトに埋め込める</td>
  </tr>
</table>
```

- パスは **リポジトリ相対**(`docs/shots/...`)にする。GitHub の README は相対パスを解決するので絶対URLにしない。
- `alt` は必ず付ける(R13 のアクセシビリティ方針に揃える)。
- README の既存本文(英語段落・日本語段落・以降の全節)は**書き換えない**。追加のみ。

### 3. 調査済みの前提(確認不要)

`docs/check.mjs` のリンク切れ検査は `HTML_PAGES = ['index.html', 'demo/embed-check.html', 'demo/hotel-page.html']` の **HTML 3ファイルだけ**を対象にしており、**README.md(Markdown)は対象外**。よって `docs/shots/*.jpg` は既存の検査に自動では含まれない。今回は check.mjs を拡張せず、後述の手順で本番URLの200を手動確認する(README の画像を検査対象に加えるのは ROADMAP の別タスクに回す)。

## 完了条件(すべて検証可能)

1. `docs/shots/state-a.jpg` / `state-b.jpg` / `embed.jpg` の3枚が存在し、**各 150,000 バイト以下**である。
2. 3枚を `Read` で開いて目視し、文字崩れ・重なり・はみ出し・真っ白の地図が無いこと。state-a には**♨の宿ピンが1つ以上写っている**こと。
3. README.md の英語段落直下に3枚が横並びの `<table>` で入っており、既存本文に差分が無い(`git diff README.md` が追加行のみ)。
4. `node docs/check.mjs` が**全項目OK・exit 0**。
5. push 後、`https://teer-tee.github.io/yadotabi/docs/shots/state-a.jpg`(および state-b / embed)が **HTTP 200** を返す。
6. `assets/` 配下・`fixtures/` 配下・`index.html` の差分が**ゼロ**(`git diff --stat` で確認)。

## 検証手順

```powershell
# 1. サイズ確認(3枚とも150000以下)
Get-ChildItem docs\shots\*.jpg | Select-Object Name, Length

# 2. 既存テストのデグレ確認
node docs\check.mjs
node scripts\check-more.mjs

# 3. コード無変更の証明
git diff --stat -- assets fixtures index.html   # 出力が空であること

# 4. push 後の本番確認(3枚それぞれ)
curl -s -o NUL -w "%{http_code} %{size_download}`n" https://teer-tee.github.io/yadotabi/docs/shots/state-a.jpg
```

さらに3枚を `Read` で開いて目視する(AUTOPILOT 絶対ルール5)。

## 変更禁止範囲

- `assets/` 配下すべて(app.js / geo.js / engine.js / style.css / ui.css / tokens.css)
- `fixtures/` 配下すべて
- `index.html`、`demo/` 配下の既存HTML
- README.md の既存本文(追加のみ。既存行の書き換え・削除は禁止)
- `git stash` / `reset --hard` / `checkout` によるファイル復元操作(AUTOPILOT 絶対ルール7)

## 完了後

`docs/ROADMAP.md` の R26 を `[x] 2026-09-16` にし、`docs/NIGHTLOG.md` に3行(やったこと / 見た目の確認結果 / 次)追記 → コミット → `git push`。**実装が終わったらまず先にコミットすること。報告は簡潔に(長文の報告書を書かない)。**
