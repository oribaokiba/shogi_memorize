# タスク一覧：定跡暗記持ち時間機能のバグ修正

- [x] `src/renderer/store/memorize.ts` の修正
  - [x] `advanceClockAfterMove` に `isPlayerMove: boolean` 引数を追加し、フィッシャー時間加算をプレイヤー着手時のみに限定する
  - [x] `doMemorizeMove` のプレイヤー着手後と相手着手後で `advanceClockAfterMove` を適切に呼び分ける
  - [x] `giveUpMemorize` (次の手ボタン) 押下時の `advanceClockAfterMove` 呼び出しを修正する
  - [x] `doMemorizeMove` 内の相手の番の自動進行待ち（`sleep` の後）にガード処理を追加する
  - [x] `handleTimeUp` 呼び出し時に `_isMemorizeProcessing = false` を設定して自動進行処理の競合を防ぐ
  - [x] `handleTimeUp` 内での `showResultDialog("perProblem")` の二重呼び出しを修正する
  - [x] `totalTimeMs` ゲッターで考慮中の経過時間をマイナスしつつ `_totalFisherMs` を加算してリアルタイム更新されるようにする
  - [x] `stopTimerAndApplyIncrement` メソッドを新設する
  - [x] `doMemorizeMove` で次の手が相手手番の場合は `stopTimerAndApplyIncrement` を呼び出してタイマーを一時停止させる
  - [x] `advanceClockAfterMove` と `stopTimerAndApplyIncrement` 内で、`total`モードの際に `_totalFisherMs` にインクリメント時間を加算する
  - [x] `updateTimer` において、`total`モードの際、全体残り時間が残っているうちは `_timeMs` に全体残り時間を設定し、切れた後は秒読み `_byoyomi` を消費させる
  - [x] `handleTimeUp` および `handleTotalTimeUp` 内の強制進行ループから `playPieceBeat` を除去する
- [x] `src/renderer/store/index.ts` の修正
- [x] `src/renderer/view/main/BoardPane.vue` の修正
- [x] `src/renderer/view/dialog/MemorizeSolveDialog.vue` の修正
  - [x] `canStart` に持ち時間使用時の合計値が 0 より大きいかどうかのバリデーションを追加する
- [x] 動作確認・検証
