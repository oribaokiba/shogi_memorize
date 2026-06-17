<template>
  <div class="root full column" :style="size ? { height: `${size.height}px` } : {}">
    <div v-if="!store.editCollection" class="content-area column center">
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

    <div v-else class="create-editor" :class="{ narrow: isNarrow }">
      <div class="editor-buttons column" :class="{ compact: isCompact }">
        <button class="ctrl-btn close-btn" @click="onCloseCollection">
          <Icon :icon="IconType.CLOSE" /><span>問題集を閉じる</span>
        </button>
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
        <button v-if="isNarrow" class="ctrl-btn list-btn" @click="onOpenProblemList">
          <Icon :icon="IconType.NOTE" /><span>問題一覧（{{ problemCount }}問）</span>
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

      <div v-if="!isNarrow" class="editor-list-area">
        <div class="list-label">問題一覧（{{ store.editCollection.problems.length }}問）</div>
        <div class="list">
          <VueDraggable
            v-model="problems"
            :item-key="(problem: any) => store.editCollection?.problems.indexOf(problem) ?? -1"
            handle=".drag-handle"
            ghost-class="ghost"
          >
            <template #item="{ element, index }">
              <div
                class="item"
                :class="{ current: store.editingProblemIndex === index }"
                @click="onSelectProblem(index)"
              >
                <span class="drag-handle">⠿</span>
                <span class="idx">{{ index + 1 }}</span>
                <span class="name">{{ element.name }}</span>
                <span class="moves">{{ element.moves.length }}手</span>
                <button class="icon-btn del-btn" @click.stop="removeProblem(index)">
                  <Icon :icon="IconType.DELETE" />
                </button>
              </div>
            </template>
          </VueDraggable>
        </div>
      </div>
    </div>

    <MemorizeCreateDialog
      v-if="store.isMemorizeCreateDialogVisible"
      @close="store.closeMemorizeCreateDialog()"
    />
    <MemorizeSettingsDialog
      v-if="isSettingsDialogVisible"
      @close="isSettingsDialogVisible = false"
    />
    <MemorizeBranchDialog v-if="isBranchDialogVisible" @close="isBranchDialogVisible = false" />
    <MemorizeImportCommentsDialog
      v-if="isImportCommentsDialogVisible"
      @confirm="onImportCommentsConfirm"
      @close="isImportCommentsDialogVisible = false"
    />
    <MemorizeProblemListDialog
      v-if="isProblemListDialogVisible"
      @close="isProblemListDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useStore } from "@/renderer/store";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import { useConfirmationStore } from "@/renderer/store/confirm";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import vuedraggable from "vuedraggable";
import MemorizeCreateDialog from "@/renderer/view/dialog/MemorizeCreateDialog.vue";
import MemorizeSettingsDialog from "@/renderer/view/dialog/MemorizeSettingsDialog.vue";
import MemorizeBranchDialog from "@/renderer/view/dialog/MemorizeBranchDialog.vue";
import MemorizeImportCommentsDialog from "@/renderer/view/dialog/MemorizeImportCommentsDialog.vue";
import MemorizeProblemListDialog from "@/renderer/view/dialog/MemorizeProblemListDialog.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { useFileReader } from "@/renderer/composables/useFileReader.js";
import api, { isNative } from "@/renderer/ipc/api.js";

const VueDraggable = vuedraggable;

const props = defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

const isCompact = computed(() => {
  return props.size?.height !== undefined && props.size.height < 230;
});

const NARROW_WIDTH_THRESHOLD = 500;
const isNarrow = computed(() => {
  return props.size?.width !== undefined && props.size.width < NARROW_WIDTH_THRESHOLD;
});

const problemCount = computed(() => {
  return store.editCollection?.problems.length ?? 0;
});

const isProblemListDialogVisible = ref(false);
const onOpenProblemList = () => {
  isProblemListDialogVisible.value = true;
};

const store = useStore();
const { openYAMLFile, openRecordFile, downloadBlob } = useFileReader();

const showCreateDialog = () => {
  store.showMemorizeCreateDialog();
};

const isSettingsDialogVisible = ref(false);
const onEditSettings = () => {
  isSettingsDialogVisible.value = true;
};

const isBranchDialogVisible = ref(false);
const onAddBranch = () => {
  isBranchDialogVisible.value = true;
};

// 棋譜読み込み時のコメント取り込み確認ダイアログ
const isImportCommentsDialogVisible = ref(false);
const pendingRecordData = ref("");
const pendingRecordFileName = ref("");

const openRecordFileForCreate = () => {
  openRecordFile((text: string, fileName: string) => {
    pendingRecordData.value = text;
    pendingRecordFileName.value = fileName;
    isImportCommentsDialogVisible.value = true;
  });
};

const onImportCommentsConfirm = (includeComments: boolean) => {
  const result = store.importRecordTextToEditCollection(
    pendingRecordData.value,
    pendingRecordFileName.value,
    includeComments,
  );
  if (result === null) {
    return;
  }
  if (result.added > 0) {
    let msg = `${result.added}件の問題を追加しました（${pendingRecordFileName.value}）。`;
    if (result.skipped > 0) {
      msg += `（${result.skipped}件は重複のためスキップ）`;
    }
    useMessageStore().enqueue({ text: msg });
  } else if (result.skipped > 0) {
    useMessageStore().enqueue({
      text: `${pendingRecordFileName.value} の全 ${result.skipped} 件の問題は既に登録されています。`,
    });
  } else {
    useErrorStore().add(new Error("棋譜から問題を抽出できませんでした。"));
  }
  pendingRecordData.value = "";
  pendingRecordFileName.value = "";
};

const onSaveYAML = async () => {
  const yaml = store.saveEditCollectionToYAML();
  if (yaml instanceof Error) {
    useErrorStore().add(yaml);
    return;
  }
  const defaultPath = `${store.editCollection?.title ?? "problems"}.yaml`;
  if (isNative() || "showSaveFilePicker" in window) {
    const path = await api.showSaveYAMLDialog(defaultPath);
    if (!path) {
      return; // キャンセル
    }
    await api.saveYAMLFile(path, yaml);
  } else {
    downloadBlob(yaml, defaultPath, "text/yaml;charset=utf-8");
  }
};

const editingName = ref("");

const updateEditingName = () => {
  const idx = store.editingProblemIndex;
  if (idx >= 0 && store.editCollection && idx < store.editCollection.problems.length) {
    editingName.value = store.editCollection.problems[idx].name;
  }
};

watch(
  () => store.editingProblemIndex,
  () => {
    updateEditingName();
  },
);

const problems = computed({
  get: () => {
    return store.editCollection?.problems ?? [];
  },
  set: (value: import("@/common/memorize/index.js").MemorizeProblem[]) => {
    store.replaceEditProblems(value);
  },
});

const onSelectProblem = (idx: number) => {
  store.loadEditProblemToRecord(idx);
  updateEditingName();
};

const onUpdateProblem = () => {
  // 更新前に古いヒント状態を保存
  store.captureOldHintsBeforeUpdate();

  if (editingName.value.trim()) {
    store.renameEditProblem(editingName.value.trim());
  }
  const ok = store.updateEditProblemFromRecord();
  if (ok) {
    useMessageStore().enqueue({ text: "問題を更新しました。" });

    // ヒント変更差分を取得し、同じUSI手を持つ他問題があれば一括適用を提案
    const changes = store.getHintChangesAfterUpdate();
    // 確認ダイアログを逐次表示するための再帰的処理
    const processChanges = (index: number) => {
      if (index >= changes.length) {
        return;
      }
      const change = changes[index];
      const sameUSIIndices = store.findProblemIndicesWithSameUSI(change.index, change.usi);
      if (sameUSIIndices.length > 0) {
        const isDelete = change.text === "";
        const displayMove = change.usiDisplay || change.usi;
        useConfirmationStore().show({
          message: isDelete
            ? `${change.index + 1}手目 ${displayMove} のコメントを削除しました。同じ手の全問題(${sameUSIIndices.length}件)からもコメントを削除しますか？`
            : `${change.index + 1}手目 ${displayMove} のコメントを「${change.text}」に設定しました。同じ手の全問題(${sameUSIIndices.length}件)にも同じコメントを適用しますか？`,
          onOk: () => {
            store.batchApplyHintToProblems(sameUSIIndices, change.index, change.text);
            useMessageStore().enqueue({
              text: isDelete
                ? `${sameUSIIndices.length}件の問題の${change.index + 1}手目からコメントを削除しました。`
                : `${sameUSIIndices.length}件の問題の${change.index + 1}手目にコメントを適用しました。`,
            });
            // 次の変更の確認へ
            processChanges(index + 1);
          },
          onCancel: () => {
            // スキップして次の変更の確認へ
            processChanges(index + 1);
          },
        });
      } else {
        // 同じ手がない場合はスキップ
        processChanges(index + 1);
      }
    };
    // 最初の変更から処理開始
    processChanges(0);
  }
};

const onCancelEditing = () => {
  store.clearEditProblem();
};

const removeProblem = (idx: number) => {
  store.removeProblemFromEditCollection(idx);
};

const onCloseCollection = () => {
  store.closeEditCollection();
};

const openYAMLForCreating = () => {
  openYAMLFile((text: string) => {
    const err = store.loadEditCollectionFromYAML(text);
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
.editor-buttons.compact {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  width: 300px;
  align-content: start;
  border-right: 1px solid var(--text-separator-color);
  border-bottom: none;
  padding: 4px;
}
.editor-buttons.compact .ctrl-btn {
  width: 100%;
  max-width: none;
}
.editor-buttons.compact .edit-separator {
  grid-column: 1 / -1;
  width: 100%;
}
.editor-buttons.compact .edit-name-area {
  grid-column: 1 / -1;
  width: 100%;
}
.editor-buttons.compact .edit-name-input {
  width: 100%;
}
.create-editor.narrow {
  flex-direction: column;
}
.create-editor.narrow .editor-buttons {
  width: 100%;
  box-sizing: border-box;
  border-right: none;
  border-bottom: 1px solid var(--text-separator-color);
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
.drag-handle {
  cursor: grab;
  color: var(--text-color-muted);
  font-size: 0.88em;
  flex-shrink: 0;
  padding: 0 2px;
  user-select: none;
  -webkit-user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.ghost {
  opacity: 0.4;
  background: var(--button-active-bg-color);
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
  background: linear-gradient(to top, var(--disabled-control-button-bg-color) 80%, white 140%);
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
.close-btn {
  border-color: #e74c3c;
  color: #e74c3c;
}
.close-btn:hover {
  background-color: #e74c3c;
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
