import { Color, Move } from "tsshogi";
import { RecordManager } from "@/renderer/record/manager.js";
import { AppState } from "@/common/control/state.js";
import type { TimeLimitSettings } from "@/common/settings/game.js";
import type { MemorizeProblem, TimeLimitMode, TimerUpdateCallback } from "./types.js";
import { TimerManager } from "./timer.js";
import { CollectionManager } from "./collection.js";
import { SolveSessionManager } from "./session.js";

/**
 * 定跡暗記機能を管理するクラス
 * 4つのサブマネージャーに分割している。
 *
 * 各サブマネージャーの役割：
 * - TimerManager: タイマーの管理
 * - CollectionManager: 問題集の管理
 * - SolveSessionManager: 解答の管理
 */
export class MemorizeManager {
  private _timerManager: TimerManager;
  private _collectionManager: CollectionManager;
  private _solveSessionManager: SolveSessionManager;
  private _recordManager: RecordManager;

  constructor(
    recordManager: RecordManager,
    callbacks: {
      setAppState: (state: AppState) => void;
      getAppState: () => AppState;
      showResultDialog: (mode: "perProblem" | "overall") => void;
    },
  ) {
    this._recordManager = recordManager;
    this._timerManager = new TimerManager();
    this._collectionManager = new CollectionManager(() => this._solveSessionManager.isSolving);
    this._solveSessionManager = new SolveSessionManager(
      recordManager,
      this._timerManager,
      this._collectionManager,
      callbacks,
    );

    // タイマー時間切れ→セッション管理へ委譲
    this._timerManager.onPerProblemTimeUp = () => {
      this._solveSessionManager.handleTimeUp();
    };
    this._timerManager.onTotalTimeUp = () => {
      this._solveSessionManager.handleTotalTimeUp();
    };
  }

  // ========== プロパティ（session経由） ==========

  get memorizeProblems(): MemorizeProblem[] {
    return this._solveSessionManager.memorizeProblems;
  }

  get currentProblemIndex(): number {
    return this._solveSessionManager.currentProblemIndex;
  }

  get currentProblem(): MemorizeProblem | undefined {
    return this._solveSessionManager.currentProblem;
  }

  get memorizeStep(): number {
    return this._solveSessionManager.memorizeStep;
  }

  get memorizeHintCount(): number {
    return this._solveSessionManager.memorizeHintCount;
  }

  get memorizeGiveUpCount(): number {
    return this._solveSessionManager.memorizeGiveUpCount;
  }

  get memorizeTotalQuestions(): number {
    return this._solveSessionManager.memorizeTotalQuestions;
  }

  get memorizeAccuracy(): number {
    return this._solveSessionManager.memorizeAccuracy;
  }

  get problemCorrectMoves(): number {
    return this._solveSessionManager.problemCorrectMoves;
  }

  get problemWrongMoves(): number {
    return this._solveSessionManager.problemWrongMoves;
  }

  get problemTotalPlayerMoves(): number {
    return this._solveSessionManager.problemTotalPlayerMoves;
  }

  get problemHintCount(): number {
    return this._solveSessionManager.problemHintCount;
  }

  get problemGiveUpCount(): number {
    return this._solveSessionManager.problemGiveUpCount;
  }

  get problemAccuracy(): number {
    return this._solveSessionManager.problemAccuracy;
  }

  get currentHint(): string | null {
    return this._solveSessionManager.currentHint;
  }

  get memorizeCorrectCount(): number {
    return this._solveSessionManager.memorizeCorrectCount;
  }

  get memorizeWrongCount(): number {
    return this._solveSessionManager.memorizeWrongCount;
  }

  get reviewMistakes(): { problemIndex: number; moveIndex: number }[] {
    return this._solveSessionManager.reviewMistakes;
  }

  get memorizePlayerColor(): Color | undefined {
    return this._solveSessionManager.memorizePlayerColor;
  }

  get isMemorizeProcessing(): boolean {
    return this._solveSessionManager.isMemorizeProcessing;
  }

  get solveOrder(): number[] {
    return this._solveSessionManager.solveOrder;
  }

  get solveIndex(): number {
    return this._solveSessionManager.solveIndex;
  }

  get solveTotal(): number {
    return this._solveSessionManager.solveTotal;
  }

  get isSolving(): boolean {
    return this._solveSessionManager.isSolving;
  }

  get isGiveUp(): boolean {
    return this._solveSessionManager.isGiveUp;
  }

  get skipCommonMoves(): boolean {
    return this._solveSessionManager.skipCommonMoves;
  }

  get currentCollectionProblemIndex(): number {
    return this._solveSessionManager.currentCollectionProblemIndex;
  }

  get currentCollectionProblem(): import("@/common/memorize/index.js").MemorizeProblem | null {
    return this._solveSessionManager.currentCollectionProblem;
  }

  get totalProblemsCount(): number {
    return this._solveSessionManager.totalProblemsCount;
  }

  // ========== プロパティ（collection経由） ==========

  get memorizeCollection(): import("@/common/memorize/index.js").MemorizeCollection | null {
    return this._collectionManager.memorizeCollection;
  }

  get memorizeCollectionPath(): string | null {
    return this._collectionManager.memorizeCollectionPath;
  }

  get editCollection(): import("@/common/memorize/index.js").MemorizeCollection | null {
    return this._collectionManager.editCollection;
  }

  get editCollectionPath(): string | null {
    return this._collectionManager.editCollectionPath;
  }

  get editingProblemIndex(): number {
    return this._collectionManager.editingProblemIndex;
  }

  set editingProblemIndex(index: number) {
    this._collectionManager.editingProblemIndex = index;
  }

  get isEditCollectionDirty(): boolean {
    return this._collectionManager.isEditCollectionDirty;
  }

  markEditCollectionClean(): void {
    this._collectionManager.markEditCollectionClean();
  }

  get dialogRandomOrder(): boolean {
    return this._collectionManager.dialogRandomOrder;
  }

  set dialogRandomOrder(v: boolean) {
    this._collectionManager.dialogRandomOrder = v;
  }

  get dialogMaxQuestions(): number {
    return this._collectionManager.dialogMaxQuestions;
  }

  set dialogMaxQuestions(v: number) {
    this._collectionManager.dialogMaxQuestions = v;
  }

  get dialogSkipCommonMoves(): boolean {
    return this._collectionManager.dialogSkipCommonMoves;
  }

  set dialogSkipCommonMoves(v: boolean) {
    this._collectionManager.dialogSkipCommonMoves = v;
  }

  get dialogUseTimeLimit(): boolean {
    return this._collectionManager.dialogUseTimeLimit;
  }

  set dialogUseTimeLimit(v: boolean) {
    this._collectionManager.dialogUseTimeLimit = v;
  }

  get dialogTimeLimitMode(): TimeLimitMode {
    return this._collectionManager.dialogTimeLimitMode;
  }

  set dialogTimeLimitMode(v: TimeLimitMode) {
    this._collectionManager.dialogTimeLimitMode = v;
  }

  get dialogTimeLimitSettings(): TimeLimitSettings {
    return this._collectionManager.dialogTimeLimitSettings;
  }

  set dialogTimeLimitSettings(v: TimeLimitSettings) {
    this._collectionManager.dialogTimeLimitSettings = v;
  }

  // ========== プロパティ（timer経由） ==========

  get timeLimitMode(): TimeLimitMode {
    return this._timerManager.timeLimitMode;
  }

  get timeLimitSettings(): TimeLimitSettings {
    return this._timerManager.timeLimitSettings;
  }

  get remainingSeconds(): number {
    return this._timerManager.remainingSeconds;
  }

  get byoyomiSeconds(): number {
    return this._timerManager.byoyomiSeconds;
  }

  get totalRemainingSeconds(): number {
    return this._timerManager.totalRemainingSeconds;
  }

  get totalByoyomiSeconds(): number {
    return this._timerManager.totalByoyomiSeconds;
  }

  get totalTimeMs(): number {
    return this._timerManager.totalTimeMs;
  }

  get panelMode(): "solve" | "create" {
    return this._panelMode;
  }

  set panelMode(value: "solve" | "create") {
    this._panelMode = value;
  }

  private _panelMode: "solve" | "create" = "solve";

  get onTimerUpdate(): TimerUpdateCallback | null {
    return this._timerManager.onTimerUpdate;
  }

  set onTimerUpdate(callback: TimerUpdateCallback | null) {
    if (callback) {
      // TimerManager は memorizePlayerColor を知らないので、
      // SolveSessionManager の現在値を注入するラッパーを設定する
      this._timerManager.onTimerUpdate = (
        timeMs,
        byoyomi,
        timeLimitMode,
        _playerColor,
        totalTimeMs,
      ) => {
        callback(
          timeMs,
          byoyomi,
          timeLimitMode,
          this._solveSessionManager.memorizePlayerColor,
          totalTimeMs,
        );
      };
    } else {
      this._timerManager.onTimerUpdate = null;
    }
  }

  // ========== メソッド ==========

  resetMemorizeStats(): void {
    this._solveSessionManager.resetMemorizeStats();
  }

  incrementHintCount(): void {
    this._solveSessionManager.incrementHintCount();
  }

  /** タイマーを開始する（public: ダイアログが閉じた後に呼び出す） */
  startTimer(): void {
    this._timerManager.startTimer();
  }

  async startSolveSession(): Promise<void> {
    await this._solveSessionManager.startSolveSession();
  }

  async startCurrentSolveProblem(): Promise<void> {
    await this._solveSessionManager.startCurrentSolveProblem();
  }

  async nextProblem(): Promise<boolean> {
    return this._solveSessionManager.nextProblem();
  }

  endSolveSession(): void {
    this._solveSessionManager.endSolveSession();
  }

  // ========== 解答用問題集コレクション管理 ==========

  loadMemorizeCollectionFromYAML(yaml: string): Error | undefined {
    return this._collectionManager.loadMemorizeCollectionFromYAML(yaml);
  }

  closeMemorizeCollection(): void {
    this._collectionManager.closeMemorizeCollection();
  }

  // ========== 作成用問題集コレクション管理 ==========

  newEditCollection(title: string, playerColor?: "black" | "white"): void {
    this._collectionManager.newEditCollection(title, playerColor);
  }

  updateEditCollectionSettings(title: string, playerColor: "black" | "white"): void {
    this._collectionManager.updateEditCollectionSettings(title, playerColor);
  }

  loadEditCollectionFromYAML(yaml: string): Error | undefined {
    return this._collectionManager.loadEditCollectionFromYAML(yaml);
  }

  saveEditCollectionToYAML(): string | Error {
    return this._collectionManager.saveEditCollectionToYAML();
  }

  importCurrentRecordAsEditProblems(): number {
    return this._collectionManager.importCurrentRecordAsEditProblems(this._recordManager);
  }

  importRecordTextToEditCollection(
    data: string,
    sourceName: string,
    includeComments?: boolean,
  ): { added: number; skipped: number } | null {
    return this._collectionManager.importRecordTextToEditCollection(
      data,
      sourceName,
      includeComments,
    );
  }

  addBranchAsEditProblem(name: string): boolean {
    return this._collectionManager.addBranchAsEditProblem(name, this._recordManager);
  }

  addProblemToEditCollection(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    this._collectionManager.addProblemToEditCollection(problem);
  }

  removeProblemFromEditCollection(index: number): void {
    this._collectionManager.removeProblemFromEditCollection(index);
  }

  updateProblemInEditCollection(
    index: number,
    problem: import("@/common/memorize/index.js").MemorizeProblem,
  ): void {
    this._collectionManager.updateProblemInEditCollection(index, problem);
  }

  loadEditProblemToRecord(index: number): void {
    this._collectionManager.loadEditProblemToRecord(index, this._recordManager);
  }

  updateEditProblemFromRecord(): boolean {
    return this._collectionManager.updateEditProblemFromRecord(this._recordManager);
  }

  renameEditProblem(name: string): void {
    this._collectionManager.renameEditProblem(name);
  }

  clearEditProblem(): void {
    this._collectionManager.clearEditProblem();
  }

  captureOldHintsBeforeUpdate(): void {
    this._collectionManager.captureOldHintsBeforeUpdate();
  }

  getHintChangesAfterUpdate(): { index: number; usi: string; text: string; usiDisplay: string }[] {
    return this._collectionManager.getHintChangesAfterUpdate();
  }

  findProblemIndicesWithSameUSI(index: number, usi: string): number[] {
    return this._collectionManager.findProblemIndicesWithSameUSI(index, usi);
  }

  batchApplyHintToProblems(problemIndices: number[], hintIndex: number, text: string): void {
    this._collectionManager.batchApplyHintToProblems(problemIndices, hintIndex, text);
  }

  moveEditProblem(fromIndex: number, toIndex: number): void {
    this._collectionManager.moveEditProblem(fromIndex, toIndex);
  }

  replaceEditProblems(problems: import("@/common/memorize/index.js").MemorizeProblem[]): void {
    this._collectionManager.replaceEditProblems(problems);
  }

  closeEditCollection(): void {
    this._collectionManager.closeEditCollection();
  }

  // ========== 一手ごとの処理 ==========

  async doMemorizeMove(move: Move): Promise<void> {
    await this._solveSessionManager.doMemorizeMove(move);
  }

  async giveUpMemorize(): Promise<void> {
    await this._solveSessionManager.giveUpMemorize();
  }

  // ========== ユーザー操作判定 ==========

  get isMovableByUser(): boolean {
    return this._solveSessionManager.isMovableByUser;
  }
}

// 型の再エクスポート（互換性維持）
export type { MemorizeProblem, TimeLimitMode, TimerUpdateCallback } from "./types.js";
