<template>
  <div>
    <div ref="root" class="full column" :class="{ compact }">
      <div
        v-if="group === ControlGroup.Group1 || group === ControlGroup.All"
        class="full column control-box"
      >
        <!-- 局面編集 -->
        <button
          v-show="store.appState === AppState.NORMAL"
          class="control-item"
          @click="onStartEditPosition"
        >
          <Icon :icon="IconType.EDIT" />
          <span :class="{ tooltip: compact }">{{ t.setupPosition }}</span>
        </button>
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item close"
          @click="onEndEditPosition"
        >
          <Icon :icon="IconType.CHECK" />
          <span :class="{ tooltip: compact }">{{ t.completePositionSetup }}</span>
        </button>
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onChangeTurn"
        >
          <Icon :icon="IconType.SWAP" />
          <span :class="{ tooltip: compact }">{{ t.changeTurn }}</span>
        </button>
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onInitPosition"
        >
          <Icon :icon="IconType.REFRESH" />
          <span :class="{ tooltip: compact }">{{ t.initializePosition }}</span>
        </button>
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onPieceSetChange"
        >
          <Icon :icon="IconType.EQUALIZER" />
          <span :class="{ tooltip: compact }">{{ t.changePieceSet }}</span>
        </button>
      </div>
      <div
        v-if="group === ControlGroup.Group2 || group === ControlGroup.All"
        class="full column control-box"
      >
        <button
          class="control-item"
          :disabled="store.appState !== AppState.NORMAL"
          @click="onRemoveCurrentMove"
        >
          <Icon :icon="IconType.DELETE" />
          <span :class="{ tooltip: compact }">{{ t.deleteMove }}</span>
        </button>
        <button class="control-item" @click="onFileAction">
          <Icon :icon="IconType.FILE" />
          <span :class="{ tooltip: compact }">{{ t.file }}</span>
        </button>
        <button class="control-item" @click="onFlip">
          <Icon :icon="IconType.FLIP" />
          <span :class="{ tooltip: compact }">{{ t.flipBoard }}</span>
        </button>
        <button class="control-item" @click="onOpenAppSettings">
          <Icon :icon="IconType.SETTINGS" />
          <span :class="{ tooltip: compact }">{{ t.appSettings }}</span>
        </button>
      </div>
      <FileMenu v-if="isFileMenuVisible" @close="isFileMenuVisible = false" />
      <InitialPositionMenu
        v-if="isInitialPositionMenuVisible"
        @close="isInitialPositionMenuVisible = false"
      />
    </div>
  </div>
</template>

<script lang="ts">
export enum ControlGroup {
  Group1,
  Group2,
  All,
}
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, PropType, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { AppState } from "@/common/control/state.js";
import { IconType } from "@/renderer/assets/icons";
import FileMenu from "@/renderer/view/menu/FileMenu.vue";
import InitialPositionMenu from "@/renderer/view/menu/InitialPositionMenu.vue";
import { useAppSettings } from "@/renderer/store/settings";
import {
  installHotKeyForMainWindow,
  uninstallHotKeyForMainWindow,
} from "@/renderer/devices/hotkey";

defineProps({
  group: {
    type: Number as PropType<ControlGroup>,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const store = useStore();
const appSettings = useAppSettings();
const root = ref();
const isFileMenuVisible = ref(false);
const isInitialPositionMenuVisible = ref(false);

onMounted(() => {
  installHotKeyForMainWindow(root.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForMainWindow(root.value);
});

const onStartEditPosition = () => {
  store.startPositionEditing();
};

const onEndEditPosition = () => {
  store.endPositionEditing();
};

const onInitPosition = () => {
  isInitialPositionMenuVisible.value = true;
};

const onChangeTurn = () => {
  store.changeTurn();
};

const onPieceSetChange = () => {
  store.showPieceSetChangeDialog();
};

const onOpenAppSettings = () => {
  store.showAppSettingsDialog();
};

const onFlip = () => {
  appSettings.flipBoard();
};

const onFileAction = () => {
  isFileMenuVisible.value = true;
};

const onRemoveCurrentMove = () => {
  store.removeCurrentMove();
};
</script>

<style scoped>
.control-item {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  height: 20%;
  font-size: 80%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.compact .control-item {
  justify-content: center;
  text-align: center;
  overflow: visible;
}
.control-item .icon {
  height: 68%;
  width: auto;
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
  object-fit: contain;
}
.compact .control-item .icon {
  height: 48%;
}
.control-item span {
  line-height: 1;
}
.control-item .icon + span {
  margin-left: 5px;
}
.tooltip {
  display: none;
  position: absolute;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  border: 1px solid var(--main-color);
  border-radius: 5px;
  padding: 5px;
  z-index: 100;
}
.compact .control-item .tooltip {
  margin-left: 0;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
}
.control-item:hover > .tooltip {
  display: block;
}
</style>
