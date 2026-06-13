import {
  Color,
  ImmutableNode,
  ImmutableRecord,
  importKIF,
  Move,
  Position,
  Move as TsshogiMove,
} from "tsshogi";
import { playPieceBeat } from "@/renderer/devices/audio.js";
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
  private _memorizeCollection: MemorizeCollection | null = null;
  private _memorizeCollectionPath: string | null = null;
  private _editingProblemIndex = -1;
  private _reviewMistakes: { problemIndex: number; moveIndex: number }[] = [];
  private _memorizeCorrectCount = 0;
  private _memorizeWrongCount = 0;

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
    this._reviewMistakes = [];
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

  startSolveSession(): void {
    if (!this._memorizeCollection || this._memorizeCollection.problems.length === 0) {
      return;
    }
    this.buildSolveOrder();
    this._skipCommonMoves = this._dialogSkipCommonMoves;
    this._clearedPaths.clear();
    this._isSolving = true;
    this.setAppState(AppState.MEMORIZE);
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

    this._recordManager.resetBySFEN(problem.sfen);

    if (this._skipCommonMoves) {
      this.skipMovesForward(problem, moveObjects);
    } else if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this._recordManager.appendMove({ move: moveObjects[0] });
      this._memorizeStep = 1;
    }
  }

  private skipMovesForward(
    _problem: import("@/common/memorize/index.js").MemorizeProblem,
    moveObjects: Move[],
  ): void {
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
      this._recordManager.appendMove({ move: moveObjects[step] });
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

  // ========== 問題集コレクション管理 ==========

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
    this.setAppState(AppState.NORMAL);
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
    this.setAppState(AppState.NORMAL);
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
    const sfen = this._recordManager.record.initialPosition.sfen;
    const problems = this.extractNewProblems(this._recordManager.record, sfen);
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
          const pColor = currentPath.length % 2 === 0 ? Color.WHITE : Color.BLACK;

          const hints: { index: number; text: string }[] = [];
          currentComments.forEach((text, idx) => {
            if (text && text.trim()) {
              hints.push({ index: idx, text: text.trim() });
            }
          });

          problems.push({
            name: `${this._memorizeCollection!.problems.length + problems.length + 1}. 問題`,
            sfen,
            playerColor: pColor,
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
    this.setAppState(AppState.MEMORIZE);

    this._recordManager.resetBySFEN(problem.sfen);

    if (moveObjects.length > 0 && moveObjects[0].color !== problem.playerColor) {
      this._recordManager.appendMove({ move: moveObjects[0] });
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
    const error = this._recordManager.importRecord(data, {});
    if (error) {
      useErrorStore().add(
        new Error(`棋譜の読み込みに失敗しました (${sourceName}): ${error.message}`),
      );
      return null;
    }
    const sfen = this._recordManager.record.initialPosition.sfen;
    const problems = this.extractNewProblems(this._recordManager.record, sfen);
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

  loadProblemToRecord(index: number): void {
    if (
      !this._memorizeCollection ||
      index < 0 ||
      index >= this._memorizeCollection.problems.length
    ) {
      return;
    }
    const problem = this._memorizeCollection.problems[index];

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

  updateProblemFromRecord(): boolean {
    if (!this._memorizeCollection || this._editingProblemIndex < 0) {
      return false;
    }

    const record = this._recordManager.record;
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

  // ========== 旧形式メモライズ ==========

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
      this._recordManager.appendMove({ move });
      try {
        playPieceBeat(useAppSettings().pieceVolume);
      } catch (e) {
        useErrorStore().add(e);
      }
      this._memorizeStep++;

      if (this._memorizeStep >= problem.moves.length) {
        this.recordClearedProblem();
        useMessageStore().enqueue({ text: "正解です！クリアしました！" });
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
          this.recordClearedProblem();
          useMessageStore().enqueue({ text: "正解です！クリアしました！" });
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
      useMessageStore().enqueue({ text: "クリアしました！（ギブアップ）" });
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

      if (this._memorizeStep >= problem.moves.length) {
        useMessageStore().enqueue({ text: "クリアしました！（ギブアップ）" });
      }
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
