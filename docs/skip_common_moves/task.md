# 共通手順のスキップ機能のリファクタリング タスク

- [x] 設定およびセッション用変数の `number` から `boolean` への変更
  - [x] `src/renderer/store/index.ts` の `_skipCommonMoves` / `_dialogSkipCommonMoves` などの型定義とゲッター・セッターを `boolean` に変更
- [x] クリア済み手順の履歴管理ロジックの実装
  - [x] `src/renderer/store/index.ts` に `_clearedPaths` (Set<string>) を追加
  - [x] `startSolveSession` で履歴をクリアする処理を追加
  - [x] `doMemorizeMove` の正解クリア時に、クリアした手順のプレフィックスを履歴に追加するロジックを実装
- [x] 共通手順自動スキップの判定・進行ロジックのリファクタリング
  - [x] `skipMovesForward` を変更し、今回の問題の SFEN と手順が履歴とどこまで一致するかを探索して自動進行するよう実装
- [x] 設定ダイアログのUI修正
  - [x] `src/renderer/view/dialog/MemorizeSolveDialog.vue` の「共通手順のスキップ」を `ToggleButton` に変更し、ON/OFF対応にする
- [ ] 動作確認・テスト
  - [ ] 手動テストによる動作の整合性の確認
