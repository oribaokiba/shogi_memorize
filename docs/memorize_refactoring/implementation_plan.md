# 定跡暗記ストアの分割・リファクタリング計画

`src/renderer/store/memorize.ts` に集中しているロジックを分割し、クラスの肥大化を解消するとともに保守性を向上させます。

## 安全対策（バックアップ手順）

作業を始める前に、現在の未コミットの変更を含めて Git でバックアップ用のブランチを作成し、現在の状態を保存します。

1. 現在の変更を退避または保存するためのバックアップブランチを作成：
   `git checkout -b backup/before-memorize-refactor`
2. 現在の変更を一時コミット：
   `git add .`
   `git commit -m "backup: before memorize store refactoring"`
3. リファクタリング作業用ブランチを作成：
   `git checkout -b refactor/memorize-store`

これにより、万が一不具合や機能喪失が発生した場合でも、即座に元の状態（未コミットの変更を含む）に戻すことができます。

## 提案する変更内容

`src/renderer/store/memorize.ts` (約54KB) から、以下の2つの独立した役割を新しいファイルに分離します。

---

### 1. タイマー制御ロジックの分離

#### [NEW] [memorizeTimer.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory - コピー/src/renderer/store/memorizeTimer.ts)
タイマーの制御（カウントダウン、秒読み、フィッシャー加算など）を独立した `MemorizeTimer` クラスとして切り出します。

* **主な管理ステート**:
  * `_timeLimitMode` (none | perProblem | total)
  * `_timeLimitSettings`
  * `_timerHandle` (setIntervalのハンドル)
  * `_startTimestamp`, `_lastTimeMs`, `_timeMs`, `_byoyomi`
  * `_totalElapsedMs`, `_totalFisherMs`
  * `_onTimerUpdate` (UIへの更新通知コールバック)
* **主なメソッド**:
  * `startTimer()`
  * `stopTimer()`
  * `updateTimer()`
  * `advanceClockAfterMove(isPlayerMove)`
  * `stopTimerAndApplyIncrement(playerColor)`
  * 各種ゲッター（`remainingSeconds`, `byoyomiSeconds`, `totalTimeMs` など）

---

### 2. 問題抽出およびインポートロジックの分離

#### [NEW] [memorizeImporter.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory - コピー/src/renderer/store/memorizeImporter.ts)
棋譜データや `Record` オブジェクトから問題（`MemorizeProblem`）をパース・自動抽出するヘルパー関数群を切り出します。これにより、`MemorizeManager` からインポート周りのユーティリティロジックが削減されます。

* **主な関数**:
  * `extractNewEditProblems(record, sfen, includeComments, playerColor, baseNameIndex)`
  * `importRecordText(data, sourceName, editCollection, includeComments)`
    * `detectRecordFormat` や `importKIF` / `importCSA` などのパース処理を担当

---

### 3. コアマネージャーの軽量化

#### [MODIFY] [memorize.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory - コピー/src/renderer/store/memorize.ts)
* `MemorizeManager` 内のタイマー関連ステートやメソッドを削除し、内部インスタンスとして `MemorizeTimer` を保持するように変更します。
* `extractNewEditProblems` や `importRecordTextToEditCollection` などの実装を `memorizeImporter.ts` の関数呼び出しに置き換えます。

---

## 検証計画

### 1. ビルド・リンター確認
* `npm run typecheck`（または TypeScript コンパイル）を実行し、型定義やインポートにエラーがないか検証します。

### 2. 手動確認項目
* **暗記モードの起動**: 問題集が正常にロードされるか。
* **制限時間モードの動作**:
  * 各問題ごとの制限時間（カウントダウン、秒読み）が正しく動作するか。
  * フィッシャー加算（increment）が指し手入力後に正しく適用されるか。
  * 時間切れ（`handleTimeUp`）が正しく発生し、解答が自動進行するか。
* **問題のインポート・作成機能**:
  * KIFなどの棋譜ファイルの読み込みが正しく行えるか。
  * 現在の棋譜からの問題抽出が動作するか。
