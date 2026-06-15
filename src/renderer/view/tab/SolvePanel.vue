<template>
  <div class="root full column" :style="size ? { height: `${size.height}px` } : {}">
    <!-- ファイル未読み込み -->
    <div v-if="!store.memorizeCollection" class="content-area column center">
      <div class="file-area">
        <button class="ctrl-btn" @click="openYAMLForSolving">
          <Icon :icon="IconType.OPEN" />
          <span>問題集ファイル（.yaml）を開く</span>
        </button>
        <p class="hint">定跡問題集のYAMLファイルを開いてください。</p>
      </div>
    </div>

    <!-- ファイル読み込み済み：解答中 -->
    <template v-if="store.memorizeCollection && store.isSolving">
      <div class="content-area column center">
        <div class="solve-area">
          <div class="solve-header">
            <span class="solve-title">{{ store.memorizeCollection.title }}</span>
            <span class="solve-progress-label"
              >問題 {{ store.solveIndex + 1 }} / {{ store.solveTotal }}（全{{
                store.totalProblemsCount
              }}問）</span
            >
          </div>
          <div class="solve-progress">
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: solveProgressPercent + '%' }"></div>
            </div>
            <div class="solve-step">
              {{ store.memorizeStep }} / {{ currentProblemMovesLength }}手
            </div>
          </div>
          <div v-if="hintVisible && store.currentHint" class="hint-area">
            <Icon :icon="IconType.HELP" />
            <span class="hint-text">{{ store.currentHint }}</span>
          </div>
          <div class="solve-buttons">
            <button class="ctrl-btn" :disabled="!hasHint || disableActions" @click="showHint">
              <Icon :icon="IconType.HELP" /><span>ヒント</span>
            </button>
            <button class="ctrl-btn" :disabled="disableActions" @click="giveUpSolveProblem">
              <Icon :icon="IconType.END" /><span>次の手</span>
            </button>
            <button class="ctrl-btn stop-btn" @click="endSolveWithResult">
              <Icon :icon="IconType.CLOSE" /><span>解答終了</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ファイル読み込み済み：未解答 -->
    <template v-if="store.memorizeCollection && !store.isSolving">
      <div class="content-area column center">
        <div class="info-area">
          <div class="info-title">{{ store.memorizeCollection.title }}</div>
          <div class="info-count">{{ store.memorizeCollection.problems.length }}問</div>
          <div class="info-buttons">
            <button class="ctrl-btn" @click="openMemorizeSolveDialog">
              <Icon :icon="IconType.QUIZ" />
              <span>定跡暗記を開く</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStore } from "@/renderer/store";
import { useErrorStore } from "@/renderer/store/error";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { RectSize } from "@/common/assets/geometry.js";
import { useFileReader } from "@/renderer/composables/useFileReader.js";

defineProps({
  size: {
    type: RectSize,
    required: false,
    default: undefined,
  },
});

const store = useStore();
const { openYAMLFile } = useFileReader();

const currentProblemMovesLength = computed(() => {
  const p = store.currentProblem;
  return p ? p.moves.length : 0;
});

const solveProgressPercent = computed(() => {
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return 0;
  }
  return (store.memorizeStep / len) * 100;
});

const isSolveCleared = computed(() => {
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return false;
  }
  return store.memorizeStep >= len;
});

const isGiveUpCleared = computed(() => {
  if (!store.isGiveUp) {
    return false;
  }
  const len = currentProblemMovesLength.value;
  if (len === 0) {
    return false;
  }
  return store.memorizeStep >= len;
});

const isCleared = computed(() => {
  return isSolveCleared.value || isGiveUpCleared.value;
});

const disableActions = computed(() => {
  return isSolveCleared.value;
});

const hintVisible = ref(false);

const hasHint = computed(() => {
  return store.currentHint !== null;
});

// 手が進んだらヒント表示を消す
watch(
  () => store.memorizeStep,
  () => {
    hintVisible.value = false;
  },
);

// クリアを検知して結果ダイアログを表示
watch(
  () => isCleared.value,
  (newVal) => {
    if (newVal) {
      store.showMemorizeResultDialog("perProblem");
    }
  },
);

const showHint = () => {
  hintVisible.value = true;
  store.memorize.incrementHintCount();
};

const giveUpSolveProblem = () => {
  store.giveUpMemorize();
};

const endSolveWithResult = () => {
  store.showMemorizeResultDialog("overall");
  store.endSolveSession();
};

const openYAMLForSolving = () => {
  openYAMLFile((text: string) => {
    const err = store.loadMemorizeCollectionFromYAML(text);
    if (err) {
      useErrorStore().add(err);
    }
  });
};

const openMemorizeSolveDialog = () => {
  store.showMemorizeSolveDialog();
};
</script>

<style scoped>
.root {
  color: var(--text-color);
  background-color: var(--main-bg-color);
  width: 100%;
  height: 100%;
}
.content-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.center {
  justify-content: center;
  align-items: center;
}
.file-area {
  text-align: center;
  padding: 16px;
}
.hint {
  margin: 8px 0 0;
  font-size: 0.8em;
  color: var(--text-color-muted);
}
.info-area {
  text-align: center;
  padding: 20px;
  max-width: 300px;
}
.info-title {
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 6px;
}
.info-count {
  font-size: 0.85em;
  color: var(--text-color-muted);
  margin-bottom: 12px;
}
.info-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

/* 解答エリア */
.solve-area {
  text-align: center;
  padding: 20px;
  max-width: 350px;
  width: 100%;
}
.solve-header {
  margin-bottom: 8px;
}
.solve-title {
  font-size: 1.1em;
  font-weight: bold;
  display: block;
  margin-bottom: 4px;
}
.solve-progress-label {
  font-size: 0.85em;
  color: var(--text-color-muted);
}
.solve-progress {
  margin-bottom: 8px;
}
.bar-track {
  background: var(--text-separator-color);
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  margin: 4px 0;
}
.bar-fill {
  background: var(--tab-highlight-color, #1e90ff);
  height: 100%;
  transition: width 0.3s ease;
}
.solve-step {
  font-size: 0.82em;
  color: var(--text-color-muted);
}
.hint-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 8px 0;
  padding: 4px 6px;
  background: var(--button-active-bg-color);
  border-radius: 3px;
  font-size: 0.85em;
}
.hint-area .icon {
  height: 16px;
  width: auto;
  flex-shrink: 0;
  display: inline-block;
}
.hint-text {
  color: var(--text-color);
}
.solve-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.solve-buttons .ctrl-btn {
  flex: 1;
  min-width: 80px;
}

/* ボタン */
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  border-radius: 2px;
  font-size: 0.82em;
  cursor: pointer;
  border: 1px solid var(--text-separator-color);
  background-color: var(--button-bg-color);
  color: var(--main-color);
  font-weight: bold;
  padding: 0 10px;
  white-space: nowrap;
}
.ctrl-btn:hover {
  background-color: var(--button-hover-bg-color);
}
.ctrl-btn:disabled {
  background: linear-gradient(to top, var(--disabled-control-button-bg-color) 80%, white 140%);
}
.ctrl-btn:disabled:hover {
  background: linear-gradient(to top, var(--disabled-control-button-bg-color) 80%, white 140%);
}
.ctrl-btn .icon {
  height: 16px;
  width: auto;
  flex-shrink: 0;
  display: inline-block;
}
.stop-btn {
  border-color: #c0392b !important;
  color: #c0392b !important;
}
.stop-btn:hover {
  background-color: #c0392b !important;
  color: white !important;
}
</style>
