import { watch } from "vue";
import { SpecialMoveType } from "tsshogi";
import { useStore } from "@/renderer/store/index.js";
import { bridge } from "@/renderer/ipc/api.js";
import { MenuEvent } from "@/common/control/menu.js";
import { AppState } from "@/common/control/state.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { t } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import { useErrorStore } from "@/renderer/store/error.js";
import { useBusyState } from "@/renderer/store/busy.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";
import { useMessageStore } from "@/renderer/store/message.js";
import { useNotificationStore } from "@/renderer/store/notification.js";
import { useBookStore } from "@/renderer/store/book.js";

export function setup(): void {
  const store = useStore();
  const appSettings = useAppSettings();
  const busyState = useBusyState();

  // Core
  watch(
    () => [store.appState, busyState.isBusy],
    ([appState, busy]) => bridge.updateAppState(appState as AppState, busy as boolean),
  );
  bridge.updateAppState(store.appState, busyState.isBusy);
  bridge.onClose(async (confirmations: string[]) => {
    try {
      for (const message of confirmations) {
        await new Promise<void>((resolve, reject) => {
          useConfirmationStore().show({
            message,
            onOk: resolve,
            onCancel: reject,
          });
        });
      }
    } catch {
      return;
    }
    try {
      await store.onMainWindowClose();
    } catch (e) {
      bridge.log(LogLevel.ERROR, `${e}`);
    } finally {
      bridge.onClosable();
    }
  });
  bridge.onSendError((e: string) => {
    useErrorStore().add(e);
  });
  bridge.onSendMessage((json: string) => {
    useMessageStore().enqueue(JSON.parse(json));
  });
  bridge.onSendNotification((message: string, url?: string) => {
    useNotificationStore().add(message, url);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bridge.onMenuEvent((event: MenuEvent, ...args: any[]) => {
    if (busyState.isBusy) {
      return;
    }
    switch (event) {
      case MenuEvent.NEW_RECORD:
        store.resetRecord();
        break;
      case MenuEvent.NEW_RECORD_HIRATE_SETUP:
        store.resetRecord("hirateSetup");
        break;
      case MenuEvent.OPEN_RECORD:
        store.openRecord();
        break;
      case MenuEvent.SAVE_RECORD:
        store.saveRecord({ overwrite: true });
        break;
      case MenuEvent.SAVE_RECORD_AS:
        store.saveRecord();
        break;
      case MenuEvent.HISTORY:
        store.showRecordFileHistoryDialog();
        break;
      case MenuEvent.LOAD_REMOTE_RECORD:
        store.showLoadRemoteFileDialog();
        break;
      case MenuEvent.COPY_RECORD:
        store.copyRecordKIF();
        break;
      case MenuEvent.COPY_RECORD_KI2:
        store.copyRecordKI2();
        break;
      case MenuEvent.COPY_RECORD_CSA:
        store.copyRecordCSA();
        break;
      case MenuEvent.COPY_RECORD_USI_BEFORE:
        store.copyRecordUSI("before");
        break;
      case MenuEvent.COPY_RECORD_USI_ALL:
        store.copyRecordUSI("all");
        break;
      case MenuEvent.COPY_RECORD_JKF:
        store.copyRecordJKF();
        break;
      case MenuEvent.COPY_RECORD_USEN:
        store.copyRecordUSEN();
        break;
      case MenuEvent.COPY_RECORD_FROM_CURRENT_POSITION:
        store.copyRecordKIF({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_KI2_FROM_CURRENT_POSITION:
        store.copyRecordKI2({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_CSA_FROM_CURRENT_POSITION:
        store.copyRecordCSA({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_USI_FROM_CURRENT_POSITION:
        store.copyRecordUSI("after");
        break;
      case MenuEvent.COPY_RECORD_JKF_FROM_CURRENT_POSITION:
        store.copyRecordJKF({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_USEN_FROM_CURRENT_POSITION:
        store.copyRecordUSEN({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_BOARD_SFEN:
        store.copyBoardSFEN();
        break;
      case MenuEvent.COPY_BOARD_BOD:
        store.copyBoardBOD();
        break;
      case MenuEvent.PASTE_RECORD:
        store.showPasteDialog();
        break;
      case MenuEvent.PASTE_RECORD_MERGE_INTO_ROOT_POSITION:
        store.showPasteDialog("mergeIntoRoot");
        break;
      case MenuEvent.PASTE_RECORD_MERGE_INTO_CURRENT_POSITION:
        store.showPasteDialog("mergeIntoCurrent");
        break;
      case MenuEvent.SEARCH_DUPLICATE_POSITIONS:
        store.showSearchDuplicatePositionsDialog();
        break;
      case MenuEvent.INSERT_INTERRUPT:
        store.insertSpecialMove(SpecialMoveType.INTERRUPT);
        break;
      case MenuEvent.INSERT_RESIGN:
        store.insertSpecialMove(SpecialMoveType.RESIGN);
        break;
      case MenuEvent.INSERT_DRAW:
        store.insertSpecialMove(SpecialMoveType.DRAW);
        break;
      case MenuEvent.INSERT_IMPASS:
        store.insertSpecialMove(SpecialMoveType.IMPASS);
        break;
      case MenuEvent.INSERT_REPETITION_DRAW:
        store.insertSpecialMove(SpecialMoveType.REPETITION_DRAW);
        break;
      case MenuEvent.INSERT_MATE:
        store.insertSpecialMove(SpecialMoveType.MATE);
        break;
      case MenuEvent.INSERT_NO_MATE:
        store.insertSpecialMove(SpecialMoveType.NO_MATE);
        break;
      case MenuEvent.INSERT_TIMEOUT:
        store.insertSpecialMove(SpecialMoveType.TIMEOUT);
        break;
      case MenuEvent.INSERT_FOUL_WIN:
        store.insertSpecialMove(SpecialMoveType.FOUL_WIN);
        break;
      case MenuEvent.INSERT_FOUL_LOSE:
        store.insertSpecialMove(SpecialMoveType.FOUL_LOSE);
        break;
      case MenuEvent.INSERT_ENTERING_OF_KING:
        store.insertSpecialMove(SpecialMoveType.ENTERING_OF_KING);
        break;
      case MenuEvent.INSERT_WIN_BY_DEFAULT:
        store.insertSpecialMove(SpecialMoveType.WIN_BY_DEFAULT);
        break;
      case MenuEvent.INSERT_LOSE_BY_DEFAULT:
        store.insertSpecialMove(SpecialMoveType.LOSE_BY_DEFAULT);
        break;
      case MenuEvent.REMOVE_CURRENT_MOVE:
        store.removeCurrentMove();
        break;
      case MenuEvent.START_POSITION_EDITING:
        store.startPositionEditing();
        break;
      case MenuEvent.END_POSITION_EDITING:
        store.endPositionEditing();
        break;
      case MenuEvent.CHANGE_TURN:
        store.changeTurn();
        break;
      case MenuEvent.INIT_POSITION:
        store.initializePositionBySFEN(args[0]);
        break;
      case MenuEvent.CHANGE_PIECE_SET:
        store.showPieceSetChangeDialog();
        break;
      case MenuEvent.FLIP_BOARD:
        useAppSettings().flipBoard();
        break;
      case MenuEvent.APP_SETTINGS_DIALOG:
        store.showAppSettingsDialog();
        break;
      case MenuEvent.RESET_BOOK:
        store.showResetBookDialog();
        break;
      case MenuEvent.OPEN_BOOK_FILE:
        useBookStore().openBookFile();
        break;
      case MenuEvent.SAVE_BOOK_FILE:
        useBookStore().saveBookFile();
        break;
      case MenuEvent.ADD_BOOK_MOVES:
        store.showAddBookMovesDialog();
        break;
      case MenuEvent.EXPORT_BOOK_AS_YANE2016:
        useBookStore().exportBookFile("yane2016");
        break;
      case MenuEvent.EXPORT_BOOK_AS_APERY:
        useBookStore().exportBookFile("apery");
        break;
      case MenuEvent.EXPORT_BOOK_AS_SBK:
        useBookStore().exportBookFile("sbk");
        break;
    }
  });

  // Settings
  bridge.onUpdateAppSettings((json: string) => {
    appSettings.updateAppSettings(JSON.parse(json));
  });

  // Record File
  bridge.onOpenRecord((path: string) => {
    useConfirmationStore().show({
      message: t.areYouSureWantToOpenFileInsteadOfCurrentRecord,
      onOk: () => {
        store.openRecord(path);
      },
    });
  });

  // Layout
  bridge.onUpdateLayoutProfile((json) => {
    store.updateLayoutProfile(json && JSON.parse(json));
  });
}

export function setupPrompt(): void {
  // プロンプト機能は削除
}
