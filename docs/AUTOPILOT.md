# やどたび 自動継続ループ規約(AUTOPILOT)

制定: 2026-09-16 未明。みのるんが寝ている間も改善を回し続けるための規約。
本番URL: https://teer-tee.github.io/yadotabi/ (GitHub Pages、無料)。リポジトリ: https://github.com/TeeR-tee/yadotabi

## 3つの役割(3すくみ)
| 役 | 誰 | やること | やらないこと |
|---|---|---|---|
| 計画役(オペレーター) | 各サイクル冒頭の planner エージェント(Opus) | ROADMAP・NIGHTLOG・最新スクリーンショットを読み、次の1タスクを `docs/NEXT.md` に書く。バックログが尽きたら ROADMAP に3〜5件追記 | コードを書かない |
| 作業役 | builder-opus / builder-sonnet | NEXT.md を実装→検証→コミット→push | 計画の変更、タスクの追加 |
| 監視役 | 司令塔セッションの cron(25分毎) | 最終コミットから40分以上動きが無ければ、サイクルを自分で起動し直す | 通常時は何もしない |

## 絶対ルール
1. **コスト0円**。有料API・APIキー必要サービス・Google Maps API は禁止。地図は Leaflet+OSM、データは Overpass/Nominatim/Wikipedia のみ。
2. **みのるんの判断を必要とする作業は選ばない**。判断が要る案は NIGHTLOG の「朝の相談」に書いて次へ進む。
3. **ユーザー入力ゼロの原則を守る**(泊数・移動手段・○△×・行った！を復活させない)。
4. **無料APIのマナー**: 1サイクルで外部APIを叩く撮影は最大2回。固定データモード(`?fixture=kusatsu`)ができたら撮影は全て固定モードで行い、本物APIは1回だけの動作確認に留める。Overpass が 429/504 を返したら待たずに固定モードへ切り替える。
5. **視覚検証は必須**: `node C:\workspace\tools\shot\shot.mjs <URL> --mobile` と PC幅で撮り、画像を Read で開いて「文字崩れ・重なり・はみ出し・アイコンずれ・空白の異常」を目で確認する。見つけたら同サイクルで直す。直せなければ ROADMAP の先頭に起票。
6. **コミット→push を毎サイクル**。push すると本番URLが更新され、みのるんがスマホで確認できる。壊れた状態を push しない(撮影で確認してから)。
7. git stash / reset --hard / checkout でファイルを戻す操作は禁止。
8. 1サイクル = 1タスク。欲張らない。

## サイクル手順
1. 計画役: `docs/NEXT.md` を書く(タスク名・目的・対象ファイル・完了条件・検証方法。150行以内)。
2. 作業役: 実装 → `node --check` → 撮影(mobile+desktop、必要な画面) → 画像を目視 → `node scripts/check-all.mjs` が緑であることを確認 → `docs/ROADMAP.md` を `[x] 日付` に → `docs/NIGHTLOG.md` に3行追記 → コミット → `git push`。
3. 司令塔: 報告を確認し、push 済みかを `git status -sb` で確認。

過去の `docs/NEXT.md` は `git log --oneline -- docs/NEXT.md` で一覧でき、`git show <コミットID>:docs/NEXT.md` で当時の全文が読める。毎サイクル上書きしてよく、アーカイブ用のコピーは作らない(2026-09-16 R78 で決定)。

## NIGHTLOG の書き方(みのるんが朝に読む)
- 1サイクル3行: 「やったこと / 見た目の確認結果 / 次」。
- 「朝の相談」節に、判断が要る案を溜める(実装はしない)。
