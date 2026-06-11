/* eslint-disable no-console */
import { defaultAppSettings } from "@/common/settings/app.js";
import { LogLevel } from "@/common/log.js";
import { Bridge } from "@/renderer/ipc/bridge.js";
import { getEmptyHistory } from "@/common/file/history.js";
import { emptyLayoutProfileList } from "@/common/settings/layout.js";
import { VersionStatus } from "@/common/version.js";

enum STORAGE_KEY {
  APP_SETTINGS = "appSetting",
}

const fileCache = new Map<string, ArrayBuffer>();

export const webAPI: Bridge = {
  // Core
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateAppState(_appState: AppState, _busy: boolean): void {
    // Do Nothing
  },
  fetchProcessArgs(): Promise<string> {
    return Promise.resolve(JSON.stringify({ type: "gui" }));
  },
  onClosable(): void {
    // Do Nothing
  },
  onClose(): void {
    // Do Nothing
  },
  onSendError(): void {
    // Do Nothing
  },
  onSendMessage(): void {
    // Do Nothing
  },
  onSendNotification(): void {
    // Do Nothing
  },
  onMenuEvent(): void {
    // Do Nothing
  },

  // Settings
  loadAppSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.APP_SETTINGS);
    if (json) {
      return Promise.resolve(json);
    }
    return Promise.resolve(JSON.stringify(defaultAppSettings()));
  },
  saveAppSettings(settings: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.APP_SETTINGS, settings);
    return Promise.resolve();
  },
  loadBookImportSettings(): Promise<string> {
    return Promise.resolve(JSON.stringify({}));
  },
  saveBookImportSettings(): Promise<void> {
    return Promise.resolve();
  },
  onUpdateAppSettings(): void {
    // Do Nothing
  },

  // Record File
  showOpenRecordDialog(): Promise<string> {
    return Promise.resolve("");
  },
  showSaveRecordDialog(): Promise<string> {
    return Promise.resolve("");
  },
  showSaveMergedRecordDialog(): Promise<string> {
    return Promise.resolve("");
  },
  openRecord(path: string): Promise<Uint8Array> {
    const data = fileCache.get(path);
    if (data) {
      return Promise.resolve(new Uint8Array(data));
    }
    return Promise.resolve(new Uint8Array());
  },
  saveRecord(): Promise<void> {
    return Promise.resolve();
  },
  loadRecordFileHistory(): Promise<string> {
    return Promise.resolve(JSON.stringify(getEmptyHistory()));
  },
  addRecordFileHistory(): void {
    // Do Nothing
  },
  clearRecordFileHistory(): Promise<void> {
    return Promise.resolve();
  },
  saveRecordFileBackup(): Promise<void> {
    return Promise.resolve();
  },
  loadRecordFileBackup(): Promise<string> {
    return Promise.resolve("");
  },
  loadRemoteTextFile(url: string): Promise<string> {
    return fetch(url).then((response) => response.text());
  },
  onOpenRecord(): void {
    // Do Nothing
  },

  // Book
  showOpenBookDialog(): Promise<string> {
    return Promise.resolve("");
  },
  showSaveBookDialog(): Promise<string> {
    return Promise.resolve("");
  },
  openBook(): Promise<void> {
    return Promise.resolve();
  },
  openBookAsNewSession(): Promise<number> {
    return Promise.resolve(0);
  },
  closeBookSession(): Promise<void> {
    return Promise.resolve();
  },
  saveBook(): Promise<void> {
    return Promise.resolve();
  },
  exportBook(): Promise<void> {
    return Promise.resolve();
  },
  clearBook(): Promise<void> {
    return Promise.resolve();
  },
  getBookFormat(): Promise<string> {
    return Promise.resolve("sbk");
  },
  searchBookMoves(): Promise<string> {
    return Promise.resolve("[]");
  },
  updateBookMove(): Promise<void> {
    return Promise.resolve();
  },
  removeBookMove(): Promise<void> {
    return Promise.resolve();
  },
  updateBookMoveOrder(): Promise<void> {
    return Promise.resolve();
  },
  importBookMoves(): Promise<string> {
    return Promise.resolve(JSON.stringify({ added: 0, merged: 0, skipped: 0 }));
  },

  // Images
  showSelectImageDialog(): Promise<string> {
    return Promise.resolve("");
  },
  cropPieceImage(): Promise<string> {
    return Promise.resolve("");
  },

  // Layout
  loadLayoutProfileList(): Promise<[string, string]> {
    return Promise.resolve(["", JSON.stringify(emptyLayoutProfileList())]);
  },
  updateLayoutProfileList(): void {
    // Do Nothing
  },
  onUpdateLayoutProfile(): void {
    // Do Nothing
  },
  createDesktopShortcutForLayoutProfile(): Promise<void> {
    return Promise.resolve();
  },

  // Log
  openLogFile(): void {
    // Do Nothing
  },
  log(level: LogLevel, message: string): void {
    if (level >= LogLevel.WARN) {
      console.error(message);
    } else {
      console.log(message);
    }
  },

  // MISC
  showSelectFileDialog(): Promise<string> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = () => {
        if (input.files && input.files[0]) {
          resolve(input.files[0].name);
        } else {
          resolve("");
        }
      };
      input.click();
    });
  },
  showSelectDirectoryDialog(): Promise<string> {
    return Promise.resolve("");
  },
  openExplorer(): void {
    // Do Nothing
  },
  openWebBrowser(url: string): void {
    window.open(url, "_blank");
  },
  isEncryptionAvailable(): Promise<boolean> {
    return Promise.resolve(false);
  },
  getVersionStatus(): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        knownReleases: undefined,
      } as VersionStatus),
    );
  },
  getPathForFile(): string {
    return "";
  },
};
