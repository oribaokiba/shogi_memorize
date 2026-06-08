# 将棋定跡暗記アプリの実装計画 (追加修正・機能拡張)

定跡暗記機能の動作改善と、ユーザー指摘に基づく課題の解決を行います。

## ユーザーレビューが必要な事項

> [!NOTE]
> - ドラッグ＆ドロップエラーの修正にあたり、Webアプリ環境でのグローバルなファイル読み込み処理を無効化し、暗記パネル内でのドロップのみに限定します。
> - 手番（先手・後手）の切り替えUIを暗記パネルに追加します。プレイヤーが切り替えた際、その手番を基準として問題が最初から再構成・開始されます。
> - ギブアップ時の連打防止のため、CPU自動実行の遅延処理（500ms）中は操作ロックフラグを立てて、ボタンの無効化と指し手の無視を行います。

## 提案される変更

---

### 1. グローバルドロップイベントの制御

#### [MODIFY] [App.vue](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/view/App.vue)
- グローバルな `body` に対する `drop` イベントハンドラにおいて、ネイティブ環境（`isNative()`）の場合のみ `store.openRecord(path)` を呼び出すようガードを追加します。
- これにより、Webブラウザ環境でどこにファイルをドロップしても誤って `openRecord`（`invalid URI` 例外）が走る現象を防ぎます。

---

### 2. 手番選択（先手・後手）と連打防止ロジックの追加

#### [MODIFY] [store/index.ts](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/store/index.ts)
- ストアの状態に以下の変数を追加します：
  - `_memorizePlayerColor`: プレイヤーが選択した手番（`Color` または `undefined`。`undefined` の場合は問題本来の最初の手番）。
  - `_isMemorizeProcessing`: CPUの指し手自動反映待ちタイマー（500ms）が動作しているかどうかを示す操作ロックフラグ。
- `startMemorizeProblem(index: number, playerColor?: Color)` を拡張：
  - 引数 `playerColor` が指定された場合、それを `problem.playerColor` の代わりにプレイヤーの手番として使用します。
  - 手番の選択状態に応じて、初期局面でのCPUの自動指し手（問題の最初の指し手がプレイヤーの手番ではない場合）を正しく実行します。
- `doMemorizeMove` および `giveUpMemorize` の修正：
  - `_isMemorizeProcessing` が `true` の場合は処理を無視（早期リターン）します。
  - CPUの指し手を `setTimeout` で実行する直前に `_isMemorizeProcessing = true` に設定し、`setTimeout` の処理完了後に `false` に戻します。
  - プレイヤーの選択した手番情報に基づいて、正誤判定（プレイヤーの手かCPUの手か）を行うように調整します。

---

### 3. 暗記UI의 拡張

#### [MODIFY] [MemorizePanel.vue](file:///c:/Users/khnhb/Downloads/game/shogi_memory/src/renderer/view/tab/MemorizePanel.vue)
- 「自分の手番」を選択するトグルスイッチ（先手/後手/デフォルト）を追加します。
- ユーザーが手番を変更した際、`store.startMemorizeProblem(store.currentProblemIndex, selectedColor)` を呼び出して選択した手番で問題を再開します。
- `store.isMemorizeProcessing` が `true` の間、「ギブアップ（1手進める）」ボタンや「最初からやり直す」ボタンを `disabled` にします。

---

## 検証計画

### 手動検証
1. **ドラッグ＆ドロップ動作の再確認**:
   - 画面の任意の場所にKIFファイルをドロップした際、`invalid URI` エラーが出ないこと、およびインポートエリアにドロップした際には正常に棋譜がインポートされることを確認します。
2. **手番選択（先手・後手）の検証**:
   - 暗記開始後、手番を「先手」から「後手」に切り替えた際、1手目をCPUが自動で指し、プレイヤーが後手番（2手目）から暗記を開始できることを確認します。
3. **連打防止の検証**:
   - 「ギブアップ」ボタンを連打した際、手番や表示が壊れることなく、500msの間隔を置いて1手ずつ正常に進行することを確認します。
