import fs from "node:fs";
import path from "node:path";
import { AppSettings, defaultAppSettings, normalizeAppSettings } from "@/common/settings/app.js";
import {
  defaultWindowSettings,
  normalizeWindowSettings,
  WindowSettings,
} from "@/common/settings/window.js";
import { getAppLogger } from "@/background/log.js";
import { getPortableExeDir, isPortable } from "./proc/env.js";
import { exists } from "./helpers/file.js";
import { emptyLayoutProfileList, LayoutProfileList } from "@/common/settings/layout.js";
import { openPath } from "./helpers/electron.js";
import { BookImportSettings, defaultBookImportSettings } from "@/common/settings/book.js";
import { writeFileAtomic, writeFileAtomicSync } from "./file/atomic.js";
import { getAppPath } from "./proc/path-electron.js";

const userDir = getAppPath("userData");
const rootDir = getPortableExeDir() || userDir;
const docDir = path.join(getAppPath("documents"), "ShogiHome");

export function openSettingsDirectory(): Promise<void> {
  return openPath(rootDir);
}

export async function openAutoSaveDirectory(): Promise<void> {
  await openPath(docDir);
}

const windowSettingsPath = path.join(userDir, "window.json");

export function saveWindowSettings(settings: WindowSettings): void {
  try {
    writeFileAtomicSync(
      windowSettingsPath,
      JSON.stringify(normalizeWindowSettings(settings), undefined, 2),
      "utf8",
    );
  } catch (e) {
    getAppLogger().error("failed to write window settings: %s", e);
  }
}

export function loadWindowSettings(): WindowSettings {
  try {
    return normalizeWindowSettings(JSON.parse(fs.readFileSync(windowSettingsPath, "utf8")));
  } catch (e) {
    getAppLogger().error("failed to read window settings: %s", e);
    return defaultWindowSettings();
  }
}

const appSettingsPath = path.join(userDir, "app_setting.json");

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await writeFileAtomic(appSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

const defaultReturnCode = process.platform === "win32" ? "\r\n" : "\n";

function getDefaultAppSettings(): AppSettings {
  return defaultAppSettings({
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir, // Deprecated
  });
}

function loadAppSettingsFromMemory(json: string): AppSettings {
  return normalizeAppSettings(JSON.parse(json), {
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir, // Deprecated
  });
}

function loadAppSettingsSync(): AppSettings {
  if (!fs.existsSync(appSettingsPath)) {
    return getDefaultAppSettings();
  }
  return loadAppSettingsFromMemory(fs.readFileSync(appSettingsPath, "utf8"));
}

let appSettingsCache: AppSettings;

export function loadAppSettingsOnce(): AppSettings {
  if (!appSettingsCache) {
    appSettingsCache = loadAppSettingsSync();
  }
  return appSettingsCache;
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (!(await exists(appSettingsPath))) {
    return getDefaultAppSettings();
  }
  return loadAppSettingsFromMemory(await fs.promises.readFile(appSettingsPath, "utf8"));
}

const layoutProfileListPath = path.join(userDir, "layouts.json");

export async function saveLayoutProfileList(profileList: LayoutProfileList): Promise<void> {
  await writeFileAtomic(layoutProfileListPath, JSON.stringify(profileList, undefined, 2), "utf8");
}

export async function loadLayoutProfileList(): Promise<LayoutProfileList> {
  if (!(await exists(layoutProfileListPath))) {
    return emptyLayoutProfileList();
  }
  return JSON.parse(await fs.promises.readFile(layoutProfileListPath, "utf8"));
}

export function loadLayoutProfileListSync(): LayoutProfileList {
  if (!fs.existsSync(layoutProfileListPath)) {
    return emptyLayoutProfileList();
  }
  return JSON.parse(fs.readFileSync(layoutProfileListPath, "utf8"));
}

const bookImportSettingsPath = path.join(rootDir, "book_import.json");

export async function saveBookImportSettings(settings: BookImportSettings): Promise<void> {
  await writeFileAtomic(bookImportSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadBookImportSettings(): Promise<BookImportSettings> {
  if (!(await exists(bookImportSettingsPath))) {
    return defaultBookImportSettings();
  }
  return JSON.parse(await fs.promises.readFile(bookImportSettingsPath, "utf8"));
}
