<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">問題集の設定</div>

    <div class="dialog-body">
      <div class="form-item">
        <span class="form-label">タイトル</span>
        <input v-model="title" type="text" placeholder="問題集タイトル" class="form-input-text" />
      </div>

      <div class="form-item">
        <span class="form-label">手番</span>
        <div class="color-select">
          <label class="color-option" :class="{ selected: playerColor === 'black' }">
            <input v-model="playerColor" type="radio" value="black" />
            <span>先手</span>
          </label>
          <label class="color-option" :class="{ selected: playerColor === 'white' }">
            <input v-model="playerColor" type="radio" value="white" />
            <span>後手</span>
          </label>
        </div>
      </div>
    </div>

    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">キャンセル</button>
      <button class="save-btn" @click="onSave">保存</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useStore } from "@/renderer/store";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const title = ref(store.editCollection?.title ?? "");
const playerColor = ref<"black" | "white">(store.editCollection?.playerColor ?? "black");

const emit = defineEmits<{
  (e: "close"): void;
}>();

const onSave = () => {
  const t = title.value.trim() || "問題集";
  store.updateEditCollectionSettings(t, playerColor.value);
  emit("close");
};

const onCancel = () => {
  emit("close");
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
.dialog-body {
  min-height: 80px;
}
.form-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--text-separator-color);
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
.color-select {
  display: flex;
  gap: 12px;
}
.color-option {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border: 1px solid var(--text-separator-color);
  border-radius: 3px;
  font-size: 0.85em;
  color: var(--text-color);
  background: var(--button-bg-color);
}
.color-option.selected {
  border-color: var(--tab-highlight-color, #1e90ff);
  background: var(--button-active-bg-color);
  font-weight: bold;
}
.color-option input[type="radio"] {
  display: none;
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
.main-buttons .save-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
.main-buttons .save-btn:hover {
  opacity: 0.85;
}
</style>
