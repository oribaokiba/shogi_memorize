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

const store = useStore();

const isRandomOrder = ref(store.dialogRandomOrder);
const maxQuestions = ref(store.dialogMaxQuestions);
const skipCommonMoves = ref(store.dialogSkipCommonMoves);

const canStart = computed(() => {
  return (store.memorizeCollection?.problems.length ?? 0) > 0;
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

const onStart = async () => {
  store.dialogRandomOrder = isRandomOrder.value;
  store.dialogMaxQuestions = maxQuestions.value;
  store.dialogSkipCommonMoves = skipCommonMoves.value;
  store.closeMemorizeSolveDialog();
  await store.startSolveSession();
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
