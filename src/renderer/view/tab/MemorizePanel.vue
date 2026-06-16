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
        :disabled="store.isSolving"
        @click="panelMode = 'create'"
      >
        問題を作成
      </button>
    </div>

    <SolvePanel v-if="panelMode === 'solve'" :size="contentSize" />
    <CreatePanel v-if="panelMode === 'create'" :size="contentSize" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/renderer/store";
import SolvePanel from "@/renderer/view/tab/SolvePanel.vue";
import CreatePanel from "@/renderer/view/tab/CreatePanel.vue";
import { RectSize } from "@/common/assets/geometry.js";

const MODE_SWITCH_HEIGHT = 25; // モード切替タブ（24px） + border-bottom（1px）

const props = defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

const contentSize = computed(() => {
  if (!props.size) {
    return undefined;
  }
  return new RectSize(props.size.width, props.size.height - MODE_SWITCH_HEIGHT);
});

const store = useStore();

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
.mode-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mode-tab:disabled:hover {
  background: none;
}
</style>
