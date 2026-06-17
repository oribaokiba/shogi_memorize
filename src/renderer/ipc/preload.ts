import { MenuEvent } from "@/common/control/menu";
import { AppState } from "@/common/control/state";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { Background, Renderer } from "@/common/ipc/channel";
import { Bridge } from "@/renderer/ipc/bridge";
import { LogType, LogLevel } from "@/common/log";
import { BookFormat } from "@/common/book";

const api: Bridge = {
  // Core
  updateAppState(appState: AppState, busy: boolean): void {
    ipcRenderer.send(Background.UPDATE_APP_STATE, appState, busy);
  },
  async fetchProcessArgs(): Promise<string> {
    return await ipcRenderer.invoke(Background.FETCH_PROCESS_ARGS);
  },
  onClosable(): void {
    ipcRenderer.send(Background.ON_CLOSABLE);
  },
  onClose(callback: (confirmations: string[]) => void): void {
    ipcRenderer.on(Renderer.CLOSE, (_, confirmations: string[]) => {
      callback(confirmations);
    });
  },
  onSendError(callback: (e: string) => void): void {
    ipcRenderer.on(Renderer.SEND_ERROR, (_, e) => {
      callback(e);
    });
  },
  onSendMessage(callback: (json: string) => void): void {
    ipcRenderer.on(Renderer.SEND_MESSAGE, (_, json) => {
      callback(json);
    });
  },
  onSendNotification(callback: (message: string, url?: string) => void): void {
    ipcRenderer.on(Renderer.SEND_NOTIFICATION, (_, message, url) => {
      callback(message, url);
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMenuEvent(callback: (event: MenuEvent, ...args: any[]) => void): void {
    ipcRenderer.on(Renderer.MENU_EVENT, (_, event, ...args) => callback(event, ...args));
  },

  // Settings
  async loadAppSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_APP_SETTINGS);
  },
  async saveAppSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_APP_SETTINGS, json);
  },
  async loadBookImportSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_BOOK_IMPORT_SETTINGS);
  },
  async saveBookImportSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_BOOK_IMPORT_SETTINGS, json);
  },
  onUpdateAppSettings(callback: (json: string) => void): void {
    ipcRenderer.on(Renderer.UPDATE_APP_SETTINGS, (_, json) => callback(json));
  },

  // Record File
  async showOpenRecordDialog(formats: string[]): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_OPEN_RECORD_DIALOG, formats);
  },
  async showSaveRecordDialog(defaultPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_RECORD_DIALOG, defaultPath);
  },
  async showSaveMergedRecordDialog(defaultPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_MERGED_RECORD_DIALOG, defaultPath);
  },
  async showSaveYAMLDialog(defaultPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_YAML_DIALOG, defaultPath);
  },
  async saveYAMLFile(path: string, data: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_YAML_FILE, path, data);
  },
  async openRecord(path: string): Promise<Uint8Array> {
    return await ipcRenderer.invoke(Background.OPEN_RECORD, path);
  },
  async saveRecord(path: string, data: Uint8Array): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_RECORD, path, data);
  },
  async loadRemoteTextFile(url: string): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_REMOTE_TEXT_FILE, url);
  },
  async loadRecordFileHistory(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_RECORD_FILE_HISTORY);
  },
  addRecordFileHistory(path: string): void {
    ipcRenderer.send(Background.ADD_RECORD_FILE_HISTORY, path);
  },
  async clearRecordFileHistory(): Promise<void> {
    ipcRenderer.invoke(Background.CLEAR_RECORD_FILE_HISTORY);
  },
  async saveRecordFileBackup(kif: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_RECORD_FILE_BACKUP, kif);
  },
  async loadRecordFileBackup(name: string): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_RECORD_FILE_BACKUP, name);
  },
  onOpenRecord(callback: (path: string) => void): void {
    ipcRenderer.on(Renderer.OPEN_RECORD, (_, path) => callback(path));
  },

  // Book
  async showOpenBookDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_OPEN_BOOK_DIALOG);
  },
  async showSaveBookDialog(session: number, targetFormat?: BookFormat): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_BOOK_DIALOG, session, targetFormat);
  },
  async clearBook(session: number, format?: BookFormat): Promise<void> {
    return await ipcRenderer.invoke(Background.CLEAR_BOOK, session, format);
  },
  async openBook(session: number, path: string, json: string): Promise<void> {
    await ipcRenderer.invoke(Background.OPEN_BOOK, session, path, json);
  },
  async openBookAsNewSession(path: string, json: string): Promise<number> {
    return await ipcRenderer.invoke(Background.OPEN_BOOK_AS_NEW_SESSION, path, json);
  },
  async closeBookSession(session: number): Promise<void> {
    return await ipcRenderer.invoke(Background.CLOSE_BOOK_SESSION, session);
  },
  async saveBook(session: number, path: string): Promise<void> {
    return await ipcRenderer.invoke(Background.SAVE_BOOK, session, path);
  },
  async exportBook(session: number, path: string, targetFormat: BookFormat): Promise<void> {
    return await ipcRenderer.invoke(Background.EXPORT_BOOK, session, path, targetFormat);
  },
  async getBookFormat(session: number): Promise<BookFormat> {
    return await ipcRenderer.invoke(Background.GET_BOOK_FORMAT, session);
  },
  async searchBookMoves(session: number, sfen: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SEARCH_BOOK_MOVES, session, sfen);
  },
  async updateBookMove(session: number, sfen: string, json: string): Promise<void> {
    return await ipcRenderer.invoke(Background.UPDATE_BOOK_MOVE, session, sfen, json);
  },
  async removeBookMove(session: number, sfen: string, usi: string): Promise<void> {
    return await ipcRenderer.invoke(Background.REMOVE_BOOK_MOVE, session, sfen, usi);
  },
  async updateBookMoveOrder(
    session: number,
    sfen: string,
    usi: string,
    order: number,
  ): Promise<void> {
    return await ipcRenderer.invoke(Background.UPDATE_BOOK_MOVE_ORDER, session, sfen, usi, order);
  },
  async importBookMoves(session: number, json: string): Promise<string> {
    return await ipcRenderer.invoke(Background.IMPORT_BOOK_MOVES, session, json);
  },

  // Images
  async showSelectImageDialog(defaultURL?: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_IMAGE_DIALOG, defaultURL);
  },
  async cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string> {
    return await ipcRenderer.invoke(Background.CROP_PIECE_IMAGE, srcURL, deleteMargin);
  },

  // Layout
  async loadLayoutProfileList(): Promise<[string, string]> {
    return await ipcRenderer.invoke(Background.LOAD_LAYOUT_PROFILE_LIST);
  },
  updateLayoutProfileList(uri: string, profileList: string): void {
    ipcRenderer.send(Background.UPDATE_LAYOUT_PROFILE_LIST, uri, profileList);
  },
  onUpdateLayoutProfile(callback: (json: string | null) => void): void {
    ipcRenderer.on(Renderer.UPDATE_LAYOUT_PROFILE, (_, json) => {
      callback(json);
    });
  },
  async createDesktopShortcutForLayoutProfile(uri: string, name: string) {
    await ipcRenderer.invoke(Background.CREATE_DESKTOP_SHORTCUT_FOR_LAYOUT_PROFILE, uri, name);
  },

  // Log
  openLogFile(logType: LogType): void {
    ipcRenderer.send(Background.OPEN_LOG_FILE, logType);
  },
  log(level: LogLevel, message: string): void {
    ipcRenderer.send(Background.LOG, level, message);
  },

  // MISC
  async showSelectFileDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_FILE_DIALOG);
  },
  async showSelectDirectoryDialog(defaultPath?: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_DIRECTORY_DIALOG, defaultPath);
  },
  openExplorer(path: string) {
    ipcRenderer.send(Background.OPEN_EXPLORER, path);
  },
  openWebBrowser(url: string) {
    ipcRenderer.send(Background.OPEN_WEB_BROWSER, url);
  },
  async isEncryptionAvailable(): Promise<boolean> {
    return await ipcRenderer.invoke(Background.IS_ENCRYPTION_AVAILABLE);
  },
  async getVersionStatus(): Promise<string> {
    return await ipcRenderer.invoke(Background.GET_VERSION_STATUS);
  },
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld("electronShogiAPI", api);
