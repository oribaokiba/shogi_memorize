"use strict";

import { app, BrowserWindow } from "electron";
import { loadAppSettingsOnce } from "@/background/settings.js";
import {
  getAppLogger,
  LogDestination,
  setLogDestinations,
  shutdownLoggers,
} from "@/background/log.js";
import { getPortableExeDir, isDevelopment, isPortable, isTest } from "@/background/proc/env.js";
import { setLanguage, t } from "@/common/i18n/index.js";
import { parseProcessArgs } from "./proc/args.js";
import contextMenu from "electron-context-menu";
import { LogType } from "@/common/log.js";
import { isLogEnabled } from "@/common/settings/app.js";
import { createWindow } from "./window/main.js";
import { setProcessArgs } from "./window/ipc.js";

const args = parseProcessArgs(process.argv);
setProcessArgs(args);

const appSettings = loadAppSettingsOnce();
for (const type of Object.values(LogType)) {
  const destinations: LogDestination[] = isLogEnabled(type, appSettings) ? ["file"] : ["stdout"];
  setLogDestinations(type, destinations, appSettings.logLevel);
}

getAppLogger().info(
  "start main process: %s %s %d",
  process.platform,
  process.execPath,
  process.pid,
);
getAppLogger().info("app: %s %s", app.getName(), app.getVersion(), app.getLocale());
getAppLogger().info("process argv: %s", process.argv.join(" "));
if (isPortable()) {
  getAppLogger().info("portable mode: %s", getPortableExeDir());
}

setLanguage(appSettings.language);

contextMenu({
  showCopyImage: false,
  showCopyLink: false,
  showSelectAll: false,
  showInspectElement: isDevelopment(),
  labels: {
    copy: t.copy,
    cut: t.cut,
    paste: t.paste,
  },
});

if (!appSettings.enableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}
app.enableSandbox();

app.once("will-finish-launching", () => {
  getAppLogger().info("on will-finish-launching");
  app.once("open-file", (event, path) => {
    getAppLogger().info("on open-file: %s", path);
    event.preventDefault();
    setProcessArgs({ ...args, path });
  });
});

app.on("will-quit", () => {
  getAppLogger().info("on will-quit");
  shutdownLoggers();
});

function onMainWindowClosed() {
  app.quit();
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(onMainWindowClosed);
  }
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  if (isDevelopment()) {
    getAppLogger().info("install Vue3 Dev Tools");
    import("electron-devtools-installer")
      .then((installer) => installer.default(installer.VUEJS_DEVTOOLS))
      .catch((e) => {
        getAppLogger().error(`failed to install Vue.js devtools: ${e}`);
      });
  }

  createWindow(onMainWindowClosed);
});

if (isDevelopment() || isTest()) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        getAppLogger().info("on graceful-exit message");
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      getAppLogger().info("on SIGTERM");
      app.quit();
    });
  }
}
