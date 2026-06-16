import { Color, Move, Position } from "tsshogi";
import { useErrorStore } from "@/renderer/store/error.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { useMessageStore } from "@/renderer/store/message.js";
import { playPieceBeat, beepShort } from "@/renderer/devices/audio.js";
import type { RecordManager } from "@/renderer/record/manager.js";
import { AppState } from "@/common/control/state.js";
import type { MemorizeCollection } from "@/common/memorize/index.js";
import type { MemorizeProblem } from "./types.js";
import type { TimerManager } from "./timer.js";
import type { CollectionManager } from "./collection.js";

/**
 * メモライズ解答セッション管理クラス
 * 解答セッションの開始/終了、問題進行、一手ごとの正解/不正解判定、統計を担当する。
 */
export class SolveSessionManager {
  private _recordManager: RecordManager;
  private _timerManager: TimerManager;
  private _collectionManager: CollectionManager;

  // 現在の問題状態
  private _memorizeProblems: MemorizeProblem[] = [];
  private _currentProblemIndex = -1;
  private _memorizeStep = 0;
  private _memorizePlayerColor?: Color;
  private _isMemorizeProcessing = false;
  private _isGiveUp = false;

  // 全体統計
  private _memorizeCorrectCount = 0;
  private _memorizeWrongCount = 0;
  private _memorizeHintCount = 0;
  private _memorizeGiveUpCount = 0;
  private _memorizeTotalQuestions = 0;
  private _reviewMistakes: { problemIndex: number; moveIndex: number }[] = [];

  // 個別問題統計（startCurrentSolveProblemでリセット）
  private _problemCorrectMoves = 0;
  private _problemWrongMoves = 0;
  private _problemHintCount = 0;
  private _problemGiveUpCount = 0;
  private _problemTotalPlayerMoves = 0;

  // 解答セッション管理
  private _solveOrder: number[] = [];
  private _solveIndex = 0;
  private _solveTotal = 0;
  private _isSolving = false;
  private _skipCommonMoves = false;
  private _clearedPaths = new Set<string>();

  // 外部コールバック
  private setAppState: (state: AppState) => void;
  private getAppState: () => AppState;
  private showResultDialog: (mode: "perProblem" | "overall") => void;

  constructor(
    recordManager: RecordManager,
    timerManager: TimerManager,
    collectionManager: CollectionManager,
    callbacks: {
      setAppState: (state: AppState) => void;
      getAppState: () => AppState;
      showResultDialog: (mode: "perProblem" | "overall") => void;
    },
  ) {
    this._recordManager = recordManager;
    this._timerManager = timerManager;
    this._collectionManager = collectionManager;
    this.setAppState = callbacks.setAppState;
    this.getAppState = callbacks.getAppState;
    this.showResultDialog = callbacks.showResultDialog;
  }

  // ========== プロパティ ==========

  get memorizeProblems(): MemorizeProblem[] {
    return this._memorizeProblems;
  }

  set memorizeProblems(problems: MemorizeProblem[]) {
    this._memorizeProblems = problems;
  }

  get currentProblemIndex(): number {
    return this._currentProblemIndex;
  }

  set currentProblemIndex(index: number) {
    this._currentProblemIndex = index;
  }

  get currentProblem(): MemorizeProblem | undefined {
    return this._memorizeProblems[this._currentProblemIndex];
  }

  get memorizeStep(): number {
    return this._memorizeStep;
  }

  set memorizeStep(step: number) {
    this._memorizeStep = step;
  }

  get memorizePlayerColor(): Color | undefined {
    return this._memorizePlayerColor;
  }

  set memorizePlayerColor(color: Color | undefined) {
    this._memorizePlayerColor = color;
  }

  get isMemorizeProcessing(): boolean {
    return this._isMemorizeProcessing;
  }

  set isMemorizeProcessing(v: boolean) {
    this._isMemorizeProcessing = v;
  }

  get isGiveUp(): boolean {
    return this._isGiveUp;
  }

  set isGiveUp(v: boolean) {
    this._isGiveUp = v;
  }

  // 全体統計

  get memorizeHintCount(): number {
    return this._memorizeHintCount;
  }

  get memorizeGiveUpCount(): number {
    return this._memorizeGiveUpCount;
  }

  get memorizeTotalQuestions(): number {
    return this._memorizeTotalQuestions;
  }

  get memorizeAccuracy(): number {
    const total = this._memorizeCorrectCount + this._memorizeWrongCount;
    if (total === 0) {
      return 100;
    }
    return Math.round((this._memorizeCorrectCount / total) * 100);
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

  // 個別問題統計

  get problemCorrectMoves(): number {
    return this._problemCorrectMoves;
  }

  get problemWrongMoves(): number {
    return this._problemWrongMoves;
  }

  get problemTotalPlayerMoves(): number {
    return this._problemTotalPlayerMoves;
  }

  get problemHintCount(): number {
    return this._problemHintCount;
  }

  get problemGiveUpCount(): number {
    return this._problemGiveUpCount;
  }

  get problemAccuracy(): number {
    const total = this._problemCorrectMoves + this._problemWrongMoves;
    if (total === 0) {
      return 100;
    }
    return Math.round((this._problemCorrectMoves / total) * 100);
  }

  // 解答セッション管理

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

  get skipCommonMoves(): boolean {
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
    if (idx < 0 || !this._collectionManager.memorizeCollection) {
      return null;
    }
    return this._collectionManager.memorizeCollection.problems[idx] ?? null;
  }

  get totalProblemsCount(): number {
    return this._collectionManager.memorizeCollection?.problems.length ?? 0;
  }

  get currentHint(): string | null {
    if (!this._collectionManager.memorizeCollection) {
      return null;
    }
    const problem = this.currentCollectionProblem;
    if (!problem || !problem.hints || problem.hints.length === 0) {
      return null;
    }
    const hint = problem.hints.find((h) => h.index === this._memorizeStep);
    return hint ? hint.text : null;
  }

  // ========== 統計リセット ==========

  resetMemorizeStats(): void {
    this._memorizeCorrectCount = 0;
    this._memorizeWrongCount = 0;
    this._memorizeHintCount = 0;
    this._memorizeGiveUpCount = 0;
    this._memorizeTotalQuestions = 0;
    this._reviewMistakes = [];
  }

  incrementHintCount(): void {
    this._memorizeHintCount++;
    this._problemHintCount++;
  }

  // ========== 解答セッション制御 ==========

  private buildSolveOrder(): void {
    const collection = this._collectionManager.memorizeCollection;
    if (!collection) {
      this._solveOrder = [];
      this._solveIndex = 0;
      this._solveTotal = 0;
      return;
    }
    const count = collection.problems.length;
    const indices = Array.from({ length: count }, (_, i) => i);
    if (this._collectionManager.dialogRandomOrder) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    const max =
      this._collectionManager.dialogMaxQuestions > 0
        ? Math.min(this._collectionManager.dialogMaxQuestions, count)
        : count;
    this._solveOrder = indices.slice(0, max);
    this._solveIndex = 0;
    this._solveTotal = this._solveOrder.length;
  }

  async startSolveSession(): Promise<void> {
    const collection = this._collectionManager.memorizeCollection;
    if (!collection || collection.problems.length === 0) {
      return;
    }
    this.buildSolveOrder();
    this._memorizeTotalQuestions = 0;
    this._memorizeCorrectCount = 0;
    this._memorizeWrongCount = 0;
    this._memorizeHintCount = 0;
    this._memorizeGiveUpCount = 0;
    this._skipCommonMoves = this._collectionManager.dialogSkipCommonMoves;
    this._clearedPaths.clear();
    this._isSolving = true;

    // タイマー設定をコピー
    const dialogSettings = this._collectionManager.dialogSettings;
    this._timerManager.timeLimitMode = dialogSettings.useTimeLimit
      ? dialogSettings.timeLimitMode
      : "none";
    this._timerManager.timeLimitSettings = { ...dialogSettings.timeLimitSettings };
    this._timerManager.resetTimer();

    this.setAppState(AppState.MEMORIZE);
    await this.startCurrentSolveProblem();
  }

  async startCurrentSolveProblem(): Promise<void> {
    this._isGiveUp = false;
    this._problemCorrectMoves = 0;
    this._problemWrongMoves = 0;
    this._problemHintCount = 0;
    this._problemGiveUpCount = 0;
    this._problemTotalPlayerMoves = 0;

    this._timerManager.stopTimer();

    const problem = this.currentCollectionProblem;
    if (!problem || !this._collectionManager.memorizeCollection) {
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

    // 問題集全体の手番設定を取得
    const collection = this._collectionManager.memorizeCollection;
    const collectionPlayerColor =
      collection && collection.playerColor === "white" ? Color.WHITE : Color.BLACK;

    this._problemTotalPlayerMoves = moveObjects.filter(
      (m) => m.color === collectionPlayerColor,
    ).length;

    this._memorizeProblems = [
      {
        name: problem.name,
        moves: moveObjects,
        playerColor: collectionPlayerColor,
      },
    ];
    this._currentProblemIndex = 0;
    this._memorizeStep = 0;
    this._memorizePlayerColor = collectionPlayerColor;
    this._isMemorizeProcessing = false;

    // SFENは元のまま（手番情報は変更しない）で初期化し、初手の自動進行で対応する
    this._recordManager.resetBySFEN(problem.sfen);

    if (this._skipCommonMoves) {
      await this.skipMovesForward(problem, moveObjects);
    } else if (moveObjects.length > 0 && moveObjects[0].color !== collectionPlayerColor) {
      // 問題集の手番設定と異なる手番の手（＝対局者の手）を自動進行する
      this._recordManager.appendMove({ move: moveObjects[0] });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep = 1;
    }

    if (
      this._timerManager.timeLimitMode === "perProblem" ||
      this._timerManager.timeLimitMode === "total"
    ) {
      this._timerManager.startTimer();
    }

    this._timerManager.notifyTimerUpdate();
  }

  private async skipMovesForward(
    _problem: import("@/common/memorize/index.js").MemorizeProblem,
    moveObjects: Move[],
  ): Promise<void> {
    const sfen = _problem.sfen;
    const moves = _problem.moves;
    let skipCount = 0;

    for (let i = 1; i <= moves.length; i++) {
      const path = sfen + ":" + moves.slice(0, i).join(",");
      const found = this._clearedPaths.has(path);
      if (found) {
        skipCount = i;
      } else {
        break;
      }
    }
    let step = 0;
    for (let i = 0; i < skipCount; i++) {
      if (i >= moveObjects.length) {
        break;
      }
      this._recordManager.appendMove({ move: moveObjects[i] });
      step++;
    }

    this._memorizeStep = step;

    const collection = this._collectionManager.memorizeCollection;
    const playerColor =
      collection && collection.playerColor === "white" ? Color.WHITE : Color.BLACK;
    if (step < moveObjects.length && moveObjects[step].color !== playerColor) {
      await this.sleep(400);
      this._recordManager.appendMove({ move: moveObjects[step] });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep = step + 1;
    }
  }

  async nextProblem(): Promise<boolean> {
    if (!this._isSolving) {
      return false;
    }
    this.recordClearedProblem();
    this._solveIndex++;
    if (this._solveIndex >= this._solveTotal) {
      this.endSolveSession();
      useMessageStore().enqueue({ text: "全問終了しました！" });
      return false;
    }
    await this.startCurrentSolveProblem();
    return true;
  }

  endSolveSession(): void {
    this._timerManager.resetTimer();
    this._timerManager.timeLimitMode = "none";
    this._isSolving = false;
    this._solveOrder = [];
    this._solveIndex = 0;
    this._solveTotal = 0;
    this._skipCommonMoves = false;
    this._clearedPaths.clear();
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._memorizePlayerColor = undefined;
    this._isMemorizeProcessing = false;

    // collection側のリセット
    this._collectionManager.resetForSession();

    this.setAppState(AppState.NORMAL);
    this._recordManager.reset();
    this._timerManager.notifyTimerUpdate();
  }

  // ========== 一手ごとの処理 ==========

  async doMemorizeMove(move: Move): Promise<void> {
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
      this._problemCorrectMoves++;
      this._recordManager.appendMove({ move });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep++;

      const nextPlayerColor =
        this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
      const nextMove = problem.moves[this._memorizeStep];
      const isNextOpponent = nextMove && nextMove.color !== nextPlayerColor;

      if (isNextOpponent) {
        this._timerManager.stopTimerAndApplyIncrement();
      } else {
        this._timerManager.advanceClockAfterMove(true);
      }

      if (this._memorizeStep >= problem.moves.length) {
        this._timerManager.stopTimer();
        this._timerManager.notifyTimerUpdate();
        this.accumulateProblemStats();
        return;
      }

      const actualPlayerColor =
        this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
      const nextExpectedMove = problem.moves[this._memorizeStep];
      if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
        this._isMemorizeProcessing = true;
        await this.sleep(400);
        if (
          this.getAppState() !== AppState.MEMORIZE ||
          !this._isMemorizeProcessing ||
          this._isGiveUp ||
          this._memorizeStep >= problem.moves.length
        ) {
          this._isMemorizeProcessing = false;
          return;
        }
        this._recordManager.appendMove({ move: nextExpectedMove });
        try {
          playPieceBeat(useAppSettings().pieceVolume);
        } catch (e) {
          useErrorStore().add(e);
        }
        this._memorizeStep++;
        this._isMemorizeProcessing = false;

        this._timerManager.advanceClockAfterMove(false);

        if (this._memorizeStep >= problem.moves.length) {
          this._timerManager.stopTimer();
          this._timerManager.notifyTimerUpdate();
          this.accumulateProblemStats();
        }
      }
    } else {
      this._problemWrongMoves++;
      this._reviewMistakes.push({
        problemIndex: this._currentProblemIndex,
        moveIndex: this._memorizeStep,
      });
      try {
        beepShort({
          frequency: 400,
          volume: useAppSettings().pieceVolume,
        });
      } catch {
        // ignore
      }
    }
  }

  async giveUpMemorize(): Promise<void> {
    const problem = this.currentProblem;
    if (this.getAppState() !== AppState.MEMORIZE || !problem || this._isMemorizeProcessing) {
      return;
    }
    this._isGiveUp = true;
    this._memorizeGiveUpCount++;
    this._problemGiveUpCount++;
    const expectedMove = problem.moves[this._memorizeStep];
    if (!expectedMove) {
      return;
    }

    this._recordManager.appendMove({ move: expectedMove });
    try {
      playPieceBeat(useAppSettings().pieceVolume);
    } catch (e) {
      useErrorStore().add(e);
    }
    this._memorizeStep++;

    this._timerManager.advanceClockAfterMove(false);

    if (this._memorizeStep >= problem.moves.length) {
      this._timerManager.stopTimer();
      this._timerManager.notifyTimerUpdate();
      return;
    }

    const actualPlayerColor =
      this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
    const nextExpectedMove = problem.moves[this._memorizeStep];
    if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
      this._isMemorizeProcessing = true;
      await this.sleep(400);
      if (this.getAppState() !== AppState.MEMORIZE || !this._isMemorizeProcessing) {
        this._isMemorizeProcessing = false;
        return;
      }
      this._recordManager.appendMove({ move: nextExpectedMove });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep++;
      this._isMemorizeProcessing = false;
    }
  }

  // ========== 時間切れ処理 ==========

  async handleTimeUp(): Promise<void> {
    this._timerManager.stopTimer();
    this._isMemorizeProcessing = false;
    this._isGiveUp = true;
    this._memorizeGiveUpCount++;
    this._problemGiveUpCount++;

    const problem = this.currentProblem;
    if (problem) {
      const remainingMoves = problem.moves.slice(this._memorizeStep);
      for (const move of remainingMoves) {
        this._recordManager.appendMove({ move });
        this._memorizeStep++;
      }
      this._memorizeWrongCount += this._problemWrongMoves;
      this._memorizeCorrectCount += this._problemCorrectMoves;
      this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
      this._problemCorrectMoves = 0;
      this._problemWrongMoves = 0;
      this._problemTotalPlayerMoves = 0;
    }

    this._timerManager.notifyTimerUpdate();

    if (this._isSolving) {
      this.recordClearedProblem();
      this.showResultDialog("perProblem");
    }
  }

  async handleTotalTimeUp(): Promise<void> {
    this._timerManager.stopTimer();
    this._isGiveUp = true;

    this._timerManager.notifyTimerUpdate();

    const problem = this.currentProblem;
    if (problem) {
      const remainingMoves = problem.moves.slice(this._memorizeStep);
      for (const move of remainingMoves) {
        this._recordManager.appendMove({ move });
        this._memorizeStep++;
      }
      this._memorizeWrongCount += this._problemWrongMoves;
      this._memorizeCorrectCount += this._problemCorrectMoves;
      this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
      this._problemCorrectMoves = 0;
      this._problemWrongMoves = 0;
      this._problemTotalPlayerMoves = 0;
    }

    this.showResultDialog("overall");
    this.endSolveSession();
  }

  // ========== 内部ユーティリティ ==========

  private accumulateProblemStats(): void {
    this._memorizeCorrectCount += this._problemCorrectMoves;
    this._memorizeWrongCount += this._problemWrongMoves;
    this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
  }

  private recordClearedProblem(): void {
    const colProblem = this.currentCollectionProblem;
    if (!colProblem) {
      return;
    }
    const sfen = colProblem.sfen;
    const moves = colProblem.moves;
    for (let i = 1; i <= moves.length; i++) {
      const path = sfen + ":" + moves.slice(0, i).join(",");
      this._clearedPaths.add(path);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** ユーザーが駒を操作可能か判定 */
  get isMovableByUser(): boolean {
    const appState = this.getAppState();
    switch (appState) {
      case AppState.NORMAL:
        return true;
      case AppState.MEMORIZE: {
        const problem = this.currentProblem;
        if (!problem) {
          return false;
        }
        const expectedMove = problem.moves[this._memorizeStep];
        if (!expectedMove) {
          return false;
        }
        const actualPlayerColor =
          this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
        return expectedMove.color === actualPlayerColor;
      }
    }
    return false;
  }
}
