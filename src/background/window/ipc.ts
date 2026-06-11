import { BrowserWindow, dialog, FileFilter, ipcMain, shell } from "electron";
import { Background, Renderer } from "@/common/ipc/channel.js";
import path from "node:path";
import { promises as fs } from "node:fs";
import url from "node:url";
import {
  loadAppSettings,
  loadBookImportSettings,
  loadLayoutProfileList,
  saveAppSettings,
  saveBookImportSettings,
  saveLayoutProfileList,
} from "@/background/settings.js";
import { MenuEvent } from "@/common/control/menu.js";
import { AppState } from "@/common/control/state.js";
import { LogLevel, LogType } from "@/common/log.js";
import { getAppLogger, getFilePath as getLogFilePath } from "@/background/log.js";
import { isEncryptionAvailable } from "@/background/helpers/encrypt.js";
import { validateIPCSender } from "@/background/security/ipc.js";
import { t } from "@/common/i18n/index.js";
import { AppSettingsUpdate } from "@/common/settings/app.js";
import {
  addHistory,
  clearHistory,
  getHistory,
  loadBackup,
  saveBackup,
} from "@/background/file/history.js";
import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { readStatus as readVersionStatus } from "@/background/version.js";
import { fetch } from "@/background/helpers/http.js";
import { openPath } from "@/background/helpers/electron.js";
import {
  clearBook,
  closeBookSession,
  exportBook,
  getBookFormat,
  importBookMoves,
  isBookUnsaved,
  openBook,
  openBookAsNewSession,
  removeBookMove,
  saveBook,
  searchBookMoves,
  updateBookMove,
  updateBookMoveOrder,
} from "@/background/book/index.js";
import { BookFormat, BookLoadingOptions, BookMove, defaultBookSession } from "@/common/book.js";
import { Message } from "@/common/message.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { LayoutProfileList } from "@/common/settings/layout.js";
import { ProcessArgs } from "@/common/ipc/process.js";
import { createDesktopShortcut } from "@/background/file/shortcuts.js";
import { escapeFileName } from "@/common/file/path.js";
import { Lazy } from "@/common/helpers/lazy.js";

let mainWindow: BrowserWindow;
let appState = AppState.NORMAL;
let closable = false;

export function setupIPC(win: BrowserWindow): void {
  mainWindow = win;
}

export function getAppState(): AppState {
  return appState;
}

export function isClosable(): boolean {
  return closable;
}

let processArgs: ProcessArgs = {};
let layoutURI = "";

export function setProcessArgs(args: ProcessArgs) {
  processArgs = args;
}

ipcMain.handle(Background.FETCH_PROCESS_ARGS, (event) => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(processArgs);
});

const onUpdateAppStateHandlers: ((state: AppState, busy: boolean) => void)[] = [];

export function onUpdateAppState(handler: (state: AppState, busy: boolean) => void): void {
  onUpdateAppStateHandlers.push(handler);
}

ipcMain.on(Background.UPDATE_APP_STATE, (event, state: AppState, busy: boolean) => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug(`change app state: AppState=${state} BusyState=${busy}`);
  appState = state;
  for (const handler of onUpdateAppStateHandlers) {
    handler(state, busy);
  }
});

ipcMain.on(Background.OPEN_EXPLORER, async (event, targetPath: string) => {
  validateIPCSender(event.senderFrame);
  try {
    const fullPath = path.resolve(targetPath);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      await openPath(fullPath);
    } else {
      await openPath(path.dirname(fullPath));
    }
  } catch {
    sendError(new Error(t.failedToOpenDirectory(targetPath)));
  }
});

ipcMain.on(Background.OPEN_WEB_BROWSER, (event, urlStr: string) => {
  validateIPCSender(event.senderFrame);
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    sendError(new Error("Invalid URL: External links must start with http:// or https://"));
    return;
  }
  getAppLogger().debug(`open web browser: ${urlStr}`);
  shell.openExternal(urlStr);
});

ipcMain.handle(
  Background.SHOW_OPEN_RECORD_DIALOG,
  async (event, formats: RecordFileFormat[]): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const appSettings = await loadAppSettings();
    getAppLogger().debug("show open-record dialog");
    const ret = await showOpenDialog(["openFile"], appSettings.lastRecordFilePath, [
      {
        name: t.recordFile,
        extensions: formats.map((format) => format.slice(1)),
      },
    ]);
    if (ret) {
      updateAppSettings({ lastRecordFilePath: ret });
    }
    return ret;
  },
);

ipcMain.handle(Background.OPEN_RECORD, async (event, filePath: string) => {
  validateIPCSender(event.senderFrame);
  if (!isSupportedRecordFilePath(filePath)) {
    throw new Error(t.fileExtensionNotSupported);
  }
  getAppLogger().debug(`open record: ${filePath}`);
  return fs.readFile(filePath);
});

async function showOpenDialog(
  properties: ("openFile" | "createDirectory" | "openDirectory" | "noResolveAliases")[],
  defaultPath?: string,
  filters?: FileFilter[],
  buttonLabel?: string,
): Promise<string> {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("Failed to open dialog by unexpected error.");
  }
  const ret = await dialog.showOpenDialog(win, {
    defaultPath,
    properties,
    filters,
    buttonLabel,
  });
  getAppLogger().debug(`open dialog result: ${JSON.stringify(ret)}`);
  if (ret.canceled || ret.filePaths.length !== 1) {
    return "";
  }
  return ret.filePaths[0];
}

async function showSaveDialog(
  defaultPath: string,
  filters: FileFilter[],
  buttonLabel?: string,
): Promise<string> {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("failed to open dialog by unexpected error.");
  }
  filters.sort((lhs, rhs) => {
    return defaultPath.endsWith("." + lhs.extensions[0])
      ? -1
      : defaultPath.endsWith("." + rhs.extensions[0])
        ? 1
        : 0;
  });
  getAppLogger().debug("show save dialog");
  const ret = await dialog.showSaveDialog(win, {
    defaultPath: defaultPath,
    properties: ["createDirectory", "showOverwriteConfirmation"],
    filters,
    buttonLabel,
  });
  getAppLogger().debug(`save dialog result: ${JSON.stringify(ret)}`);
  return (!ret.canceled && ret.filePath) || "";
}

ipcMain.handle(
  Background.SHOW_SAVE_RECORD_DIALOG,
  async (event, defaultPath: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const appSettings = await loadAppSettings();
    const KIFEncoding = appSettings.useUTF8ForKifAndKi2 ? "UTF-8" : "Shift_JIS";
    const filters = [
      { name: `KIF (${KIFEncoding})`, extensions: ["kif"] },
      { name: "KIFU (UTF-8)", extensions: ["kifu"] },
      { name: `KI2 (${KIFEncoding})`, extensions: ["ki2"] },
      { name: "KI2U (UTF-8)", extensions: ["ki2u"] },
      { name: "CSA", extensions: ["csa"] },
      { name: "JSON Kifu Format", extensions: ["jkf"] },
    ];
    const result = await showSaveDialog(
      path.resolve(path.dirname(appSettings.lastRecordFilePath), defaultPath),
      filters,
    );
    if (result) {
      updateAppSettings({ lastRecordFilePath: result });
    }
    return result;
  },
);

ipcMain.handle(
  Background.SAVE_RECORD,
  async (event, filePath: string, data: Uint8Array): Promise<void> => {
    validateIPCSender(event.senderFrame);
    if (!isSupportedRecordFilePath(filePath)) {
      throw new Error(t.fileExtensionNotSupported);
    }
    getAppLogger().debug(`save record: ${filePath} (${data.length} bytes)`);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
  },
);

ipcMain.handle(Background.SHOW_SELECT_FILE_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show select-file dialog");
  const ret = await showOpenDialog(["openFile"], appSettings.lastOtherFilePath);
  if (ret) {
    updateAppSettings({ lastOtherFilePath: ret });
  }
  return ret;
});

ipcMain.handle(
  Background.SHOW_SELECT_DIRECTORY_DIALOG,
  async (event, defaultPath?: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("show select-directory dialog");
    const ret = await showOpenDialog(["createDirectory", "openDirectory"], defaultPath);
    return ret;
  },
);

ipcMain.handle(
  Background.SHOW_SELECT_IMAGE_DIALOG,
  async (event, defaultURL?: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("show select-image dialog");
    const ret = await showOpenDialog(["openFile"], defaultURL, [
      { name: t.imageFile, extensions: ["png", "jpg", "jpeg"] },
    ]);
    return ret !== "" ? url.pathToFileURL(ret).toString() : "";
  },
);

ipcMain.handle(
  Background.SHOW_SAVE_MERGED_RECORD_DIALOG,
  async (event, defaultPath: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const filters = [{ name: "SFEN", extensions: ["sfen"] }];
    return await showSaveDialog(path.resolve(defaultPath), filters, "OK");
  },
);

ipcMain.handle(Background.LOAD_REMOTE_TEXT_FILE, async (event, remoteUrl: string) => {
  validateIPCSender(event.senderFrame);
  return await fetch(remoteUrl);
});

ipcMain.handle(Background.LOAD_APP_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load app settings");
  return JSON.stringify(await loadAppSettings());
});

ipcMain.handle(Background.SAVE_APP_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save app settings");
  await saveAppSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_RECORD_FILE_HISTORY, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await getHistory());
});

ipcMain.on(Background.ADD_RECORD_FILE_HISTORY, (event, historyPath: string): void => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("add record file history: %s", historyPath);
  addHistory(historyPath);
});

ipcMain.handle(Background.CLEAR_RECORD_FILE_HISTORY, async (event): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("clear record file history");
  clearHistory();
});

ipcMain.handle(Background.SAVE_RECORD_FILE_BACKUP, async (event, kif: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save record file backup");
  await saveBackup(kif);
});

ipcMain.handle(Background.LOAD_RECORD_FILE_BACKUP, async (event, name: string): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load record file backup: %s", name);
  return await loadBackup(name);
});

ipcMain.handle(Background.SHOW_OPEN_BOOK_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show open-book dialog");
  const ret = await showOpenDialog(["openFile"], appSettings.lastBookFilePath, [
    { name: "Book", extensions: ["db", "bin", "sbk"] },
  ]);
  if (ret) {
    updateAppSettings({ lastBookFilePath: ret });
  }
  return ret;
});

ipcMain.handle(
  Background.SHOW_SAVE_BOOK_DIALOG,
  async (event, session: number, targetFormat?: BookFormat): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const appSettings = await loadAppSettings();
    getAppLogger().debug("show save-book dialog");
    const fmt = targetFormat ?? getBookFormat(session);
    const filter =
      fmt === "yane2016"
        ? { name: "YaneuraOu Book Database", extensions: ["db"] }
        : fmt === "apery"
          ? { name: "Apery Book", extensions: ["bin"] }
          : { name: "Shogi Book", extensions: ["sbk"] };
    const defaultPath = appSettings.lastBookFilePath.replace(/\.(db|bin|sbk)$/, "");
    const ret = await showSaveDialog(defaultPath, [filter]);
    if (ret) {
      updateAppSettings({ lastBookFilePath: ret });
    }
    return ret;
  },
);

ipcMain.handle(Background.CLEAR_BOOK, (event, session: number, format?: BookFormat) => {
  validateIPCSender(event.senderFrame);
  clearBook(session, format);
});

ipcMain.handle(
  Background.OPEN_BOOK,
  async (event, session: number, bookPath: string, json: string): Promise<void> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug(`open book: ${bookPath}`);
    const options = JSON.parse(json) as BookLoadingOptions;
    await openBook(session, bookPath, options);
  },
);

ipcMain.handle(
  Background.OPEN_BOOK_AS_NEW_SESSION,
  async (event, bookPath: string, json: string): Promise<number> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug(`open book as new session: ${bookPath}`);
    const options = JSON.parse(json) as BookLoadingOptions;
    const { session } = await openBookAsNewSession(bookPath, options);
    getAppLogger().debug(`new book session: ${session}`);
    return session;
  },
);

ipcMain.handle(Background.CLOSE_BOOK_SESSION, (event, session: number) => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug(`close book session: ${session}`);
  closeBookSession(session);
});

ipcMain.handle(
  Background.SAVE_BOOK,
  async (event, session: number, savePath: string): Promise<void> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug(`save book: ${savePath}`);
    await saveBook(session, savePath);
  },
);

ipcMain.handle(
  Background.EXPORT_BOOK,
  async (event, session: number, exportPath: string, targetFormat: BookFormat): Promise<void> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug(`export book: ${exportPath} as ${targetFormat}`);
    await exportBook(session, exportPath, targetFormat);
  },
);

ipcMain.handle(Background.GET_BOOK_FORMAT, (event, session: number): BookFormat => {
  validateIPCSender(event.senderFrame);
  return getBookFormat(session);
});

ipcMain.handle(
  Background.SEARCH_BOOK_MOVES,
  async (event, session: number, sfen: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    return JSON.stringify(await searchBookMoves(session, sfen));
  },
);

ipcMain.handle(
  Background.UPDATE_BOOK_MOVE,
  async (event, session: number, sfen: string, json: string) => {
    validateIPCSender(event.senderFrame);
    await updateBookMove(session, sfen, JSON.parse(json) as BookMove);
  },
);

ipcMain.handle(
  Background.REMOVE_BOOK_MOVE,
  async (event, session: number, sfen: string, usi: string) => {
    validateIPCSender(event.senderFrame);
    await removeBookMove(session, sfen, usi);
  },
);

ipcMain.handle(
  Background.UPDATE_BOOK_MOVE_ORDER,
  async (event, session: number, sfen: string, usi: string, order: number) => {
    validateIPCSender(event.senderFrame);
    await updateBookMoveOrder(session, sfen, usi, order);
  },
);

ipcMain.handle(Background.LOAD_BOOK_IMPORT_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load book import settings");
  return JSON.stringify(await loadBookImportSettings());
});

ipcMain.handle(Background.SAVE_BOOK_IMPORT_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save book import settings");
  await saveBookImportSettings(JSON.parse(json));
});

ipcMain.handle(
  Background.IMPORT_BOOK_MOVES,
  async (event, session: number, json: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    return JSON.stringify(await importBookMoves(session, JSON.parse(json)));
  },
);

ipcMain.handle(Background.LOAD_LAYOUT_PROFILE_LIST, async (event): Promise<[string, string]> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load layout config");
  const json = JSON.stringify(await loadLayoutProfileList());
  return [layoutURI, json];
});

const layoutProfileLazySaver = new Lazy();

ipcMain.on(Background.UPDATE_LAYOUT_PROFILE_LIST, (event, uri: string, json: string) => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("update layout: %s", uri);
  layoutURI = uri;
  const layoutList = JSON.parse(json) as LayoutProfileList;
  const layout = layoutList.profiles.find((p) => p.uri === uri) || null;
  mainWindow.webContents.send(Renderer.UPDATE_LAYOUT_PROFILE, layout && JSON.stringify(layout));
  layoutProfileLazySaver.after(() => {
    saveLayoutProfileList(JSON.parse(json)).catch((e) => {
      sendError(new Error(`failed to save layout config: ${e}`));
    });
  }, 500);
});

ipcMain.handle(
  Background.CREATE_DESKTOP_SHORTCUT_FOR_LAYOUT_PROFILE,
  async (event, uri: string, name: string) => {
    validateIPCSender(event.senderFrame);
    const fileName = escapeFileName(`ShogiHome ${name}`);
    getAppLogger().debug(
      "create desktop shortcut for layout profile: uri=[%s] file=[%s]",
      uri,
      fileName,
    );
    await createDesktopShortcut(fileName, ["--layout-profile", uri]);
  },
);

ipcMain.handle(Background.IS_ENCRYPTION_AVAILABLE, (event): boolean => {
  validateIPCSender(event.senderFrame);
  return isEncryptionAvailable();
});

ipcMain.handle(Background.GET_VERSION_STATUS, async (event) => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await readVersionStatus());
});

ipcMain.on(Background.OPEN_LOG_FILE, (event, logType: LogType) => {
  validateIPCSender(event.senderFrame);
  openPath(getLogFilePath(logType));
});

ipcMain.on(Background.LOG, (event, level: LogLevel, message: string) => {
  validateIPCSender(event.senderFrame);
  switch (level) {
    case LogLevel.DEBUG:
      getAppLogger().debug("%s", message);
      break;
    case LogLevel.INFO:
      getAppLogger().info("%s", message);
      break;
    case LogLevel.WARN:
      getAppLogger().warn("%s", message);
      break;
    case LogLevel.ERROR:
      getAppLogger().error("%s", message);
      break;
  }
});

ipcMain.on(Background.ON_CLOSABLE, (event) => {
  validateIPCSender(event.senderFrame);
  closable = true;
  mainWindow.close();
});

export function onClose(): void {
  const confirmations = [];
  if (isBookUnsaved(defaultBookSession)) {
    confirmations.push(t.anyBookMovesAreUnsavedDoYouReallyWantToDiscardThemAndCloseTheApp);
  }
  mainWindow.webContents.send(Renderer.CLOSE, confirmations);
}

export function sendError(e: Error): void {
  if (e instanceof AggregateError) {
    for (const error of e.errors) {
      sendError(error);
    }
    return;
  }
  mainWindow.webContents.send(Renderer.SEND_ERROR, e.message || e.name);
}

export function sendMessage(message: Message): void {
  mainWindow.webContents.send(Renderer.SEND_MESSAGE, JSON.stringify(message));
}

export function sendNotification(message: string, url?: string): void {
  mainWindow.webContents.send(Renderer.SEND_NOTIFICATION, message, url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onMenuEvent(event: MenuEvent, ...args: any[]): void {
  mainWindow.webContents.send(Renderer.MENU_EVENT, event, ...args);
}

export function updateAppSettings(update: AppSettingsUpdate): void {
  mainWindow.webContents.send(Renderer.UPDATE_APP_SETTINGS, JSON.stringify(update));
}

export function sendProgress(progress: number): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(Renderer.PROGRESS, progress);
  }
}

export function openRecord(path: string): void {
  if (isSupportedRecordFilePath(path)) {
    mainWindow.webContents.send(Renderer.OPEN_RECORD, path);
  }
}
