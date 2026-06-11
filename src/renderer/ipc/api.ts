import { AppSettings } from "@/common/settings/app.js";
import { webAPI } from "./web.js";
import { AppState } from "@/common/control/state.js";
import { LogLevel, LogType } from "@/common/log.js";
import { Rect } from "@/common/assets/geometry.js";
import { RecordFileHistory } from "@/common/file/history.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { VersionStatus } from "@/common/version.js";
import { Bridge } from "./bridge.js";
import { LayoutProfileList } from "@/common/settings/layout.js";
import { BookFormat, BookImportSummary, BookLoadingOptions, BookMove } from "@/common/book.js";
import { BookImportSettings } from "@/common/settings/book.js";
import { ProcessArgs } from "@/common/ipc/process.js";

type AppInfo = {
  appVersion?: string;
  buildVersion?: string;
};

export interface API {
  // Core
  updateAppState(appState: AppState, busy: boolean): void;
  fetchProcessArgs(): Promise<ProcessArgs>;

  // Settings
  loadAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<void>;
  loadBookImportSettings(): Promise<BookImportSettings>;
  saveBookImportSettings(settings: BookImportSettings): Promise<void>;

  // Record File
  showOpenRecordDialog(formats: RecordFileFormat[]): Promise<string>;
  showSaveRecordDialog(defaultPath: string): Promise<string>;
  showSaveMergedRecordDialog(defaultPath: string): Promise<string>;
  openRecord(path: string): Promise<Uint8Array>;
  saveRecord(path: string, data: Uint8Array): Promise<void>;
  loadRecordFileHistory(): Promise<RecordFileHistory>;
  addRecordFileHistory(path: string): void;
  clearRecordFileHistory(): Promise<void>;
  saveRecordFileBackup(kif: string): Promise<void>;
  loadRecordFileBackup(name: string): Promise<string>;
  loadRemoteTextFile(url: string): Promise<string>;

  // Book
  showOpenBookDialog(): Promise<string>;
  showSaveBookDialog(session: number, targetFormat?: BookFormat): Promise<string>;
  openBook(session: number, path: string, options: BookLoadingOptions): Promise<void>;
  openBookAsNewSession(path: string, options: BookLoadingOptions): Promise<number>;
  closeBookSession(session: number): Promise<void>;
  saveBook(session: number, path: string): Promise<void>;
  exportBook(session: number, path: string, targetFormat: BookFormat): Promise<void>;
  clearBook(session: number, format?: BookFormat): Promise<void>;
  getBookFormat(session: number): Promise<BookFormat>;
  searchBookMoves(session: number, sfen: string): Promise<BookMove[]>;
  updateBookMove(session: number, sfen: string, move: BookMove): Promise<void>;
  removeBookMove(session: number, sfen: string, usi: string): Promise<void>;
  updateBookMoveOrder(session: number, sfen: string, usi: string, order: number): Promise<void>;
  importBookMoves(session: number, settings: BookImportSettings): Promise<BookImportSummary>;

  // Images
  showSelectImageDialog(defaultURL?: string): Promise<string>;
  cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string>;

  // Layout
  loadLayoutProfileList(): Promise<[string, LayoutProfileList]>;
  updateLayoutProfileList(uri: string, profileList: LayoutProfileList): void;
  createDesktopShortcutForLayoutProfile(uri: string, name: string): Promise<void>;

  // Log
  openLogFile(logType: LogType): void;
  log(level: LogLevel, message: string): void;

  // MISC
  showSelectFileDialog(): Promise<string>;
  showSelectDirectoryDialog(defaultPath?: string): Promise<string>;
  openExplorer(path: string): void;
  openWebBrowser(url: string): void;
  isEncryptionAvailable(): Promise<boolean>;
  getVersionStatus(): Promise<VersionStatus>;
  onSendNotification(callback: (message: string, url?: string) => void): void;
  getPathForFile(file: File): string;
}

interface ExtendedWindow extends Window {
  electronShogi?: AppInfo;
  electronShogiAPI?: Bridge;
}

function getWindowObject(): ExtendedWindow {
  return window as unknown as ExtendedWindow;
}

export const appInfo: AppInfo = getWindowObject().electronShogi || {};

export const bridge: Bridge = getWindowObject().electronShogiAPI || webAPI;

const api: API = {
  ...bridge,

  // Core
  async fetchProcessArgs(): Promise<ProcessArgs> {
    return JSON.parse(await bridge.fetchProcessArgs());
  },

  // Settings
  async loadAppSettings(): Promise<AppSettings> {
    return JSON.parse(await bridge.loadAppSettings());
  },
  saveAppSettings(settings: AppSettings): Promise<void> {
    return bridge.saveAppSettings(JSON.stringify(settings));
  },
  async loadBookImportSettings(): Promise<BookImportSettings> {
    return JSON.parse(await bridge.loadBookImportSettings());
  },
  saveBookImportSettings(settings: BookImportSettings): Promise<void> {
    return bridge.saveBookImportSettings(JSON.stringify(settings));
  },

  // Record File
  async loadRecordFileHistory(): Promise<RecordFileHistory> {
    return JSON.parse(await bridge.loadRecordFileHistory());
  },

  // Book
  async getBookFormat(session: number): Promise<BookFormat> {
    return await bridge.getBookFormat(session);
  },
  openBook(session: number, path: string, options: BookLoadingOptions): Promise<void> {
    return bridge.openBook(session, path, JSON.stringify(options));
  },
  async openBookAsNewSession(path: string, options: BookLoadingOptions): Promise<number> {
    return await bridge.openBookAsNewSession(path, JSON.stringify(options));
  },
  async searchBookMoves(session: number, sfen: string): Promise<BookMove[]> {
    return JSON.parse(await bridge.searchBookMoves(session, sfen));
  },
  updateBookMove(session: number, sfen: string, move: BookMove): Promise<void> {
    return bridge.updateBookMove(session, sfen, JSON.stringify(move));
  },
  async importBookMoves(session: number, settings: BookImportSettings): Promise<BookImportSummary> {
    return JSON.parse(await bridge.importBookMoves(session, JSON.stringify(settings)));
  },

  // Layout
  async loadLayoutProfileList(): Promise<[string, LayoutProfileList]> {
    const [uri, json] = await bridge.loadLayoutProfileList();
    return [uri, JSON.parse(json)];
  },
  updateLayoutProfileList(uri: string, profileList: LayoutProfileList): void {
    bridge.updateLayoutProfileList(uri, JSON.stringify(profileList));
  },

  // MISC
  async getVersionStatus(): Promise<VersionStatus> {
    return JSON.parse(await bridge.getVersionStatus());
  },
};

export default api;

export function isNative(): boolean {
  return !!getWindowObject().electronShogiAPI;
}

export function isMobileWebApp(): boolean {
  if (isNative()) {
    return false;
  }
  const urlParams = new URL(window.location.toString()).searchParams;
  return urlParams.has("mobile");
}
