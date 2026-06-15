<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">定跡暗記 - 解答設定</div>

    <div class="dialog-scroll">
      <!-- タイトル -->
      <div class="form-item">
        <span class="title-label">{{ store.memorizeCollection?.title }}</span>
      </div>

      <!-- 出題順 -->
      <div class="form-item">
        <span class="form-label">出題順</span>
        <ToggleButton
          :value="isRandomOrder"
          :label="isRandomOrder ? 'ランダム' : '順序通り'"
          @update:value="onChangeRandomOrder"
        />
      </div>

      <!-- 出題数 -->
      <div class="form-item">
        <span class="form-label">出題数</span>
        <input
          type="number"
          :value="maxQuestions"
          min="0"
          max="999"
          class="form-input-number"
          @change="onChangeMaxQuestions"
        />
        <span class="form-suffix">（0=全て）</span>
      </div>

      <!-- 共通手順のスキップ -->
      <div class="form-item">
        <span class="form-label">共通手順のスキップ</span>
        <ToggleButton
          :value="skipCommonMoves"
          :label="skipCommonMoves ? 'スキップする' : 'スキップしない'"
          @update:value="onChangeSkipCommonMoves"
        />
      </div>

      <!-- 持ち時間セクション -->
      <div class="form-section-label">持ち時間設定</div>

      <div class="form-item">
        <span class="form-label">持ち時間</span>
        <ToggleButton
          :value="useTimeLimit"
          :label="useTimeLimit ? '使用する' : '使用しない'"
          @update:value="onChangeUseTimeLimit"
        />
      </div>

      <template v-if="useTimeLimit">
        <div class="form-item">
          <span class="form-label">適用範囲</span>
          <ToggleButton
            :value="timeLimitMode === 'total'"
            :label="timeLimitMode === 'total' ? '問題集全体' : '各問題ごと'"
            @update:value="onChangeTimeLimitMode"
          />
        </div>

        <div class="form-item">
          <span class="form-label">持ち時間</span>
          <input
            type="number"
            :value="timeMinutes"
            min="0"
            max="999"
            class="form-input-number"
            @input="onChangeTimeMinutes"
          />
          <span class="form-suffix">分</span>
          <input
            type="number"
            :value="timeSeconds"
            min="0"
            max="59"
            class="form-input-number"
            @input="onChangeTimeSeconds"
          />
          <span class="form-suffix">秒</span>
        </div>

        <div class="form-item">
          <span class="form-label">秒読み</span>
          <input
            type="number"
            :value="byoyomiMinutes"
            min="0"
            max="99"
            class="form-input-number"
            @input="onChangeByoyomiMinutes"
          />
          <span class="form-suffix">分</span>
          <input
            type="number"
            :value="byoyomiSeconds"
            min="0"
            max="59"
            class="form-input-number"
            @input="onChangeByoyomiSeconds"
          />
          <span class="form-suffix">秒</span>
        </div>

        <div class="form-item">
          <span class="form-label">加算</span>
          <input
            type="number"
            :value="incrementMinutes"
            min="0"
            max="99"
            class="form-input-number"
            @input="onChangeIncrementMinutes"
          />
          <span class="form-suffix">分</span>
          <input
            type="number"
            :value="incrementSeconds"
            min="0"
            max="59"
            class="form-input-number"
            @input="onChangeIncrementSeconds"
          />
          <span class="form-suffix">秒</span>
        </div>
      </template>
    </div>

    <div class="main-buttons">
      <button class="start-btn" :disabled="!canStart" @click="onStart">解答スタート</button>
      <button data-hotkey="Escape" @click="onCancel">キャンセル</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import DialogFrame from "./DialogFrame.vue";
import type { TimeLimitMode } from "@/renderer/store/memorize.js";

const store = useStore();

const isRandomOrder = ref(store.dialogRandomOrder);
const maxQuestions = ref(store.dialogMaxQuestions);
const skipCommonMoves = ref(store.dialogSkipCommonMoves);
const useTimeLimit = ref(store.dialogUseTimeLimit);
const timeLimitMode = ref<TimeLimitMode>(store.dialogTimeLimitMode);

// 持ち時間（秒→分/秒に変換）
const timeLimitTotalSeconds = ref(store.dialogTimeLimitSettings.timeSeconds);
const byoyomiSeconds_ = ref(store.dialogTimeLimitSettings.byoyomi);
const incrementSeconds_ = ref(store.dialogTimeLimitSettings.increment);

const timeMinutes = computed(() => Math.floor(timeLimitTotalSeconds.value / 60));
const timeSeconds = computed(() => timeLimitTotalSeconds.value % 60);
const byoyomiMinutes = computed(() => Math.floor(byoyomiSeconds_.value / 60));
const byoyomiSeconds = computed(() => byoyomiSeconds_.value % 60);
const incrementMinutes = computed(() => Math.floor(incrementSeconds_.value / 60));
const incrementSeconds = computed(() => incrementSeconds_.value % 60);

const canStart = computed(() => {
  const hasProblems = (store.memorizeCollection?.problems.length ?? 0) > 0;
  if (!hasProblems) {
    return false;
  }
  if (useTimeLimit.value) {
    const totalLimit = timeLimitTotalSeconds.value + byoyomiSeconds_.value + incrementSeconds_.value;
    return totalLimit > 0;
  }
  return true;
});

const onChangeRandomOrder = (v: boolean) => {
  isRandomOrder.value = v;
  store.dialogRandomOrder = v;
};

const onChangeMaxQuestions = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  maxQuestions.value = isNaN(val) || val < 0 ? 0 : val;
  store.dialogMaxQuestions = maxQuestions.value;
};

const onChangeSkipCommonMoves = (v: boolean) => {
  skipCommonMoves.value = v;
  store.dialogSkipCommonMoves = skipCommonMoves.value;
};

const onChangeUseTimeLimit = (v: boolean) => {
  useTimeLimit.value = v;
  store.dialogUseTimeLimit = v;
};

const onChangeTimeLimitMode = (v: boolean) => {
  // toggle: false=perProblem, true=total
  timeLimitMode.value = v ? "total" : "perProblem";
  store.dialogTimeLimitMode = timeLimitMode.value;
};

const updateTimeLimitSettings = () => {
  store.dialogTimeLimitSettings = {
    timeSeconds: timeLimitTotalSeconds.value,
    byoyomi: byoyomiSeconds_.value,
    increment: incrementSeconds_.value,
  };
};

const onChangeTimeMinutes = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const m = isNaN(val) || val < 0 ? 0 : val;
  timeLimitTotalSeconds.value = m * 60 + (timeLimitTotalSeconds.value % 60);
  updateTimeLimitSettings();
};

const onChangeTimeSeconds = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const s = isNaN(val) || val < 0 ? 0 : Math.min(val, 59);
  timeLimitTotalSeconds.value = Math.floor(timeLimitTotalSeconds.value / 60) * 60 + s;
  updateTimeLimitSettings();
};

const onChangeByoyomiMinutes = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const m = isNaN(val) || val < 0 ? 0 : val;
  byoyomiSeconds_.value = m * 60 + (byoyomiSeconds_.value % 60);
  updateTimeLimitSettings();
};

const onChangeByoyomiSeconds = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const s = isNaN(val) || val < 0 ? 0 : Math.min(val, 59);
  byoyomiSeconds_.value = Math.floor(byoyomiSeconds_.value / 60) * 60 + s;
  updateTimeLimitSettings();
};

const onChangeIncrementMinutes = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const m = isNaN(val) || val < 0 ? 0 : val;
  incrementSeconds_.value = m * 60 + (incrementSeconds_.value % 60);
  updateTimeLimitSettings();
};

const onChangeIncrementSeconds = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  const s = isNaN(val) || val < 0 ? 0 : Math.min(val, 59);
  incrementSeconds_.value = Math.floor(incrementSeconds_.value / 60) * 60 + s;
  updateTimeLimitSettings();
};

const onStart = async () => {
  store.dialogRandomOrder = isRandomOrder.value;
  store.dialogMaxQuestions = maxQuestions.value;
  store.dialogSkipCommonMoves = skipCommonMoves.value;
  store.dialogUseTimeLimit = useTimeLimit.value;
  store.dialogTimeLimitMode = timeLimitMode.value;
  store.dialogTimeLimitSettings = {
    timeSeconds: timeLimitTotalSeconds.value,
    byoyomi: byoyomiSeconds_.value,
    increment: incrementSeconds_.value,
  };
  store.closeMemorizeSolveDialog();
  await store.startSolveSession();
  // ダイアログを閉じた後にタイマー開始（ダイアログ中に時間消費されるのを防ぐ）
  store.startMemorizeTimer();
};

const onCancel = () => {
  store.closeMemorizeSolveDialog();
};
</script>

<style scoped>
.title {
  font-size: 1.1em;
  font-weight: bold;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--text-separator-color);
  margin-bottom: 8px;
}
.dialog-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 100px;
  max-height: calc(80vh - 150px);
}
.form-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--text-separator-color);
  flex-shrink: 0;
  flex-wrap: wrap;
  background: var(--main-bg-color);
}
.form-section-label {
  font-size: 0.82em;
  font-weight: bold;
  color: var(--text-color-muted);
  padding: 8px 8px 4px;
  border-bottom: 1px solid var(--text-separator-color);
  background: var(--main-bg-color);
}
.form-label {
  font-size: 0.82em;
  color: var(--text-color-muted);
  white-space: nowrap;
  min-width: 80px;
}
.title-label {
  font-size: 0.9em;
  font-weight: bold;
  color: var(--text-color);
}
.form-input-number {
  width: 48px;
  padding: 1px 3px;
  background: var(--main-bg-color);
  border: 1px solid var(--text-separator-color);
  color: var(--text-color);
  font-size: 0.85em;
  text-align: center;
}
.form-suffix {
  font-size: 0.82em;
  color: var(--text-color-muted);
  white-space: nowrap;
}
.main-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--text-separator-color);
}
.main-buttons button {
  min-width: 100px;
  height: 30px;
  font-size: 0.9em;
  cursor: pointer;
  border: 1px solid var(--text-separator-color);
  background-color: var(--button-bg-color);
  color: var(--main-color);
  border-radius: 3px;
  font-weight: bold;
}
.main-buttons button:hover {
  background-color: var(--button-hover-bg-color);
}
.main-buttons button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.main-buttons button:disabled:hover {
  background-color: var(--button-bg-color);
}
.start-btn {
  border-color: #4caf50 !important;
  color: #4caf50 !important;
}
.start-btn:hover {
  background-color: #4caf50 !important;
  color: white !important;
}
</style>
