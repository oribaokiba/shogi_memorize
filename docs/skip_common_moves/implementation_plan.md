# 共通手順のスキップ機能のリファクタリング

共通手順のスキップ機能を「手数指定」から「ON/OFF（正解済みの手順と共通する局面までスキップする）」方式へとリファクタリングし、分岐手順の長短に関わらず正確に共通手順がスキップされるように変更します。

## ユーザー確認事項

> [!NOTE]
> 設定ダイアログのUIにて、「共通手順のスキップ」を「●手（0=スキップなし）」からトグルボタンによる「ON/OFF」指定へと変更します。これにより、直感的に共通手順をスキップするかどうかを選択できるようになります。

## 提案する変更

---

### [Store & UI]

#### [MODIFY] [index.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory%20-%20%E3%82%B3%E3%83%94%E3%83%BC/src/renderer/store/index.ts)
- `_skipCommonMoves` および `_dialogSkipCommonMoves` のデータ型を `number` から `boolean` に変更します。
- セッション管理に `_clearedPaths` (Set<string>) を追加します。
- `startSolveSession` 時に `_clearedPaths` をクリアします。
- 問題のクリア時（`doMemorizeMove` 内で正解としてクリア判定された際）に、その問題の SFEN と `moves` のプレフィックスを `_clearedPaths` に追加します。
- `skipMovesForward` を変更し、今回の問題の SFEN と `moves` を順に確認し、`_clearedPaths` に含まれる最大の手数までスキップするように実装します。

#### [MODIFY] [MemorizeSolveDialog.vue](file:///c:/Users/khnhb/Downloads/game/shogi_memory%20-%20%E3%82%B3%E3%83%94%E3%83%BC/src/renderer/view/dialog/MemorizeSolveDialog.vue)
- 「共通手順のスキップ」のインプットを `ToggleButton` に変更し、ON/OFFで指定できるようにします。
- `skipCommonMoves` 関連の reactive 変数およびイベントハンドラを `boolean` 対応に変更します。

## 検証計画

### 手動確認
- 共通手順を含む問題集（例えば、ある局面から `7g7f` -> `8c8d` で分岐する複数の問題）を読み込む。
- 「共通手順のスキップ」をONにして解答セッションを開始する。
- 1つ目の分岐（例: 3七桂）をクリアする。
- 2つ目の分岐（例: 3八金）に移った際、共通部分（1つ目の分岐までの手順）が自動的にスキップされ、分岐点からスタートすることを確認する。
- 共通しない手順（全く別の分岐や短い手順）が誤ってスキップされないことを確認する。
- 「共通手順のスキップ」をOFFにした場合、何もスキップされずに1手目からスタートすることを確認する。
