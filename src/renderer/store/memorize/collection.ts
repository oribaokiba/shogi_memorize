import {
  Color,
  ImmutableNode,
  ImmutableRecord,
  importKIF,
  importKI2,
  importCSA,
  importJKFString,
  Position,
  Record,
  RecordFormatType,
  detectRecordFormat,
  Move as TsshogiMove,
} from "tsshogi";
import { localizeError, t } from "@/common/i18n/index.js";
import { useErrorStore } from "@/renderer/store/error.js";
import { useConfirmationStore, type Confirmation } from "@/renderer/store/confirm.js";
import {
  loadMemorizeCollection,
  saveMemorizeCollection,
  type MemorizeCollection,
} from "@/common/memorize/index.js";
import type { DialogSettings } from "./types.js";
import { createDefaultDialogSettings } from "./types.js";

/**
 * 問題集コレクション管理クラス
 * 解答用・作成用コレクションの読み込み/保存/CRUDを担当する。
 */
export class CollectionManager {
  // 解答用コレクション
  private _memorizeCollection: MemorizeCollection | null = null;
  private _memorizeCollectionPath: string | null = null;

  // 作成用コレクション
  private _editCollection: MemorizeCollection | null = null;
  private _editCollectionPath: string | null = null;
  private _editingProblemIndex = -1;

  // ダイアログ設定
  private _dialogSettings: DialogSettings = createDefaultDialogSettings();

  // 外部依存
  private _isSolving: () => boolean;

  constructor(isSolving: () => boolean) {
    this._isSolving = isSolving;
  }

  // ========== プロパティ ==========

  // === 解答用問題集コレクション管理 ===

  get memorizeCollection(): MemorizeCollection | null {
    return this._memorizeCollection;
  }

  set memorizeCollection(collection: MemorizeCollection | null) {
    this._memorizeCollection = collection;
  }

  get memorizeCollectionPath(): string | null {
    return this._memorizeCollectionPath;
  }

  set memorizeCollectionPath(path: string | null) {
    this._memorizeCollectionPath = path;
  }

  // === 作成用問題集コレクション管理 ===

  get editCollection(): MemorizeCollection | null {
    return this._editCollection;
  }

  get editCollectionPath(): string | null {
    return this._editCollectionPath;
  }

  get editingProblemIndex(): number {
    return this._editingProblemIndex;
  }

  set editingProblemIndex(index: number) {
    this._editingProblemIndex = index;
  }

  // === ダイアログ設定 ===

  get dialogRandomOrder(): boolean {
    return this._dialogSettings.randomOrder;
  }

  set dialogRandomOrder(v: boolean) {
    this._dialogSettings.randomOrder = v;
  }

  get dialogMaxQuestions(): number {
    return this._dialogSettings.maxQuestions;
  }

  set dialogMaxQuestions(v: number) {
    this._dialogSettings.maxQuestions = v;
  }

  get dialogSkipCommonMoves(): boolean {
    return this._dialogSettings.skipCommonMoves;
  }

  set dialogSkipCommonMoves(v: boolean) {
    this._dialogSettings.skipCommonMoves = v;
  }

  get dialogUseTimeLimit(): boolean {
    return this._dialogSettings.useTimeLimit;
  }

  set dialogUseTimeLimit(v: boolean) {
    this._dialogSettings.useTimeLimit = v;
  }

  get dialogTimeLimitMode() {
    return this._dialogSettings.timeLimitMode;
  }

  set dialogTimeLimitMode(v: "none" | "perProblem" | "total") {
    this._dialogSettings.timeLimitMode = v;
  }

  get dialogTimeLimitSettings() {
    return this._dialogSettings.timeLimitSettings;
  }

  set dialogTimeLimitSettings(v: import("@/common/settings/game.js").TimeLimitSettings) {
    this._dialogSettings.timeLimitSettings = v;
  }

  get dialogSettings(): DialogSettings {
    return this._dialogSettings;
  }

  // ========== 解答用問題集コレクション管理 ==========

  loadMemorizeCollectionFromYAML(yaml: string): Error | undefined {
    if (this._isSolving()) {
      return new Error("解答セッション中は問題集の読み込みはできません");
    }
    const result = loadMemorizeCollection(yaml);
    if (result instanceof Error) {
      return result;
    }
    this._memorizeCollection = result;
    this._memorizeCollectionPath = null;
    return undefined;
  }

  // ========== 作成用問題集コレクション管理 ==========

  newEditCollection(title: string, playerColor?: "black" | "white"): void {
    if (this._isSolving()) {
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
    this._editingProblemIndex = -1;
  }

  updateEditCollectionSettings(title: string, playerColor: "black" | "white"): void {
    if (!this._editCollection) {
      return;
    }
    this._editCollection.title = title;
    this._editCollection.playerColor = playerColor;
  }

  loadEditCollectionFromYAML(yaml: string): Error | undefined {
    if (this._isSolving()) {
      return new Error("解答セッション中は問題集の作成・編集はできません");
    }
    const result = loadMemorizeCollection(yaml);
    if (result instanceof Error) {
      return result;
    }
    this._editCollection = result;
    this._editCollectionPath = null;
    this._editingProblemIndex = -1;
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

  importCurrentRecordAsEditProblems(
    recordManager: import("@/renderer/record/manager.js").RecordManager,
  ): number {
    if (!this._editCollection) {
      return 0;
    }
    const sfen = recordManager.record.initialPosition.sfen;
    const problems = this.extractNewEditProblems(recordManager.record, sfen, true);
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
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return null;
    }
    if (!this._editCollection) {
      useErrorStore().add(new Error("問題集が作成されていません"));
      return null;
    }

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

  addBranchAsEditProblem(
    name: string,
    recordManager: import("@/renderer/record/manager.js").RecordManager,
  ): boolean {
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return false;
    }
    if (!this._editCollection) {
      return false;
    }

    const record = recordManager.record;
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
        children.push(child);
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

    // 重複チェック
    if (this.isDuplicateEditProblem(sfen, playerColor, fullPathUSI)) {
      useErrorStore().add(new Error("同じ手順の問題が既に存在します。"));
      return false;
    }

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
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection) {
      return;
    }
    this._editCollection.problems.push(problem);
  }

  moveEditProblem(fromIndex: number, toIndex: number): void {
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || fromIndex === toIndex) {
      return;
    }
    const problems = this._editCollection.problems;
    if (
      fromIndex < 0 ||
      fromIndex >= problems.length ||
      toIndex < 0 ||
      toIndex >= problems.length
    ) {
      return;
    }
    const [moved] = problems.splice(fromIndex, 1);
    problems.splice(toIndex, 0, moved);

    // 編集中のインデックスを追従
    if (this._editingProblemIndex === fromIndex) {
      this._editingProblemIndex = toIndex;
    } else if (fromIndex < toIndex) {
      // 前方から後方に移動: 間にある要素は前にずれる
      if (this._editingProblemIndex > fromIndex && this._editingProblemIndex <= toIndex) {
        this._editingProblemIndex--;
      }
    } else {
      // 後方から前方に移動: 間にある要素は後ろにずれる
      if (this._editingProblemIndex >= toIndex && this._editingProblemIndex < fromIndex) {
        this._editingProblemIndex++;
      }
    }
  }

  removeProblemFromEditCollection(index: number): void {
    if (this._isSolving()) {
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
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
      return;
    }
    this._editCollection.problems[index] = problem;
  }

  loadEditProblemToRecord(
    index: number,
    recordManager: import("@/renderer/record/manager.js").RecordManager,
  ): void {
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return;
    }
    if (!this._editCollection || index < 0 || index >= this._editCollection.problems.length) {
      return;
    }
    const problem = this._editCollection.problems[index];

    recordManager.resetBySFEN(problem.sfen);

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
      recordManager.appendMove({ move });

      if (problem.hints) {
        const hint = problem.hints.find((h) => h.index === i);
        if (hint) {
          recordManager.updateComment(hint.text);
        }
      }
    }

    this._editingProblemIndex = index;
  }

  updateEditProblemFromRecord(
    recordManager: import("@/renderer/record/manager.js").RecordManager,
  ): boolean {
    if (this._isSolving()) {
      useErrorStore().add(new Error("解答セッション中は問題の作成・編集はできません"));
      return false;
    }
    if (!this._editCollection || this._editingProblemIndex < 0) {
      return false;
    }

    const record = recordManager.record;
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
        children.push(child);
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
    if (this._isSolving()) {
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

  /**
   * updateEditProblemFromRecord を呼ぶ直前に、編集中問題の更新前ヒント状態を保存する。
   */
  captureOldHintsBeforeUpdate(): void {
    if (this._editingProblemIndex >= 0 && this._editCollection) {
      this._capturedEditingIndex = this._editingProblemIndex;
      this._oldHintsBeforeUpdate = this._editCollection.problems[this._editingProblemIndex].hints
        ? [...this._editCollection.problems[this._editingProblemIndex].hints!]
        : [];
    } else {
      this._capturedEditingIndex = -1;
      this._oldHintsBeforeUpdate = undefined;
    }
  }

  private _capturedEditingIndex = -1;
  private _oldHintsBeforeUpdate: { index: number; text: string }[] | undefined = undefined;

  /**
   * updateEditProblemFromRecord の実行後に、編集中問題のヒント変更差分を取得する。
   * 変更＝新しく追加された、またはテキストが変更されたヒント、または削除されたヒント。
   * @returns 変更があった各ヒントの { index, usi, text, usiDisplay }
   */
  getHintChangesAfterUpdate(): { index: number; usi: string; text: string; usiDisplay: string }[] {
    const problemIndex = this._capturedEditingIndex;
    if (
      !this._editCollection ||
      problemIndex < 0 ||
      problemIndex >= this._editCollection.problems.length
    ) {
      return [];
    }
    const oldHints = this._oldHintsBeforeUpdate || [];
    const problem = this._editCollection.problems[problemIndex];
    const newHints = problem.hints || [];

    const oldMap = new Map<number, string>();
    for (const h of oldHints) {
      oldMap.set(h.index, h.text);
    }

    const newMap = new Map<number, string>();
    for (const h of newHints) {
      newMap.set(h.index, h.text);
    }

    const changes: { index: number; usi: string; text: string; usiDisplay: string }[] = [];

    // Position を使って駒名を取得する（一手ずつ適用しながら）
    const pos = Position.newBySFEN(problem.sfen);
    const usiDisplayCache: Map<number, string> = new Map();
    if (pos) {
      for (let i = 0; i < problem.moves.length; i++) {
        const usi = problem.moves[i];
        if (!usi) {
          continue;
        }
        const move = pos.createMoveByUSI(usi);
        if (move) {
          const toUSI = move.to.usi;
          const toDisplay = this._squareToDisplay(toUSI);
          const pieceKanji = this._pieceTypeToKanji(move.pieceType);
          const promote = move.promote ? "成" : "";
          usiDisplayCache.set(i, `${toDisplay}${pieceKanji}${promote}`);
          pos.doMove(move);
        } else {
          usiDisplayCache.set(i, usi);
        }
      }
    }

    // 追加・変更されたヒント
    for (const [index, text] of newMap) {
      const oldText = oldMap.get(index);
      if (oldText !== text) {
        const usi = problem.moves[index] || "";
        if (usi) {
          const usiDisplay = usiDisplayCache.get(index) || usi;
          changes.push({ index, usi, text, usiDisplay });
        }
      }
    }
    // 削除されたヒント
    for (const [index] of oldMap) {
      if (!newMap.has(index)) {
        const usi = problem.moves[index] || "";
        if (usi) {
          const usiDisplay = usiDisplayCache.get(index) || usi;
          changes.push({ index, usi, text: "", usiDisplay });
        }
      }
    }
    return changes;
  }

  /**
   * USI駒種コードを漢字一文字に変換する。
   */
  private _pieceTypeToKanji(pieceType: string): string {
    const map: { [key: string]: string } = {
      pawn: "歩",
      lance: "香",
      knight: "桂",
      silver: "銀",
      gold: "金",
      bishop: "角",
      rook: "飛",
      king: "玉",
      promPawn: "と",
      promLance: "杏",
      promKnight: "圭",
      promSilver: "全",
      horse: "馬",
      dragon: "龍",
    };
    return map[pieceType] || "";
  }

  /**
   * 将棋盤の座標文字列（例: "7g"）を「７七」のような表示に変換する。
   */
  private _squareToDisplay(square: string): string {
    if (square.length !== 2) {
      return square;
    }
    const fileNum = parseInt(square[0], 10);
    const rankChar = square[1];
    const fileKanji = "１２３４５６７８９"[fileNum - 1] || square[0];
    const rankIndex = "abcdefghi".indexOf(rankChar);
    const rankKanji = "一二三四五六七八九"[rankIndex >= 0 ? rankIndex : -1] || rankChar;
    return fileKanji + rankKanji;
  }

  /**
   * 現在の編集コレクションから、指定された手数(index)に指定されたUSI文字列を持つ
   * 他問題のインデックス一覧を返す。
   */
  findProblemIndicesWithSameUSI(index: number, usi: string): number[] {
    if (!this._editCollection || index < 0) {
      return [];
    }
    const skipIndex =
      this._capturedEditingIndex >= 0 ? this._capturedEditingIndex : this._editingProblemIndex;
    // skipIndex が有効でない場合は自分自身を特定できないため、空配列を返す
    if (skipIndex < 0 || skipIndex >= this._editCollection.problems.length) {
      return [];
    }
    // 編集中の問題の手順（prefix比較の基準とする）
    const refMoves = this._editCollection.problems[skipIndex].moves;
    if (index >= refMoves.length) {
      return [];
    }
    const results: number[] = [];
    for (let i = 0; i < this._editCollection.problems.length; i++) {
      if (i === skipIndex) {
        continue;
      }
      const p = this._editCollection.problems[i];
      // 同じ手数に同じUSIがあり、かつそこまでの手順（prefix）も一致する場合のみ「同手順」
      if (index < p.moves.length && p.moves[index] === usi) {
        const prefixMatches = p.moves.slice(0, index).every((m, j) => m === refMoves[j]);
        if (prefixMatches) {
          results.push(i);
        }
      }
    }
    return results;
  }

  /**
   * 指定された複数の問題に、指定された手数(index)のヒントをまとめて設定する。
   */
  batchApplyHintToProblems(problemIndices: number[], hintIndex: number, text: string): void {
    if (!this._editCollection) {
      return;
    }
    for (const pi of problemIndices) {
      if (pi < 0 || pi >= this._editCollection.problems.length) {
        continue;
      }
      const problem = this._editCollection.problems[pi];
      if (hintIndex >= problem.moves.length) {
        continue;
      }
      if (text === "") {
        // 空文字の場合は削除
        if (problem.hints) {
          problem.hints = problem.hints.filter((h) => h.index !== hintIndex);
          if (problem.hints.length === 0) {
            problem.hints = undefined;
          }
        }
      } else {
        if (!problem.hints) {
          problem.hints = [];
        }
        const existing = problem.hints.find((h) => h.index === hintIndex);
        if (existing) {
          existing.text = text;
        } else {
          problem.hints.push({ index: hintIndex, text });
        }
      }
    }
  }

  /** 作成用問題集コレクションを閉じる（アンロード） */
  closeEditCollection(): void {
    this._editCollection = null;
    this._editCollectionPath = null;
    this._editingProblemIndex = -1;
  }

  /** 解答用問題集コレクションを閉じる（アンロード） */
  closeMemorizeCollection(): void {
    this._memorizeCollection = null;
    this._memorizeCollectionPath = null;
  }

  /** 解答用問題集コレクションをリセット */
  resetForSession(): void {
    this._memorizeCollection = null;
    this._memorizeCollectionPath = null;
  }

  private showConfirmation(confirmation: Confirmation): void {
    useConfirmationStore().show(confirmation);
  }
}
