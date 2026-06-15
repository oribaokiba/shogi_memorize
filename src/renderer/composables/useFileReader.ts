/**
 * ファイル読み込み用 composable
 */
export function useFileReader() {
  /**
   * ファイル選択ダイアログを開き、テキストファイルを読み込む
   */
  function openTextFile(accept: string, encoding: string, onLoad: (text: string) => void): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || !target.files[0]) {
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        // shift-jis で失敗したら utf-8 で再試行
        const reader2 = new FileReader();
        reader2.onload = (e2) => {
          const text2 = e2.target?.result as string;
          if (text2) {
            onLoad(text2);
          }
        };
        reader2.readAsText(target.files![0], "utf-8");
      };
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
          return;
        }
        onLoad(text);
      };
      reader.readAsText(target.files![0], encoding);
    };
    input.click();
  }

  /**
   * YAMLファイルを開く
   */
  function openYAMLFile(onLoad: (text: string) => void): void {
    openTextFile(".yaml,.yml", "utf-8", onLoad);
  }

  /**
   * 棋譜ファイルを開く
   */
  function openRecordFile(onLoad: (text: string, fileName: string) => void): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".kif,.kifu,.ki2,.ki2u,.csa,.usi,.jkf,.sfen,.json";
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || !target.files[0]) {
        return;
      }
      const file = target.files[0];
      const reader = new FileReader();
      reader.onerror = () => {
        const reader2 = new FileReader();
        reader2.onload = (e2) => {
          const text2 = e2.target?.result as string;
          if (text2) {
            onLoad(text2, file.name);
          }
        };
        reader2.readAsText(file!, "utf-8");
      };
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
          return;
        }
        onLoad(text, file.name);
      };
      reader.readAsText(file!, "shift-jis");
    };
    input.click();
  }

  /**
   * Blob をダウンロードさせる
   */
  function downloadBlob(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    openTextFile,
    openYAMLFile,
    openRecordFile,
    downloadBlob,
  };
}
