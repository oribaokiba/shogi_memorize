<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">{{ t.loadRecordFromWeb }}</div>
    <div class="form-group">
      <div class="form-item">
        <input v-model.trim="url" class="url" type="text" placeholder="URL" />
      </div>
      <div class="note">{{ t.supportsKIF_KI2_CSA_USI_SFEN_JKF_USEN }}</div>
      <div class="note">{{ t.pleaseSpecifyPlainTextURL }}</div>
      <div class="note">{{ t.redirectNotSupported }}</div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="open(url)">
        {{ t.ok }}
      </button>
      <button data-hotkey="Escape" @click="onCancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { onMounted, ref } from "vue";
import { useStore } from "@/renderer/store";
import { isNative } from "@/renderer/ipc/api";
import { useErrorStore } from "@/renderer/store/error";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const url = ref("");

function open(url: string) {
  if (!url) {
    useErrorStore().add("URL is required.");
    return;
  }
  store.closeModalDialog();
  store.loadRemoteRecordFile(url);
}

function onCancel() {
  store.closeModalDialog();
}

onMounted(async () => {
  if (!isNative()) {
    return;
  }
  const copied = (await navigator.clipboard.readText()).trim();
  if (copied && /^https?:\/\//.test(copied)) {
    url.value = copied;
  }
});
</script>

<style scoped>
.form-group {
  width: 800px;
  max-width: calc(100vw - 50px);
}
.url {
  width: calc(100% - 20px);
}
</style>
