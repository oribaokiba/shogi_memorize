import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { Color } from "tsshogi";

/**
 * ヒント情報
 */
export type MemorizeHint = {
  /** moves 配列の 0 始まりインデックス */
  index: number;
  /** ヒントテキスト */
  text: string;
};

/**
 * 1 つの問題
 */
export type MemorizeProblem = {
  /** 問題名 */
  name: string;
  /** 初期局面の SFEN 文字列（平手/駒落ち/途中図すべて対応） */
  sfen: string;
  /** 解答者の手番 */
  playerColor: Color;
  /** 解答手順（USI 文字列の配列） */
  moves: string[];
  /** ヒント（任意） */
  hints?: MemorizeHint[];
};

/**
 * 問題集コレクション
 */
export type MemorizeCollection = {
  /** 形式バージョン */
  version: number;
  /** 問題集タイトル */
  title: string;
  /** 問題集全体のデフォルト手番 */
  playerColor: "black" | "white";
  /** 問題一覧 */
  problems: MemorizeProblem[];
};

const CURRENT_VERSION = 1;

/**
 * 問題集データの YAML 文字列を読み込み、MemorizeCollection に変換する。
 * @param yamlText YAML 文字列
 * @returns 変換に成功した場合は MemorizeCollection、失敗した場合は Error
 */
export function loadMemorizeCollection(yamlText: string): MemorizeCollection | Error {
  let parsed: unknown;
  try {
    parsed = parseYAML(yamlText);
  } catch (e) {
    return new Error(`YAML のパースに失敗しました: ${e}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    return new Error("問題集データがオブジェクトではありません");
  }

  const data = parsed as Record<string, unknown>;

  if (data.version !== CURRENT_VERSION) {
    return new Error(`未対応のバージョンです: ${data.version}`);
  }

  if (typeof data.title !== "string" || !data.title) {
    return new Error("問題集のタイトルが設定されていません");
  }

  if (!Array.isArray(data.problems)) {
    return new Error("問題一覧が配列ではありません");
  }

  // デフォルト手番 (互換性: 未指定の場合は black)
  const playerColor: "black" | "white" = data.playerColor === "white" ? "white" : "black";

  const problems: MemorizeProblem[] = [];
  for (let i = 0; i < data.problems.length; i++) {
    const problem = data.problems[i] as Record<string, unknown> | undefined;
    const err = validateProblem(problem, i);
    if (err) {
      return err;
    }

    const hints: MemorizeHint[] = [];
    if (Array.isArray(problem!.hints)) {
      for (const hint of problem!.hints) {
        const h = hint as Record<string, unknown>;
        if (typeof h.index !== "number" || typeof h.text !== "string") {
          return new Error(`問題 ${i + 1} のヒントの形式が正しくありません`);
        }
        hints.push({ index: h.index, text: h.text });
      }
    }

    problems.push({
      name: problem!.name as string,
      sfen: problem!.sfen as string,
      playerColor: problem!.playerColor === "white" ? Color.WHITE : Color.BLACK,
      moves: problem!.moves as string[],
      hints: hints.length > 0 ? hints : undefined,
    });
  }

  return {
    version: CURRENT_VERSION,
    title: data.title as string,
    playerColor,
    problems,
  };
}

/**
 * MemorizeCollection を YAML 文字列に変換する。
 */
export function saveMemorizeCollection(collection: MemorizeCollection): string {
  const data: Record<string, unknown> = {
    version: collection.version,
    title: collection.title,
    playerColor: collection.playerColor,
    problems: collection.problems.map((p) => {
      const problem: Record<string, unknown> = {
        name: p.name,
        sfen: p.sfen,
        playerColor: p.playerColor === Color.WHITE ? "white" : "black",
        moves: p.moves,
      };
      if (p.hints && p.hints.length > 0) {
        problem.hints = p.hints;
      }
      return problem;
    }),
  };
  return stringifyYAML(data, {
    indent: 2,
    lineWidth: 120,
  });
}

/**
 * MemorizeCollection のバリデーションを行う。
 * @returns 問題がある場合は Error、問題がない場合は undefined
 */
export function validateMemorizeCollection(collection: MemorizeCollection): Error | undefined {
  if (!collection.title) {
    return new Error("問題集のタイトルが設定されていません");
  }
  for (let i = 0; i < collection.problems.length; i++) {
    const p = collection.problems[i];
    const err = validateProblemInternal(p, i);
    if (err) {
      return err;
    }
  }
  return undefined;
}

function validateProblem(problem: unknown, index: number): Error | undefined {
  if (typeof problem !== "object" || problem === null) {
    return new Error(`問題 ${index + 1} がオブジェクトではありません`);
  }
  const p = problem as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name) {
    return new Error(`問題 ${index + 1} に名前が設定されていません`);
  }
  if (typeof p.sfen !== "string" || !p.sfen) {
    return new Error(`問題 ${index + 1} の初期局面 (sfen) が設定されていません`);
  }
  if (p.playerColor !== "black" && p.playerColor !== "white") {
    return new Error(`問題 ${index + 1} の手番の指定が正しくありません`);
  }
  if (!Array.isArray(p.moves) || p.moves.length === 0) {
    return new Error(`問題 ${index + 1} の手順が空です`);
  }
  return undefined;
}

// USI文字列が有効な形式か簡易チェック
function isValidUSIMove(move: string): boolean {
  // 例: 7g7f, 8c8d, 5i5h, など 4文字 or 5文字 (成りは最後に +)
  // 駒打ち: 2a3a+? など
  return /^[1-9][a-i][1-9][a-i][+]?$/.test(move);
}

function validateProblemInternal(p: MemorizeProblem, index: number): Error | undefined {
  if (!p.name) {
    return new Error(`問題 ${index + 1} に名前が設定されていません`);
  }
  if (!p.sfen) {
    return new Error(`問題 ${index + 1} の初期局面 (sfen) が設定されていません`);
  }
  if (p.moves.length === 0) {
    return new Error(`問題 ${index + 1} の手順が空です`);
  }
  for (let j = 0; j < p.moves.length; j++) {
    if (!isValidUSIMove(p.moves[j])) {
      return new Error(`問題 ${index + 1} の ${j + 1} 手目が不正なUSI文字列です: ${p.moves[j]}`);
    }
  }
  if (p.hints) {
    for (let j = 0; j < p.hints.length; j++) {
      const hint = p.hints[j];
      if (typeof hint.index !== "number" || hint.index < 0 || hint.index >= p.moves.length) {
        return new Error(`問題 ${index + 1} のヒント ${j + 1} のインデックスが不正です`);
      }
      if (!hint.text) {
        return new Error(`問題 ${index + 1} のヒント ${j + 1} のテキストが空です`);
      }
    }
  }
  return undefined;
}
