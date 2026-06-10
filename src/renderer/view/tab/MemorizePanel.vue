<template>
  <div class="memorize-panel full column">
    <!-- ヘッダー -->
    <div class="section header-section">
      <div class="row align-center space-between">
        <label class="section-label no-margin">定跡暗記</label>
        <button class="btn-close" @click="closeMemorize">✕</button>
      </div>
    </div>

    <!-- ファイルインポートエリア -->
    <div class="section">
      <label class="section-label">定跡KIFファイル</label>
      <input type="file" accept=".kif,.kifu" @change="onFileChange" class="file-input" />
    </div>

    <!-- 問題がまだ読み込まれていない場合 -->
    <div v-if="store.memorizeProblems.length === 0" class="section">
      <p class="hint-text">練習したい定跡のKIFファイルをインポートしてください。</p>
    </div>

    <!-- 問題が読み込まれている場合 -->
    <template v-if="store.memorizeProblems.length > 0">
      <!-- 問題選択 -->
      <div class="section">
        <label class="section-label">問題</label>
        <select
          class="problem-select"
          :value="store.currentProblemIndex"
          @change="onSelectProblem"
        >
          <option value="-1" disabled>問題を選択</option>
          <option v-for="(problem, idx) in store.memorizeProblems" :key="idx" :value="idx">
            {{ idx + 1 }}. {{ problem.name }} ({{ problem.moves.length }}手)
          </option>
        </select>
      </div>

      <!-- 手番設定 -->
      <div class="section">
        <label class="section-label">自分の手番</label>
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

      <!-- 暗記中の表示 -->
      <div v-if="hasProblem" class="section">
        <div class="status-row">
          <span class="status-label">手番:</span>
          <span class="status-value" :class="playerColorClass">
            {{ actualPlayerColor === Color.BLACK ? '先手 (▲)' : '後手 (△)' }}
          </span>
        </div>
        <div class="status-row">
          <span class="status-label">進捗:</span>
          <span class="status-value">
            {{ store.memorizeStep }} / {{ totalMoves }}手
          </span>
        </div>

        <!-- プログレスバー -->
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>

        <!-- アクションボタン -->
        <div class="action-buttons">
          <button
            class="btn btn-restart"
            :disabled="store.isMemorizeProcessing"
            @click="restart"
          >
            最初から
          </button>
          <button
            class="btn btn-giveup"
            :disabled="isCleared || store.isMemorizeProcessing"
            @click="store.giveUpMemorize()"
          >
            ギブアップ
          </button>
        </div>

        <div v-if="isCleared" class="clear-message">
          🎉 クリアしました！
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { Color } from "tsshogi";
import { Tab } from "@/common/settings/app";

const store = useStore();
const appSettings = useAppSettings();

const closeMemorize = () => {
  appSettings.updateAppSettings({ tab: Tab.RECORD_INFO });
};

const hasProblem = computed(() => {
  return store.currentProblemIndex >= 0 && store.currentProblemIndex < store.memorizeProblems.length;
});

const totalMoves = computed(() => {
  return store.currentProblem?.moves.length ?? 0;
});

const selectedColor = computed(() => store.memorizePlayerColor);

const actualPlayerColor = computed(() => {
  if (!store.currentProblem) return Color.BLACK;
  return store.memorizePlayerColor !== undefined
    ? store.memorizePlayerColor
    : store.currentProblem.playerColor;
});

const progressPercent = computed(() => {
  if (totalMoves.value === 0) return 0;
  return (store.memorizeStep / totalMoves.value) * 100;
});

const isCleared = computed(() => {
  if (totalMoves.value === 0) return false;
  return store.memorizeStep >= totalMoves.value;
});

const playerColorClass = computed(() => {
  return actualPlayerColor.value === Color.BLACK ? "sente" : "gote";
});

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    loadKIFFile(target.files[0]);
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
  if (!isNaN(idx) && idx >= 0) {
    store.startMemorizeProblem(idx, store.memorizePlayerColor);
  }
};

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
</script>

<style scoped>
.memorize-panel {
  padding: 8px;
  background-color: var(--main-bg-color);
  color: var(--main-color);
  overflow: auto;
  gap: 8px;
}
.header-section {
  padding: 8px 12px;
}
.no-margin {
  margin-bottom: 0;
}
.space-between {
  justify-content: space-between;
}
.btn-close {
  background: none;
  border: none;
  color: var(--main-color);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.btn-close:hover {
  background: var(--button-hover-bg-color);
}
.section {
  background-color: var(--panel-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px 12px;
}
.section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--text-color-muted);
  margin-bottom: 6px;
}
.hint-text {
  color: var(--text-color-muted);
  font-size: 0.85rem;
  text-align: center;
  padding: 8px;
}
.file-input {
  width: 100%;
  color: var(--main-color);
  font-size: 0.85rem;
}
.problem-select {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--text-bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}
.problem-select option {
  background-color: var(--text-bg-color);
  color: var(--text-color);
}
.toggle-group {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}
.toggle-btn {
  flex: 1;
  padding: 6px 8px;
  background: var(--button-bg-color);
  border: none;
  border-right: 1px solid var(--border-color);
  color: var(--main-color);
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.2s;
}
.toggle-btn:last-child {
  border-right: none;
}
.toggle-btn:hover:not(:disabled) {
  background: var(--button-hover-bg-color);
}
.toggle-btn.active {
  background: var(--button-active-bg-color);
  color: var(--text-color);
  font-weight: bold;
}
.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 0.9rem;
}
.status-label {
  font-weight: bold;
  color: var(--text-color-muted);
  min-width: 50px;
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
  margin: 8px 0;
}
.progress-bar {
  background: var(--accent-color, #4caf50);
  height: 100%;
  transition: width 0.3s ease;
}
.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.btn {
  flex: 1;
  padding: 8px 14px;
  border-radius: 4px;
  font-size: 0.88rem;
  cursor: pointer;
  border: none;
  font-weight: bold;
  transition: background 0.2s;
}
.btn-restart {
  background: #2196f3;
  color: white;
}
.btn-restart:hover:not(:disabled) {
  background: #1976d2;
}
.btn-restart:disabled {
  background: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
.btn-giveup {
  background: #9e9e9e;
  color: white;
}
.btn-giveup:hover:not(:disabled) {
  background: #757575;
}
.btn-giveup:disabled {
  background: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
.clear-message {
  font-size: 1.1rem;
  font-weight: bold;
  color: #4caf50;
  text-align: center;
  margin-top: 8px;
}
</style>
