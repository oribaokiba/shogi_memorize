<template>
  <div class="memorize-panel full column">
    <!-- ヘッダー -->
    <div class="section header-section">
      <div class="row align-center space-between">
        <label class="section-label no-margin">定跡暗記</label>
        <button class="btn-close" @click="closeMemorize">✕</button>
      </div>
    </div>

    <!-- モード選択 -->
    <div class="section">
      <div class="toggle-group">
        <button
          class="toggle-btn"
          :class="{ active: mode === 'solve' }"
          @click="switchMode('solve')"
        >
          問題を解く
        </button>
        <button
          class="toggle-btn"
          :class="{ active: mode === 'create' }"
          @click="switchMode('create')"
        >
          問題を作成
        </button>
      </div>
    </div>

    <!-- ========== 問題を解くモード ========== -->
    <template v-if="mode === 'solve'">
      <div v-if="!store.memorizeCollection" class="section">
        <label class="section-label">問題集ファイル（.yaml）</label>
        <input type="file" accept=".yaml,.yml" class="file-input" @change="onOpenYAMLFile" />
        <p class="hint-text">定跡問題集のYAMLファイルを開いてください。</p>
      </div>
      <template v-if="store.memorizeCollection">
        <div class="section">
          <label class="section-label">{{ store.memorizeCollection.title }}</label>
          <div class="problem-list">
            <div
              v-for="(problem, idx) in store.memorizeCollection.problems"
              :key="idx"
              class="problem-item"
              :class="{ active: currentSolveIndex === idx }"
              @click="startSolveProblem(idx)"
            >
              <span class="problem-idx">{{ idx + 1 }}</span>
              <span class="problem-name">{{ problem.name }}</span>
              <span class="problem-moves">{{ problem.moves.length }}手</span>
            </div>
          </div>
        </div>
        <div class="section">
          <label class="section-label">解答設定</label>
          <div class="setting-row">
            <span class="setting-label">出題順</span>
            <button
              class="toggle-btn-sm"
              :class="{ active: isRandomOrder }"
              @click="isRandomOrder = !isRandomOrder"
            >
              {{ isRandomOrder ? "ランダム" : "順序通り" }}
            </button>
          </div>
          <div class="setting-row">
            <span class="setting-label">出題数</span>
            <input
              type="number"
              class="setting-input"
              :value="maxQuestions"
              min="0"
              max="999"
              @change="onChangeMaxQuestions"
            />
            <span class="setting-hint">（0=全て）</span>
          </div>
        </div>
        <div v-if="currentSolveProblem" class="section">
          <div class="status-row">
            <span class="status-label">問題:</span>
            <span class="status-value">{{ currentSolveProblem.name }}</span>
          </div>
          <div class="status-row">
            <span class="status-label">進捗:</span>
            <span class="status-value"
              >{{ store.memorizeStep }} / {{ currentSolveProblem.moves.length }}手</span
            >
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: solveProgressPercent + '%' }"></div>
          </div>
          <div class="action-buttons">
            <button class="btn btn-restart" @click="restartSolveProblem">最初から</button>
            <button class="btn btn-giveup" :disabled="isSolveCleared" @click="giveUpSolveProblem">
              ギブアップ
            </button>
          </div>
          <div v-if="isSolveCleared" class="clear-message">🎉 クリアしました！</div>
        </div>
      </template>
    </template>

    <!-- ========== 問題を作成モード ========== -->
    <template v-if="mode === 'create'">
      <div class="section">
        <label class="section-label">問題集タイトル</label>
        <input
          type="text"
          class="text-input"
          :value="createTitle"
          placeholder="例: 基本定跡集"
          @change="onChangeCreateTitle"
        />
      </div>
      <div class="section">
        <div class="setting-row">
          <button class="btn btn-action" @click="createNewCollection">新規作成</button>
          <button class="btn btn-action" @click="importFromRecord">現在の棋譜から問題追加</button>
        </div>
        <div class="setting-row">
          <button class="btn btn-action" @click="openRecordFile">棋譜ファイルを開く</button>
          <button class="btn btn-action" @click="openYAMLForEditing">YAMLファイルを開く</button>
        </div>
        <div class="setting-row">
          <button class="btn btn-action" @click="saveYAMLFile">YAMLファイルに保存</button>
        </div>
      </div>
      <div v-if="store.memorizeCollection" class="section">
        <label class="section-label"
          >問題一覧（{{ store.memorizeCollection.problems.length }}問）</label
        >
        <div class="problem-list">
          <div
            v-for="(problem, idx) in store.memorizeCollection.problems"
            :key="idx"
            class="problem-item"
          >
            <span class="problem-idx">{{ idx + 1 }}</span>
            <span class="problem-name">{{ problem.name }}</span>
            <span class="problem-moves">{{ problem.moves.length }}手</span>
            <button class="btn-delete" @click="removeProblem(idx)">削除</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { Color } from "tsshogi";
import { Tab } from "@/common/settings/app";
import type { MemorizeProblem } from "@/common/memorize/index.js";

type PanelMode = "solve" | "create";

const store = useStore();
const appSettings = useAppSettings();

// === モード ===
const mode = ref<PanelMode>("solve");
const switchMode = (newMode: PanelMode) => {
  mode.value = newMode;
};

// === 共通 ===
const closeMemorize = () => {
  appSettings.updateAppSettings({ tab: Tab.RECORD_INFO });
};

// === 問題を解くモード ===
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

const onOpenYAMLFile = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (!target.files || !target.files[0]) {
    return;
  }
  const file = target.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (!text) {
      return;
    }
    const err = store.loadMemorizeCollectionFromYAML(text);
    if (err) {
      alert("問題集の読み込みに失敗しました: " + err.message);
      return;
    }
    buildSolveOrder();
  };
  reader.readAsText(file, "utf-8");
};

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

// === 問題を作成モード ===
const createTitle = ref("");

const onChangeCreateTitle = (event: Event) => {
  createTitle.value = (event.target as HTMLInputElement).value;
};

const createNewCollection = () => {
  const title = createTitle.value.trim() || "新規問題集";
  store.newMemorizeCollection(title);
  createTitle.value = title;
};

const importFromRecord = () => {
  const count = store.importCurrentRecordAsProblems();
  if (count > 0) {
    alert(`${count}件の問題を追加しました。`);
  } else {
    alert("棋譜に手順がありません。");
  }
};

const openRecordFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".kif,.kifu,.ki2,.ki2u,.csa,.usi,.jkf,.sfen,.json";
  input.onchange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || !target.files[0]) {
      return;
    }
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        return;
      }
      const count = store.importRecordTextToCollection(text, file.name);
      if (count > 0) {
        alert(`${count}件の問題を追加しました（${file.name}）。`);
      } else {
        alert("棋譜から問題を抽出できませんでした。");
      }
    };
    // Shift-JIS -> UTF-8 の順でトライ
    reader.readAsText(file, "shift-jis");
    reader.onerror = () => {
      const reader2 = new FileReader();
      reader2.onload = (e2) => {
        const text2 = e2.target?.result as string;
        if (text2) {
          const count2 = store.importRecordTextToCollection(text2, file.name);
          if (count2 > 0) {
            alert(`${count2}件の問題を追加しました（${file.name}）。`);
          }
        }
      };
      reader2.readAsText(file, "utf-8");
    };
  };
  input.click();
};

const openYAMLForEditing = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".yaml,.yml";
  input.onchange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || !target.files[0]) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        return;
      }
      const err = store.loadMemorizeCollectionFromYAML(text);
      if (err) {
        alert("読み込みに失敗しました: " + err.message);
      } else if (store.memorizeCollection) {
        createTitle.value = store.memorizeCollection.title;
      }
    };
    reader.readAsText(target.files[0], "utf-8");
  };
  input.click();
};

const saveYAMLFile = () => {
  const yaml = store.saveMemorizeCollectionToYAML();
  if (yaml instanceof Error) {
    alert(yaml.message);
    return;
  }
  const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${store.memorizeCollection?.title ?? "problems"}.yaml`;
  a.click();
  URL.revokeObjectURL(url);
};

const removeProblem = (idx: number) => {
  store.removeProblemFromCollection(idx);
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
.text-input {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--text-bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
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
.toggle-btn:hover {
  background: var(--button-hover-bg-color);
}
.toggle-btn.active {
  background: var(--button-active-bg-color);
  color: var(--text-color);
  font-weight: bold;
}
.toggle-btn-sm {
  padding: 4px 12px;
  background: var(--button-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--main-color);
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.2s;
}
.toggle-btn-sm.active {
  background: var(--button-active-bg-color);
  color: var(--text-color);
  font-weight: bold;
}
.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.setting-label {
  font-weight: bold;
  color: var(--text-color-muted);
  font-size: 0.82rem;
  min-width: 60px;
}
.setting-input {
  width: 60px;
  padding: 4px 6px;
  background-color: var(--text-bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  font-size: 0.85rem;
  text-align: center;
}
.setting-hint {
  font-size: 0.78rem;
  color: var(--text-color-muted);
}
.problem-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.problem-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.problem-item:hover {
  background: var(--button-hover-bg-color);
}
.problem-item.active {
  background: var(--button-active-bg-color);
  font-weight: bold;
}
.problem-idx {
  width: 24px;
  text-align: center;
  font-weight: bold;
  color: var(--text-color-muted);
  font-size: 0.82rem;
}
.problem-name {
  flex: 1;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.problem-moves {
  font-size: 0.78rem;
  color: var(--text-color-muted);
  white-space: nowrap;
}
.btn-delete {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-delete:hover {
  background: #c0392b;
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
.btn-restart:hover {
  background: #1976d2;
}
.btn-giveup {
  background: #9e9e9e;
  color: white;
}
.btn-giveup:hover {
  background: #757575;
}
.btn-giveup:disabled {
  background: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
.btn-action {
  flex: 1;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--button-bg-color);
  color: var(--main-color);
  font-weight: bold;
  transition: background 0.2s;
  white-space: nowrap;
}
.btn-action:hover {
  background: var(--button-hover-bg-color);
}
.clear-message {
  font-size: 1.1rem;
  font-weight: bold;
  color: #4caf50;
  text-align: center;
  margin-top: 8px;
}
</style>
