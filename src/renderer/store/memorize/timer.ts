import { Color } from "tsshogi";
import type { TimeLimitSettings } from "@/common/settings/game.js";
import { defaultTimeLimitSettings } from "@/common/settings/game.js";
import type { TimeLimitMode, TimerUpdateCallback } from "./types.js";

/**
 * メモライズのタイマー管理クラス
 * 持ち時間・秒読み・フィッシャー加算の管理、時間切れ通知を行う。
 */
export class TimerManager {
  private _timeLimitMode: TimeLimitMode = "none";
  private _timeLimitSettings: TimeLimitSettings = defaultTimeLimitSettings();
  private _timerHandle: ReturnType<typeof setInterval> | null = null;
  private _startTimestamp = 0;
  private _lastTimeMs = 0;
  private _timeMs = 0;
  private _byoyomi = 0;
  private _totalElapsedMs = 0;
  private _totalFisherMs = 0;
  private _onTimerUpdate: TimerUpdateCallback | null = null;

  // 時間切れ処理用コールバック
  private _onPerProblemTimeUp: (() => void) | null = null;
  private _onTotalTimeUp: (() => void) | null = null;

  set onPerProblemTimeUp(callback: (() => void) | null) {
    this._onPerProblemTimeUp = callback;
  }

  set onTotalTimeUp(callback: (() => void) | null) {
    this._onTotalTimeUp = callback;
  }

  // ========== プロパティ ==========

  get timeLimitMode(): TimeLimitMode {
    return this._timeLimitMode;
  }

  set timeLimitMode(mode: TimeLimitMode) {
    this._timeLimitMode = mode;
  }

  get timeLimitSettings(): TimeLimitSettings {
    return this._timeLimitSettings;
  }

  set timeLimitSettings(settings: TimeLimitSettings) {
    this._timeLimitSettings = settings;
  }

  get timeMs(): number {
    return this._timeMs;
  }

  get byoyomi(): number {
    return this._byoyomi;
  }

  get totalElapsedMs(): number {
    return this._totalElapsedMs;
  }

  set totalElapsedMs(ms: number) {
    this._totalElapsedMs = ms;
  }

  get totalFisherMs(): number {
    return this._totalFisherMs;
  }

  set totalFisherMs(ms: number) {
    this._totalFisherMs = ms;
  }

  get startTimestamp(): number {
    return this._startTimestamp;
  }

  set startTimestamp(ts: number) {
    this._startTimestamp = ts;
  }

  /** 持ち時間残り（秒） */
  get remainingSeconds(): number {
    if (this._timeLimitMode === "none") {
      return -1;
    }
    return Math.ceil(this._timeMs / 1000);
  }

  /** 秒読み残り（秒） */
  get byoyomiSeconds(): number {
    if (this._timeLimitMode === "none") {
      return -1;
    }
    return this._byoyomi;
  }

  /** 全体モードでの残り持ち時間（秒） */
  get totalRemainingSeconds(): number {
    if (this._timeLimitMode !== "total") {
      return -1;
    }
    const totalMs = this.totalTimeMs;
    if (totalMs < 0) {
      return -1;
    }
    return Math.ceil(totalMs / 1000);
  }

  /** 全体モードでの秒読み残り（秒） */
  get totalByoyomiSeconds(): number {
    if (this._timeLimitMode !== "total") {
      return -1;
    }
    return this._byoyomi;
  }

  get totalTimeMs(): number {
    if (this._timeLimitMode !== "total") {
      return -1;
    }
    const limitMs = this._timeLimitSettings.timeSeconds * 1000 + this._totalFisherMs;
    const elapsedMs = this._totalElapsedMs + this.getCurrentIntervalMs();
    return Math.max(0, limitMs - elapsedMs);
  }

  /** Storeのリアクティブな値を更新するコールバックを登録 */
  set onTimerUpdate(callback: TimerUpdateCallback | null) {
    this._onTimerUpdate = callback;
  }

  get onTimerUpdate(): TimerUpdateCallback | null {
    return this._onTimerUpdate;
  }

  private getCurrentIntervalMs(): number {
    if (!this._startTimestamp) {
      return 0;
    }
    return Date.now() - this._startTimestamp;
  }

  /** タイマーを開始する */
  startTimer(): void {
    this.stopTimer();
    if (this._timeLimitMode === "none") {
      return;
    }
    this._timeMs = this._timeLimitSettings.timeSeconds * 1000;
    this._byoyomi = this._timeLimitSettings.byoyomi;
    this._startTimestamp = Date.now();
    this._lastTimeMs = this._timeMs;

    this._timerHandle = setInterval(() => {
      this.updateTimer();
    }, 200);
  }

  stopTimer(): void {
    if (this._timerHandle !== null) {
      clearInterval(this._timerHandle);
      this._timerHandle = null;
    }
    if (this._startTimestamp) {
      const diffMs = this.getCurrentIntervalMs();
      this._timeMs = Math.max(0, this._lastTimeMs - diffMs);
      if (this._timeMs === 0 && this._byoyomi > 0) {
        const consumedByoyomi = Math.ceil((diffMs - this._lastTimeMs) / 1000);
        this._byoyomi = Math.max(0, this._byoyomi - consumedByoyomi);
      }
      if (this._timeLimitMode === "total") {
        this._totalElapsedMs += diffMs;
      }
      this._startTimestamp = 0;
    }
  }

  /** 一手消費後の時計処理（Clock.stop() + increment + Clock.start() 相当） */
  advanceClockAfterMove(isPlayerMove: boolean): void {
    if (this._timeLimitMode === "none") {
      return;
    }
    this.stopTimer();

    if (isPlayerMove && this._timeLimitSettings.increment > 0) {
      if (this._timeLimitMode === "perProblem") {
        this._timeMs += this._timeLimitSettings.increment * 1000;
      } else if (this._timeLimitMode === "total") {
        this._totalFisherMs += this._timeLimitSettings.increment * 1000;
      }
    }

    if (this._timeLimitSettings.byoyomi > 0) {
      if (
        this._timeLimitMode === "perProblem" ||
        (this._timeLimitMode === "total" && this.totalTimeMs > 0)
      ) {
        this._byoyomi = this._timeLimitSettings.byoyomi;
      }
    }

    this._startTimestamp = Date.now();
    this._lastTimeMs = this._timeMs;
    this._timerHandle = setInterval(() => {
      this.updateTimer();
    }, 200);
  }

  /** プレイヤーの指し手を反映し、タイマーを停止させ、フィッシャー加算を適用する */
  stopTimerAndApplyIncrement(): void {
    if (this._timeLimitMode === "none") {
      return;
    }
    this.stopTimer();
    if (this._timeLimitSettings.increment > 0) {
      if (this._timeLimitMode === "perProblem") {
        this._timeMs += this._timeLimitSettings.increment * 1000;
      } else if (this._timeLimitMode === "total") {
        this._totalFisherMs += this._timeLimitSettings.increment * 1000;
      }
    }
    if (this._timeLimitSettings.byoyomi > 0) {
      this._byoyomi = this._timeLimitSettings.byoyomi;
    }
    this.notifyTimerUpdate();
  }

  /** タイマー状態をリセット（停止して初期値に戻す） */
  resetTimer(): void {
    this.stopTimer();
    this._timeMs = 0;
    this._byoyomi = 0;
    this._totalElapsedMs = 0;
    this._totalFisherMs = 0;
    this._startTimestamp = 0;
  }

  /** タイマー情報を通知 */
  notifyTimerUpdate(extraTotalTimeMs?: number): void {
    if (this._onTimerUpdate) {
      this._onTimerUpdate(
        this._timeMs,
        this._byoyomi,
        this._timeLimitMode,
        undefined, // memorizePlayerColorは外部から設定
        extraTotalTimeMs !== undefined ? extraTotalTimeMs : this.totalTimeMs,
      );
    }
  }

  private updateTimer(): void {
    if (!this._startTimestamp) {
      return;
    }

    const diffMs = Date.now() - this._startTimestamp;
    const remainingMs = this._lastTimeMs - diffMs;

    if (remainingMs >= 0) {
      this._timeMs = remainingMs;
    } else {
      this._timeMs = 0;
      this._byoyomi = Math.max(
        0,
        Math.ceil((this._timeLimitSettings.byoyomi || 0) + remainingMs / 1000),
      );
    }

    if (this._timeLimitMode === "perProblem") {
      if (this._timeMs === 0 && this._byoyomi === 0) {
        this._onPerProblemTimeUp?.();
        return;
      }
    }

    if (this._timeLimitMode === "total") {
      const totalRemainingMs = this.totalTimeMs;
      if (totalRemainingMs > 0) {
        this._timeMs = totalRemainingMs;
        this._byoyomi = this._timeLimitSettings.byoyomi;
      } else {
        this._timeMs = 0;
        const limitMs = this._timeLimitSettings.timeSeconds * 1000 + this._totalFisherMs;
        const elapsedMs = this._totalElapsedMs + diffMs;
        const overdraftMs = elapsedMs - limitMs;
        this._byoyomi = Math.max(
          0,
          Math.ceil(this._timeLimitSettings.byoyomi - overdraftMs / 1000),
        );
      }

      if (this._timeMs === 0 && this._byoyomi === 0) {
        this._onTotalTimeUp?.();
        return;
      }
    }

    if (this._onTimerUpdate) {
      this._onTimerUpdate(
        this._timeMs,
        this._byoyomi,
        this._timeLimitMode,
        undefined,
        this.totalTimeMs,
      );
    }
  }
}
