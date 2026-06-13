<template>
  <div class="root full column" :style="size ? { height: `${size.height}px` } : {}">
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

    <div v-else class="create-editor">
      <div class="editor-buttons column">
        <button class="ctrl-btn" @click="onAddBranch">
          <Icon :icon="IconType.TREE" /><span>分岐を追加</span>
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
        <template v-if="store.editingProblemIndex >= 0">
          <div class="edit-separator"></div>
          <div class="edit-name-area">
            <span class="edit-name-label">問題名</span>
            <input
              v-model="editingName"
              type="text"
              class="edit-name-input"
              @keyup.enter="onUpdateProblem"
            />
          </div>
          <button class="ctrl-btn update-btn" @click="onUpdateProblem">
            <Icon :icon="IconType.CHECK" /><span>問題を更新</span>
          </button>
          <button class="ctrl-btn cancel-btn" @click="onCancelEditing">
            <Icon :icon="IconType.CLOSE" /><span>編集をキャンセル</span>
          </button>
        </template>
      </div>

      <div class="editor-list-area">
        <div class="list-label">問題一覧（{{ store.memorizeCollection.problems.length }}問）</div>
        <div class="list">
          <div
            v-for="(problem, idx) in store.memorizeCollection.problems"
            :key="idx"
            class="item"
            :class="{ current: store.editingProblemIndex === idx }"
            @click="onSelectProblem(idx)"
          >
            <span class="idx">{{ idx + 1 }}</span>
            <span class="name">{{ problem.name }}</span>
            <span class="moves">{{ problem.moves.length }}手</span>
            <button class="icon-btn del-btn" @click.stop="removeProblem(idx)">
              <Icon :icon="IconType.DELETE" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <MemorizeCreateDialog v-if="isCreateDialogVisible" @close="isCreateDialogVisible = false" />
    <MemorizeSettingsDialog
      v-if="isSettingsDialogVisible"
      @close="isSettingsDialogVisible = false"
    />
    <MemorizeBranchDialog v-if="isBranchDialogVisible" @close="isBranchDialogVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useStore } from "@/renderer/store";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import MemorizeCreateDialog from "@/renderer/view/dialog/MemorizeCreateDialog.vue";
import MemorizeSettingsDialog from "@/renderer/view/dialog/MemorizeSettingsDialog.vue";
import MemorizeBranchDialog from "@/renderer/view/dialog/MemorizeBranchDialog.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { useFileReader } from "@/renderer/composables/useFileReader.js";

defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

const store = useStore();
const { openYAMLFile, openRecordFile, downloadBlob } = useFileReader();

const isCreateDialogVisible = ref(false);
const showCreateDialog = () => {
  isCreateDialogVisible.value = true;
};

const isSettingsDialogVisible = ref(false);
const onEditSettings = () => {
  isSettingsDialogVisible.value = true;
};

const isBranchDialogVisible = ref(false);
const onAddBranch = () => {
  isBranchDialogVisible.value = true;
};

const openRecordFileForCreate = () => {
  openRecordFile((text: string, fileName: string) => {
    const result = store.importRecordTextToCollection(text, fileName);
    if (result === null) {
      return;
    }
    if (result.added > 0) {
      let msg = `${result.added}件の問題を追加しました（${fileName}）。`;
      if (result.skipped > 0) {
        msg += `（${result.skipped}件は重複のためスキップ）`;
      }
      useMessageStore().enqueue({ text: msg });
    } else if (result.skipped > 0) {
      useMessageStore().enqueue({
        text: `${fileName} の全 ${result.skipped} 件の問題は既に登録されています。`,
      });
    } else {
      useErrorStore().add(new Error("棋譜から問題を抽出できませんでした。"));
    }
  });
};

const onSaveYAML = () => {
  const yaml = store.saveMemorizeCollectionToYAML();
  if (yaml instanceof Error) {
    useErrorStore().add(yaml);
    return;
  }
  downloadBlob(
    yaml,
    `${store.memorizeCollection?.title ?? "problems"}.yaml`,
    "text/yaml;charset=utf-8",
  );
};

const editingName = ref("");

const updateEditingName = () => {
  const idx = store.editingProblemIndex;
  if (idx >= 0 && store.memorizeCollection && idx < store.memorizeCollection.problems.length) {
    editingName.value = store.memorizeCollection.problems[idx].name;
  }
};

watch(
  () => store.editingProblemIndex,
  () => {
    updateEditingName();
  },
);

const onSelectProblem = (idx: number) => {
  store.loadProblemToRecord(idx);
  updateEditingName();
};

const onUpdateProblem = () => {
  if (editingName.value.trim()) {
    store.renameEditingProblem(editingName.value.trim());
  }
  const ok = store.updateProblemFromRecord();
  if (ok) {
    useMessageStore().enqueue({ text: "問題を更新しました。" });
  }
};

const onCancelEditing = () => {
  store.clearEditingProblem();
};

const removeProblem = (idx: number) => {
  store.removeProblemFromCollection(idx);
};

const openYAMLForCreating = () => {
  openYAMLFile((text: string) => {
    const err = store.loadMemorizeCollectionFromYAML(text);
    if (err) {
      useErrorStore().add(err);
      return;
    }
  });
};
</script>

<style scoped>
.root {
  color: var(--text-color);
  background-color: var(--text-bg-color);
  width: 100%;
  height: 100%;
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
.create-editor {
  display: flex;
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
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
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
  min-height: 0;
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
  background: #fff;
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
.del-btn {
  border-color: #c0392b;
  color: #c0392b;
  background: #c0392b;
}
.del-btn:hover {
  background-color: #e74c3c;
  color: #fff;
}
.update-btn {
  border-color: #4caf50;
  color: #4caf50;
}
.update-btn:hover {
  background-color: #4caf50;
  color: white;
}
.cancel-btn {
  border-color: #ff9800;
  color: #ff9800;
}
.cancel-btn:hover {
  background-color: #ff9800;
  color: white;
}
.edit-separator {
  border-top: 1px solid var(--text-separator-color);
  margin: 4px 0;
}
.edit-name-area {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}
.edit-name-label {
  font-size: 0.75em;
  color: var(--text-color-muted);
}
.edit-name-input {
  width: 100%;
  padding: 2px 4px;
  background: var(--text-bg-color);
  border: 1px solid var(--text-separator-color);
  color: var(--text-color);
  font-size: 0.82em;
  border-radius: 2px;
  box-sizing: border-box;
}
</style>
