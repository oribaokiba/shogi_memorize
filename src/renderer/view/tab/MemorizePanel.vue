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
      <!-- コレクション未作成 -->
      <div v-if="!store.memorizeCollection" class="content-area column center">
        <div class="create-area">
          <button class="ctrl-btn create-btn" @click="showCreateDialog">
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

      <!-- コレクション作成済み -->
      <div v-else class="create-editor">
        <!-- 左側: 操作用ボタン -->
        <div class="editor-buttons column">
          <button class="ctrl-btn" @click="onAddBranch">
            <Icon :icon="IconType.TREE" /><span>分岐を編集・追加</span>
          </button>
          <button class="ctrl-btn" @click="openRecordFileForCreate">
            <Icon :icon="IconType.OPEN_FOLDER" /><span>棋譜ファイルを開く</span>
          </button>
          <button class="ctrl-btn save-btn" @click="onSaveYAML">
            <Icon :icon="IconType.SAVE" /><span>YAMLファイルに保存</span>
          </button>
          <button class="ctrl-btn" @click="onEditSettings">
            <Icon :icon="IconType.SETTINGS" /><span>問題集の設定</span>
          </button>
        </div>

        <!-- 右側: 問題一覧 -->
        <div class="editor-list-area">
          <div class="list-label">問題一覧（{{ store.memorizeCollection.problems.length }}問）</div>
          <div class="list">
            <div
              v-for="(problem, idx) in store.memorizeCollection.problems"
              :key="idx"
              class="item"
            >
              <span class="idx">{{ idx + 1 }}</span>
              <span class="name">{{ problem.name }}</span>
              <span class="moves">{{ problem.moves.length }}手</span>
              <button class="icon-btn del-btn" @click="removeProblem(idx)">
                <Icon :icon="IconType.DELETE" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 新規問題集作成ダイアログ -->
    <MemorizeCreateDialog v-if="isCreateDialogVisible" @close="isCreateDialogVisible = false" />

    <!-- 問題集の設定ダイアログ -->
    <MemorizeSettingsDialog
      v-if="isSettingsDialogVisible"
      @close="isSettingsDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import MemorizeCreateDialog from "@/renderer/view/dialog/MemorizeCreateDialog.vue";
import MemorizeSettingsDialog from "@/renderer/view/dialog/MemorizeSettingsDialog.vue";

type PanelMode = "solve" | "create";

const store = useStore();
const panelMode = ref<PanelMode>("solve");

// === 新規作成ダイアログ ===
const isCreateDialogVisible = ref(false);
const showCreateDialog = () => {
  isCreateDialogVisible.value = true;
};

// === 問題集の設定ダイアログ ===
const isSettingsDialogVisible = ref(false);
const onEditSettings = () => {
  isSettingsDialogVisible.value = true;
};

// === 分岐を編集・追加 ===
const onAddBranch = () => {
  // 問題名を入力させる簡易ダイアログ（prompt）
  const name = prompt("問題名を入力してください", "");
  if (!name || !name.trim()) {
    return;
  }
  const ok = store.addBranchAsProblem(name.trim());
  if (!ok) {
    alert("問題を追加できませんでした。棋譜に手順がないか、問題集が作成されていません。");
  }
};

// === 棋譜ファイルを開く ===
const openRecordFileForCreate = () => {
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

// === YAML保存 ===
const onSaveYAML = () => {
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

// === 問題削除 ===
const removeProblem = (idx: number) => {
  store.removeProblemFromCollection(idx);
};

// === 解答モード ===
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
      panelMode.value = "create";
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

/* 作成エリア（未作成時） */
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

/* 作成済みエディタ */
.create-editor {
  flex: 1;
  min-height: 0;
  flex-direction: row;
}
.editor-buttons {
  flex-shrink: 0;
  width: 140px;
  padding: 4px;
  gap: 3px;
  border-right: 1px solid var(--text-separator-color);
}
.editor-buttons .ctrl-btn {
  width: 100%;
}
.save-btn {
  border-color: #4caf50;
  color: #4caf50;
}
.save-btn:hover {
  background-color: #4caf50;
  color: white;
}
.editor-list-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
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

/* ヒント編集 */
.hint-edit-area {
  flex-shrink: 0;
  border-top: 1px solid var(--text-separator-color);
  background: var(--main-bg-color);
}
.hint-edit-header {
  font-size: 0.82em;
  font-weight: bold;
  color: var(--text-color-muted);
  padding: 4px 8px;
}
.hint-edit-list {
  max-height: 150px;
  overflow-y: auto;
}
.hint-edit-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
}
.hint-edit-move {
  font-size: 0.82em;
  color: var(--text-color-muted);
  min-width: 50px;
  flex-shrink: 0;
}
.hint-edit-input {
  flex: 1;
  padding: 2px 4px;
  background: var(--text-bg-color);
  border: 1px solid var(--text-separator-color);
  color: var(--text-color);
  font-size: 0.82em;
  border-radius: 2px;
}

/* ボタン */
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
.create-btn:hover {
  background-color: #4caf50;
  color: white;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--text-separator-color);
  border-radius: 2px;
  padding: 1px 4px;
  cursor: pointer;
  color: var(--text-color-muted);
  height: 22px;
  flex-shrink: 0;
}
.icon-btn .icon {
  height: 14px;
  width: auto;
  display: inline-block;
}
.icon-btn:hover {
  background: var(--button-hover-bg-color);
}
.hint-btn {
  border-color: #ff9800;
  color: #ff9800;
}
.hint-btn:hover {
  background-color: #ff9800;
  color: white;
}
.del-btn {
  border-color: #c0392b;
  color: #c0392b;
}
.del-btn:hover {
  background-color: #c0392b;
  color: white;
}
.close-btn {
  width: 100%;
  border: none;
  border-top: 1px solid var(--text-separator-color);
  border-radius: 0;
}
</style>
