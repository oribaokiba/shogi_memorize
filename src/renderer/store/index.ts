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
  // 新しい問題集コレクション管理
  private _memorizeCollection: MemorizeCollection | null = null;
  private _memorizeCollectionPath: string | null = null;
  private _customLayout: LayoutProfile | null = null;
  private _isAppSettingsDialogVisible = false;
  private _reactive: UnwrapNestedRefs<Store>;
  private garbledNotified = false;
  private onChangePositionHandlers: ChangePositionHandler[] = [];
  private onUpdateRecordTreeHandlers: UpdateTreeHandler[] = [];
  private onUpdateCustomDataHandlers: UpdateCustomDataHandler[] = [];

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

  get memorizePlayerColor(): Color | undefined {
    return this._memorizePlayerColor;
  }

  get isMemorizeProcessing(): boolean {
    return this._isMemorizeProcessing;
  }

  // === 新しい問題集コレクション管理 ===

  get memorizeCollection(): MemorizeCollection | null {
    return this._memorizeCollection;
  }

  get memorizeCollectionPath(): string | null {
    return this._memorizeCollectionPath;
  }

  /**
   * 新しい問題集コレクションを作成する
   */
  newMemorizeCollection(title: string): void {
    this._memorizeCollection = {
      version: 1,
      title,
      problems: [],
    };
    this._memorizeCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._appState = AppState.NORMAL;
  }

  /**
   * YAML文字列から問題集を読み込む
   */
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

  /**
   * 現在のコレクションをYAML文字列にシリアライズする
   */
  saveMemorizeCollectionToYAML(): string | Error {
    if (!this._memorizeCollection) {
      return new Error("問題集が読み込まれていません");
    }
    return saveMemorizeCollection(this._memorizeCollection);
  }

  /**
   * 現在の棋譜の全末端ノードを問題としてコレクションに追加する
   */
  importCurrentRecordAsProblems(): number {
    if (!this._memorizeCollection) {
      return 0;
    }
    const sfen = this.recordManager.record.initialPosition.sfen;
    const problems = this.extractNewProblems(this.recordManager.record, sfen);
    this._memorizeCollection.problems.push(...problems);
    return problems.length;
  }

  /**
   * 現在の棋譜ツリーから新しい形式の問題を抽出する
   */
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

  /**
   * 新しい形式の問題（USI文字列の手順）を旧形式に変換して暗記解答を開始する
   */
  startMemorizeFromNewProblem(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._memorizePlayerColor = undefined;
    this._isMemorizeProcessing = false;

    // USI文字列からMoveオブジェクトを構築
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

    // 旧形式に変換して設定
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

    // 盤面を初期状態にリセット
    this.recordManager.resetBySFEN(problem.sfen);

    // 相手の初手があれば自動進行
    if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this.recordManager.appendMove({ move: moveObjects[0] });
      this._memorizeStep = 1;
    }
  }

  /**
   * 問題集に新しい問題を追加する
   */
  addProblemToCollection(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    if (!this._memorizeCollection) {
      return;
    }
    this._memorizeCollection.problems.push(problem);
  }

  /**
   * 問題集から問題を削除する
   */
  removeProblemFromCollection(index: number): void {
    if (
      !this._memorizeCollection ||
      index < 0 ||
      index >= this._memorizeCollection.problems.length
    ) {
      return;
    }
    this._memorizeCollection.problems.splice(index, 1);
  }

  /**
   * 問題集の問題を更新する
   */
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
        return;
      }

      const actualPlayerColor =
        this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
      const nextExpectedMove = problem.moves[this._memorizeStep];
      if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
        this._isMemorizeProcessing = true;
        setTimeout(() => {
          this.recordManager.appendMove({ move: nextExpectedMove });
          try {
            playPieceBeat(useAppSettings().pieceVolume);
          } catch (e) {
            useErrorStore().add(e);
          }
          this._memorizeStep++;
          this._isMemorizeProcessing = false;

          if (this._memorizeStep >= problem.moves.length) {
            useMessageStore().enqueue({ text: "正解です！クリアしました！" });
          }
        }, 500);
      }
    } else {
      try {
        playPieceBeat(useAppSettings().pieceVolume);
        // 不正解時のフィードバック
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

    const actualPlayerColor =
      this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
    const nextExpectedMove = problem.moves[this._memorizeStep];
    if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
      this._isMemorizeProcessing = true;
      setTimeout(() => {
        this.recordManager.appendMove({ move: nextExpectedMove });
        try {
          playPieceBeat(useAppSettings().pieceVolume);
        } catch (e) {
          useErrorStore().add(e);
        }
        this._memorizeStep++;
        this._isMemorizeProcessing = false;

        if (this._memorizeStep >= problem.moves.length) {
          useMessageStore().enqueue({ text: "クリアしました！（ギブアップ）" });
        }
      }, 500);
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
