import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { ProcessArgs as GUIArgs } from "@/common/ipc/process.js";
import { LayoutProfile } from "@/common/settings/layout.js";
import { loadLayoutProfileListSync } from "@/background/settings.js";

type ProcessArgs = { type: "gui" } & GUIArgs;

export function parseProcessArgs(args: string[]): ProcessArgs | Error {
  // GUI mode option:
  //   /path/to/record.<extension>
  //       path to record file
  //
  //   -n <ply>
  //       ShogiGUI/KifuExplorer style ply
  //
  //   +<ply>
  //     KifuBase style ply
  //
  //   --layout-profile <profile>
  //     layout profile
  //
  // Headless mode option:
  //   --add-engine <path> <name> <timeout> [<engine_options_base64>]
  //     add USI engine
  //
  let path;
  let ply;
  let layoutProfile: LayoutProfile | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (isSupportedRecordFilePath(arg)) {
      // 棋譜ファイル
      path = arg;
    } else if (arg === "-n" && !isNaN(Number(nextArg))) {
      // 手数 (ShogiGUI/KifuExplorer style)
      ply = Number(nextArg);
      i++;
    } else if (/^\+\d+$/.test(arg)) {
      // 手数 (KifuBase style)
      ply = Number(arg.substring(1));
    } else if (arg === "--layout-profile" && nextArg) {
      // レイアウトプロファイル
      const layoutProfileList = loadLayoutProfileListSync();
      layoutProfile = layoutProfileList.profiles.find((profile) => profile.uri === nextArg);
      if (!layoutProfile) {
        return new Error(`Invalid layout profile: ${nextArg}`);
      }
      i++;
    }
  }
  return {
    type: "gui",
    path,
    ply,
    layoutProfile,
  };
}
