<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">棋譜コメント</div>

    <div class="dialog-body">
      <div class="message">棋譜コメントを問題のヒントとして取り込みますか？</div>
    </div>

    <div class="main-buttons">
      <button class="yes-btn" @click="onYes">はい</button>
      <button class="no-btn" @click="onNo">いいえ</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import DialogFrame from "./DialogFrame.vue";

const emit = defineEmits<{
  (e: "confirm", includeComments: boolean): void;
  (e: "close"): void;
}>();

const onYes = () => {
  emit("confirm", true);
  emit("close");
};

const onNo = () => {
  emit("confirm", false);
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
  min-height: 40px;
  padding: 12px 8px;
}
.message {
  font-size: 0.9em;
  color: var(--text-color);
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
.yes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
.yes-btn:hover {
  opacity: 0.85;
}
.no-btn {
  background-color: #ff9800;
  color: white;
  border-color: #ff9800;
}
.no-btn:hover {
  opacity: 0.85;
}
</style>
