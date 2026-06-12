<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">定跡暗記 - 問題を解く</div>

    <div class="dialog-scroll">
      <!-- タイトル -->
      <div class="form-item">
        <span class="title-label">{{ store.memorizeCollection?.title }}</span>
      </div>

      <!-- 設定 -->
      <div class="form-item">
        <span class="form-label">出題順</span>
        <ToggleButton
          :value="isRandomOrder"
          :label="isRandomOrder ? 'ランダム' : '順序通り'"
          @update:value="
            (v: boolean) => {
              isRandomOrder = v;
              buildSolveOrder();
            }
          "
        />
      </div>
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

      <!-- 問題一覧 -->
      <div class="list-area">
        <div class="list-label">問題一覧（{{ store.memorizeCollection?.problems.length }}問）</div>
        <div class="list">
          <div
            v-for="(problem, idx) in store.memorizeCollection?.problems"
            :key="idx"
            class="item"
            :class="{ current: currentSolveIndex === idx }"
            @click="startSolveProblem(idx)"
          >
            <span class="idx">{{ idx + 1 }}</span>
            <span class="name">{{ problem.name }}</span>
            <span class="moves">{{ problem.moves.length }}手</span>
          </div>
        </div>
      </div>

      <!-- 解答エリア -->
      <div v-if="currentSolveProblem" class="solve-area">
        <div class="solve-header">
          <span class="solve-name">{{ currentSolveProblem.name }}</span>
          <span class="solve-step"
            >{{ store.memorizeStep }} / {{ currentSolveProblem.moves.length }}手</span
          >
        </div>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: solveProgressPercent + '%' }"></div>
        </div>
        <div v-if="hintVisible && store.currentHint" class="hint-area">
          <Icon :icon="IconType.HELP" />
          <span class="hint-text">{{ store.currentHint }}</span>
        </div>
        <div class="solve-btns">
          <button class="ctrl-btn" :disabled="!hasHint || isSolveCleared" @click="showHint">
            <Icon :icon="IconType.HELP" /><span>ヒント</span>
          </button>
          <button class="ctrl-btn" @click="restartSolveProblem">
            <Icon :icon="IconType.REFRESH" /><span>最初から</span>
          </button>
          <button class="ctrl-btn" :disabled="isSolveCleared" @click="giveUpSolveProblem">
            <Icon :icon="IconType.END" /><span>ギブアップ</span>
          </button>
        </div>
        <div v-if="isSolveCleared" class="clear">
          <Icon :icon="IconType.CHECK" /><span>クリアしました！</span>
        </div>
      </div>
    </div>

    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">閉じる</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const isRandomOrder = ref(false);
const maxQuestions = ref(0);
const currentSolveOrder = ref<number[]>([]);
const currentSolveOrderIdx = ref(0);

const currentSolveIndex = computed(() => {
  if (currentSolveOrder.value.length === 0) {
    return -1;
  }
  return currentSolveOrder.value[currentSolveOrderIdx.value] ?? -1;
});

const currentSolveProblem = computed(() => {
  const idx = currentSolveIndex.value;
  if (idx < 0 || !store.memorizeCollection) {
    return null;
  }
  return store.memorizeCollection.problems[idx] ?? null;
});

const solveProgressPercent = computed(() => {
  const p = currentSolveProblem.value;
  if (!p || p.moves.length === 0) {
    return 0;
  }
  return (store.memorizeStep / p.moves.length) * 100;
});

const isSolveCleared = computed(() => {
  const p = currentSolveProblem.value;
  if (!p || p.moves.length === 0) {
    return false;
  }
  return store.memorizeStep >= p.moves.length;
});

const buildSolveOrder = () => {
  if (!store.memorizeCollection) {
    currentSolveOrder.value = [];
    currentSolveOrderIdx.value = 0;
    return;
  }
  const count = store.memorizeCollection.problems.length;
  const indices = Array.from({ length: count }, (_, i) => i);
  if (isRandomOrder.value) {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }
  const max = maxQuestions.value > 0 ? Math.min(maxQuestions.value, count) : count;
  currentSolveOrder.value = indices.slice(0, max);
  currentSolveOrderIdx.value = 0;
};

const onChangeMaxQuestions = (event: Event) => {
  const val = parseInt((event.target as HTMLInputElement).value, 10);
  maxQuestions.value = isNaN(val) || val < 0 ? 0 : val;
  buildSolveOrder();
};

const startSolveProblem = (collectionIdx: number) => {
  if (!store.memorizeCollection) {
    return;
  }
  const count = store.memorizeCollection.problems.length;
  const indices = Array.from({ length: count }, (_, i) => i);
  const startPos = indices.indexOf(collectionIdx);
  if (startPos < 0) {
    return;
  }

  if (isRandomOrder.value) {
    const rest = indices.filter((i) => i !== collectionIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const max = maxQuestions.value > 0 ? Math.min(maxQuestions.value, count) : count;
    currentSolveOrder.value = [collectionIdx, ...rest].slice(0, max);
  } else {
    const max = maxQuestions.value > 0 ? Math.min(maxQuestions.value, count) : count;
    currentSolveOrder.value = indices.slice(startPos, startPos + max);
  }
  currentSolveOrderIdx.value = 0;

  const problem = store.memorizeCollection.problems[collectionIdx];
  if (problem) {
    store.startMemorizeFromNewProblem(problem);
  }
};

const restartSolveProblem = () => {
  const p = currentSolveProblem.value;
  if (p) {
    store.startMemorizeFromNewProblem(p);
  }
};

const giveUpSolveProblem = () => {
  store.giveUpMemorize();
};

// === ヒント ===
const hintVisible = ref(false);

const hasHint = computed(() => {
  if (!currentSolveProblem.value || !currentSolveProblem.value.hints) {
    return false;
  }
  return currentSolveProblem.value.hints.length > 0;
});

const showHint = () => {
  hintVisible.value = true;
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
  min-height: 200px;
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
  min-width: 50px;
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
.list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100px;
}
.list-label {
  flex-shrink: 0;
  font-size: 0.82em;
  color: var(--text-color-muted);
  padding: 3px 8px;
  background: var(--main-bg-color);
  border-bottom: 1px solid var(--text-separator-color);
}
.list {
  flex: 1;
  overflow-y: auto;
  max-height: 200px;
  border-bottom: 1px solid var(--text-separator-color);
}
.item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.88em;
}
.item:hover {
  background: var(--button-hover-bg-color);
}
.item.current {
  background: var(--button-active-bg-color);
  font-weight: bold;
}
.item .idx {
  width: 22px;
  text-align: center;
  font-size: 0.82em;
  color: var(--text-color-muted);
  flex-shrink: 0;
}
.item .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item .moves {
  font-size: 0.82em;
  color: var(--text-color-muted);
  flex-shrink: 0;
}
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  border-radius: 2px;
  font-size: 0.82em;
  cursor: pointer;
  border: 1px solid var(--text-separator-color);
  background-color: var(--button-bg-color);
  color: var(--main-color);
  font-weight: bold;
  padding: 0 10px;
  white-space: nowrap;
}
.ctrl-btn:hover {
  background-color: var(--button-hover-bg-color);
}
.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ctrl-btn:disabled:hover {
  background-color: var(--button-bg-color);
}
.ctrl-btn .icon {
  height: 16px;
  width: auto;
  flex-shrink: 0;
  display: inline-block;
}
.solve-area {
  flex-shrink: 0;
  padding: 6px 8px;
  border-top: 1px solid var(--text-separator-color);
  background: var(--main-bg-color);
}
.solve-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88em;
}
.solve-step {
  margin-left: auto;
  color: var(--text-color-muted);
  font-size: 0.88em;
}
.bar-track {
  background: var(--text-separator-color);
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  margin: 4px 0;
}
.bar-fill {
  background: var(--tab-highlight-color, #1e90ff);
  height: 100%;
  transition: width 0.3s ease;
}
.hint-area {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0;
  padding: 4px 6px;
  background: var(--button-active-bg-color);
  border-radius: 3px;
  font-size: 0.85em;
}
.hint-area .icon {
  height: 16px;
  width: auto;
  flex-shrink: 0;
  display: inline-block;
}
.hint-text {
  color: var(--text-color);
}
.solve-btns {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.solve-btns .ctrl-btn {
  flex: 1;
}
.clear {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 1em;
  font-weight: bold;
  color: #4caf50;
  margin-top: 6px;
}
.clear .icon {
  height: 18px;
  width: auto;
  display: inline-block;
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
</style>
