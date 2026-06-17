import { BookFormat } from "@/common/book";
import { MenuEvent } from "@/common/control/menu.js";
import { AppState } from "@/common/control/state.js";
import { RecordFileFormat } from "@/common/file/record";
import { LogLevel, LogType } from "@/common/log.js";

export interface Bridge {
  // Core
  updateAppState(appState: AppState, busy: boolean): void;
  fetchProcessArgs(): Promise<string>;
  onClosable(): void;
  onClose(callback: (confirmations: string[]) => void): void;
  onSendError(callback: (e: string) => void): void;
  onSendMessage(callback: (json: string) => void): void;
  onSendNotification(callback: (message: string, url?: string) => void): void;
  onMenuEvent(callback: (event: MenuEvent) => void): void;

  // Settings
  loadAppSettings(): Promise<string>;
  saveAppSettings(settings: string): Promise<void>;
  loadBookImportSettings(): Promise<string>;
  saveBookImportSettings(json: string): Promise<void>;
  onUpdateAppSettings(callback: (json: string) => void): void;

  // Record File
  showOpenRecordDialog(formats: RecordFileFormat[]): Promise<string>;
  showSaveRecordDialog(defaultPath: string): Promise<string>;
  showSaveMergedRecordDialog(defaultPath: string): Promise<string>;
  showSaveYAMLDialog(defaultPath: string): Promise<string>;
  saveYAMLFile(path: string, data: string): Promise<void>;
  openRecord(path: string): Promise<Uint8Array>;
  saveRecord(path: string, data: Uint8Array): Promise<void>;
  loadRecordFileHistory(): Promise<string>;
  addRecordFileHistory(path: string): void;
  clearRecordFileHistory(): Promise<void>;
  saveRecordFileBackup(kif: string): Promise<void>;
  loadRecordFileBackup(name: string): Promise<string>;
  loadRemoteTextFile(url: string): Promise<string>;
  onOpenRecord(callback: (path: string) => void): void;

  // Book
  showOpenBookDialog(): Promise<string>;
  showSaveBookDialog(session: number, targetFormat?: BookFormat): Promise<string>;
  openBook(session: number, path: string, json: string): Promise<void>;
  openBookAsNewSession(path: string, json: string): Promise<number>;
  closeBookSession(session: number): Promise<void>;
  saveBook(session: number, path: string): Promise<void>;
  exportBook(session: number, path: string, targetFormat: BookFormat): Promise<void>;
  clearBook(session: number, format?: BookFormat): Promise<void>;
  getBookFormat(session: number): Promise<BookFormat>;
  searchBookMoves(session: number, sfen: string): Promise<string>;
  updateBookMove(session: number, sfen: string, move: string): Promise<void>;
  removeBookMove(session: number, sfen: string, usi: string): Promise<void>;
  updateBookMoveOrder(session: number, sfen: string, usi: string, order: number): Promise<void>;
  importBookMoves(session: number, json: string): Promise<string>;

  // Images
  showSelectImageDialog(defaultURL?: string): Promise<string>;
  cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string>;

  // Layout
  loadLayoutProfileList(): Promise<[string, string]>;
  updateLayoutProfileList(uri: string, profileList: string): void;
  onUpdateLayoutProfile(callback: (json: string | null) => void): void;
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
  getVersionStatus(): Promise<string>;
  getPathForFile(file: File): string;
}
