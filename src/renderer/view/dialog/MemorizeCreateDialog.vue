<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">定跡暗記 - 問題を作成</div>

    <div class="dialog-scroll">
      <div class="form-item">
        <span class="form-label">タイトル</span>
        <input
          type="text"
          :value="createTitle"
          placeholder="問題集タイトル"
          class="form-input-text"
          @change="onChangeCreateTitle"
        />
      </div>

      <div class="create-btns">
        <button class="ctrl-btn" @click="createNewCollection">
          <Icon :icon="IconType.ADD" /><span>新規作成</span>
        </button>
        <button class="ctrl-btn" @click="importFromRecord">
          <Icon :icon="IconType.FILE" /><span>現在の棋譜から追加</span>
        </button>
        <button class="ctrl-btn" @click="openRecordFile">
          <Icon :icon="IconType.OPEN_FOLDER" /><span>棋譜ファイルを開く</span>
        </button>
        <button class="ctrl-btn" @click="openYAMLForEditing">
          <Icon :icon="IconType.OPEN" /><span>YAMLファイルを開く</span>
        </button>
        <button class="ctrl-btn save-btn" @click="saveYAMLFile">
          <Icon :icon="IconType.SAVE" /><span>YAMLファイルに保存</span>
        </button>
      </div>

      <div v-if="store.memorizeCollection" class="list-area">
        <div class="list-label">問題一覧（{{ store.memorizeCollection.problems.length }}問）</div>
        <div class="list">
          <div
            v-for="(problem, idx) in store.memorizeCollection.problems"
            :key="idx"
            class="item"
            :class="{ current: editHintIndex === idx }"
          >
            <span class="idx">{{ idx + 1 }}</span>
            <span class="name">{{ problem.name }}</span>
            <span class="moves">{{ problem.moves.length }}手</span>
            <button class="icon-btn hint-btn" @click.stop="toggleHintEdit(idx)">
              <Icon :icon="IconType.EDIT" />
            </button>
            <button class="icon-btn del-btn" @click="removeProblem(idx)">
              <Icon :icon="IconType.DELETE" />
            </button>
          </div>
        </div>
      </div>

      <!-- ヒント編集 -->
      <div v-if="editHintIndex >= 0 && editHintProblem" class="hint-edit-area">
        <div class="hint-edit-header">ヒント編集: {{ editHintProblem.name }}</div>
        <div class="hint-edit-list">
          <div v-for="(move, midx) in editHintProblem.moves" :key="midx" class="hint-edit-item">
            <span class="hint-edit-move">{{ midx + 1 }}手目</span>
            <input
              type="text"
              class="hint-edit-input"
              :value="getHintText(editHintIndex, midx)"
              placeholder="ヒントを入力"
              @change="
                (e) => setHintText(editHintIndex, midx, (e.target as HTMLInputElement).value)
              "
            />
          </div>
        </div>
        <button class="ctrl-btn close-btn" @click="editHintIndex = -1">
          <Icon :icon="IconType.CLOSE" /><span>閉じる</span>
        </button>
      </div>
    </div>

    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">閉じる</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const createTitle = ref(store.memorizeCollection?.title ?? "");

// === ヒント編集 ===
const editHintIndex = ref(-1);

const editHintProblem = computed(() => {
  if (editHintIndex.value < 0 || !store.memorizeCollection) {
    return null;
  }
  return store.memorizeCollection.problems[editHintIndex.value] ?? null;
});

const toggleHintEdit = (idx: number) => {
  editHintIndex.value = editHintIndex.value === idx ? -1 : idx;
};

const getHintText = (problemIdx: number, moveIdx: number): string => {
  if (!store.memorizeCollection) {
    return "";
  }
  const p = store.memorizeCollection.problems[problemIdx];
  if (!p || !p.hints) {
    return "";
  }
  const hint = p.hints.find((h) => h.index === moveIdx);
  return hint ? hint.text : "";
};

const setHintText = (problemIdx: number, moveIdx: number, text: string) => {
  if (!store.memorizeCollection) {
    return;
  }
  const p = store.memorizeCollection.problems[problemIdx];
  if (!p) {
    return;
  }
  if (!p.hints) {
    p.hints = [];
  }
  const existing = p.hints.find((h) => h.index === moveIdx);
  if (existing) {
    if (text.trim()) {
      existing.text = text.trim();
    } else {
      p.hints = p.hints.filter((h) => h.index !== moveIdx);
    }
  } else if (text.trim()) {
    p.hints.push({ index: moveIdx, text: text.trim() });
  }
};

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

const onCancel = () => {
  store.closeMemorizeCreateDialog();
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
  min-height: 200px;
  max-height: calc(80vh - 150px);
}
.form-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--text-separator-color);
  flex-shrink: 0;
  flex-wrap: wrap;
  background: var(--main-bg-color);
}
.form-label {
  font-size: 0.82em;
  color: var(--text-color-muted);
  white-space: nowrap;
  min-width: 50px;
}
.form-input-text {
  flex: 1;
  padding: 2px 4px;
  background: var(--main-bg-color);
  border: 1px solid var(--text-separator-color);
  color: var(--text-color);
  font-size: 0.9em;
}
.create-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--text-separator-color);
  flex-shrink: 0;
}
.create-btns .ctrl-btn {
  width: 100%;
}
.save-btn {
  grid-column: 1 / -1;
  border-color: #4caf50;
  color: #4caf50;
}
.save-btn:hover {
  background-color: #4caf50;
  color: white;
}
.list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100px;
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
  max-height: 200px;
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
.close-btn {
  width: 100%;
  border: none;
  border-top: 1px solid var(--text-separator-color);
  border-radius: 0;
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
</style>
