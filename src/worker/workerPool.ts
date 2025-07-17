import type { DialogueHistory } from "../types/aiDialogue";

export class WorkerPool {
  private workers: Worker[] = []; // Worker 线程池
  private queue: {
    taskId: number;
    messages: DialogueHistory;
    userApiKey: string;
    model: string;
    API_URL: string;
    onResponse: (responseText: string, isComplete: boolean) => void;
  }[] = []; // 任务队列
  private activeTasks: Map<number, Worker> = new Map(); // 正在执行的任务
  private nextTaskId = 1;     // 任务 ID 计数器

  // 构建，初始化线程池
  constructor(workerCount: number) {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL("./aiWorker.ts", import.meta.url), { type: "module" });
      this.workers.push(worker);
      worker.onmessage = (event) => {
        const { taskId, result, isComplete } = event.data;
        const task = this.queue.find((t) => t.taskId === taskId);
        if (task) {
          task.onResponse(result, isComplete);
        }
        if (isComplete) {
          this.activeTasks.delete(taskId);
          this.workers.push(worker);
          this.processQueue();
        }
      };
      worker.onerror = (error) => {
        console.error("Worker 处理任务失败:", error);
        this.workers.push(worker);
        this.processQueue();
      };
    }
  }

  /**
   * 新增任务
   * @param messages  对话历史
   * @param userApiKey  API Key
   * @param model  选择的模型
   * @param API_URL  请求 API 地址
   * @param onResponse  结果回调
   */
  execute(
    messages: DialogueHistory,
    userApiKey: string,
    model: string,
    API_URL: string,
    onResponse: (responseText: string, isComplete: boolean) => void
  ): void {
    const taskId = this.nextTaskId++;
    this.queue.push({ taskId, messages, userApiKey, model, API_URL, onResponse });
    this.processQueue();
  }

  /**
   * 处理任务队列
   */
  private processQueue() {
    if (this.queue.length > 0 && this.workers.length > 0) {
      const worker = this.workers.pop()!;
      const { taskId, messages, userApiKey, model, API_URL, onResponse } = this.queue.shift()!;
      this.activeTasks.set(taskId, worker);
      try {
        // postMessage自动克隆出现问题，这里手动克隆 messages
        const clonedMessages = JSON.parse(JSON.stringify(messages));
        worker.postMessage({ taskId, messages: clonedMessages, userApiKey, model, API_URL });
        console.log(`任务${taskId}分配给 Worker:${worker}`);
        worker.onmessage = (event) => {
          const { taskId, result, isComplete } = event.data;
          onResponse(result, isComplete);
          if (isComplete) {
            this.activeTasks.delete(taskId);
            this.workers.push(worker);
            this.processQueue();
          }
        };
      } catch (error) {
        onResponse("数据传输失败", true);
        this.workers.push(worker);
        this.processQueue();
      }
    }
  }

  /**
   * 终止所有 Worker
   */
  terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.activeTasks.clear();
  }
}
