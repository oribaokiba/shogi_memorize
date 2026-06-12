import api, { isNative } from "@/renderer/ipc/api.js";
import {
  Color,
  ImmutableRecord,
  Move,
  PositionChange,
  exportKIF,
  importKIF,
  RecordMetadataKey,
  DoMoveOption,
  SpecialMoveType,
  exportKI2,
  RecordFormatType,
  exportJKFString,
  exportBOD,
  exportCSA,
  InitialPositionType,
  ImmutableNode,
  Position,
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
import {
  loadMemorizeCollection,
  saveMemorizeCollection,
  type MemorizeCollection,
} from "@/common/memorize/index.js";

// 旧形式のメモライズ問題（互換性維持）
export type MemorizeProblem = {
  name: string;
  moves: Move[];
  playerColor: Color;
};

class Store {
  private recordManager = new RecordManager(loadRecordForWebApp());
  private _appState = AppState.NORMAL;
  private _memorizeProblems: MemorizeProblem[] = [];
  private _currentProblemIndex = -1;
  private _memorizeStep = 0;
  private _memorizePlayerColor?: Color;
  private _isMemorizeProcessing = false;
  private _memorizeCollection: MemorizeCollection | null = null;
  private _memorizeCollectionPath: string | null = null;
  private _editingProblemIndex = -1;
  private _reviewMistakes: { problemIndex: number; moveIndex: number }[] = [];
  private _memorizeCorrectCount = 0;
  private _memorizeWrongCount = 0;
  private _customLayout: LayoutProfile | null = null;
  private _isAppSettingsDialogVisible = false;
  private _isMemorizeDialogVisible = false;
  private _isMemorizeCreateDialogVisible = false;
  private _reactive: UnwrapNestedRefs<Store>;
  private garbledNotified = false;
  private onChangePositionHandlers: ChangePositionHandler[] = [];
  private onUpdateRecordTreeHandlers: UpdateTreeHandler[] = [];
  private onUpdateCustomDataHandlers: UpdateCustomDataHandler[] = [];

  // 解答セッション管理
  private _solveOrder: number[] = [];
  private _solveIndex = 0;
  private _solveTotal = 0;
  private _isSolving = false;
  private _skipCommonMoves = 0;

  // ダイアログ設定の一時保存用
  private _dialogRandomOrder = false;
  private _dialogMaxQuestions = 0;
  private _dialogSkipCommonMoves = 0;

  constructor() {
    const refs = reactive(this);
    this._reactive = refs;
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

  get isMemorizeSolveDialogVisible(): boolean {
    return this._isMemorizeDialogVisible;
  }

  showMemorizeSolveDialog(): void {
    this._isMemorizeDialogVisible = true;
  }

  closeMemorizeSolveDialog(): void {
    this._isMemorizeDialogVisible = false;
  }

  get isMemorizeCreateDialogVisible(): boolean {
    return this._isMemorizeCreateDialogVisible;
  }

  showMemorizeCreateDialog(): void {
    this._isMemorizeCreateDialogVisible = true;
  }

  closeMemorizeCreateDialog(): void {
    this._isMemorizeCreateDialogVisible = false;
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

  get isMovableByUser() {
    switch (this.appState) {
      case AppState.NORMAL:
        return true;
      case AppState.MEMORIZE: {
        const problem = this.currentProblem;
        if (!problem) {
          return false;
        }
        const expectedMove = problem.moves[this._memorizeStep];
        return expectedMove ? expectedMove.color === problem.playerColor : false;
      }
    }
    return false;
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

  get memorizeProblems(): MemorizeProblem[] {
    return this._memorizeProblems;
  }

  get currentProblemIndex(): number {
    return this._currentProblemIndex;
  }

  get currentProblem(): MemorizeProblem | undefined {
    return this._memorizeProblems[this._currentProblemIndex];
  }

  get memorizeStep(): number {
    return this._memorizeStep;
  }

  get currentHint(): string | null {
    if (!this._memorizeCollection || this._currentProblemIndex < 0) {
      return null;
    }
    const problem = this._memorizeCollection.problems[this._currentProblemIndex];
    if (!problem || !problem.hints || problem.hints.length === 0) {
      return null;
    }
    const hint = problem.hints.find((h) => h.index === this._memorizeStep);
    return hint ? hint.text : null;
  }

  get memorizeCorrectCount(): number {
    return this._memorizeCorrectCount;
  }

  get memorizeWrongCount(): number {
    return this._memorizeWrongCount;
  }

  get reviewMistakes(): { problemIndex: number; moveIndex: number }[] {
    return this._reviewMistakes;
  }

  resetMemorizeStats(): void {
    this._memorizeCorrectCount = 0;
    this._memorizeWrongCount = 0;
    this._reviewMistakes = [];
  }

  get memorizePlayerColor(): Color | undefined {
    return this._memorizePlayerColor;
  }

  get isMemorizeProcessing(): boolean {
    return this._isMemorizeProcessing;
  }

  // === 問題集コレクション管理 ===

  get memorizeCollection(): MemorizeCollection | null {
    return this._memorizeCollection;
  }

  get memorizeCollectionPath(): string | null {
    return this._memorizeCollectionPath;
  }

  // === 解答セッション管理 ===

  get solveOrder(): number[] {
    return this._solveOrder;
  }

  get solveIndex(): number {
    return this._solveIndex;
  }

  get solveTotal(): number {
    return this._solveTotal;
  }

  get isSolving(): boolean {
    return this._isSolving;
  }

  get skipCommonMoves(): number {
    return this._skipCommonMoves;
  }

  get currentCollectionProblemIndex(): number {
    if (this._solveOrder.length === 0) {
      return -1;
    }
    return this._solveOrder[this._solveIndex] ?? -1;
  }

  get currentCollectionProblem(): import("@/common/memorize/index.js").MemorizeProblem | null {
    const idx = this.currentCollectionProblemIndex;
    if (idx < 0 || !this._memorizeCollection) {
      return null;
    }
    return this._memorizeCollection.problems[idx] ?? null;
  }

  get totalProblemsCount(): number {
    return this._memorizeCollection?.problems.length ?? 0;
  }

  get dialogRandomOrder(): boolean {
    return this._dialogRandomOrder;
  }

  set dialogRandomOrder(v: boolean) {
    this._dialogRandomOrder = v;
  }

  get dialogMaxQuestions(): number {
    return this._dialogMaxQuestions;
  }

  set dialogMaxQuestions(v: number) {
    this._dialogMaxQuestions = v;
  }

  get dialogSkipCommonMoves(): number {
    return this._dialogSkipCommonMoves;
  }

  set dialogSkipCommonMoves(v: number) {
    this._dialogSkipCommonMoves = v;
  }

  private buildSolveOrder(): void {
    if (!this._memorizeCollection) {
      this._solveOrder = [];
      this._solveIndex = 0;
      this._solveTotal = 0;
      return;
    }
    const count = this._memorizeCollection.problems.length;
    const indices = Array.from({ length: count }, (_, i) => i);
    if (this._dialogRandomOrder) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    const max = this._dialogMaxQuestions > 0 ? Math.min(this._dialogMaxQuestions, count) : count;
    this._solveOrder = indices.slice(0, max);
    this._solveIndex = 0;
    this._solveTotal = this._solveOrder.length;
  }

  startSolveSession(): void {
    if (!this._memorizeCollection || this._memorizeCollection.problems.length === 0) {
      return;
    }
    this.buildSolveOrder();
    this._skipCommonMoves = this._dialogSkipCommonMoves;
    this._isSolving = true;
    this._appState = AppState.MEMORIZE;
    this.startCurrentSolveProblem();
  }

  private startCurrentSolveProblem(): void {
    const problem = this.currentCollectionProblem;
    if (!problem || !this._memorizeCollection) {
      return;
    }

    const pos = Position.newBySFEN(problem.sfen);
    if (!pos) {
      useErrorStore().add(new Error("問題の初期局面(SFEN)が正しくありません"));
      return;
    }

    const moveObjects: Move[] = [];
    for (const usi of problem.moves) {
      const move = pos.createMoveByUSI(usi);
      if (!move) {
        useErrorStore().add(
          new Error(`問題 ${problem.name} の${moveObjects.length + 1}手目 (${usi}) が不正です`),
        );
        return;
      }
      moveObjects.push(move);
      pos.doMove(move);
    }

    this._memorizeProblems = [
      {
        name: problem.name,
        moves: moveObjects,
        playerColor: problem.playerColor,
      },
    ];
    this._currentProblemIndex = 0;
    this._memorizeStep = 0;
    this._memorizePlayerColor = problem.playerColor;
    this._isMemorizeProcessing = false;

    this.recordManager.resetBySFEN(problem.sfen);

    if (this._skipCommonMoves > 0) {
      this.skipMovesForward(problem, moveObjects);
    } else if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this.recordManager.appendMove({ move: moveObjects[0] });
      this._memorizeStep = 1;
    }
  }

  private skipMovesForward(
    _problem: import("@/common/memorize/index.js").MemorizeProblem,
    moveObjects: Move[],
  ): void {
    const skipCount = Math.min(this._skipCommonMoves, moveObjects.length);
    const playerColor = _problem.playerColor;
    let step = 0;

    for (let i = 0; i < skipCount; i++) {
      if (i >= moveObjects.length) {
        break;
      }
      this.recordManager.appendMove({ move: moveObjects[i] });
      step++;
    }

    this._memorizeStep = step;

    if (step < moveObjects.length && moveObjects[step].color !== playerColor) {
      this.recordManager.appendMove({ move: moveObjects[step] });
      this._memorizeStep = step + 1;
    }
  }

  nextProblem(): boolean {
    if (!this._isSolving) {
      return false;
    }
    this._solveIndex++;
    if (this._solveIndex >= this._solveTotal) {
      this.endSolveSession();
      useMessageStore().enqueue({ text: "全問終了しました！" });
      return false;
    }
    this.startCurrentSolveProblem();
    return true;
  }

  endSolveSession(): void {
    this._isSolving = false;
    this._solveOrder = [];
    this._solveIndex = 0;
    this._solveTotal = 0;
    this._skipCommonMoves = 0;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._memorizePlayerColor = undefined;
    this._isMemorizeProcessing = false;
    this._memorizeCollection = null;
    this._memorizeCollectionPath = null;
    this._appState = AppState.NORMAL;
    this.recordManager.reset();
  }

  newMemorizeCollection(title: string, playerColor?: "black" | "white"): void {
    this._memorizeCollection = {
      version: 1,
      title,
      playerColor: playerColor || "black",
      problems: [],
    };
    this._memorizeCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._appState = AppState.NORMAL;
  }

  updateMemorizeCollectionSettings(title: string, playerColor: "black" | "white"): void {
    if (!this._memorizeCollection) {
      return;
    }
    this._memorizeCollection.title = title;
    this._memorizeCollection.playerColor = playerColor;
  }

  addBranchAsProblem(name: string): boolean {
    if (!this._memorizeCollection) {
      return false;
    }

    const record = this.recordManager.record;
    const sfen = record.initialPosition.sfen;
    const current = record.current;

    const pathUSI: string[] = [];
    const pathComments: (string | null)[] = [];

    const collectPath = (node: ImmutableNode, target: ImmutableNode): boolean => {
      if (node === target) {
        return true;
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        if (child.move && child.move instanceof Move) {
          children.push(child);
        }
        child = child.branch;
      }

      if (children.length === 0) {
        return false;
      }

      let targetChild: ImmutableNode | null = null;
      for (const c of children) {
        if (collectPath(c, target)) {
          targetChild = c;
          break;
        }
      }

      if (targetChild) {
        if (targetChild.move && targetChild.move instanceof Move) {
          pathUSI.unshift(targetChild.move.usi);
        }
        pathComments.unshift(targetChild.comment || null);
        return true;
      }

      return false;
    };

    const found = collectPath(record.first, current);
    if (!found) {
      useErrorStore().add(new Error("手順のパス収集に失敗しました。"));
      return false;
    }

    const remainingUSI: string[] = [];
    const remainingComments: (string | null)[] = [];
    const collectRemainingPath = (node: ImmutableNode): boolean => {
      let curr = node;
      while (true) {
        const children: ImmutableNode[] = [];
        let child = curr.next;
        while (child) {
          if (child.move && child.move instanceof Move) {
            children.push(child);
          }
          child = child.branch;
        }

        if (children.length === 0) {
          break;
        }
        if (children.length > 1) {
          return false;
        }

        const nextNode = children[0];
        if (nextNode.move && nextNode.move instanceof Move) {
          remainingUSI.push(nextNode.move.usi);
        }
        remainingComments.push(nextNode.comment || null);
        curr = nextNode;
      }
      return true;
    };

    if (!collectRemainingPath(current)) {
      useErrorStore().add(
        new Error(
          "選択された手順の先に分岐があります。一意になるように最後の分岐の後の局面を選択してください。",
        ),
      );
      return false;
    }

    const fullPathUSI = [...pathUSI, ...remainingUSI];
    const fullPathComments = [...pathComments, ...remainingComments];

    const hints: { index: number; text: string }[] = [];
    fullPathComments.forEach((text, idx) => {
      if (text && text.trim()) {
        hints.push({ index: idx, text: text.trim() });
      }
    });

    const playerColor =
      this._memorizeCollection.playerColor === "white" ? Color.WHITE : Color.BLACK;
    const problem: import("@/common/memorize/index.js").MemorizeProblem = {
      name,
      sfen,
      playerColor,
      moves: fullPathUSI,
      hints: hints.length > 0 ? hints : undefined,
    };
    this._memorizeCollection.problems.push(problem);
    return true;
  }

  loadMemorizeCollectionFromYAML(yaml: string): Error | undefined {
    const result = loadMemorizeCollection(yaml);
    if (result instanceof Error) {
      return result;
    }
    this._memorizeCollection = result;
    this._memorizeCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._appState = AppState.NORMAL;
    return undefined;
  }

  saveMemorizeCollectionToYAML(): string | Error {
    if (!this._memorizeCollection) {
      return new Error("問題集が読み込まれていません");
    }
    return saveMemorizeCollection(this._memorizeCollection);
  }

  private isDuplicateProblem(sfen: string, playerColor: Color, moves: string[]): boolean {
    if (!this._memorizeCollection) {
      return false;
    }
    return this._memorizeCollection.problems.some(
      (p) =>
        p.sfen === sfen &&
        p.playerColor === playerColor &&
        p.moves.length === moves.length &&
        p.moves.every((m, i) => m === moves[i]),
    );
  }

  importCurrentRecordAsProblems(): number {
    if (!this._memorizeCollection) {
      return 0;
    }
    const sfen = this.recordManager.record.initialPosition.sfen;
    const problems = this.extractNewProblems(this.recordManager.record, sfen);
    let addedCount = 0;
    for (const problem of problems) {
      if (!this.isDuplicateProblem(problem.sfen, problem.playerColor, problem.moves)) {
        this._memorizeCollection.problems.push(problem);
        addedCount++;
      }
    }
    return addedCount;
  }

  private extractNewProblems(
    record: ImmutableRecord,
    sfen: string,
  ): import("@/common/memorize/index.js").MemorizeProblem[] {
    const problems: import("@/common/memorize/index.js").MemorizeProblem[] = [];

    const dfs = (node: ImmutableNode, pathUSI: string[]) => {
      const currentPath = [...pathUSI];
      if (node.move && node.move instanceof Move) {
        currentPath.push(node.move.usi);
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        children.push(child);
        child = child.branch;
      }

      if (children.length === 0) {
        if (currentPath.length > 0) {
          const pColor = currentPath.length % 2 === 0 ? Color.WHITE : Color.BLACK;
          problems.push({
            name: `${this._memorizeCollection!.problems.length + problems.length + 1}. 問題`,
            sfen,
            playerColor: pColor,
            moves: currentPath,
            hints: undefined,
          });
        }
        return;
      }

      children.forEach((child) => {
        dfs(child, currentPath);
      });
    };

    dfs(record.first, []);
    return problems;
  }

  startMemorizeFromNewProblem(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._memorizePlayerColor = undefined;
    this._isMemorizeProcessing = false;

    const pos = Position.newBySFEN(problem.sfen);
    if (!pos) {
      useErrorStore().add(new Error("問題の初期局面(SFEN)が正しくありません"));
      return;
    }

    const moveObjects: Move[] = [];
    for (const usi of problem.moves) {
      const move = pos.createMoveByUSI(usi);
      if (!move) {
        useErrorStore().add(
          new Error(`問題 ${problem.name} の${moveObjects.length + 1}手目 (${usi}) が不正です`),
        );
        return;
      }
      moveObjects.push(move);
      pos.doMove(move);
    }

    this._memorizeProblems = [
      {
        name: problem.name,
        moves: moveObjects,
        playerColor: problem.playerColor,
      },
    ];
    this._currentProblemIndex = 0;
    this._memorizeStep = 0;
    this._memorizePlayerColor = problem.playerColor;
    this._isMemorizeProcessing = false;
    this._appState = AppState.MEMORIZE;

    this.recordManager.resetBySFEN(problem.sfen);

    if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this.recordManager.appendMove({ move: moveObjects[0] });
      this._memorizeStep = 1;
    }
  }

  importRecordTextToCollection(
    data: string,
    sourceName: string,
  ): { added: number; skipped: number } | null {
    if (!this._memorizeCollection) {
      useErrorStore().add(new Error("問題集が作成されていません"));
      return null;
    }
    const error = this.recordManager.importRecord(data, {});
    if (error) {
      useErrorStore().add(
        new Error(`棋譜の読み込みに失敗しました (${sourceName}): ${error.message}`),
      );
      return null;
    }
    const sfen = this.recordManager.record.initialPosition.sfen;
    const problems = this.extractNewProblems(this.recordManager.record, sfen);
    let addedCount = 0;
    let skippedCount = 0;
    for (const problem of problems) {
      if (!this.isDuplicateProblem(problem.sfen, problem.playerColor, problem.moves)) {
        this._memorizeCollection.problems.push(problem);
        addedCount++;
      } else {
        skippedCount++;
      }
    }
    return { added: addedCount, skipped: skippedCount };
  }

  addProblemToCollection(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    if (!this._memorizeCollection) {
      return;
    }
    this._memorizeCollection.problems.push(problem);
  }

  removeProblemFromCollection(index: number): void {
    if (
      !this._memorizeCollection ||
      index < 0 ||
      index >= this._memorizeCollection.problems.length
    ) {
      return;
    }
    const problemName = this._memorizeCollection.problems[index].name;
    this.showConfirmation({
      message: `問題「${problemName}」を削除してもよろしいですか？`,
      onOk: () => {
        if (
          !this._memorizeCollection ||
          index < 0 ||
          index >= this._memorizeCollection.problems.length
        ) {
          return;
        }
        this._memorizeCollection.problems.splice(index, 1);
        if (this._editingProblemIndex === index) {
          this._editingProblemIndex = -1;
        } else if (this._editingProblemIndex > index) {
          this._editingProblemIndex--;
        }
      },
    });
  }

  updateProblemInCollection(
    index: number,
    problem: import("@/common/memorize/index.js").MemorizeProblem,
  ): void {
    if (
      !this._memorizeCollection ||
      index < 0 ||
      index >= this._memorizeCollection.problems.length
    ) {
      return;
    }
    this._memorizeCollection.problems[index] = problem;
  }

  get editingProblemIndex(): number {
    return this._editingProblemIndex;
  }

  loadProblemToRecord(index: number): void {
    if (
      !this._memorizeCollection ||
      index < 0 ||
      index >= this._memorizeCollection.problems.length
    ) {
      return;
    }
    const problem = this._memorizeCollection.problems[index];

    this.recordManager.resetBySFEN(problem.sfen);

    const pos = Position.newBySFEN(problem.sfen);
    if (!pos) {
      useErrorStore().add(new Error("問題の初期局面(SFEN)が正しくありません"));
      return;
    }

    for (let i = 0; i < problem.moves.length; i++) {
      const usi = problem.moves[i];
      const move = pos.createMoveByUSI(usi);
      if (!move) {
        useErrorStore().add(new Error(`問題 ${problem.name} の${i + 1}手目 (${usi}) が不正です`));
        return;
      }
      pos.doMove(move);
      this.recordManager.appendMove({ move });

      if (problem.hints) {
        const hint = problem.hints.find((h) => h.index === i);
        if (hint) {
          this.recordManager.updateComment(hint.text);
        }
      }
    }

    this._editingProblemIndex = index;
  }

  updateProblemFromRecord(): boolean {
    if (!this._memorizeCollection || this._editingProblemIndex < 0) {
      return false;
    }

    const record = this.recordManager.record;
    const sfen = record.initialPosition.sfen;
    const current = record.current;
    const oldProblem = this._memorizeCollection.problems[this._editingProblemIndex];

    const pathUSI: string[] = [];
    const pathComments: (string | null)[] = [];

    const collectPath = (node: ImmutableNode, target: ImmutableNode): boolean => {
      if (node === target) {
        return true;
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        if (child.move && child.move instanceof Move) {
          children.push(child);
        }
        child = child.branch;
      }

      if (children.length === 0) {
        return false;
      }

      let targetChild: ImmutableNode | null = null;
      for (const c of children) {
        if (collectPath(c, target)) {
          targetChild = c;
          break;
        }
      }

      if (targetChild) {
        if (targetChild.move && targetChild.move instanceof Move) {
          pathUSI.unshift(targetChild.move.usi);
        }
        pathComments.unshift(targetChild.comment || null);
        return true;
      }

      return false;
    };

    const found = collectPath(record.first, current);
    if (!found) {
      useErrorStore().add(new Error("手順のパス収集に失敗しました。"));
      return false;
    }

    const remainingUSI: string[] = [];
    const remainingComments: (string | null)[] = [];
    const collectRemainingPath = (node: ImmutableNode): boolean => {
      let curr = node;
      while (true) {
        const children: ImmutableNode[] = [];
        let child = curr.next;
        while (child) {
          if (child.move && child.move instanceof Move) {
            children.push(child);
          }
          child = child.branch;
        }

        if (children.length === 0) {
          break;
        }
        if (children.length > 1) {
          return false;
        }

        const nextNode = children[0];
        if (nextNode.move && nextNode.move instanceof Move) {
          remainingUSI.push(nextNode.move.usi);
        }
        remainingComments.push(nextNode.comment || null);
        curr = nextNode;
      }
      return true;
    };

    if (!collectRemainingPath(current)) {
      useErrorStore().add(
        new Error("選択された手順の先に分岐があります。末端まで一意になるように選択してください。"),
      );
      return false;
    }

    const fullPathUSI = [...pathUSI, ...remainingUSI];
    const fullPathComments = [...pathComments, ...remainingComments];

    if (fullPathUSI.length === 0) {
      useErrorStore().add(new Error("手順が空です。"));
      return false;
    }

    const hints: { index: number; text: string }[] = [];
    fullPathComments.forEach((text, idx) => {
      if (text && text.trim()) {
        hints.push({ index: idx, text: text.trim() });
      }
    });

    const updatedProblem: import("@/common/memorize/index.js").MemorizeProblem = {
      name: oldProblem.name,
      sfen,
      playerColor: oldProblem.playerColor,
      moves: fullPathUSI,
      hints: hints.length > 0 ? hints : undefined,
    };

    this._memorizeCollection.problems[this._editingProblemIndex] = updatedProblem;
    this._editingProblemIndex = -1;
    return true;
  }

  renameEditingProblem(name: string): void {
    if (!this._memorizeCollection || this._editingProblemIndex < 0) {
      return;
    }
    this._memorizeCollection.problems[this._editingProblemIndex].name = name;
  }

  clearEditingProblem(): void {
    this._editingProblemIndex = -1;
  }

  importKIFForMemorize(data: string): Error | undefined {
    const recordOrError = importKIF(data);
    if (recordOrError instanceof Error) {
      return recordOrError;
    }
    this._memorizeProblems = this.extractProblems(recordOrError);
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._memorizePlayerColor = undefined;
    this._isMemorizeProcessing = false;
    this._appState = AppState.NORMAL;
    if (this._memorizeProblems.length > 0) {
      this.startMemorizeProblem(0);
    }
    return undefined;
  }

  startMemorizeProblem(index: number, playerColor?: Color): void {
    if (index < 0 || index >= this._memorizeProblems.length) {
      return;
    }
    const problem = this._memorizeProblems[index];
    this._appState = AppState.MEMORIZE;
    this._currentProblemIndex = index;
    this._memorizeStep = 0;
    this._isMemorizeProcessing = false;
    this._memorizePlayerColor = playerColor;

    this.recordManager.reset();

    const actualPlayerColor = playerColor !== undefined ? playerColor : problem.playerColor;

    if (problem.moves.length > 0 && problem.moves[0].color !== actualPlayerColor) {
      this.recordManager.appendMove({ move: problem.moves[0] });
      this._memorizeStep = 1;
    }
  }

  doMemorizeMove(move: Move): void {
    const problem = this.currentProblem;
    if (!problem || this._isMemorizeProcessing) {
      return;
    }
    const expectedMove = problem.moves[this._memorizeStep];
    if (!expectedMove) {
      return;
    }

    const isCorrect = move.equals(expectedMove);

    if (isCorrect) {
      this.recordManager.appendMove({ move });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep++;

      if (this._memorizeStep >= problem.moves.length) {
        useMessageStore().enqueue({ text: "正解です！クリアしました！" });
        // setTimeout なし、次の問題への遷移はユーザーが「次の問題へ」ボタンを押すまで待つ
        return;
      }

      // 次の手が相手の手番であれば即座に自動進行（setTimeout不使用で競合を防止）
      const actualPlayerColor =
        this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
      const nextExpectedMove = problem.moves[this._memorizeStep];
      if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
        this.recordManager.appendMove({ move: nextExpectedMove });
        try {
          playPieceBeat(useAppSettings().pieceVolume);
        } catch (e) {
          useErrorStore().add(e);
        }
        this._memorizeStep++;

        if (this._memorizeStep >= problem.moves.length) {
          useMessageStore().enqueue({ text: "正解です！クリアしました！" });
          // setTimeout なし、次の問題への遷移はユーザーが「次の問題へ」ボタンを押すまで待つ
        }
      }
    } else {
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch {
        // ignore
      }
    }
  }

  giveUpMemorize(): void {
    const problem = this.currentProblem;
    if (this.appState !== AppState.MEMORIZE || !problem || this._isMemorizeProcessing) {
      return;
    }
    const expectedMove = problem.moves[this._memorizeStep];
    if (!expectedMove) {
      return;
    }

    this.recordManager.appendMove({ move: expectedMove });
    try {
      playPieceBeat(useAppSettings().pieceVolume);
    } catch (e) {
      useErrorStore().add(e);
    }
    this._memorizeStep++;

    if (this._memorizeStep >= problem.moves.length) {
      useMessageStore().enqueue({ text: "クリアしました！（ギブアップ）" });
      return;
    }

    // 次の手が相手の手番であれば即座に自動進行
    const actualPlayerColor =
      this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
    const nextExpectedMove = problem.moves[this._memorizeStep];
    if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
      this.recordManager.appendMove({ move: nextExpectedMove });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep++;

      if (this._memorizeStep >= problem.moves.length) {
        useMessageStore().enqueue({ text: "クリアしました！（ギブアップ）" });
      }
    }
  }

  private extractProblems(record: ImmutableRecord): MemorizeProblem[] {
    const problems: MemorizeProblem[] = [];

    const dfs = (node: ImmutableNode, pathMoves: Move[], branchName: string) => {
      const currentPath = [...pathMoves];
      if (node.move && node.move instanceof Move) {
        currentPath.push(node.move);
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        children.push(child);
        child = child.branch;
      }

      if (children.length === 0) {
        if (currentPath.length > 0) {
          const playerColor = currentPath[0].color;
          problems.push({
            name: branchName || "本譜",
            moves: currentPath,
            playerColor: playerColor,
          });
        }
        return;
      }

      children.forEach((child) => {
        let nextBranchName = branchName;
        if (children.length > 1) {
          const moveText = child.displayText || `${child.ply}手目`;
          nextBranchName = branchName ? `${branchName} - ${moveText}変化` : `${moveText}変化`;
        }
        dfs(child, currentPath, nextBranchName);
      });
    };

    dfs(record.first, [], "");
    return problems;
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
