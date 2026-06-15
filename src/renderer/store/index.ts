import api, { isNative } from "@/renderer/ipc/api.js";
import {
  Color,
  ImmutableRecord,
  Move,
  PositionChange,
  exportKIF,
  RecordMetadataKey,
  DoMoveOption,
  RecordFormatType,
  SpecialMoveType,
  exportKI2,
  exportJKFString,
  exportBOD,
  exportCSA,
  InitialPositionType,
  ImmutableNode,
} from "tsshogi";
import { reactive, UnwrapNestedRefs } from "vue";
import { TextDecodingRule } from "@/common/settings/app.js";
import { playPieceBeat } from "@/renderer/devices/audio.js";
import {
  RecordManager,
  ChangePositionHandler,
  UpdateCustomDataHandler,
  PieceSet,
  UpdateTreeHandler,
} from "@/renderer/record/manager.js";
import { generateRecordFileName } from "@/renderer/helpers/path.js";
import { AppState } from "@/common/control/state.js";
import { useMessageStore } from "./message.js";
import { useAppSettings } from "./settings.js";
import { t } from "@/common/i18n/index.js";
import { detectUnsupportedRecordProperties } from "@/renderer/helpers/record.js";
import {
  RecordFileFormat,
  detectRecordFileFormatByPath,
  getStandardRecordFileFormats,
} from "@/common/file/record.js";
import { useErrorStore } from "./error.js";
import { useBusyState } from "./busy.js";
import { Confirmation, useConfirmationStore } from "./confirm.js";
import { LayoutProfile } from "@/common/settings/layout.js";
import { clearURLParams, loadRecordForWebApp, saveRecordForWebApp } from "./webapp.js";
import { ListItem } from "@/common/message.js";
import { MemorizeManager, MemorizeProblem, TimeLimitMode } from "./memorize.js";
import type { TimeLimitSettings } from "@/common/settings/game.js";

class Store {
  private recordManager = new RecordManager(loadRecordForWebApp());
  private _appState = AppState.NORMAL;
  private _isAppSettingsDialogVisible = false;
  private _customLayout: LayoutProfile | null = null;
  private _reactive: UnwrapNestedRefs<Store>;
  private garbledNotified = false;
  private onChangePositionHandlers: ChangePositionHandler[] = [];
  private onUpdateRecordTreeHandlers: UpdateTreeHandler[] = [];
  private onUpdateCustomDataHandlers: UpdateCustomDataHandler[] = [];

  /** メモライズ機能管理 */
  private _memorize: MemorizeManager;
  /** メモライズ用時計表示（リアクティブ） */
  private _memorizeBlackTime = -1;
  private _memorizeWhiteTime = -1;
  private _memorizeBlackByoyomi = -1;
  private _memorizeWhiteByoyomi = -1;

  constructor() {
    const refs = reactive(this);
    this._reactive = refs;
    this._memorize = new MemorizeManager(this.recordManager, {
      setAppState: (state: AppState) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this._reactive as any).appState = state;
      },
      getAppState: () => this._appState,
      showResultDialog: (mode: "perProblem" | "overall") => {
        this.showMemorizeResultDialog(mode);
      },
    });
    // メモライズタイマー更新のコールバックを設定
    this._memorize.onTimerUpdate = (
      timeMs: number,
      byoyomi: number,
      timeLimitMode: TimeLimitMode,
      memorizePlayerColor: Color | undefined,
      totalTimeMs: number,
    ) => {
      // reactiveプロキシ経由で代入（Vueの変更検知を正しく動作させるため）
      const r = this._reactive as any;
      if (timeLimitMode === "none") {
        r._memorizeBlackTime = -1;
        r._memorizeWhiteTime = -1;
        r._memorizeBlackByoyomi = -1;
        r._memorizeWhiteByoyomi = -1;
        return;
      }
      // 持ち時間残り（秒）に変換
      const remainingSeconds = timeMs >= 0 ? Math.ceil(timeMs / 1000) : -1;
      // 秒読み残り
      const byoyomiValue = byoyomi >= 0 ? byoyomi : -1;
      // 解答者の手番に応じて時計を設定
      if (memorizePlayerColor === Color.BLACK) {
        r._memorizeBlackTime = remainingSeconds >= 0 ? remainingSeconds : -1;
        r._memorizeBlackByoyomi = byoyomiValue >= 0 ? byoyomiValue : -1;
        r._memorizeWhiteTime = -1;
        r._memorizeWhiteByoyomi = -1;
      } else if (memorizePlayerColor === Color.WHITE) {
        r._memorizeWhiteTime = remainingSeconds >= 0 ? remainingSeconds : -1;
        r._memorizeWhiteByoyomi = byoyomiValue >= 0 ? byoyomiValue : -1;
        r._memorizeBlackTime = -1;
        r._memorizeBlackByoyomi = -1;
      }
      // totalモードの場合、全体残り時間を表示。切れたら秒読みを表示
      if (timeLimitMode === "total" && totalTimeMs >= 0) {
        const totalSeconds = Math.ceil(totalTimeMs / 1000);
        if (memorizePlayerColor === Color.BLACK) {
          if (totalSeconds > 0) {
            r._memorizeBlackTime = totalSeconds;
            r._memorizeBlackByoyomi = -1;
          } else {
            r._memorizeBlackTime = 0;
            r._memorizeBlackByoyomi = byoyomiValue;
          }
          r._memorizeWhiteTime = -1;
          r._memorizeWhiteByoyomi = -1;
        } else if (memorizePlayerColor === Color.WHITE) {
          if (totalSeconds > 0) {
            r._memorizeWhiteTime = totalSeconds;
            r._memorizeWhiteByoyomi = -1;
          } else {
            r._memorizeWhiteTime = 0;
            r._memorizeWhiteByoyomi = byoyomiValue;
          }
          r._memorizeBlackTime = -1;
          r._memorizeBlackByoyomi = -1;
        }
      }
    };
    this.recordManager
      .on("changePosition", () => {
        this.onChangePositionHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
      })
      .on("updateTree", () => {
        this.onUpdateRecordTreeHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
        clearURLParams();
      })
      .on("updateComment", () => {
        saveRecordForWebApp(this.record);
      })
      .on("updateBookmark", () => {
        saveRecordForWebApp(this.record);
      })
      .on("updateCustomData", () => {
        this.onUpdateCustomDataHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
      })
      .on("backup", () => {
        return {
          returnCode: useAppSettings().returnCode,
        };
      });
  }

  // ========== Memorize 委譲プロパティ ==========

  get memorize(): MemorizeManager {
    return this._memorize;
  }

  get memorizeProblems(): MemorizeProblem[] {
    return this._memorize.memorizeProblems;
  }

  get currentProblemIndex(): number {
    return this._memorize.currentProblemIndex;
  }

  get currentProblem(): MemorizeProblem | undefined {
    return this._memorize.currentProblem;
  }

  get memorizeStep(): number {
    return this._memorize.memorizeStep;
  }

  get memorizeHintCount(): number {
    return this._memorize.memorizeHintCount;
  }

  get memorizeGiveUpCount(): number {
    return this._memorize.memorizeGiveUpCount;
  }

  get memorizeTotalQuestions(): number {
    return this._memorize.memorizeTotalQuestions;
  }

  get memorizeAccuracy(): number {
    return this._memorize.memorizeAccuracy;
  }

  get problemCorrectMoves(): number {
    return this._memorize.problemCorrectMoves;
  }

  get problemWrongMoves(): number {
    return this._memorize.problemWrongMoves;
  }

  get problemTotalPlayerMoves(): number {
    return this._memorize.problemTotalPlayerMoves;
  }

  get problemHintCount(): number {
    return this._memorize.problemHintCount;
  }

  get problemGiveUpCount(): number {
    return this._memorize.problemGiveUpCount;
  }

  get problemAccuracy(): number {
    return this._memorize.problemAccuracy;
  }

  get currentHint(): string | null {
    return this._memorize.currentHint;
  }

  get memorizeCorrectCount(): number {
    return this._memorize.memorizeCorrectCount;
  }

  get memorizeWrongCount(): number {
    return this._memorize.memorizeWrongCount;
  }

  get reviewMistakes(): { problemIndex: number; moveIndex: number }[] {
    return this._memorize.reviewMistakes;
  }

  get memorizePlayerColor(): Color | undefined {
    return this._memorize.memorizePlayerColor;
  }

  get isMemorizeProcessing(): boolean {
    return this._memorize.isMemorizeProcessing;
  }

  resetMemorizeStats(): void {
    this._memorize.resetMemorizeStats();
  }

  // === 解答用問題集コレクション委譲 ===

  get memorizeCollection() {
    return this._memorize.memorizeCollection;
  }

  get memorizeCollectionPath() {
    return this._memorize.memorizeCollectionPath;
  }

  // === 作成用問題集コレクション委譲 ===

  get editCollection() {
    return this._memorize.editCollection;
  }

  get editCollectionPath() {
    return this._memorize.editCollectionPath;
  }

  // === 解答セッション委譲 ===

  get solveOrder(): number[] {
    return this._memorize.solveOrder;
  }

  get solveIndex(): number {
    return this._memorize.solveIndex;
  }

  get solveTotal(): number {
    return this._memorize.solveTotal;
  }

  get isSolving(): boolean {
    return this._memorize.isSolving;
  }

  get isGiveUp(): boolean {
    return this._memorize.isGiveUp;
  }

  get skipCommonMoves(): boolean {
    return this._memorize.skipCommonMoves;
  }

  get currentCollectionProblemIndex(): number {
    return this._memorize.currentCollectionProblemIndex;
  }

  get currentCollectionProblem() {
    return this._memorize.currentCollectionProblem;
  }

  get totalProblemsCount(): number {
    return this._memorize.totalProblemsCount;
  }

  get dialogRandomOrder(): boolean {
    return this._memorize.dialogRandomOrder;
  }

  set dialogRandomOrder(v: boolean) {
    this._memorize.dialogRandomOrder = v;
  }

  get dialogMaxQuestions(): number {
    return this._memorize.dialogMaxQuestions;
  }

  set dialogMaxQuestions(v: number) {
    this._memorize.dialogMaxQuestions = v;
  }

  get dialogSkipCommonMoves(): boolean {
    return this._memorize.dialogSkipCommonMoves;
  }

  set dialogSkipCommonMoves(v: boolean) {
    this._memorize.dialogSkipCommonMoves = v;
  }

  get editingProblemIndex(): number {
    return this._memorize.editingProblemIndex;
  }

  // ========== 持ち時間設定 ==========

  get dialogUseTimeLimit(): boolean {
    return this._memorize.dialogUseTimeLimit;
  }

  set dialogUseTimeLimit(v: boolean) {
    this._memorize.dialogUseTimeLimit = v;
  }

  get dialogTimeLimitMode(): TimeLimitMode {
    return this._memorize.dialogTimeLimitMode;
  }

  set dialogTimeLimitMode(v: TimeLimitMode) {
    this._memorize.dialogTimeLimitMode = v;
  }

  get dialogTimeLimitSettings(): TimeLimitSettings {
    return this._memorize.dialogTimeLimitSettings;
  }

  set dialogTimeLimitSettings(v: TimeLimitSettings) {
    this._memorize.dialogTimeLimitSettings = v;
  }

  // タイマー状態
  get timeLimitMode(): TimeLimitMode {
    return this._memorize.timeLimitMode;
  }

  get remainingSeconds(): number {
    return this._memorize.remainingSeconds;
  }

  get totalRemainingSeconds(): number {
    return this._memorize.totalRemainingSeconds;
  }

  /** メモライズ用時計表示（先手） */
  get memorizeBlackTime(): number {
    return this._memorizeBlackTime;
  }

  /** メモライズ用時計表示（後手） */
  get memorizeWhiteTime(): number {
    return this._memorizeWhiteTime;
  }

  /** メモライズ用時計 秒読み表示（先手） */
  get memorizeBlackByoyomi(): number {
    return this._memorizeBlackByoyomi;
  }

  /** メモライズ用時計 秒読み表示（後手） */
  get memorizeWhiteByoyomi(): number {
    return this._memorizeWhiteByoyomi;
  }

  // ========== Memorize 委譲メソッド（解答用） ==========

  async startSolveSession(): Promise<void> {
    await this._memorize.startSolveSession();
  }

  startMemorizeTimer(): void {
    this._memorize.startTimer();
  }

  async startCurrentSolveProblem(): Promise<void> {
    await this._memorize.startCurrentSolveProblem();
  }

  async nextProblem(): Promise<boolean> {
    return this._memorize.nextProblem();
  }

  endSolveSession(): void {
    this._memorize.endSolveSession();
  }

  loadMemorizeCollectionFromYAML(yaml: string): Error | undefined {
    return this._memorize.loadMemorizeCollectionFromYAML(yaml);
  }

  // ========== Memorize 委譲メソッド（作成用） ==========

  newEditCollection(title: string, playerColor?: "black" | "white"): void {
    this._memorize.newEditCollection(title, playerColor);
  }

  updateEditCollectionSettings(title: string, playerColor: "black" | "white"): void {
    this._memorize.updateEditCollectionSettings(title, playerColor);
  }

  addBranchAsEditProblem(name: string): boolean {
    return this._memorize.addBranchAsEditProblem(name);
  }

  loadEditCollectionFromYAML(yaml: string): Error | undefined {
    return this._memorize.loadEditCollectionFromYAML(yaml);
  }

  saveEditCollectionToYAML(): string | Error {
    return this._memorize.saveEditCollectionToYAML();
  }

  importRecordTextToEditCollection(
    data: string,
    sourceName: string,
    includeComments?: boolean,
  ): { added: number; skipped: number } | null {
    return this._memorize.importRecordTextToEditCollection(data, sourceName, includeComments);
  }

  addProblemToEditCollection(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    this._memorize.addProblemToEditCollection(problem);
  }

  removeProblemFromEditCollection(index: number): void {
    this._memorize.removeProblemFromEditCollection(index);
  }

  updateProblemInEditCollection(
    index: number,
    problem: import("@/common/memorize/index.js").MemorizeProblem,
  ): void {
    this._memorize.updateProblemInEditCollection(index, problem);
  }

  loadEditProblemToRecord(index: number): void {
    this._memorize.loadEditProblemToRecord(index);
  }

  updateEditProblemFromRecord(): boolean {
    return this._memorize.updateEditProblemFromRecord();
  }

  renameEditProblem(name: string): void {
    this._memorize.renameEditProblem(name);
  }

  clearEditProblem(): void {
    this._memorize.clearEditProblem();
  }

  importKIFForMemorize(data: string): Error | undefined {
    return this._memorize.importKIFForMemorize(data);
  }

  startMemorizeProblem(index: number, playerColor?: Color): void {
    this._memorize.startMemorizeProblem(index, playerColor);
  }

  async doMemorizeMove(move: Move): Promise<void> {
    await this._memorize.doMemorizeMove(move);
  }

  async giveUpMemorize(): Promise<void> {
    await this._memorize.giveUpMemorize();
  }

  get isMovableByUser(): boolean {
    return this._memorize.isMovableByUser;
  }

  // ========== ダイアログ表示制御 ==========

  get isMemorizeSolveDialogVisible(): boolean {
    return this._isMemorizeSolveDialogVisible;
  }
  private _isMemorizeSolveDialogVisible = false;

  showMemorizeSolveDialog(): void {
    this._isMemorizeSolveDialogVisible = true;
  }

  closeMemorizeSolveDialog(): void {
    this._isMemorizeSolveDialogVisible = false;
  }

  get isMemorizeResultDialogVisible(): boolean {
    return this._isMemorizeResultDialogVisible;
  }
  private _isMemorizeResultDialogVisible = false;

  get memorizeResultDialogMode(): "perProblem" | "overall" {
    return this._memorizeResultDialogMode;
  }
  private _memorizeResultDialogMode: "perProblem" | "overall" = "perProblem";

  showMemorizeResultDialog(mode: "perProblem" | "overall"): void {
    this._memorizeResultDialogMode = mode;
    this._isMemorizeResultDialogVisible = true;
  }

  closeMemorizeResultDialog(): void {
    this._isMemorizeResultDialogVisible = false;
  }

  get isMemorizeCreateDialogVisible(): boolean {
    return this._isMemorizeCreateDialogVisible;
  }
  private _isMemorizeCreateDialogVisible = false;

  showMemorizeCreateDialog(): void {
    this._isMemorizeCreateDialogVisible = true;
  }

  closeMemorizeCreateDialog(): void {
    this._isMemorizeCreateDialogVisible = false;
  }

  // ========== 既存のメソッド（変更なし） ==========

  addEventListener(event: "changePosition", handler: ChangePositionHandler): void;
  addEventListener(event: "updateRecordTree", handler: UpdateTreeHandler): void;
  addEventListener(event: "updateCustomData", handler: UpdateCustomDataHandler): void;
  addEventListener(event: string, handler: unknown): void {
    switch (event) {
      case "changePosition":
        this.onChangePositionHandlers.push(handler as ChangePositionHandler);
        break;
      case "updateRecordTree":
        this.onUpdateRecordTreeHandlers.push(handler as UpdateTreeHandler);
        break;
      case "updateCustomData":
        this.onUpdateCustomDataHandlers.push(handler as UpdateCustomDataHandler);
        break;
    }
  }

  removeEventListener(event: "changePosition", handler: ChangePositionHandler): void;
  removeEventListener(event: "updateRecordTree", handler: UpdateTreeHandler): void;
  removeEventListener(event: "updateCustomData", handler: UpdateCustomDataHandler): void;
  removeEventListener(event: string, handler: unknown): void {
    switch (event) {
      case "changePosition":
        this.onChangePositionHandlers = this.onChangePositionHandlers.filter((h) => h !== handler);
        break;
      case "updateRecordTree":
        this.onUpdateRecordTreeHandlers = this.onUpdateRecordTreeHandlers.filter(
          (h) => h !== handler,
        );
        break;
      case "updateCustomData":
        this.onUpdateCustomDataHandlers = this.onUpdateCustomDataHandlers.filter(
          (h) => h !== handler,
        );
        break;
    }
  }

  get reactive(): UnwrapNestedRefs<Store> {
    return this._reactive;
  }

  get record(): ImmutableRecord {
    return this.recordManager.record;
  }

  get recordFilePath(): string | undefined {
    return this.recordManager.recordFilePath;
  }

  get isRecordFileUnsaved(): boolean {
    return this.recordManager.unsaved;
  }

  get inCommentPVs(): Move[][] {
    return this.recordManager.inCommentPVs;
  }

  get positionCounts(): ReadonlyMap<string, number> {
    return this.recordManager.positionCounts;
  }

  updateStandardRecordMetadata(update: { key: RecordMetadataKey; value: string }): void {
    this.recordManager.updateStandardMetadata(update);
  }

  appendMovesSilently(moves: Move[], opt?: DoMoveOption): number {
    return this.recordManager.appendMovesSilently(moves, opt);
  }

  get appState(): AppState {
    return this._appState;
  }
  set appState(state: AppState) {
    this._appState = state;
  }

  get customLayout() {
    return this._customLayout;
  }

  updateLayoutProfile(layout: LayoutProfile | null): void {
    this._customLayout = layout;
  }

  showPasteDialog(mode: "standard" | "mergeIntoRoot" | "mergeIntoCurrent" = "standard"): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    const appSettings = useAppSettings();
    if ((mode === "standard" && appSettings.showPasteDialog) || !isNative()) {
      this._appState = AppState.PASTE_DIALOG;
    } else {
      navigator.clipboard.readText().then((text) => {
        this.pasteRecord(text, mode);
      });
    }
  }

  showRecordFileHistoryDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.RECORD_FILE_HISTORY_DIALOG;
    }
  }

  showLoadRemoteFileDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.LOAD_REMOTE_FILE_DIALOG;
    }
  }

  showAddBookMovesDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.ADD_BOOK_MOVES_DIALOG;
    }
  }

  showResetBookDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.RESET_BOOK_DIALOG;
    }
  }

  showSearchDuplicatePositionsDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.SEARCH_DUPLICATE_POSITIONS_DIALOG;
    }
  }

  destroyModalDialog(): void {
    if (
      this.appState === AppState.PASTE_DIALOG ||
      this.appState === AppState.RECORD_FILE_HISTORY_DIALOG ||
      this.appState === AppState.LOAD_REMOTE_FILE_DIALOG ||
      this.appState === AppState.ADD_BOOK_MOVES_DIALOG ||
      this.appState === AppState.RESET_BOOK_DIALOG ||
      this.appState === AppState.SEARCH_DUPLICATE_POSITIONS_DIALOG
    ) {
      this._appState = AppState.NORMAL;
    }
  }

  closeModalDialog(): void {
    if (!useBusyState().isBusy) {
      this.destroyModalDialog();
    }
  }

  get isAppSettingsDialogVisible(): boolean {
    return this._isAppSettingsDialogVisible;
  }

  showAppSettingsDialog(): void {
    this._isAppSettingsDialogVisible = true;
  }

  closeAppSettingsDialog(): void {
    this._isAppSettingsDialogVisible = false;
  }

  doMove(move: Move): void {
    if (this.appState === AppState.MEMORIZE) {
      this.doMemorizeMove(move);
      return;
    }
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    if (!this.recordManager.appendMove({ move })) {
      return;
    }
    const appSettings = useAppSettings();
    try {
      playPieceBeat(appSettings.pieceVolume);
    } catch (e) {
      useErrorStore().add(e);
    }
  }

  resetRecord(mode: "keepRootPosition" | "hirateSetup" = "keepRootPosition"): void {
    if (this.appState != AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToClearRecord,
      onOk: () => {
        switch (mode) {
          case "keepRootPosition":
            this.recordManager.reset();
            break;
          case "hirateSetup":
            this.recordManager.resetByInitialPositionType(InitialPositionType.STANDARD);
            break;
        }
      },
    });
  }

  updateRecordComment(comment: string): void {
    this.recordManager.updateComment(comment);
  }

  updateRecordBookmark(bookmark: string): void {
    this.recordManager.updateBookmark(bookmark);
  }

  insertSpecialMove(specialMoveType: SpecialMoveType): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    this.recordManager.appendMove({ move: specialMoveType });
  }

  startPositionEditing(): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToClearRecord,
      onOk: () => {
        this._appState = AppState.POSITION_EDITING;
        this.recordManager.resetByCurrentPosition();
      },
    });
  }

  endPositionEditing(): void {
    if (this.appState === AppState.POSITION_EDITING) {
      this._appState = AppState.NORMAL;
    }
  }

  initializePositionBySFEN(sfen: string): void {
    if (this.appState === AppState.NORMAL || this.appState === AppState.POSITION_EDITING) {
      this.showConfirmation({
        message:
          this.appState === AppState.NORMAL
            ? t.areYouSureWantToClearRecord
            : t.areYouSureWantToDiscardPosition,
        onOk: () => {
          this.recordManager.resetBySFEN(sfen);
        },
      });
    }
  }

  changeTurn(): void {
    if (this.appState == AppState.POSITION_EDITING) {
      this.recordManager.swapNextTurn();
    }
  }

  showPieceSetChangeDialog() {
    if (this.appState === AppState.POSITION_EDITING) {
      this._appState = AppState.PIECE_SET_CHANGE_DIALOG;
    }
  }

  closePieceSetChangeDialog(pieceSet?: PieceSet) {
    if (this.appState !== AppState.PIECE_SET_CHANGE_DIALOG) {
      return;
    }
    if (pieceSet) {
      this.recordManager.changePieceSet(pieceSet);
    }
    this._appState = AppState.POSITION_EDITING;
  }

  editPosition(change: PositionChange): void {
    if (this.appState === AppState.POSITION_EDITING) {
      this.recordManager.changePosition(change);
    }
  }

  goForward(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.goForward();
    }
  }

  goBack(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.goBack();
    }
  }

  changePly(ply: number): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changePly(ply);
    }
  }

  changeBranch(index: number): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changeBranch(index);
    }
  }

  changeNode(node: ImmutableNode): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changeNode(node);
    }
  }

  swapWithNextBranch(): boolean {
    return this.recordManager.swapWithNextBranch();
  }

  swapWithPreviousBranch(): boolean {
    return this.recordManager.swapWithPreviousBranch();
  }

  backToMainBranch(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.resetAllBranchSelection();
    }
  }

  removeCurrentMove(): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    if (this.recordManager.record.current.isLastMove) {
      this.recordManager.removeCurrentMove();
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToDeleteFollowingMove(this.recordManager.record.current.ply),
      onOk: () => {
        this.recordManager.removeCurrentMove();
      },
    });
  }

  jumpToBookmark(bookmark: string): boolean {
    if (this.appState === AppState.NORMAL) {
      return this.recordManager.jumpToBookmark(bookmark);
    }
    return false;
  }

  copyRecordKIF(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportKIF(record, {
      returnCode: appSettings.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordKI2(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportKI2(record, {
      returnCode: appSettings.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordCSA(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportCSA(record, {
      returnCode: appSettings.returnCode,
      v3: appSettings.useCSAV3 ? { milliseconds: true } : undefined,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordUSI(target: "all" | "before" | "after"): void {
    const appSettings = useAppSettings();
    const record =
      target === "after" ? this.recordManager.record.getSubtree() : this.recordManager.record;
    const str = record.getUSI({
      startpos: appSettings.enableUSIFileStartpos,
      resign: appSettings.enableUSIFileSpecialMoves,
      repDraw: appSettings.enableUSIFileSpecialMoves,
      draw: appSettings.enableUSIFileSpecialMoves,
      timeout: appSettings.enableUSIFileSpecialMoves,
      break: appSettings.enableUSIFileSpecialMoves,
      win: appSettings.enableUSIFileSpecialMoves,
      allMoves: target !== "before",
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordJKF(options?: { fromCurrentPosition?: boolean }): void {
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportJKFString(record);
    navigator.clipboard.writeText(str);
  }

  copyRecordUSEN(options?: { fromCurrentPosition?: boolean }): void {
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const [usen] = record.usen;
    navigator.clipboard.writeText(usen);
  }

  copyBoardSFEN(): void {
    const str = this.recordManager.record.sfen;
    navigator.clipboard.writeText(str);
  }

  copyBoardBOD(): void {
    const str = exportBOD(this.recordManager.record);
    navigator.clipboard.writeText(str);
  }

  pasteRecord(
    data: string,
    mode: "standard" | "mergeIntoRoot" | "mergeIntoCurrent" = "standard",
  ): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    const error = this.recordManager.importRecord(data.trim(), { mode });
    if (error) {
      useErrorStore().add(error);
      return;
    }
  }

  openRecord(path?: string, opt?: { ply?: number }): void {
    if (this.appState !== AppState.NORMAL || useBusyState().isBusy) {
      useErrorStore().add(t.pleaseEndActiveFeaturesBeforeOpenRecord);
      return;
    }
    useBusyState().retain();
    Promise.resolve()
      .then(() => {
        return path || api.showOpenRecordDialog(getStandardRecordFileFormats());
      })
      .then((path) => {
        if (!path) {
          return;
        }
        const appSettings = useAppSettings();
        const autoDetect = appSettings.textDecodingRule == TextDecodingRule.AUTO_DETECT;
        return api.openRecord(path).then((data) => {
          const e = this.recordManager.importRecordFromBuffer(data, path, {
            autoDetect,
          });
          return e && Promise.reject(e);
        });
      })
      .then(() => {
        if (opt?.ply) {
          this.recordManager.changePly(opt.ply);
        }
      })
      .catch((e) => {
        useErrorStore().add("棋譜の読み込み中にエラーが出ました: " + e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  saveRecord(options?: { overwrite?: boolean; format?: RecordFileFormat }): void {
    if (this.appState !== AppState.NORMAL || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    Promise.resolve()
      .then(() => {
        const path = this.recordManager.recordFilePath;
        if (options?.overwrite && path) {
          return path;
        }
        const appSettings = useAppSettings();
        const defaultPath =
          (!options?.format && path) ||
          generateRecordFileName(this.recordManager.record, {
            template: appSettings.recordFileNameTemplate,
            extension: options?.format || appSettings.defaultRecordFileFormat,
          });
        return api.showSaveRecordDialog(defaultPath);
      })
      .then((path) => {
        if (!path) {
          return;
        }
        return this.saveRecordByPath(path, { detectGarbled: true }).then(() => {
          const fileFormat = detectRecordFileFormatByPath(path) as RecordFileFormat;
          const props = detectUnsupportedRecordProperties(this.recordManager.record, fileFormat);
          const items = Object.entries(props)
            .filter(([, v]) => v)
            .map(([k]) => {
              switch (k) {
                case "branch":
                  return t.branches;
                case "comment":
                  return t.comments;
                case "bookmark":
                  return t.bookmark;
                case "time":
                  return t.elapsedTime;
              }
            })
            .map((v) => ({ text: v })) as ListItem[];
          if (items.length) {
            useMessageStore().enqueue({
              text: t.followingDataNotSavedBecauseNotSupporetedBy(fileFormat),
              attachments: [{ type: "list", items }],
            });
          }
        });
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  private async saveRecordByPath(
    path: string,
    opt?: { detectGarbled?: boolean; recordManager?: RecordManager },
  ): Promise<void> {
    const appSettings = useAppSettings();
    const recordManager = opt?.recordManager || this.recordManager;
    const result = recordManager.exportRecordAsBuffer(path, {
      returnCode: appSettings.returnCode,
      detectGarbled: opt?.detectGarbled,
      csa: { v3: appSettings.useCSAV3 },
      useUTF8ForKifAndKi2: appSettings.useUTF8ForKifAndKi2,
    });
    if (result instanceof Error) {
      throw result;
    }
    try {
      await api.saveRecord(path, result.data);
      if (result.garbled && !this.garbledNotified) {
        useMessageStore().enqueue({
          text: `${t.recordSavedWithGarbledCharacters}\n${t.pleaseConsiderToUseKIFU}\n${t.youCanChangeDefaultRecordFileFormatFromAppSettings}`,
        });
        this.garbledNotified = true;
      }
    } catch (e) {
      throw new Error(`${t.failedToSaveRecord}: ${e}`);
    }
  }

  restoreFromBackupV1(name: string): void {
    if (this.appState !== AppState.RECORD_FILE_HISTORY_DIALOG || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    api
      .loadRecordFileBackup(name)
      .then((data) => {
        const err = this.recordManager.importRecord(data, {
          type: RecordFormatType.KIF,
          markAsSaved: true,
        });
        if (err) {
          return Promise.reject(err);
        }
        this._appState = AppState.NORMAL;
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  restoreFromBackupV2(kif: string): void {
    if (this.appState !== AppState.RECORD_FILE_HISTORY_DIALOG || useBusyState().isBusy) {
      return;
    }
    const err = this.recordManager.importRecord(kif, {
      type: RecordFormatType.KIF,
      markAsSaved: true,
    });
    if (err) {
      useErrorStore().add(err);
      return;
    }
    this._appState = AppState.NORMAL;
  }

  get remoteRecordFileURL() {
    return this.recordManager.sourceURL;
  }

  loadRemoteRecordFile(url?: string) {
    useBusyState().retain();
    this.recordManager
      .importRecordFromRemoteURL(url)
      .catch((e) => useErrorStore().add(e))
      .finally(() => useBusyState().release());
  }

  async onMainWindowClose(): Promise<void> {
    useBusyState().retain();
    try {
      await this.recordManager.saveBackup();
    } finally {
      useBusyState().release();
    }
  }

  private showConfirmation(confirmation: Confirmation): void {
    const lastAppState = this.appState;
    useConfirmationStore().show({
      ...confirmation,
      onOk: () => {
        if (this.appState !== lastAppState) {
          useErrorStore().add("確認ダイアログ表示中に他の操作が行われたため処理が中止されました。");
          return;
        }
        confirmation.onOk();
      },
    });
  }
}

export function createStore(): UnwrapNestedRefs<Store> {
  return new Store().reactive;
}

let store: UnwrapNestedRefs<Store>;

export function useStore(): UnwrapNestedRefs<Store> {
  if (!store) {
    store = createStore();
  }
  return store;
}
