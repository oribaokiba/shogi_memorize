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

    <SolvePanel v-if="panelMode === 'solve'" :size="size" />
    <CreatePanel v-if="panelMode === 'create'" :size="size" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SolvePanel from "@/renderer/view/tab/SolvePanel.vue";
import CreatePanel from "@/renderer/view/tab/CreatePanel.vue";
import { RectSize } from "@/common/assets/geometry.js";

defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

type PanelMode = "solve" | "create";
const panelMode = ref<PanelMode>("solve");
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
</style>
