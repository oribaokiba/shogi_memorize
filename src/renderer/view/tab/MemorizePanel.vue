<template>
  <div class="root full column">
    <!-- モード選択タブ -->
    <div class="mode-switch row">
      <button
        class="mode-tab"
        :class="{ active: panelMode === 'solve' }"
        @click="panelMode = 'solve'"
      >
        問題を解く
      </button>
      <button
        class="mode-tab"
        :class="{ active: panelMode === 'create' }"
        @click="panelMode = 'create'"
      >
        問題を作成
      </button>
    </div>

    <!-- ========== 問題を解くモード ========== -->
    <template v-if="panelMode === 'solve'">
      <!-- ファイル未読み込み -->
      <div v-if="!store.memorizeCollection" class="content-area column center">
        <div class="file-area">
          <button class="ctrl-btn" @click="openYAMLForSolving">
            <Icon :icon="IconType.OPEN" />
            <span>問題集ファイル（.yaml）を開く</span>
          </button>
          <p class="hint">定跡問題集のYAMLファイルを開いてください。</p>
        </div>
      </div>
      <!-- ファイル読み込み済み -->
      <template v-if="store.memorizeCollection">
        <div class="content-area column center">
          <div class="info-area">
            <div class="info-title">{{ store.memorizeCollection.title }}</div>
            <div class="info-count">{{ store.memorizeCollection.problems.length }}問</div>
            <div v-if="currentSolveProblem" class="info-progress">
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: solveProgressPercent + '%' }"></div>
              </div>
              <div class="info-step">
                {{ store.memorizeStep }} / {{ currentSolveProblem.moves.length }}手
              </div>
            </div>
            <div v-if="isSolveCleared" class="clear">
              <Icon :icon="IconType.CHECK" />
              <span>クリアしました！</span>
            </div>
            <div class="info-buttons">
              <button class="ctrl-btn" @click="openMemorizeSolveDialog">
                <Icon :icon="IconType.QUIZ" />
                <span>定跡暗記を開く</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ========== 問題を作成モード ========== -->
    <template v-if="panelMode === 'create'">
      <div class="content-area column center">
        <div class="create-area">
          <button class="ctrl-btn create-btn" @click="createNewCollection">
            <Icon :icon="IconType.ADD" />
            <span>新規問題集を作成</span>
          </button>
          <div class="create-divider">または</div>
          <button class="ctrl-btn" @click="openYAMLForCreating">
            <Icon :icon="IconType.OPEN" />
            <span>既存のYAMLファイルを開く</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";

type PanelMode = "solve" | "create";

const store = useStore();
const panelMode = ref<PanelMode>("solve");

const currentSolveProblem = computed(() => {
  const collection = store.memorizeCollection;
  if (!collection || collection.problems.length === 0) {
    return null;
  }
  return collection.problems[0] ?? null;
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

const openYAMLForSolving = () => {
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
        alert("問題集の読み込みに失敗しました: " + err.message);
        return;
      }
      store.showMemorizeSolveDialog();
    };
    reader.readAsText(target.files[0], "utf-8");
  };
  input.click();
};

const openMemorizeSolveDialog = () => {
  store.showMemorizeSolveDialog();
};

const createNewCollection = () => {
  store.newMemorizeCollection("新規問題集");
  store.showMemorizeCreateDialog();
};

const openYAMLForCreating = () => {
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
        return;
      }
      store.showMemorizeCreateDialog();
    };
    reader.readAsText(target.files[0], "utf-8");
  };
  input.click();
};
</script>

<style scoped>
.root {
  color: var(--text-color);
  background-color: var(--text-bg-color);
  width: 100%;
  height: 100%;
}

/* モード切替タブ */
.mode-switch {
  flex-shrink: 0;
  border-bottom: 1px solid var(--text-separator-color);
  background: linear-gradient(to top, var(--tab-bg-color) 80%, white 140%);
}
.mode-tab {
  flex: 1;
  height: 24px;
  line-height: 24px;
  font-size: 0.85em;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--tab-color);
  cursor: pointer;
  padding: 0 8px;
  text-align: center;
}
.mode-tab:hover {
  background: var(--button-hover-bg-color);
}
.mode-tab.active {
  border-bottom-color: var(--tab-highlight-color);
  font-weight: bold;
}

.content-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.center {
  justify-content: center;
  align-items: center;
}

/* ファイル選択 */
.file-area {
  text-align: center;
  padding: 16px;
}
.file-label {
  margin: 0 0 8px;
  font-size: 0.85em;
  color: var(--text-color-muted);
}
.hint {
  margin: 8px 0 0;
  font-size: 0.8em;
  color: var(--text-color-muted);
}

/* 読み込み済み表示 */
.info-area {
  text-align: center;
  padding: 20px;
  max-width: 300px;
}
.info-title {
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 6px;
}
.info-count {
  font-size: 0.85em;
  color: var(--text-color-muted);
  margin-bottom: 12px;
}
.info-progress {
  margin-bottom: 12px;
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
.info-step {
  font-size: 0.82em;
  color: var(--text-color-muted);
}
.info-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.clear {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.9em;
  font-weight: bold;
  color: #4caf50;
  margin-bottom: 12px;
}
.clear .icon {
  height: 18px;
  width: auto;
  display: inline-block;
}

/* 作成エリア */
.create-area {
  text-align: center;
  padding: 20px;
  max-width: 300px;
}
.create-divider {
  margin: 12px 0;
  font-size: 0.82em;
  color: var(--text-color-muted);
}

/* ボタン */
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  border-radius: 3px;
  font-size: 0.88em;
  cursor: pointer;
  border: 1px solid var(--text-separator-color);
  background-color: var(--button-bg-color);
  color: var(--main-color);
  font-weight: bold;
  padding: 0 16px;
  white-space: nowrap;
  width: 100%;
}
.ctrl-btn:hover {
  background-color: var(--button-hover-bg-color);
}
.ctrl-btn .icon {
  height: 18px;
  width: auto;
  flex-shrink: 0;
  display: inline-block;
}
.create-btn:hover {
  background-color: #4caf50;
  color: white;
}
</style>
