<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">分岐を追加</div>

    <div class="dialog-body">
      <div class="form-item">
        <span class="form-label">問題名</span>
        <input
          v-model="name"
          type="text"
          placeholder="問題名を入力"
          class="form-input-text"
          @keyup.enter="onCreate"
        />
      </div>
    </div>

    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">キャンセル</button>
      <button class="create-btn" @click="onCreate">作成</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useStore } from "@/renderer/store";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const name = ref("");

const emit = defineEmits<{
  (e: "close"): void;
}>();

const onCreate = () => {
  const n = name.value.trim();
  if (!n) {
    return;
  }
  const ok = store.addBranchAsProblem(n);
  if (!ok) {
    return;
  }
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
  min-height: 60px;
}
.form-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
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
.main-buttons .create-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
.main-buttons .create-btn:hover {
  opacity: 0.85;
}
</style>
