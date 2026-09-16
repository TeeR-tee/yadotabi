# NEXT: R75 + R78 + R72(文書3件まとめ・コード変更なし)

## 選定理由
残る未完了は R64・R72・R75・R77・R78 の5件。R64 は GitHub Actions の無料枠確認という「外部の事実確認+有料化の恐れ」があり判断寄り、R77 は表示の採否を撮り比べる実作業。**R75・R78・R72 はいずれも文書のみ・コード変更0・外部API 0回**で、かつ R75 は R14(fixture 軽量化)直後の今が after 値を書く好機なので、3件を1サイクルにまとめる。計画役が事前に全数値を実測済みなので、作業役は測り直さずそのまま書けばよい(値は下の表をコピーする)。

**重要な訂正**: ROADMAP の R72 は「23本」「7本以上がサーバを立てる」と書いているが、計画役の実測では **check は25本、うちサーバを立てるのは21本(Playwright を使う21本と完全に一致)**。R75 も ROADMAP は「R14 の before 値として残す」と書いているが、R14 は既に完了しているので **after 値(現行値)を書き、before 値は括弧で併記する**。この2点の食い違いも作業役が ROADMAP 側の記述を直すこと。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\README.md`(R75: 「開発者向け」節に表を追加)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\CHECKS.md`(R72: **新規作成**)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\AUTOPILOT.md`(R78: 1〜2行追記)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md`(3件を `[x] 2026-09-16` に + 追記5件)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md`(3行追記)

## 実装方針

### R75 — fixtures サイズ表を README の「開発者向け」節(190行目付近)に追加
以下の実測値をそのまま貼る(計画役が `ls -l` と `node -e` で取得済み。**測り直し不要**)。wiki 件数は `wiki.query.pages` のキー数。

| エリア | osmRadiusM | OSM elements | Wikipedia pages | ファイルKB(R14後) | R14前 |
|---|---|---|---|---|---|
| kusatsu(草津温泉) | 15,000 | 189 | 50 | 55.5 KB | 65.3 KB |
| hakone(箱根湯本) | **30,000** | 4,186 | 50 | 585.7 KB | 900.1 KB |
| dogo(道後温泉) | 15,000 | 463 | 50 | 93.7 KB | 117.1 KB |
| beppu(別府温泉) | 15,000 | 667 | 50 | 122.7 KB | 172.7 KB |

表の下に2〜3行の説明を付ける:
- **hakone だけ 10倍近く大きい理由は収集半径**。hakone のみ `osmRadiusM=30000` で、他3エリアの 15,000 に対して面積が4倍になり OSM 要素が 4,186件(他の6〜22倍)になる。ファイルサイズはほぼ OSM 要素数で決まる。
- Wikipedia 側は4エリアとも 50件でファイルサイズに効いていない(geosearch の1リングあたり上限が 50件のため)。
- R14 の keep-list 除去で全体が 30〜35% 縮んだ。詳細は `docs/FIXTURES.md`。
- `docs/FIXTURES.md` からこの表へリンクを1行足す(相互参照)。

### R78 — NEXT.md の履歴は git log で追えるので、ディレクトリは作らない
**`docs/next-archive/` は作らない**という判断を採る。理由(AUTOPILOT.md に短く書く):
- `git log --oneline -- docs/NEXT.md` は現時点で **68コミット**を返し、各サイクルの NEXT.md が全て残っている。`git show <hash>:docs/NEXT.md` でその時点の全文が読める。
- コピーを置くと同じ内容が2箇所に増え、作業役が忘れたときに片方だけ欠ける運用事故が起きる。git が既に果たしている役目を二重化する利点がない。

`docs\AUTOPILOT.md` の「サイクル手順」の直下(または「絶対ルール」の末尾)に、次の趣旨の1〜2行を足す:

> 過去の `docs/NEXT.md` は `git log --oneline -- docs/NEXT.md` で一覧でき、`git show <コミットID>:docs/NEXT.md` で当時の全文が読める。毎サイクル上書きしてよく、アーカイブ用のコピーは作らない(2026-09-16 R78 で決定)。

### R72 — `docs/CHECKS.md` を新規作成
以下の実測に基づく表を載せる(計画役が各本を grep して確定済み。**測り直し不要**)。

**サーバを立てる21本**(`spawn('python', ['-m','http.server','3000','--bind','127.0.0.1'])` を実行し `finally` で `kill()`。全て Playwright あり):
check-a11y / check-attrib / check-autozoom / check-chipcurrent / check-distance / check-embedbg / check-embedheight / check-feednote / check-history / check-hotelparam / check-hoteltip / check-imgfail / check-initpos / check-keyboard / check-lightbox / check-more / check-nohotels / check-passive / check-pinflash / check-recent / check-sample

**サーバもPlaywrightも不要な4本**(純粋な Node 単体テスト・本番URLへのGETのみ):
check-engine(engine.js の除外/併合/要約の単体テスト) / check-geo(geosearch の同心円リング。fetch をスタブ) / check-r5(段階描画の発火順) / docs/check.mjs(本番URLへの GET・応答時間・KB・リンク切れ)

表は「本名 / 何を検査するか / サーバ / Playwright」の4列。所要目安は R55 の実測値(NIGHTLOG 2026-09-16 R60+R55)を転記: **合計 162.8s(20本時点)、最遅 check-hotelparam 27.9s、次点 check-feednote 12.3s、check-attrib 12.1s**。現在は25本で約4分。

**並列化できない理由**の節(これが R72 の本体):
- 21本が同じ **ポート3000** を `--bind 127.0.0.1` で占有する。同時に2本走ると後発が `EADDRINUSE` で即死する。
- `check-all.mjs` は `spawnSync` で直列に呼ぶだけの外側の殻で、各 check 本の中身は無編集が原則(AUTOPILOT の運用)。ポートを外から変える口が無い。

**並列化する場合に必要になる改修**(今回はやらない、と明記):
1. 各本の `const PORT = 3000` を `Number(process.env.YADO_PORT) || 3000` にする(21ファイルの1行修正)。
2. `check-all.mjs` が本ごとに空きポートを割り当てて環境変数で渡す。
3. Playwright の Chromium を同時に何個立てるかの上限(Windows のメモリ次第。`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績あり)を決める。
4. 見返りは最大で 4分→1分程度だが、フレークの切り分けが難しくなるコストと引き換えになる。

README の「開発者向け」節から `docs/CHECKS.md` へのリンクを1行足す。

## 完了条件(検証可能)
1. `README.md` に4エリア×6列の fixture サイズ表があり、数値が上表と一致する。hakone が大きい理由が1行で書かれている。
2. `docs/CHECKS.md` が存在し、25本の表(サーバ列の「立てる」が21本・「立てない」が4本)、所要目安、並列化不可の理由2点、必要な改修4点が書かれている。
3. `docs/AUTOPILOT.md` に `git log --oneline -- docs/NEXT.md` で追える旨の記述がある。`docs/next-archive/` は**存在しない**こと。
4. README から `docs/CHECKS.md` へのリンクがあり、`docs/FIXTURES.md` から README のサイズ表へのリンクがある。
5. `node scripts/check-all.mjs` が25本全緑(docs/check.mjs のリンク切れ検査が README の新リンクを見るため、**相対パスの綴りミスがあるとここで落ちる**)。
6. `git diff --stat -- assets index.html style.css scripts fixtures` が**空**(コード無変更の機械的証明)。

## 検証手順
```
cd C:\workspace\claude\旅行先用サイト\yadotabi
git diff --stat -- assets index.html style.css scripts fixtures   # 空であること
node scripts/check-all.mjs                                        # 25本全緑(約4分)
ls docs/next-archive 2>/dev/null                                  # 無いこと
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
```
撮影は文書のみの変更なのでデグレ確認1枚でよい(`?fixture=kusatsu` mobile)。**Read で画像を開いて目視する**こと。

## 変更禁止範囲
`assets/app.js` `assets/engine.js` `assets/geo.js` `assets/style.css` `index.html` `scripts/*.mjs` `fixtures/*.json` `demo/*` を**一切編集しない**。rank の重み・閾値・除外ルールに触れない。git stash / reset --hard / checkout は禁止。fixture の再生成をしない(Overpass を叩かない)。

## 難易度・所要目安
難易度: 低(文書のみ・数値は全て計画役が実測済み)。**sonnet** で可。所要目安 20分(うち check-all が4分)。

## ROADMAP 追記(未完了が3件未満になるため、作業役は下記5件をそのまま「小さな改善候補」節の末尾に追記する)
- [ ] R81 5エリア目「城崎温泉」の fixture 追加: 兵庫県の城崎(35.6262,134.8055)は温泉街が円山川沿いの1本道に細長く並び、草津(密集)・箱根(広域分散)・道後(市街地隣接)・別府(散在)のどれとも違う「線状」の地形。`node scripts/make-fixture.mjs kinosaki`(Overpass 1回・osmRadiusM=15000)。R80 の救済機構が4エリアでは差分0だったので、観測できるエリアを増やす材料にもなる。`docs/check.mjs` の TARGETS、`app.js` の SAMPLE_LINKS、`check-sample.mjs` の件数アサーション(5本→6本)、README・docs/FIXTURES.md の表(R75 のサイズ表を含む)を全て更新すること
- [ ] R82 状態Bの「戻る」ボタンに `aria-label` を足す: R13 で地図ピンとチップには `aria-label` が付いたが、`.topbar` の「←」ボタンは文字が矢印1字のみで、読み上げでは「左向き矢印」としか読まれない。`aria-label="地図に戻る"` を1つ足すだけ。`scripts/check-a11y.mjs` に「戻るボタンの aria-label が空でない」検査を追加して機械確認する。表示は変わらないのでデグレ確認1枚のみ
- [ ] R83 カード要約が無いときの代替文を正直な1行にする: 現在 Wikipedia 記事が紐づかない OSM 単独候補は要約行が空欄のまま詰まって見える。「Wikipediaに記事がありません(地図の情報だけで表示しています)」等の淡色1行を出すか、空欄のままにするかを `?fixture=beppu` mobile で撮り比べる(beppu は OSM 単独候補が多い)。件数は `scripts/dump-rank.mjs` で先に数えて NEXT.md に書くこと。表示のみ・engine/rank は触らない
- [ ] R84 `?fixture=` 時にランキングの根拠を出す開発者向けフラグ `?debug=1`: 現在カードが何を根拠に何位なのか(source が osm / wiki / both のどれか、距離、カテゴリ多様性の減点後スコア)は `scripts/dump-rank.mjs` を回さないと分からない。`?fixture=` と併用したときだけカードの隅に `osm · 12.3` のような淡色の極小文字を出す。**`?fixture=` が無いときは一切効かないこと**(本番URLで一般の人に見えてはいけない)。`scripts/check-debugflag.mjs` を新設して「fixture 無しでは `.dbg` が0件」を機械検査する
- [ ] R85 `demo/hotel-page.html` の英語版 `demo/hotel-page-en.html`: README には既に英語1段落(R21)があるが、営業用デモページは日本語のみ。海外の宿泊施設・OTA に見せる想定で、同じレイアウトのまま文言だけ英訳した1枚を作る(iframe の中身=やどたび本体は日本語のままでよい。「この埋め込みは日本語UIです」と1行断る)。`docs/check.mjs` の HTML_PAGES と リンク切れ検査の対象に追加する。やどたび本体は無変更
