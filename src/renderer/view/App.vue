<template>
  <div
    class="root full"
    :class="[appSettings.thema, dialogPosition, dialogBackdrop]"
    :style="style"
  >
    <!-- Main Contents -->
    <MobileLayout v-if="isMobileWebApp()" />
    <CustomLayout v-else-if="store.customLayout" :profile="store.customLayout" />
    <StandardLayout v-else class="full" />

    <!-- Dialogs -->
    <BusyMessage v-if="busyState.isBusy" />
    <InfoMessage v-if="messageStore.hasMessage" />
    <ErrorMessage v-if="errorStore.hasError" />
    <ConfirmDialog v-if="confirmation.message" />
    <RecordFileHistoryDialog v-if="store.appState === AppState.RECORD_FILE_HISTORY_DIALOG" />
    <AppSettingsDialog v-if="store.isAppSettingsDialogVisible" />
    <PasteDialog v-if="store.appState === AppState.PASTE_DIALOG" />
    <LoadRemoteFileDialog v-if="store.appState === AppState.LOAD_REMOTE_FILE_DIALOG" />
    <AddBookMovesDialog v-if="store.appState === AppState.ADD_BOOK_MOVES_DIALOG" />
    <ResetBookDialog v-if="store.appState === AppState.RESET_BOOK_DIALOG" />
    <PieceSetChangeDialog v-if="store.appState === AppState.PIECE_SET_CHANGE_DIALOG" />
    <MemorizeSolveDialog v-if="store.isMemorizeSolveDialogVisible" />
    <MemorizeCreateDialog v-if="store.isMemorizeCreateDialogVisible" />
    <SearchDuplicatePositionsDialog
      v-if="store.appState === AppState.SEARCH_DUPLICATE_POSITIONS_DIALOG"
      @close="store.destroyModalDialog()"
    />
    <!-- アプリ内通知 -->
    <NotificationOverlay />
    <!-- PCブラウザの場合のみライセンスへの遷移が無いので、画面の隅にボタンを表示する。 -->
    <button v-if="!isNative() && !isMobileWebApp()" class="copyright" @click="openCopyright">
      &copy;
    </button>
    <!-- copy/paste イベントを拾えない問題があるので隠しボタンを置いて google/hotkey でイベントを受け取る。 -->
    <!-- https://github.com/sunfish-shogi/shogihome/issues/1114 -->
    <div ref="clipboard" hidden>
      <button data-hotkey="Mod+c" @click="onCopy"></button>
      <button data-hotkey="Mod+v" @click="onPaste"></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StandardLayout from "@/renderer/view/main/StandardLayout.vue";
import AppSettingsDialog from "@/renderer/view/dialog/AppSettingsDialog.vue";
import PasteDialog from "@/renderer/view/dialog/PasteDialog.vue";
import BusyMessage from "@/renderer/view/dialog/BusyMessage.vue";
import ConfirmDialog from "@/renderer/view/dialog/ConfirmDialog.vue";
import InfoMessage from "@/renderer/view/dialog/InfoMessage.vue";
import ErrorMessage from "@/renderer/view/dialog/ErrorMessage.vue";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import { useAppSettings } from "@/renderer/store/settings";
import { BackgroundImageType } from "@/common/settings/app";
import RecordFileHistoryDialog from "./dialog/RecordFileHistoryDialog.vue";
import PieceSetChangeDialog from "./dialog/PieceSetChangeDialog.vue";
import LoadRemoteFileDialog from "./dialog/LoadRemoteFileDialog.vue";
import AddBookMovesDialog from "./dialog/AddBookMovesDialog.vue";
import ResetBookDialog from "./dialog/ResetBookDialog.vue";
import SearchDuplicatePositionsDialog from "./dialog/SearchDuplicatePositionsDialog.vue";
import MemorizeSolveDialog from "./dialog/MemorizeSolveDialog.vue";
import MemorizeCreateDialog from "./dialog/MemorizeCreateDialog.vue";
import NotificationOverlay from "./overlay/NotificationOverlay.vue";
import { useBusyState } from "@/renderer/store/busy";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import { useConfirmationStore } from "@/renderer/store/confirm";
import CustomLayout from "./main/CustomLayout.vue";
import MobileLayout from "./main/MobileLayout.vue";
import api, { isMobileWebApp, isNative } from "@/renderer/ipc/api";
import { openCopyright } from "@/renderer/helpers/copyright";
import { installHotKeyForMainWindow } from "@/renderer/devices/hotkey";
import { DialogPosition } from "@/common/settings/layout";
import { fileURLToCustomSchemeURL } from "@/common/url";

const clipboard = ref();
const appSettings = useAppSettings();
const store = useStore();
const messageStore = useMessageStore();
const errorStore = useErrorStore();
const busyState = useBusyState();
const confirmation = useConfirmationStore();

const onCopy = () => {
  store.copyRecordKIF();
};

const onPaste = () => {
  store.showPasteDialog();
};

onMounted(() => {
  installHotKeyForMainWindow(clipboard.value);
  const body = document.getElementsByTagName("body")[0];
  body.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  body.addEventListener("drop", (event: DragEvent) => {
    if (isNative() && event.dataTransfer && event.dataTransfer.files[0]) {
      try {
        const path = api.getPathForFile(event.dataTransfer.files[0]);
        if (path) {
          store.openRecord(path);
        }
      } catch (e) {
        // Webアプリ版でドロップされた場合はパス取得が失敗することがあるため、ここでは無視する
      }
    }
    event.preventDefault();
  });
});

const dialogPosition = computed(() =>
  !store.customLayout?.dialogPosition || store.customLayout.dialogPosition === DialogPosition.CENTER
    ? "dialog-position-center"
    : store.customLayout.dialogPosition === DialogPosition.LEFT
      ? "dialog-position-left"
      : "dialog-position-right",
);

const dialogBackdrop = computed(() =>
  !store.customLayout || store.customLayout.dialogBackdrop
    ? "dialog-backdrop"
    : "dialog-no-backdrop",
);

const style = computed(() => {
  const style: { [key: string]: string } = {};
  if (
    appSettings.backgroundImageType !== BackgroundImageType.NONE &&
    appSettings.backgroundImageFileURL
  ) {
    let size = "";
    switch (appSettings.backgroundImageType) {
      case BackgroundImageType.COVER:
        size = "cover";
        break;
      case BackgroundImageType.CONTAIN:
        size = "contain";
        break;
      case BackgroundImageType.TILE:
        size = "auto";
        break;
    }
    style["background-image"] =
      `url("${fileURLToCustomSchemeURL(appSettings.backgroundImageFileURL)}")`;
    style["background-size"] = size;
  }
  if (store.customLayout?.backgroundColor) {
    style["background-color"] = store.customLayout.backgroundColor;
  }
  return style;
});
</script>

<style scoped>
.root {
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
button.copyright {
  display: inline-block;
  position: absolute;
  z-index: 1000;
  right: 0;
  bottom: 0;
  height: 30px;
  width: 30px;
  font-size: 100%;
}
</style>
