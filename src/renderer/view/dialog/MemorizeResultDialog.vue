<template>
  <DialogFrame @cancel="onClose">
    <div class="title">結果</div>

    <div class="dialog-scroll">
      <!-- 各問題の結果（perProblemモード） -->
      <template v-if="store.memorizeResultDialogMode === 'perProblem'">
        <div class="result-section">
          <div class="result-label">問題</div>
          <div class="problem-name">{{ currentProblemName }}</div>
          <div class="problem-stats">
            <div class="stats-item">
              <span class="stats-label">正解</span>
              <span class="stats-value"
                >{{ store.problemCorrectMoves }} / {{ store.problemTotalPlayerMoves }} 手</span
              >
            </div>
            <div class="stats-item">
              <span class="stats-label">不正解</span>
              <span class="stats-value">{{ store.problemWrongMoves }} 手</span>
            </div>
            <div class="stats-item">
              <span class="stats-label">正解率</span>
              <span class="stats-value">{{ store.problemAccuracy }}%</span>
            </div>
            <div class="stats-item">
              <span class="stats-label">ヒント使用</span>
              <span class="stats-value">{{ store.problemHintCount }} 回</span>
            </div>
            <div class="stats-item">
              <span class="stats-label">次の手使用</span>
              <span class="stats-value">{{ store.problemGiveUpCount }} 回</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 全体の結果（overallモード） -->
      <template v-if="store.memorizeResultDialogMode === 'overall'">
        <div class="stats-section">
          <div class="stats-title">全体結果</div>
          <div class="stats-item">
            <span class="stats-label">正解</span>
            <span class="stats-value"
              >{{ store.memorizeCorrectCount }} / {{ store.memorizeTotalQuestions }} 手</span
            >
          </div>
          <div class="stats-item">
            <span class="stats-label">不正解</span>
            <span class="stats-value">{{ store.memorizeWrongCount }} 手</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">正解率</span>
            <span class="stats-value">{{ store.memorizeAccuracy }}%</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">ヒント使用</span>
            <span class="stats-value">{{ store.memorizeHintCount }} 回</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">次の手使用</span>
            <span class="stats-value">{{ store.memorizeGiveUpCount }} 回</span>
          </div>
        </div>
      </template>
    </div>

    <div class="main-buttons">
      <!-- perProblemモード -->
      <template v-if="store.memorizeResultDialogMode === 'perProblem'">
        <button class="start-btn" @click="onRetry">再挑戦</button>
        <button v-if="!isLastProblem" class="start-btn" @click="onNextProblem">次の問題へ</button>
        <button class="stop-btn" @click="onEndSolve">解答終了</button>
      </template>
      <!-- overallモード -->
      <template v-else>
        <button class="start-btn" @click="onClose">閉じる</button>
      </template>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const currentProblemName = computed(() => {
  const p = store.currentCollectionProblem;
  return p ? p.name : "";
});

const isLastProblem = computed(() => {
  return store.solveIndex >= store.solveTotal - 1;
});

const onRetry = async () => {
  store.closeMemorizeResultDialog();
  await store.startCurrentSolveProblem();
};

const onNextProblem = async () => {
  store.closeMemorizeResultDialog();
  const hasNext = await store.nextProblem();
  // 全問終了時（nextProblemがfalseを返した時）は全体結果を表示
  if (
    !hasNext &&
    store.memorizeCorrectCount + store.memorizeWrongCount + store.memorizeGiveUpCount > 0
  ) {
    store.showMemorizeResultDialog("overall");
  }
};

const onEndSolve = () => {
  store.closeMemorizeResultDialog();
  // 全体結果を表示
  store.showMemorizeResultDialog("overall");
};

const onClose = () => {
  store.closeMemorizeResultDialog();
  store.endSolveSession();
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
.result-section {
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--text-separator-color);
  border-radius: 4px;
  background: var(--button-active-bg-color);
}
.result-label {
  font-size: 0.82em;
  color: var(--text-color-muted);
  margin-bottom: 2px;
}
.problem-name {
  font-size: 0.95em;
  font-weight: bold;
  margin-bottom: 6px;
}
.result-status {
  font-size: 1.1em;
  font-weight: bold;
  text-align: center;
  padding: 6px 0;
}
.result-success {
  color: #4caf50;
}
.result-giveup {
  color: #e67e22;
}
.problem-stats {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--text-separator-color);
}
.stats-section {
  padding: 8px;
}
.stats-title {
  font-size: 0.9em;
  font-weight: bold;
  margin-bottom: 6px;
}
.stats-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid var(--text-separator-color);
  font-size: 0.85em;
}
.stats-item:last-of-type {
  border-bottom: none;
}
.stats-label {
  color: var(--text-color-muted);
}
.stats-value {
  font-weight: bold;
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
.start-btn {
  border-color: #4caf50 !important;
  color: #4caf50 !important;
}
.start-btn:hover {
  background-color: #4caf50 !important;
  color: white !important;
}
.stop-btn {
  border-color: #c0392b !important;
  color: #c0392b !important;
}
.stop-btn:hover {
  background-color: #c0392b !important;
  color: white !important;
}
</style>
