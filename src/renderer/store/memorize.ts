import {
  Color,
  ImmutableNode,
  ImmutableRecord,
  importKIF,
  importKI2,
  importCSA,
  importJKFString,
  Move,
  Position,
  Record,
  RecordFormatType,
  detectRecordFormat,
  Move as TsshogiMove,
} from "tsshogi";
import { localizeError, t } from "@/common/i18n/index.js";

import { playPieceBeat, beepShort } from "@/renderer/devices/audio.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { AppState } from "@/common/control/state.js";
import { useMessageStore } from "./message.js";
import { useAppSettings } from "./settings.js";
import { useErrorStore } from "./error.js";
import { Confirmation, useConfirmationStore } from "./confirm.js";
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

/**
 * メモライズ（定跡暗記）機能を管理するクラス
 * Store から分離することで Store クラスの肥大化を解消する。
 */
export class MemorizeManager {
  private _recordManager: RecordManager;
  private _memorizeProblems: MemorizeProblem[] = [];
  private _currentProblemIndex = -1;
  private _memorizeStep = 0;
  private _memorizePlayerColor?: Color;
  private _isMemorizeProcessing = false;
  /** 解答用コレクション */
  private _memorizeCollection: MemorizeCollection | null = null;
  /** 作成用コレクション（解答用とは独立） */
  private _editCollection: MemorizeCollection | null = null;
  private _memorizeCollectionPath: string | null = null;
  private _editCollectionPath: string | null = null;
  private _editingProblemIndex = -1;
  private _reviewMistakes: { problemIndex: number; moveIndex: number }[] = [];
  private _memorizeCorrectCount = 0;
  private _memorizeWrongCount = 0;
  private _isGiveUp = false;

  // 結果表示用統計
  private _memorizeHintCount = 0;
  private _memorizeGiveUpCount = 0;
  private _memorizeTotalQuestions = 0;

  // 個別問題の統計（startCurrentSolveProblemでリセット）
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

  // ダイアログ設定の一時保存用
  private _dialogRandomOrder = false;
  private _dialogMaxQuestions = 0;
  private _dialogSkipCommonMoves = false;

  // 外部から appState を操作するためのコールバック
  private setAppState: (state: AppState) => void;
  private getAppState: () => AppState;

  constructor(
    recordManager: RecordManager,
    callbacks: {
      setAppState: (state: AppState) => void;
      getAppState: () => AppState;
    },
  ) {
    this._recordManager = recordManager;
    this.setAppState = callbacks.setAppState;
    this.getAppState = callbacks.getAppState;
  }

  // ========== プロパティ ==========

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

  // 個別問題の統計
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

  get currentHint(): string | null {
    if (!this._memorizeCollection) {
      return null;
    }
    const problem = this.currentCollectionProblem;
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

  get memorizePlayerColor(): Color | undefined {
    return this._memorizePlayerColor;
  }

  get isMemorizeProcessing(): boolean {
    return this._isMemorizeProcessing;
  }

  // === 解答用問題集コレクション管理 ===

  get memorizeCollection(): MemorizeCollection | null {
    return this._memorizeCollection;
  }

  get memorizeCollectionPath(): string | null {
    return this._memorizeCollectionPath;
  }

  // === 作成用問題集コレクション管理 ===

  get editCollection(): MemorizeCollection | null {
    return this._editCollection;
  }

  get editCollectionPath(): string | null {
    return this._editCollectionPath;
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

  get isGiveUp(): boolean {
    return this._isGiveUp;
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

  get dialogSkipCommonMoves(): boolean {
    return this._dialogSkipCommonMoves;
  }

  set dialogSkipCommonMoves(v: boolean) {
    this._dialogSkipCommonMoves = v;
  }

  get editingProblemIndex(): number {
    return this._editingProblemIndex;
  }

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

  // ========== 解答セッション ==========

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

  async startSolveSession(): Promise<void> {
    if (!this._memorizeCollection || this._memorizeCollection.problems.length === 0) {
      return;
    }
    this.buildSolveOrder();
    this._memorizeTotalQuestions = 0;
    this._memorizeCorrectCount = 0;
    this._memorizeWrongCount = 0;
    this._memorizeHintCount = 0;
    this._memorizeGiveUpCount = 0;
    this._skipCommonMoves = this._dialogSkipCommonMoves;
    this._clearedPaths.clear();
    this._isSolving = true;
    this.setAppState(AppState.MEMORIZE);
    await this.startCurrentSolveProblem();
  }

  async startCurrentSolveProblem(): Promise<void> {
    this._isGiveUp = false;
    // 個別問題統計をリセット
    this._problemCorrectMoves = 0;
    this._problemWrongMoves = 0;
    this._problemHintCount = 0;
    this._problemGiveUpCount = 0;
    this._problemTotalPlayerMoves = 0;

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

    // プレイヤーの総手番数を計算（problem.playerColorと一致する手の数）
    this._problemTotalPlayerMoves = moveObjects.filter(
      (m) => m.color === problem.playerColor,
    ).length;

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

    this._recordManager.resetBySFEN(problem.sfen);

    if (this._skipCommonMoves) {
      await this.skipMovesForward(problem, moveObjects);
    } else if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this._recordManager.appendMove({ move: moveObjects[0] });
      this._memorizeStep = 1;
    }
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

    const playerColor = _problem.playerColor;
    if (step < moveObjects.length && moveObjects[step].color !== playerColor) {
      await this.sleep(400);
      this._recordManager.appendMove({ move: moveObjects[step] });
      this._memorizeStep = step + 1;
    }
  }

  async nextProblem(): Promise<boolean> {
    if (!this._isSolving) {
      return false;
    }
    // 現在の問題をクリア済みとして記録する（次の問題で共通手順をスキップするため）
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
    this._memorizeCollection = null;
    this._memorizeCollectionPath = null;
    this.setAppState(AppState.NORMAL);
    this._recordManager.reset();
  }

  // ========== 解答用問題集コレクション管理 ==========

  loadMemorizeCollectionFromYAML(yaml: string): Error | undefined {
    if (this._isSolving) {
      return new Error("解答セッション中は問題集の読み込みはできません");
    }
    const result = loadMemorizeCollection(yaml);
    if (result instanceof Error) {
      return result;
    }
    this._memorizeCollection = result;
    this._memorizeCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this.setAppState(AppState.NORMAL);
    return undefined;
  }

  // ========== 作成用問題集コレクション管理 ==========

  newEditCollection(title: string, playerColor?: "black" | "white"): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は新規作成できません"));
      return;
    }
    this._editCollection = {
      version: 1,
      title,
      playerColor: playerColor || "black",
      problems: [],
    };
    this._editCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._editingProblemIndex = -1;
    this.setAppState(AppState.NORMAL);
  }

  updateEditCollectionSettings(title: string, playerColor: "black" | "white"): void {
    if (!this._editCollection) {
      return;
    }
    this._editCollection.title = title;
    this._editCollection.playerColor = playerColor;
  }

  loadEditCollectionFromYAML(yaml: string): Error | undefined {
    if (this._isSolving) {
      return new Error("解答セッション中は問題集の作成・編集はできません");
    }
    const result = loadMemorizeCollection(yaml);
    if (result instanceof Error) {
      return result;
    }
    this._editCollection = result;
    this._editCollectionPath = null;
    this._memorizeProblems = [];
    this._currentProblemIndex = -1;
    this._memorizeStep = 0;
    this._editingProblemIndex = -1;
    this.setAppState(AppState.NORMAL);
    return undefined;
  }

  saveEditCollectionToYAML(): string | Error {
    if (!this._editCollection) {
      return new Error("問題集が作成されていません");
    }
    return saveMemorizeCollection(this._editCollection);
  }

  private isDuplicateEditProblem(sfen: string, playerColor: Color, moves: string[]): boolean {
    if (!this._editCollection) {
      return false;
    }
    return this._editCollection.problems.some(
      (p) =>
        p.sfen === sfen &&
        p.playerColor === playerColor &&
        p.moves.length === moves.length &&
        p.moves.every((m, i) => m === moves[i]),
    );
  }

  importCurrentRecordAsEditProblems(): number {
    if (!this._editCollection) {
      return 0;
    }
    const sfen = this._recordManager.record.initialPosition.sfen;
    const problems = this.extractNewEditProblems(this._recordManager.record, sfen, true);
    let addedCount = 0;
    for (const problem of problems) {
      if (!this.isDuplicateEditProblem(problem.sfen, problem.playerColor, problem.moves)) {
        this._editCollection.problems.push(problem);
        addedCount++;
      }
    }
    return addedCount;
  }

  private extractNewEditProblems(
    record: ImmutableRecord,
    sfen: string,
    includeComments: boolean,
  ): import("@/common/memorize/index.js").MemorizeProblem[] {
    const collection = this._editCollection;
    if (!collection) {
      return [];
    }
    const playerColor = collection.playerColor === "white" ? Color.WHITE : Color.BLACK;
    const baseNameIndex = collection.problems.length;
    const problems: import("@/common/memorize/index.js").MemorizeProblem[] = [];

    const dfs = (node: ImmutableNode, pathUSI: string[], pathComments: (string | null)[]) => {
      const currentPath = [...pathUSI];
      const currentComments = [...pathComments];
      if (node.move && node.move instanceof TsshogiMove) {
        currentPath.push(node.move.usi);
        currentComments.push(node.comment || null);
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        children.push(child);
        child = child.branch;
      }

      if (children.length === 0) {
        if (currentPath.length > 0) {
          const hints: { index: number; text: string }[] = [];
          if (includeComments) {
            currentComments.forEach((text, idx) => {
              if (text && text.trim()) {
                hints.push({ index: idx, text: text.trim() });
              }
            });
          }

          problems.push({
            name: `${baseNameIndex + problems.length + 1}. 問題`,
            sfen,
            playerColor,
            moves: currentPath,
            hints: hints.length > 0 ? hints : undefined,
          });
        }
        return;
      }

      children.forEach((child) => {
        dfs(child, currentPath, currentComments);
      });
    };

    dfs(record.first, [], []);
    return problems;
  }

  importRecordTextToEditCollection(
    data: string,
    sourceName: string,
    includeComments?: boolean,
  ): { added: number; skipped: number } | null {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return null;
    }
    if (!this._editCollection) {
      useErrorStore().add(new Error("問題集が作成されていません"));
      return null;
    }

    // RecordManager を経由せず直接パースする（棋譜パネルの表示を変更しないため）
    const format = detectRecordFormat(data);
    let recordOrError: Record | Error;
    switch (format) {
      case RecordFormatType.SFEN: {
        const position = Position.newBySFEN(data);
        recordOrError = position ? new Record(position) : new Error(t.failedToParseSFEN);
        break;
      }
      case RecordFormatType.USI:
        recordOrError = Record.newByUSI(data);
        break;
      case RecordFormatType.KIF:
        recordOrError = importKIF(data);
        break;
      case RecordFormatType.KI2:
        recordOrError = importKI2(data);
        break;
      case RecordFormatType.CSA:
        recordOrError = importCSA(data);
        break;
      case RecordFormatType.JKF:
        recordOrError = importJKFString(data);
        break;
      case RecordFormatType.USEN:
        recordOrError = Record.newByUSEN(data);
        break;
      default:
        recordOrError = new Error(t.failedToDetectRecordFormat);
        break;
    }
    if (recordOrError instanceof Error) {
      useErrorStore().add(
        new Error(
          `棋譜の読み込みに失敗しました (${sourceName}): ${localizeError(recordOrError).message}`,
        ),
      );
      return null;
    }
    const record = recordOrError;
    const sfen = record.initialPosition.sfen;
    const problems = this.extractNewEditProblems(record, sfen, includeComments !== false);
    let addedCount = 0;
    let skippedCount = 0;
    for (const problem of problems) {
      if (!this.isDuplicateEditProblem(problem.sfen, problem.playerColor, problem.moves)) {
        this._editCollection.problems.push(problem);
        addedCount++;
      } else {
        skippedCount++;
      }
    }
    return { added: addedCount, skipped: skippedCount };
  }

  addBranchAsEditProblem(name: string): boolean {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return false;
    }
    if (!this._editCollection) {
      return false;
    }

    const record = this._recordManager.record;
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
        if (child.move && child.move instanceof TsshogiMove) {
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
        if (targetChild.move && targetChild.move instanceof TsshogiMove) {
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
          if (child.move && child.move instanceof TsshogiMove) {
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
        if (nextNode.move && nextNode.move instanceof TsshogiMove) {
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

    const playerColor = this._editCollection.playerColor === "white" ? Color.WHITE : Color.BLACK;
    const problem: import("@/common/memorize/index.js").MemorizeProblem = {
      name,
      sfen,
      playerColor,
      moves: fullPathUSI,
      hints: hints.length > 0 ? hints : undefined,
    };
    this._editCollection.problems.push(problem);
    return true;
  }

  addProblemToEditCollection(problem: import("@/common/memorize/index.js").MemorizeProblem): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection) {
      return;
    }
    this._editCollection.problems.push(problem);
  }

  removeProblemFromEditCollection(index: number): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
      return;
    }
    const problemName = this._editCollection.problems[index].name;
    this.showConfirmation({
      message: `問題「${problemName}」を削除してもよろしいですか？`,
      onOk: () => {
        if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
          return;
        }
        this._editCollection.problems.splice(index, 1);
        if (this._editingProblemIndex === index) {
          this._editingProblemIndex = -1;
        } else if (this._editingProblemIndex > index) {
          this._editingProblemIndex--;
        }
      },
    });
  }

  updateProblemInEditCollection(
    index: number,
    problem: import("@/common/memorize/index.js").MemorizeProblem,
  ): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
      return;
    }
    this._editCollection.problems[index] = problem;
  }

  loadEditProblemToRecord(index: number): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
      return;
    }
    const problem = this._editCollection.problems[index];

    this._recordManager.resetBySFEN(problem.sfen);

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
      this._recordManager.appendMove({ move });

      if (problem.hints) {
        const hint = problem.hints.find((h) => h.index === i);
        if (hint) {
          this._recordManager.updateComment(hint.text);
        }
      }
    }

    this._editingProblemIndex = index;
  }

  updateEditProblemFromRecord(): boolean {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return false;
    }
    if (!this._editCollection || this._editingProblemIndex < 0) {
      return false;
    }

    const record = this._recordManager.record;
    const sfen = record.initialPosition.sfen;
    const current = record.current;
    const oldProblem = this._editCollection.problems[this._editingProblemIndex];

    const pathUSI: string[] = [];
    const pathComments: (string | null)[] = [];

    const collectPath = (node: ImmutableNode, target: ImmutableNode): boolean => {
      if (node === target) {
        return true;
      }

      const children: ImmutableNode[] = [];
      let child = node.next;
      while (child) {
        if (child.move && child.move instanceof TsshogiMove) {
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
        if (targetChild.move && targetChild.move instanceof TsshogiMove) {
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
          if (child.move && child.move instanceof TsshogiMove) {
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
        if (nextNode.move && nextNode.move instanceof TsshogiMove) {
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

    this._editCollection.problems[this._editingProblemIndex] = updatedProblem;
    this._editingProblemIndex = -1;
    return true;
  }

  renameEditProblem(name: string): void {
    if (this._isSolving) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || this._editingProblemIndex < 0) {
      return;
    }
    this._editCollection.problems[this._editingProblemIndex].name = name;
  }

  clearEditProblem(): void {
    this._editingProblemIndex = -1;
  }

  // ========== 旧形式メモライズ（解答用、互換性維持） ==========

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
    this.setAppState(AppState.NORMAL);
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
    this._currentProblemIndex = index;
    this._memorizeStep = 0;
    this._isMemorizeProcessing = false;
    this._memorizePlayerColor = playerColor;

    this._recordManager.reset();

    const actualPlayerColor = playerColor !== undefined ? playerColor : problem.playerColor;

    if (problem.moves.length > 0 && problem.moves[0].color !== actualPlayerColor) {
      this._recordManager.appendMove({ move: problem.moves[0] });
      this._memorizeStep = 1;
    }
  }

  // ========== 一手ごとの処理 ==========

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

      if (this._memorizeStep >= problem.moves.length) {
        this._memorizeCorrectCount += this._problemCorrectMoves;
        this._memorizeWrongCount += this._problemWrongMoves;
        this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
        return;
      }

      // 次の手が相手の手番であれば、少し待ってから自動進行
      const actualPlayerColor =
        this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
      const nextExpectedMove = problem.moves[this._memorizeStep];
      if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
        this._isMemorizeProcessing = true;
        await this.sleep(400);
        // セッションが継続中か確認（解答終了などで中断された場合は何もしない）
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

        if (this._memorizeStep >= problem.moves.length) {
          this._memorizeCorrectCount += this._problemCorrectMoves;
          this._memorizeWrongCount += this._problemWrongMoves;
          this._memorizeTotalQuestions += this._problemTotalPlayerMoves;
        }
      }
    } else {
      this._problemWrongMoves++;
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

    if (this._memorizeStep >= problem.moves.length) {
      return;
    }

    // 次の手が相手の手番であれば、少し待ってから自動進行
    const actualPlayerColor =
      this._memorizePlayerColor !== undefined ? this._memorizePlayerColor : problem.playerColor;
    const nextExpectedMove = problem.moves[this._memorizeStep];
    if (nextExpectedMove && nextExpectedMove.color !== actualPlayerColor) {
      this._isMemorizeProcessing = true;
      await this.sleep(400);
      // セッションが継続中か確認
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

  private extractProblems(record: ImmutableRecord): MemorizeProblem[] {
    const problems: MemorizeProblem[] = [];

    const dfs = (node: ImmutableNode, pathMoves: Move[], branchName: string) => {
      const currentPath = [...pathMoves];
      if (node.move && node.move instanceof TsshogiMove) {
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

  private showConfirmation(confirmation: Confirmation): void {
    useConfirmationStore().show(confirmation);
  }

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
        return expectedMove ? expectedMove.color === problem.playerColor : false;
      }
    }
    return false;
  }
}
