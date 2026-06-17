/* eslint-disable no-console */
import { defaultAppSettings } from "@/common/settings/app.js";
import { LogLevel } from "@/common/log.js";
import { Bridge } from "@/renderer/ipc/bridge.js";
import { getEmptyHistory } from "@/common/file/history.js";
import { emptyLayoutProfileList } from "@/common/settings/layout.js";
import { VersionStatus } from "@/common/version.js";
import { AppState } from "@/common/control/state.js";
import { BookFormat } from "@/common/book.js";

enum STORAGE_KEY {
  APP_SETTINGS = "appSetting",
}

const fileCache = new Map<string, ArrayBuffer>();
/** File System Access API用: 選択されたファイルのハンドルをキャッシュ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentRecordFileHandle: any = null;

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
    // File System Access APIが利用可能なら使用
    if ("showOpenFilePicker" in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any)
        .showOpenFilePicker({
          types: [
            {
              description: "棋譜ファイル",
              accept: {
                "text/*": [
                  ".kif",
                  ".kifu",
                  ".ki2",
                  ".ki2u",
                  ".csa",
                  ".usi",
                  ".jkf",
                  ".sfen",
                  ".json",
                ],
              },
            },
          ],
        })
        .then(
          (
            handles: {
              name: string;
            }[],
          ) => {
            if (handles.length > 0) {
              currentRecordFileHandle = handles[0];
              return handles[0].name;
            }
            return "";
          },
        )
        .catch(() => "");
    }
    return Promise.resolve("");
  },
  showSaveRecordDialog(defaultPath: string): Promise<string> {
    // File System Access APIが利用可能なら使用
    if ("showSaveFilePicker" in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any)
        .showSaveFilePicker({
          suggestedName: defaultPath,
          types: [
            {
              description: "棋譜ファイル",
              accept: {
                "text/*": [".kif", ".kifu", ".ki2", ".ki2u", ".csa", ".usi", ".jkf"],
              },
            },
          ],
        })
        .then((handle: { name: string }) => {
          currentRecordFileHandle = handle;
          return handle.name;
        })
        .catch(() => "");
    }
    return Promise.resolve("");
  },
  showSaveMergedRecordDialog(): Promise<string> {
    return Promise.resolve("");
  },
  showSaveYAMLDialog(defaultPath: string): Promise<string> {
    if ("showSaveFilePicker" in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any)
        .showSaveFilePicker({
          suggestedName: defaultPath,
          types: [
            {
              description: "YAML",
              accept: { "text/*": [".yaml", ".yml"] },
            },
          ],
        })
        .then((handle: { name: string }) => {
          currentRecordFileHandle = handle;
          return handle.name;
        })
        .catch(() => "");
    }
    return Promise.resolve("");
  },
  async saveYAMLFile(_path: string, data: string): Promise<void> {
    if (currentRecordFileHandle && "createWritable" in currentRecordFileHandle) {
      const writable = await currentRecordFileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    }
    const blob = new Blob([data], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = _path.split("/").pop() || "problems.yaml";
    a.click();
    URL.revokeObjectURL(url);
  },
  openRecord(path: string): Promise<Uint8Array> {
    // キャッシュされたファイルハンドルから読み込む
    if (currentRecordFileHandle && "getFile" in currentRecordFileHandle) {
      return currentRecordFileHandle
        .getFile()
        .then((file: File) => {
          return file.arrayBuffer();
        })
        .then((buffer: ArrayBuffer) => {
          fileCache.set(path, buffer);
          return new Uint8Array(buffer);
        })
        .catch(() => {
          return new Uint8Array();
        });
    }
    // フォールバック: キャッシュから読み込む
    const data = fileCache.get(path);
    if (data) {
      return Promise.resolve(new Uint8Array(data));
    }
    return Promise.resolve(new Uint8Array());
  },
  async saveRecord(path: string, data: Uint8Array): Promise<void> {
    // File System Access APIのファイルハンドルがあれば、そこへ書き込む
    if (currentRecordFileHandle && "createWritable" in currentRecordFileHandle) {
      const writable = await currentRecordFileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    }
    // フォールバック: ダウンロード
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([data as any], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "record.kif";
    a.click();
    URL.revokeObjectURL(url);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getBookFormat(_session: number): Promise<BookFormat> {
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
