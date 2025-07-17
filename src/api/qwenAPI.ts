import { computed } from "vue";
import { useSettingsStore } from "../store/useSettingsStore";
import type { DialogueHistory } from "../types/aiDialogue";
import { WorkerPool } from "../worker/workerPool";

//读取用户设置的API地址和API Key
const settingsStore = useSettingsStore();
const API_URL = computed(() => settingsStore.aliApiUrl);
const userApiKey = computed(() => settingsStore.aliApiKey);
const model = computed(() => settingsStore.modelName);
// 创建线程池，最多 4 个工作线程
const workerPool = new WorkerPool(4);
export async function sendToQwenAIDialogue(messages: DialogueHistory,
  onResponse: (responseText: string, isComplete: boolean) => void): Promise<void> {
  workerPool.execute(messages, userApiKey.value, model.value, API_URL.value, onResponse);
}
