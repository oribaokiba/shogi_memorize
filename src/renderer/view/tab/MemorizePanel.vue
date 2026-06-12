<template>
  <div class="root full column" :style="size ? { height: `${size.height}px` } : {}">
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

      <!-- ファイル読み込み済み：解答中 -->
      <template v-if="store.memorizeCollection && store.isSolving">
        <div class="content-area column center">
          <div class="solve-area">
            <div class="solve-header">
              <span class="solve-title">{{ store.memorizeCollection.title }}</span>
              <span class="solve-progress-label"
                >問題 {{ store.solveIndex + 1 }} / {{ store.solveTotal }}（全{{
                  store.totalProblemsCount
                }}問）</span
              >
            </div>
            <div class="solve-progress">
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: solveProgressPercent + '%' }"></div>
              </div>
              <div class="solve-step">
                {{ store.memorizeStep }} / {{ currentProblemMovesLength }}手
              </div>
            </div>
            <div v-if="hintVisible && store.currentHint" class="hint-area">
              <Icon :icon="IconType.HELP" />
              <span class="hint-text">{{ store.currentHint }}</span>
            </div>
            <div v-if="isSolveCleared" class="clear">
              <Icon :icon="IconType.CHECK" />
              <span>クリアしました！</span>
            </div>
            <div v-if="isGiveUpCleared" class="clear give-up">
              <Icon :icon="IconType.END" />
              <span>ギブアップしました</span>
            </div>
            <div class="solve-buttons">
              <button class="ctrl-btn" :disabled="!hasHint || disableActions" @click="showHint">
                <Icon :icon="IconType.HELP" /><span>ヒント</span>
              </button>
              <button class="ctrl-btn" @click="restartSolveProblem">
                <Icon :icon="IconType.REFRESH" /><span>最初から</span>
              </button>
              <button class="ctrl-btn" :disabled="disableActions" @click="giveUpSolveProblem">
                <Icon :icon="IconType.END" /><span>ギブアップ</span>
              </button>
              <button class="ctrl-btn stop-btn" @click="endSolve">
                <Icon :icon="IconType.CLOSE" /><span>解答終了</span>
              </button>
            </div>
            <div v-if="isCleared && !isLastProblem" class="next-buttons">
              <button class="ctrl-btn next-btn" @click="goToNextProblem">
                <Icon :icon="IconType.NEXT" /><span>次の問題へ</span>
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ファイル読み込み済み：未解答 -->
      <template v-if="store.memorizeCollection && !store.isSolving">
        <div class="content-area column center">
          <div class="info-area">
            <div class="info-title">{{ store.memorizeCollection.title }}</div>
            <div class="info-count">{{ store.memorizeCollection.problems.length }}問</div>
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
              <button class="icon-btn edit-btn" title="編集" @click.stop="onSelectProblem(idx)">
                <Icon :icon="IconType.EDIT" />
              </button>
              <button class="icon-btn del-btn" @click.stop="removeProblem(idx)">
                <Icon :icon="IconType.DELETE" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <MemorizeCreateDialog v-if="isCreateDialogVisible" @close="isCreateDialogVisible = false" />
    <MemorizeSettingsDialog
      v-if="isSettingsDialogVisible"
      @close="isSettingsDialogVisible = false"
    />
    <MemorizeBranchDialog v-if="isBranchDialogVisible" @close="isBranchDialogVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStore } from "@/renderer/store";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import MemorizeCreateDialog from "@/renderer/view/dialog/MemorizeCreateDialog.vue";
import MemorizeSettingsDialog from "@/renderer/view/dialog/MemorizeSettingsDialog.vue";
import MemorizeBranchDialog from "@/renderer/view/dialog/MemorizeBranchDialog.vue";
import { RectSize } from "@/common/assets/geometry.js";

defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

type PanelMode = "solve" | "create";

const store = useStore();
const panelMode = ref<PanelMode>("solve");

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
      const result = store.importRecordTextToCollection(text, file.name);
      if (result === null) {
      } else if (result.added > 0) {
        let msg = `${result.added}件の問題を追加しました（${file.name}）。`;
        if (result.skipped > 0) {
          msg += `（${result.skipped}件は重複のためスキップ）`;
        }
        useMessageStore().enqueue({ text: msg });
      } else if (result.skipped > 0) {
        useMessageStore().enqueue({
          text: `${file.name} の全 ${result.skipped} 件の問題は既に登録されています。`,
        });
      } else {
        useErrorStore().add(new Error("棋譜から問題を抽出できませんでした。"));
      }
    };
    reader.readAsText(file, "shift-jis");
    reader.onerror = () => {
      const reader2 = new FileReader();
      reader2.onload = (e2) => {
        const text2 = e2.target?.result as string;
        if (text2) {
          const result2 = store.importRecordTextToCollection(text2, file.name);
          if (result2 === null) {
          } else if (result2.added > 0) {
            let msg = `${result2.added}件の問題を追加しました（${file.name}）。`;
            if (result2.skipped > 0) {
              msg += `（${result2.skipped}件は重複のためスキップ）`;
            }
            useMessageStore().enqueue({ text: msg });
          } else if (result2.skipped > 0) {
            useMessageStore().enqueue({
              text: `${file.name} の全 ${result2.skipped} 件の問題は既に登録されています。`,
            });
          } else {
            useErrorStore().add(new Error("棋譜から問題を抽出できませんでした。"));
          }
        }
      };
      reader2.readAsText(file, "utf-8");
    };
  };
  input.click();
};

const onSaveYAML = () => {
  const yaml = store.saveMemorizeCollectionToYAML();
  if (yaml instanceof Error) {
    useErrorStore().add(yaml);
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

const editingName = ref("");

const updateEditingName = () => {
  const idx = store.editingProblemIndex;
  const collection = store.memorizeCollection;
  if (idx >= 0 && collection && idx < collection.problems.length) {
    editingName.value = collection.problems[idx].name;
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

// === 解答モード ===

const currentProblemMovesLength = computed(() => {
  const p = store.currentProblem;
  return p ? p.moves.length : 0;
});

const solveProgressPercent = computed(() => {
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return 0;
  }
  return (store.memorizeStep / len) * 100;
});

const isSolveCleared = computed(() => {
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return false;
  }
  return store.memorizeStep >= len;
});

// ギブアップクリア状態の判定（クリアより優先度を下げるため、クリアでなければギブアップ）
const isGiveUpCleared = computed(() => {
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return false;
  }
  return store.memorizeStep >= len;
});
// 注意: isSolveCleared が true なら isGiveUpCleared も true になるが、
// テンプレートの v-if 順により、isSolveCleared が先に評価される

// クリアまたはギブアップで完了状態か
const isCleared = computed(() => {
  return isSolveCleared.value;
});

// 最終問題か
const isLastProblem = computed(() => {
  return store.solveIndex >= store.solveTotal - 1;
});

// 操作を無効化する状態
const disableActions = computed(() => {
  return isSolveCleared.value;
});

const hintVisible = ref(false);

const hasHint = computed(() => {
  const problem = store.currentCollectionProblem;
  if (!problem || !problem.hints) {
    return false;
  }
  return problem.hints.length > 0;
});

const showHint = () => {
  hintVisible.value = true;
};

const restartSolveProblem = () => {
  hintVisible.value = false;
  const problem = store.currentCollectionProblem;
  if (problem) {
    store.closeMemorizeSolveDialog();
    store.startSolveSession();
  }
};

const giveUpSolveProblem = () => {
  store.giveUpMemorize();
};

const goToNextProblem = () => {
  hintVisible.value = false;
  store.nextProblem();
};

const endSolve = () => {
  store.endSolveSession();
};

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
        useErrorStore().add(err);
        return;
      }
      // ダイアログは即座に表示せず、ボタン表示に任せる
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
        useErrorStore().add(err);
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
.file-area {
  text-align: center;
  padding: 16px;
}
.hint {
  margin: 8px 0 0;
  font-size: 0.8em;
  color: var(--text-color-muted);
}
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
.info-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

/* 解答エリア */
.solve-area {
  text-align: center;
  padding: 20px;
  max-width: 350px;
  width: 100%;
}
.solve-header {
  margin-bottom: 8px;
}
.solve-title {
  font-size: 1.1em;
  font-weight: bold;
  display: block;
  margin-bottom: 4px;
}
.solve-progress-label {
  font-size: 0.85em;
  color: var(--text-color-muted);
}
.solve-progress {
  margin-bottom: 8px;
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
.solve-step {
  font-size: 0.82em;
  color: var(--text-color-muted);
}
.hint-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 8px 0;
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
.clear {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.9em;
  font-weight: bold;
  color: #4caf50;
  margin-bottom: 8px;
}
.clear .icon {
  height: 18px;
  width: auto;
  display: inline-block;
}
.solve-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.solve-buttons .ctrl-btn {
  flex: 1;
  min-width: 80px;
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
.stop-btn {
  border-color: #c0392b !important;
  color: #c0392b !important;
}
.stop-btn:hover {
  background-color: #c0392b !important;
  color: white !important;
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
.edit-btn {
  border-color: #2196f3;
  color: #2196f3;
}
.edit-btn:hover {
  background-color: #2196f3;
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
.close-btn {
  width: 100%;
  border: none;
  border-top: 1px solid var(--text-separator-color);
  border-radius: 0;
}
</style>
