# 将棋定跡暗記アプリの実装計画 (Shogi Memory Customization)

ShogiHomeをベースに、要件定義書に沿って不要機能を非表示にし、定跡暗記クイズ機能を追加します。

## ユーザーレビューが必要な事項
- ロールバック（指し間違い時の駒の自動戻し）は、検証が不一致だった場合にストアの指し手履歴更新（`appendMove`）を行わないだけで実現できる予定です。
- 不要な機能の削除は、今回はソースコードの大規模な物理削除を避け、メニューUIや設定項目、タブなどから不要なエントリーをコメントアウトまたは非表示にするアプローチで進めます（これにより、ベースコードの安定性を維持します）。

## 提案される変更

### 1. 定数・設定の拡張

#### [MODIFY] [state.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/common/control/state.ts)
- `AppState` 列挙型に `MEMORIZE = "memorize"` を追加します。

#### [MODIFY] [app.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/common/settings/app.ts)
- `Tab` 列挙型に `MEMORIZE = "memorize"` を追加します。

---

### 2. 暗記モードの状態・ロジック追加

#### [MODIFY] [store/index.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/store/index.ts)
- 暗記モード用の状態を追加します。
  - `memorizeProblems`: 現在読み込んでいる問題（ルートから末尾までの指し手シーケンス）の配列
  - `currentProblemIndex`: 選択中の問題のインデックス
  - `memorizeStep`: 現在何手目まで正解したか
  - `memorizePlayerColor`: プレイヤーの手番（先手または後手）
- 指し手イベントのインターセプト:
  - `doMove(move)` 内で `AppState.MEMORIZE` の場合、指された手が正しい指し手（`currentProblem.moves[memorizeStep]`）と一致するか検証します。
  - 正解なら盤面に反映して手数を進め、次にCPU手番があれば `setTimeout`（500ms）経由でCPUの指し手を自動反映します。
  - 不正解なら効果音等を鳴らし、盤面状態は更新しません（これにより駒は元の位置に戻ります）。
- KIFパース処理（変化手順の抽出）:
  - KIFインポート時、棋譜ツリーの全探索（DFS等）を行い、ルート局面から各終了局面までのパスをリスト化して `memorizeProblems` を構築します。

---

### 3. UI의 改修と新規コンポーネントの追加

#### [NEW] [MemorizePanel.vue](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/view/tab/MemorizePanel.vue)
- 画面下部のタブに表示される暗記モード用コントロールパネルです。
  - KIFファイルのドラッグ＆ドロップ/選択エリア
  - 抽出された問題の一覧リスト（選択ボタン）
  - 「最初から」「ギブアップ（1手ヒント表示）」ボタン
  - 正解率や手数（進捗）の表示

#### [MODIFY] [TabPane.vue](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/view/tab/TabPane.vue)
- `Tab.MEMORIZE` の切り替えを追加し、`MemorizePanel.vue` を描画するように設定します。
- 不要なタブ（検討、モニターなど）を初期リストから非表示、またはコメントアウトします。

---

## 検証計画

### 手動検証
1. **不要機能の整理の確認**:
   - 画面起動時に、USI設定などの不要なメニュー項目やタブが表示されなくなっていることを確認します。
2. **KIFインポートと問題抽出**:
   - 変化手順（分岐）を含むKIFファイルを読み込ませ、複数の問題に分割されてリスト表示されることを確認します。
3. **暗記クイズの動作**:
   - プレイヤーの手番で正しい手を指したとき、駒音が再生されて手番がCPUに進むことを確認します。
   - CPUが自動的に自分の手番の指し手を盤面に反映することを確認します。
   - 間違った手を指した際、駒が元の位置に戻り、手数が進まないことを確認します。
