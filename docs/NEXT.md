# NEXT: R27 Leaflet の CDN を unpkg から cdnjs へ

**選定理由**: 地図が出ないと本体が成立しない単一障害点を、SRI を正しく付け直すだけで可用性の高い CDN(Cloudflare)に移せる。index.html の2行のみで撮影検証も短く、夜間ループ向き(R24 は更に小さいが、地図の可用性のほうが実害が大きいので先)。

## 対象ファイル(絶対パス)
- `C:\workspace\claude\旅行先用サイト\yadotabi\index.html` … **これだけ**を編集する(25〜26行目の `<link>`、69〜70行目の `<script>`)
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\ROADMAP.md` … R27 を `[x] 2026-09-16` に
- `C:\workspace\claude\旅行先用サイト\yadotabi\docs\NIGHTLOG.md` … 3行追記

## 現状(計画役が実物を確認済み)
index.html 25-26行目:
```
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
```
index.html 69-70行目:
```
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
```
`unpkg` の参照はこの2箇所のみ(リポジトリ全文 grep 済み。`demo/*.html` は Leaflet を読み込んでいない)。

## 実装方針
### 1. URL と integrity の差し替え
cdnjs 公式 API(`https://api.cdnjs.com/libraries/leaflet/1.9.4?fields=sri`)から計画役が取得済みの値。**unpkg の sha256 をそのまま流用してはいけない**(cdnjs 配信ファイルはバイト列が異なるためハッシュが合わず、ブラウザが読み込みをブロックして地図が真っ白になる)。必ず下の sha512 に置き換えること。

`<link>`(25-26行目)を:
```
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css"
    integrity="sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w==" crossorigin="" referrerpolicy="no-referrer">
```
`<script>`(69-70行目)を:
```
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"
  integrity="sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==" crossorigin="" referrerpolicy="no-referrer"></script>
```
- バージョンは 1.9.4 のまま上げない。`crossorigin=""` は SRI に必須なので残す。`referrerpolicy="no-referrer"` は cdnjs の推奨なので付ける(任意、付けなくても可)。
- **ハッシュは1文字でも写し間違えると地図が消える**。コピー後に `grep -c "sha512-Zcn6\|sha512-BwHf" index.html` が 2 になることを確認する。

### 2. マーカー画像の追従確認(重要)
Leaflet の既定マーカー画像は CSS からの相対パス(`images/marker-icon.png`)で解決されるため、CSS の置き場が unpkg の `/dist/` から cdnjs の `/1.9.4/` に変わっても `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png` に着地する(計画役が `curl -sI` で 200 を確認済み)。ただし本アプリのピンは `divIcon`(HTML)で自前実装なので、既定画像は実際には使っていない可能性が高い。**撮影でピンが従来どおり出ることを目で確認すれば足りる**。CSS の上書きや画像の自前ホストは不要(やらないこと)。

### 3. check.mjs は変更しない
`docs/check.mjs` の 114〜139行目は「ホスト名が本番と違うものは外部ドメインとみなし fetch せず件数だけ報告する」実装。cdnjs も同じく外部扱いになるだけで、判定ロジックの変更は不要。**check.mjs は編集禁止**。ただし「外部リンク N件(検査対象外)」の件数が変更前後で同じ(=2件のまま)であることを実行結果で確認する。

## 完了条件(すべて検証可能)
1. `curl -sI https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css` と `.../leaflet.js` が **200**(計画役確認済み、作業役も再実行してログに残す)。
2. `node docs/check.mjs` が **全項目 [OK] / exit code 0**、外部リンク件数が変更前と同数。
3. `?fixture=kusatsu` の mobile 撮影で **地図タイル(OSM の地形)が描画され、番号ピン 1〜30 と宿ピン♨が見える**。SRI 不一致なら地図枠が真っ白かグレーになるので一目で分かる。
4. `?fixture=hakone` の mobile 撮影でもデグレなし(カード30枚・ピン判読可)。
5. ブラウザコンソールに `Failed to find a valid digest` / `Subresource Integrity` を含むエラーが **0件**。
6. `git diff --stat` が **index.html 1ファイル(+ROADMAP/NIGHTLOG)のみ**。

## 検証手順
```
node --check assets/app.js
curl -sI https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css | head -1
curl -sI https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js  | head -1
node docs/check.mjs
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=kusatsu" --mobile
node C:\workspace\tools\shot\shot.mjs "http://127.0.0.1:3000/?fixture=hakone"  --mobile
node scripts/check-engine.mjs
node scripts/check-a11y.mjs
```
撮影した画像は **必ず Read で開いて目視**する(地図が白くないか、ピンが出ているか)。コンソールエラーは shot の出力か check-a11y の結果で確認する。
push 後に `curl -s https://teer-tee.github.io/yadotabi/ | grep -c cdnjs` が 2 になることも確認する。

## 変更禁止範囲
- `assets/engine.js` / `assets/geo.js` / `assets/app.js` / `fixtures/*.json` … **一切触らない**(rank の重み・閾値・カテゴリ多様性も当然不可)。
- `docs/check.mjs` および `scripts/*.mjs` … 触らない。
- Leaflet のバージョンアップ、ローカルへの自前ホスト、別 CDN の併記(フォールバック)は **やらない**(今回の範囲外。必要なら ROADMAP に起票)。
- `git stash` / `reset --hard` / `checkout` によるファイル復元は禁止。
- 外部 API(Overpass/Wikipedia)を叩く撮影は不要。全て fixture で完結させる。

## 難易度・所要目安
- 難易度: **sonnet**(差し替え2箇所+撮影確認)
- 所要目安: **10〜15分**
