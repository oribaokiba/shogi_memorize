<template>
  <div class="memorize-panel full column">
    <!-- ファイルインポートエリア -->
    <div class="import-area card shrink">
      <div class="import-row row align-center">
        <span class="label">定跡KIFインポート:</span>
        <input type="file" accept=".kif,.kifu" @change="onFileChange" class="file-input" />
      </div>
    </div>

    <!-- 問題が読み込まれている場合 -->
    <div v-if="store.memorizeProblems.length > 0" class="problem-section card shrink">
      <!-- 問題選択（セレクトボックス） -->
      <div class="row align-center problem-select-row">
        <span class="setting-label">問題:</span>
        <select
          class="problem-select"
          :value="store.currentProblemIndex"
          @change="onSelectProblem"
        >
          <option v-for="(problem, idx) in store.memorizeProblems" :key="idx" :value="idx">
            {{ idx + 1 }}. {{ problem.name }} ({{ problem.moves.length }}手)
          </option>
        </select>
      </div>

      <!-- 手番設定 -->
      <div class="row align-center setting-row">
        <span class="setting-label">自分の手番:</span>
        <div class="toggle-group">
          <button
            class="toggle-btn"
            :class="{ active: selectedColor === undefined }"
            :disabled="store.isMemorizeProcessing"
            @click="changePlayerColor(undefined)"
          >
            デフォルト
          </button>
          <button
            class="toggle-btn"
            :class="{ active: selectedColor === Color.BLACK }"
            :disabled="store.isMemorizeProcessing"
            @click="changePlayerColor(Color.BLACK)"
          >
            先手 (▲)
          </button>
          <button
            class="toggle-btn"
            :class="{ active: selectedColor === Color.WHITE }"
            :disabled="store.isMemorizeProcessing"
            @click="changePlayerColor(Color.WHITE)"
          >
            後手 (△)
          </button>
        </div>
      </div>
    </div>

    <!-- 暗記コントロール -->
    <div v-if="store.currentProblem" class="controls-card card shrink">
      <!-- 手番 & 進捗 -->
      <div class="status-row row align-center">
        <span class="status-item">
          <span class="status-label">手番:</span>
          <span class="status-value" :class="playerColorClass">
            {{ actualPlayerColor === Color.BLACK ? '先手 (▲)' : '後手 (△)' }}
          </span>
        </span>
        <span class="status-item">
          <span class="status-label">進捗:</span>
          <span class="status-value">
            {{ store.memorizeStep }} / {{ store.currentProblem.moves.length }}手
          </span>
        </span>
      </div>

      <!-- プログレスバー -->
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <!-- アクションボタン -->
      <div class="action-buttons row">
        <button
          class="btn btn-primary"
          :disabled="store.isMemorizeProcessing"
          @click="restart"
        >
          最初からやり直す
        </button>
        <button
          class="btn btn-secondary"
          :disabled="isCleared || store.isMemorizeProcessing"
          @click="store.giveUpMemorize()"
        >
          ギブアップ (1手進める)
        </button>
      </div>

      <div v-if="isCleared" class="clear-message">
        🎉 クリアしました！
      </div>
    </div>

    <!-- 問題がまだ読み込まれていない場合 -->
    <div v-if="store.memorizeProblems.length === 0" class="empty-area column grow">
      <div class="empty-message">
        練習したい定跡のKIFファイルをインポートしてください。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import { Color } from "tsshogi";

const store = useStore();

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    loadKIFFile(target.files[0]);
  }
};

const onFileDrop = (event: DragEvent) => {
  event.stopPropagation();
  event.preventDefault();
  if (event.dataTransfer && event.dataTransfer.files[0]) {
    loadKIFFile(event.dataTransfer.files[0]);
  }
};

const loadKIFFile = (file: File) => {
  // まず Shift-JIS として読み込み、失敗したら UTF-8 でリトライする
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (text) {
      const err = store.importKIFForMemorize(text);
      if (err) {
        const reader2 = new FileReader();
        reader2.onload = (e2) => {
          const text2 = e2.target?.result as string;
          if (text2) {
            const err2 = store.importKIFForMemorize(text2);
            if (err2) {
              alert("KIFのインポートに失敗しました: " + err2.message);
            }
          }
        };
        reader2.readAsText(file, "utf-8");
      }
    }
  };
  reader.readAsText(file, "shift-jis");
};

const onSelectProblem = (event: Event) => {
  const idx = parseInt((event.target as HTMLSelectElement).value, 10);
  store.startMemorizeProblem(idx, store.memorizePlayerColor);
};

const selectedColor = computed(() => store.memorizePlayerColor);

const actualPlayerColor = computed(() => {
  if (!store.currentProblem) return Color.BLACK;
  return store.memorizePlayerColor !== undefined
    ? store.memorizePlayerColor
    : store.currentProblem.playerColor;
});

const progressPercent = computed(() => {
  if (!store.currentProblem) return 0;
  return (store.memorizeStep / store.currentProblem.moves.length) * 100;
});

const isCleared = computed(() => {
  if (!store.currentProblem) return false;
  return store.memorizeStep >= store.currentProblem.moves.length;
});

const playerColorClass = computed(() => {
  return actualPlayerColor.value === Color.BLACK ? "sente" : "gote";
});

const changePlayerColor = (color: Color | undefined) => {
  if (store.currentProblemIndex !== -1) {
    store.startMemorizeProblem(store.currentProblemIndex, color);
  }
};

const restart = () => {
  if (store.currentProblemIndex !== -1) {
    store.startMemorizeProblem(store.currentProblemIndex, store.memorizePlayerColor);
  }
};

// onFileDrop は import-area が消えたので残しておくが実際には使われない（念のため保持）
void onFileDrop;
</script>

<style scoped>
.memorize-panel {
  padding: 8px;
  background-color: var(--main-bg-color);
  color: var(--main-color);
  overflow: auto;
  gap: 6px;
}
.card {
  background-color: var(--panel-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 12px;
}
.import-area {
  padding: 6px 12px;
}
.import-row {
  gap: 10px;
  align-items: center;
}
.label {
  white-space: nowrap;
  font-size: 0.9rem;
}
.file-input {
  color: var(--main-color);
  font-size: 0.85rem;
  flex: 1;
}
.problem-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.problem-select-row {
  gap: 8px;
}
.problem-select {
  flex: 1;
  padding: 4px 8px;
  background: var(--button-bg-color);
  border: 1px solid var(--border-color);
  color: var(--main-color);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}
.setting-row {
  gap: 8px;
}
.setting-label {
  font-weight: bold;
  white-space: nowrap;
  font-size: 0.85rem;
}
.toggle-group {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}
.toggle-btn {
  padding: 4px 10px;
  background: var(--button-bg-color);
  border: none;
  border-right: 1px solid var(--border-color);
  color: var(--main-color);
  cursor: pointer;
  font-size: 0.82rem;
}
.toggle-btn:last-child {
  border-right: none;
}
.toggle-btn:hover:not(:disabled) {
  background: var(--button-hover-bg-color);
}
.toggle-btn.active {
  background: var(--button-active-bg-color);
  font-weight: bold;
}
.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.controls-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.status-row {
  gap: 20px;
  flex-wrap: wrap;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
}
.status-label {
  font-weight: bold;
  color: var(--text-color-muted);
}
.status-value.sente {
  color: #ff4500;
  font-weight: bold;
}
.status-value.gote {
  color: #1e90ff;
  font-weight: bold;
}
.progress-bar-container {
  background: var(--border-color);
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar {
  background: var(--accent-color, #4caf50);
  height: 100%;
  transition: width 0.3s ease;
}
.action-buttons {
  gap: 10px;
}
.btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.88rem;
  cursor: pointer;
  border: none;
}
.btn-primary {
  background: #2196f3;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background: #1e88e5;
}
.btn-primary:disabled {
  background: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
.btn-secondary {
  background: #9e9e9e;
  color: white;
}
.btn-secondary:disabled {
  background: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
.btn-secondary:not(:disabled):hover {
  background: #757575;
}
.clear-message {
  font-size: 1.1rem;
  font-weight: bold;
  color: #4caf50;
  text-align: center;
}
.empty-area {
  justify-content: center;
  align-items: center;
  border: 2px dashed var(--border-color);
  border-radius: 4px;
  min-height: 60px;
}
.empty-message {
  font-size: 1rem;
  color: var(--text-color-muted);
  text-align: center;
  padding: 12px;
}
.row {
  display: flex;
  flex-direction: row;
}
.column {
  display: flex;
  flex-direction: column;
}
.align-center {
  align-items: center;
}
.shrink {
  flex-shrink: 0;
}
.grow {
  flex: 1;
}
</style>
