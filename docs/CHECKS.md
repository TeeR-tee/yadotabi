# CHECKS.md — `scripts/check-all.mjs` が回す25本の一覧と並列化できない理由

## 対象範囲

`node scripts/check-all.mjs` は `scripts/check-*.mjs` の24本と `docs/check.mjs` の1本、計25本を `spawnSync` で直列に呼ぶだけの外側の殻です。各 check 本の中身はこのタスクでは無編集(AUTOPILOT の運用どおり)。

## サーバを立てる21本(ポート3000占有・全て Playwright あり)

`spawn('python', ['-m','http.server','3000','--bind','127.0.0.1'])` を実行し `finally` で `kill()` する構成です。

| 本名 | 何を検査するか |
|---|---|
| check-a11y | アクセシビリティ(aria-label 等) |
| check-attrib | 出典・ライセンス表記の有無 |
| check-autozoom | 地図の自動ズーム挙動 |
| check-chipcurrent | 現在地チップの表示 |
| check-distance | 距離表示・並び順 |
| check-embedbg | embed時の背景表示 |
| check-embedheight | embed時の高さ調整 |
| check-feednote | フィード注記の表示 |
| check-history | 「最近の宿」履歴の記録・表示 |
| check-hotelparam | ホテルURLパラメータの解釈 |
| check-hoteltip | ホテル選択時のツールチップ |
| check-imgfail | 画像読み込み失敗時のフォールバック |
| check-initpos | 初期表示位置 |
| check-keyboard | キーボード操作対応 |
| check-lightbox | 画像ライトボックス表示 |
| check-more | 「もっと見る」展開挙動 |
| check-nohotels | ホテル指定なし時の挙動 |
| check-passive | passiveイベントリスナー設定 |
| check-pinflash | 地図ピンの点滅演出 |
| check-recent | 直近閲覧の反映 |
| check-sample | サンプル導線チップの表示・件数 |

所要目安(R55 実測・NIGHTLOG 2026-09-16 R60+R55、当時20本時点): 合計 **162.8s**、最遅 **check-hotelparam 27.9s**、次点 **check-feednote 12.3s**、僅差で **check-attrib 12.1s**。現在は25本に増え約4分。

## サーバもPlaywrightも不要な4本

| 本名 | 何を検査するか |
|---|---|
| check-engine | `engine.js` の除外・併合・要約ロジックの単体テスト |
| check-geo | `geo.js` の同心円リング収集ロジック(fetchをスタブ) |
| check-r5 | 段階描画の発火順 |
| docs/check.mjs | 本番URLへのGET・応答時間・ファイルKB・リンク切れ検査 |

## 並列化できない理由

- 21本が同じ**ポート3000**を `--bind 127.0.0.1` で占有します。同時に2本走らせると後発が `EADDRINUSE` で即死します。
- `check-all.mjs` は `spawnSync` による直列呼び出しの外側の殻で、各 check 本の中身は無編集が原則(AUTOPILOT の運用)。ポートを外から変える口がありません。

## 並列化する場合に必要になる改修(今回はやらない)

1. 各本の `const PORT = 3000` を `Number(process.env.YADO_PORT) || 3000` にする(21ファイルの1行修正)。
2. `check-all.mjs` が本ごとに空きポートを割り当てて環境変数で渡す。
3. Playwright の Chromium を同時に何個立てるかの上限を決める(Windows のメモリ次第。`check-history` が過去に `ERR_NO_BUFFER_SPACE` でフレークした実績あり)。
4. 見返りは最大で 4分→1分程度だが、フレークの切り分けが難しくなるコストと引き換えになる。
