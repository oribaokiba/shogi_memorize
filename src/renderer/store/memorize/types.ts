import { Color, Move } from "tsshogi";
import type { TimeLimitSettings } from "@/common/settings/game.js";
import { defaultTimeLimitSettings } from "@/common/settings/game.js";

// 解答セッション中の一問題を表す型
export type MemorizeProblem = {
  name: string;
  moves: Move[];
  playerColor: Color;
};

/** 持ち時間モード */
export type TimeLimitMode = "none" | "perProblem" | "total";

/** タイマー更新通知用コールバック */
export type TimerUpdateCallback = (
  timeMs: number,
  byoyomi: number,
  timeLimitMode: TimeLimitMode,
  memorizePlayerColor: Color | undefined,
  totalTimeMs: number,
) => void;

/** ダイアログ設定のデフォルト値 */
export function createDefaultDialogSettings(): DialogSettings {
  return {
    randomOrder: false,
    maxQuestions: 0,
    skipCommonMoves: false,
    useTimeLimit: false,
    timeLimitMode: "perProblem",
    timeLimitSettings: defaultTimeLimitSettings(),
  };
}

export type DialogSettings = {
  randomOrder: boolean;
  maxQuestions: number;
  skipCommonMoves: boolean;
  useTimeLimit: boolean;
  timeLimitMode: TimeLimitMode;
  timeLimitSettings: TimeLimitSettings;
};

/** 解答セッション統計 */
export type SessionStats = {
  correctCount: number;
  wrongCount: number;
  hintCount: number;
  giveUpCount: number;
  totalQuestions: number;
};

/** 個別問題統計 */
export type ProblemStats = {
  correctMoves: number;
  wrongMoves: number;
  hintCount: number;
  giveUpCount: number;
  totalPlayerMoves: number;
};
