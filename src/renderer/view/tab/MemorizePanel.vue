<template>
  <div class="memorize-panel full column">
    <!-- ファイルインポートエリア -->
    <div class="import-area card row shrink" @dragover.prevent.stop @drop.prevent.stop="onFileDrop">
      <span class="label">定跡KIFインポート:</span>
      <input type="file" accept=".kif" @change="onFileChange" class="file-input" />
      <span class="help-text">（KIFファイルをドラッグ＆ドロップまたは選択）</span>
    </div>

    <!-- 問題が読み込まれている場合 -->
    <div v-if="store.memorizeProblems.length > 0" class="content-area row grow">
      <!-- 問題選択リスト（左側） -->
      <div class="problem-list card column shrink">
        <h3>問題リスト</h3>
        <div class="list-container scrollable">
          <button
            v-for="(problem, idx) in store.memorizeProblems"
            :key="idx"
            class="problem-btn"
            :class="{ active: store.currentProblemIndex === idx }"
            @click="store.startMemorizeProblem(idx)"
          >
            {{ problem.name }} ({{ problem.moves.length }}手)
          </button>
        </div>
      </div>

      <!-- 暗記コントロール（右側） -->
      <div v-if="store.currentProblem" class="controls-area card column grow">
        <h2 class="problem-title">{{ store.currentProblem.name }}</h2>
        
        <div class="status-box">
          <div class="status-item">
            <span class="status-label">手番:</span>
            <span class="status-value" :class="playerColorClass">
              {{ store.currentProblem.playerColor === Color.BLACK ? '先手 (▲)' : '後手 (△)' }}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">進捗:</span>
            <span class="status-value">
              {{ store.memorizeStep }} / {{ store.currentProblem.moves.length }}手
            </span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>

        <div class="action-buttons row shrink">
          <button class="btn btn-primary" @click="restart">
            最初からやり直す
          </button>
          <button 
            class="btn btn-secondary" 
            :disabled="isCleared"
            @click="store.giveUpMemorize()"
          >
            ギブアップ (1手進める)
          </button>
        </div>

        <div v-if="isCleared" class="clear-message">
          🎉 クリアしました！
        </div>
      </div>
    </div>

    <!-- 問題がまだ読み込まれていない場合 -->
    <div v-else class="empty-area column grow center">
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
        // Shift-JIS で失敗した場合 UTF-8 でリトライ
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

const progressPercent = computed(() => {
  if (!store.currentProblem) return 0;
  return (store.memorizeStep / store.currentProblem.moves.length) * 100;
});

const isCleared = computed(() => {
  if (!store.currentProblem) return false;
  return store.memorizeStep >= store.currentProblem.moves.length;
});

const playerColorClass = computed(() => {
  if (!store.currentProblem) return "";
  return store.currentProblem.playerColor === Color.BLACK ? "sente" : "gote";
});

const restart = () => {
  if (store.currentProblemIndex !== -1) {
    store.startMemorizeProblem(store.currentProblemIndex);
  }
};
</script>

<style scoped>
.memorize-panel {
  padding: 10px;
  background-color: var(--main-bg-color);
  color: var(--main-color);
  overflow: hidden;
}
.card {
  background-color: var(--panel-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;
}
.import-area {
  align-items: center;
  gap: 10px;
}
.file-input {
  color: var(--main-color);
}
.help-text {
  font-size: 0.8rem;
  color: var(--text-color-muted);
}
.content-area {
  gap: 10px;
  overflow: hidden;
}
.problem-list {
  width: 250px;
  overflow: hidden;
}
.list-container {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 10px;
}
.problem-btn {
  text-align: left;
  padding: 8px 12px;
  background: var(--button-bg-color);
  border: 1px solid var(--border-color);
  color: var(--main-color);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.problem-btn:hover {
  background: var(--button-hover-bg-color);
}
.problem-btn.active {
  background: var(--button-active-bg-color);
  font-weight: bold;
}
.controls-area {
  padding: 15px;
  overflow: auto;
}
.problem-title {
  font-size: 1.2rem;
  margin-bottom: 15px;
}
.status-box {
  background: var(--bg-color-2);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 20px;
}
.status-item {
  display: flex;
  margin-bottom: 10px;
  font-size: 1.1rem;
}
.status-label {
  width: 80px;
  font-weight: bold;
}
.status-value.sente {
  color: #ff4500;
}
.status-value.gote {
  color: #1e90ff;
}
.progress-bar-container {
  background: var(--border-color);
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  margin-top: 15px;
}
.progress-bar {
  background: var(--accent-color, #4caf50);
  height: 100%;
  transition: width 0.3s ease;
}
.action-buttons {
  gap: 15px;
  margin-bottom: 20px;
}
.btn {
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  border: none;
}
.btn-primary {
  background: #2196f3;
  color: white;
}
.btn-primary:hover {
  background: #1e88e5;
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
  font-size: 1.5rem;
  font-weight: bold;
  color: #4caf50;
  text-align: center;
  margin-top: 20px;
}
.empty-area {
  justify-content: center;
  align-items: center;
  border: 2px dashed var(--border-color);
  border-radius: 4px;
}
.empty-message {
  font-size: 1.2rem;
  color: var(--text-color-muted);
}
.scrollable {
  overflow-y: auto;
  max-height: 100%;
}
</style>
