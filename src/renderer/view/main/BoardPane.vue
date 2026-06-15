<template>
  <div>
    <BoardView
      :layout-type="layoutType || appSettings.boardLayoutType"
      :board-image-type="appSettings.boardImage"
      :custom-board-image-url="
        appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
      "
      :board-image-opacity="appSettings.enableTransparent ? appSettings.boardOpacity : 1"
      :board-grid-color="appSettings.boardGridColor || undefined"
      :piece-stand-image-type="appSettings.pieceStandImage"
      :custom-piece-stand-image-url="
        appSettings.pieceStandImageFileURL &&
        fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
      "
      :piece-stand-image-opacity="appSettings.enableTransparent ? appSettings.pieceStandOpacity : 1"
      :promotion-selector-style="appSettings.promotionSelectorStyle"
      :board-label-type="appSettings.boardLabelType"
      :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
      :king-piece-type="appSettings.kingPieceType"
      :max-size="maxSize"
      :position="store.record.position"
      :last-move="lastMove"
      :candidates="[]"
      :flip="appSettings.boardFlipping"
      :hide-clock="hideClock"
      :mobile="isMobileWebApp()"
      :allow-move="store.isMovableByUser"
      :allow-edit="store.appState === AppState.POSITION_EDITING"
      :enable-drag-and-drop="appSettings.enableDragAndDrop"
      :black-player-name="blackPlayerName"
      :white-player-name="whitePlayerName"
      :black-player-time="blackTime"
      :black-player-byoyomi="blackByoyomi"
      :white-player-time="whiteTime"
      :white-player-byoyomi="whiteByoyomi"
      :drop-shadows="!isMobileWebApp()"
      @resize="onResize"
      @move="onMove"
      @edit="onEdit"
    >
      <template #right-control>
        <ControlPane
          v-show="rightControlType !== RightSideControlType.NONE"
          class="full"
          :group="ControlGroup.Group1"
        />
      </template>
      <template #left-control>
        <ControlPane
          v-show="leftControlType !== LeftSideControlType.NONE"
          class="full"
          :group="ControlGroup.Group2"
        />
      </template>
    </BoardView>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, PropType } from "vue";
import { Color, Move, PositionChange, getBlackPlayerName, getWhitePlayerName } from "tsshogi";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import ControlPane, { ControlGroup } from "@/renderer/view/main/ControlPane.vue";

import { RectSize } from "@/common/assets/geometry.js";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import { useAppSettings } from "@/renderer/store/settings";
import {
  RightSideControlType,
  LeftSideControlType,
  getPieceImageURLTemplate,
} from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";
import { isMobileWebApp } from "@/renderer/ipc/api";
import { fileURLToCustomSchemeURL } from "@/common/url";

defineProps({
  maxSize: {
    type: RectSize,
    required: true,
  },
  layoutType: {
    type: String as PropType<BoardLayoutType>,
    required: false,
    default: undefined,
  },
  leftControlType: {
    type: String as PropType<LeftSideControlType>,
    required: false,
    default: LeftSideControlType.STANDARD,
  },
  rightControlType: {
    type: String as PropType<RightSideControlType>,
    required: false,
    default: RightSideControlType.STANDARD,
  },
});

const emit = defineEmits<{
  resize: [RectSize];
}>();

const store = useStore();
const appSettings = useAppSettings();

const onResize = (size: RectSize) => {
  emit("resize", size);
};

const onMove = (move: Move) => {
  store.doMove(move);
};

const onEdit = (change: PositionChange) => {
  store.editPosition(change);
};

const lastMove = computed(() => {
  const move = store.record.current.move;
  return move instanceof Move ? move : undefined;
});

// メモライズ時はプレイヤー名を動的に
const blackPlayerName = computed(() => {
  if (store.appState === AppState.MEMORIZE) {
    return store.memorizePlayerColor === Color.BLACK ? "あなた" : "相手";
  }
  return getBlackPlayerName(store.record.metadata) || t.sente;
});
const whitePlayerName = computed(() => {
  if (store.appState === AppState.MEMORIZE) {
    return store.memorizePlayerColor === Color.WHITE ? "あなた" : "相手";
  }
  return getWhitePlayerName(store.record.metadata) || t.gote;
});

// メモライズ解答中は時計を表示する
const hideClock = computed(() => {
  return store.appState !== AppState.MEMORIZE;
});

// メモライズ用時計の値を取得（リアクティブ）
const blackTime = computed(() => {
  if (store.appState === AppState.MEMORIZE && store.memorizeBlackTime >= 0) {
    return store.memorizeBlackTime;
  }
  return undefined;
});

const whiteTime = computed(() => {
  if (store.appState === AppState.MEMORIZE && store.memorizeWhiteTime >= 0) {
    return store.memorizeWhiteTime;
  }
  return undefined;
});

const blackByoyomi = computed(() => {
  if (store.appState === AppState.MEMORIZE && store.memorizeBlackByoyomi >= 0) {
    return store.memorizeBlackByoyomi;
  }
  return 0;
});

const whiteByoyomi = computed(() => {
  if (store.appState === AppState.MEMORIZE && store.memorizeWhiteByoyomi >= 0) {
    return store.memorizeWhiteByoyomi;
  }
  return 0;
});
</script>
