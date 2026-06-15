🔴 重大なバグ
1. USIバリデーション正規表現が駒打ち（drop）を拒否する
ファイル: 

index.ts

typescript
function isValidUSIMove(move: string): boolean {
  return /^[1-9][a-i][1-9][a-i][+]?$/.test(move);
}
USIの駒打ち表記は P*5e（例: R*5e, B*3c）のように [駒種]*[座標] の形式ですが、現在の正規表現はこれを一切マッチしません。駒打ちを含む問題を validateMemorizeCollection() でバリデーションすると、不正なUSI文字列としてエラーになります。

修正案:

typescript
function isValidUSIMove(move: string): boolean {
  // 通常の指し手: 7g7f, 8c8d+ など
  // 駒打ち: P*5e, R*3c など
  return /^([1-9][a-i][1-9][a-i][+]?|[PLNSGBRK]\*[1-9][a-i])$/.test(move);
}
2. stopTimer の秒読み消費ロジックが逆
ファイル: 

memorize.ts

typescript
if (this._timeMs === 0 && this._byoyomi > 0) {
  const consumedByoyomi = Math.ceil((diffMs - this._lastTimeMs) / 1000);
  this._byoyomi = Math.max(0, this._byoyomi + consumedByoyomi);
}
diffMs - this._lastTimeMs は持ち時間を超過した分の時間で、正の値になります。consumedByoyomi は消費した秒読みの秒数のため、足すのではなく引くべきです。現状では秒読みが増えてしまい、時間切れにならないバグとなります。

修正案:

typescript
this._byoyomi = Math.max(0, this._byoyomi - consumedByoyomi);
3. handleTimeUp で統計の二重カウント
ファイル: 

memorize.ts

typescript
this._memorizeWrongCount += this._problemWrongMoves;
this._memorizeCorrectCount += this._problemCorrectMoves;
this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
handleTimeUp で統計を集計していますが、その後 nextProblem() が呼ばれたときも（問題クリア時の doMemorizeMove 内の集計と同じく）再度集計される可能性があります。ただし handleTimeUp の場合は問題が途中で中断されるため、通常フローの完了時集計（doMemorizeMove の L1545-1547）とは排他的な場合もあります。しかし、タイミングによっては二重カウントのリスクがあります。

🟡 中程度の問題
4. MemorizeSolveDialog で startSolveSession() 後に startMemorizeTimer() を重複呼び出し
ファイル: 

MemorizeSolveDialog.vue

typescript
await store.startSolveSession();
store.startMemorizeTimer();
startSolveSession() 内で startCurrentSolveProblem() が呼ばれ、その中の L777-781 で既にタイマーが開始されます：

typescript
if (this._timeLimitMode === "perProblem") {
  this.startTimer();
} else if (this._timeLimitMode === "total") {
  this.startTimer();
}
その後ダイアログ側で startMemorizeTimer() → startTimer() がもう一度呼ばれます。startTimer() の先頭で this.stopTimer() を呼んでいるためクラッシュはしませんが、タイマーがリセットされてしまう（持ち時間が再初期化される）ため、startSolveSession() から startTimer() が呼ばれた後の経過時間が消失します。

5. isMovableByUser が memorizePlayerColor の上書きを考慮しない
ファイル: 

memorize.ts

typescript
case AppState.MEMORIZE: {
  const problem = this.currentProblem;
  if (!problem) {
    return false;
  }
  const expectedMove = problem.moves[this._memorizeStep];
  return expectedMove ? expectedMove.color === problem.playerColor : false;
}
ここでは problem.playerColor を使っていますが、doMemorizeMove などでは this._memorizePlayerColor を使って実際のプレイヤーの手番を判定しています。startMemorizeProblem で playerColor パラメータを渡して上書きした場合、isMovableByUser の判定と実際の解答ロジックが矛盾する可能性があります。

修正案:

typescript
const actualPlayerColor = this._memorizePlayerColor !== undefined 
  ? this._memorizePlayerColor 
  : problem.playerColor;
return expectedMove ? expectedMove.color === actualPlayerColor : false;
6. totalRemainingSeconds の計算が不正確
ファイル: 

memorize.ts

typescript
get totalRemainingSeconds(): number {
  const limitMs =
    (this._timeLimitSettings.timeSeconds +
      this._timeLimitSettings.byoyomi +
      this._timeLimitSettings.increment) *
    1000;
「全体の制限時間」に byoyomi（秒読み）と increment（フィッシャー加算）を足しているのは概念的に誤りです。秒読みは持ち時間が切れた後に使うもので、フィッシャー加算は一手ごとに累積するものです。本来は timeSeconds * 1000 のみか、totalTimeMs プロパティを使うべきです。

7. giveUpMemorize で _isGiveUp 設定後にタイマーが動作し続ける
ファイル: 

memorize.ts

giveUpMemorize では stopTimer() を呼んでいません。タイマーモードが有効な場合、「次の手」ボタンで1手ずつ進めている間もタイマーが走り続けます。これ自体は仕様の可能性もありますが、handleTimeUp で全手を自動進行させた場合とで動作が一貫しません。

🟢 軽微な問題 / コード品質
8. 未使用コード：_reviewMistakes が書き込まれない
ファイル: 

memorize.ts

_reviewMistakes は resetMemorizeStats() で空配列にリセットされますが、不正解時に記録を追加するコードがありません。ゲッターやUIから参照されているものの、常に空配列を返します。

9. MemorizeCreateDialog でApp.vue側のダイアログ表示制御との不整合
ファイル: 

App.vue
 と 

CreatePanel.vue

MemorizeCreateDialog は App.vue では store.isMemorizeCreateDialogVisible で表示制御されていますが、CreatePanel.vue では独自の isCreateDialogVisible refで制御されており、同じダイアログが2つの場所から別々の状態で管理されています。CreatePanel側のローカルrefで開いた場合、App.vue側は連動しないため、ダイアログが二重に表示されるリスクがあります。

10. useFileReader.ts の readAsText 後の onerror 設定順序
ファイル: 

useFileReader.ts

typescript
reader.readAsText(target.files![0], encoding);  // ← 先に実行開始
reader.onerror = () => { ... };                   // ← 後からエラーハンドラ設定
readAsText を呼んだ後に onerror を設定しています。FileReader APIは非同期のためほぼ問題にはなりませんが、仕様上は onerror を先に設定すべきです。