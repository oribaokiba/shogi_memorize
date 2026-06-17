<template>
  <DialogFrame @cancel="$emit('close')">
    <div class="title">問題一覧</div>
    <div class="list-count">全 {{ problems.length }} 問</div>
    <div class="list">
      <VueDraggable
        :list="problems"
        :item-key="(problem: any) => problems.indexOf(problem)"
        handle=".drag-handle"
        ghost-class="ghost"
        @change="onDragChange"
      >
        <template #item="{ element, index }">
          <div
            class="item"
            :class="{ current: currentEditingIndex === index }"
            @click="onSelectProblem(index)"
          >
            <span class="drag-handle">⠿</span>
            <span class="idx">{{ index + 1 }}</span>
            <span class="name">{{ element.name }}</span>
            <span class="moves">{{ element.moves.length }}手</span>
            <button class="icon-btn del-btn" @click.stop="onRemoveProblem(index)">
              <Icon :icon="IconType.DELETE" />
            </button>
          </div>
        </template>
      </VueDraggable>
    </div>
    <button class="close-button" data-hotkey="Escape" @click="onClose">閉じる</button>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import vuedraggable from "vuedraggable";
import DialogFrame from "./DialogFrame.vue";

const VueDraggable = vuedraggable;

const emit = defineEmits<{
  (e: "close"): void;
}>();
const onClose = () => emit("close");

const store = useStore();

const problems = computed(() => {
  return store.editCollection?.problems ?? [];
});

const currentEditingIndex = computed(() => {
  return store.editingProblemIndex;
});

const onSelectProblem = (idx: number) => {
  store.loadEditProblemToRecord(idx);
};

const onRemoveProblem = (idx: number) => {
  store.removeProblemFromEditCollection(idx);
};

const onDragChange = (evt: { moved?: { oldIndex: number; newIndex: number } }) => {
  if (evt.moved) {
    store.moveEditProblem(evt.moved.oldIndex, evt.moved.newIndex);
  }
};
</script>

<style scoped>
.title {
  font-size: 1.1em;
  font-weight: bold;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--text-separator-color);
  margin-bottom: 4px;
}
.list-count {
  font-size: 0.82em;
  color: var(--text-color-muted);
  padding: 2px 8px;
  margin-bottom: 4px;
}
.list {
  flex: 1;
  min-height: 100px;
  max-height: calc(80vh - 180px);
  overflow-y: auto;
  border: 1px solid var(--text-separator-color);
  border-radius: 2px;
}
.item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 0.88em;
  border-bottom: 1px solid var(--text-separator-color);
}
.item:last-child {
  border-bottom: none;
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
.close-button {
  display: block;
  margin: 10px auto 0;
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
.close-button:hover {
  background-color: var(--button-hover-bg-color);
}
</style>
