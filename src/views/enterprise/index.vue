<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { marked } from 'marked';
import { message } from 'ant-design-vue';

// 输入框
const enterpriseName = ref('');

// 状态输出框
const statusOutput = ref('');

// 企业评价信息收集（原始数据）
const dataOutput = ref('');

// markdown 原始内容（AI总结）
const enterpriseInfoTextRaw = ref('');

// markdown 渲染后 HTML
const enterpriseInfoTextHtml = ref('');

// 企业评价图片地址
const evaluationImage = ref('');

// 加载状态
const loading = ref({
  status: false,
  data: false,
  wordcloud: false,
  analysis: false
});

// 重试计数器
const retryCount = ref(0);
const MAX_RETRIES = 3;

// 确定按钮点击事件
const handleConfirm = () => {
  if (!enterpriseName.value.trim()) {
    message.error('请输入企业名称后再点击"查询"！');
    return;
  }

  // 重置
  statusOutput.value = '';
  dataOutput.value = '';
  enterpriseInfoTextRaw.value = '';
  enterpriseInfoTextHtml.value = '';
  evaluationImage.value = '';
  retryCount.value = 0;

  loading.value = { status: true, data: true, wordcloud: true, analysis: true };
  statusOutput.value = `企业名称已确认: ${enterpriseName.value}
获取资料需要30秒，请耐心等待哦~
正在获取资料~`;

  // 开始连接SSE
  connectSSE();
};

// 连接SSE
const connectSSE = () => {
  const companyName = encodeURIComponent(enterpriseName.value.trim());
  const source = new EventSource(`http://localhost:5000/analyze?company_name=${companyName}`);

  source.onmessage = (event) => {
    // 检查空事件（心跳事件）
    if (event.data.trim() === '') return;
    
    try {
      const data = JSON.parse(event.data);

      if (data.step === 'init') {
        dataOutput.value = (data.reviews || []).map((r: {
  evaluator: string;
  job_info: string;
  date: string;
  content: string;
  metrics: string;
}, idx: number) => 
          `【${idx + 1}】${r.date} - ${r.evaluator}（${r.job_info}）\n${r.content}\n反馈指标：${r.metrics}\n`
        ).join('\n');
        evaluationImage.value = data.wordcloud_image || '';
        loading.value.data = false;
        loading.value.wordcloud = false;
        statusOutput.value += `\n成功获取~\n正在保存资料~\n已成功保存~\n正在显示~`;
      }
      else if (data.step === 'summary') {
        // 实时追加 token
        enterpriseInfoTextRaw.value += data.token || '';
        // 实时同步渲染 HTML
        enterpriseInfoTextHtml.value = (marked.parse(enterpriseInfoTextRaw.value) as string);
        // 强制 Vue 立即更新 DOM
        nextTick(() => {});
      }
      else if (data.step === 'done') {
        // 最终渲染一次
        enterpriseInfoTextHtml.value = (marked.parse(enterpriseInfoTextRaw.value) as string);
        loading.value.analysis = false;
        loading.value.status  = false;
        source.close();
        message.success('数据获取成功！');
        statusOutput.value += '\nAI分析完成~';
      }
      else if (data.step === 'error') {
        statusOutput.value = `AI 分析失败：${data.message}`;
        loading.value.analysis = false;
        loading.value.status = false;
        source.close();
        message.error('AI 分析失败！');
      }
    } catch (e) {
      console.error('解析事件数据失败:', e);
    }
  };

  source.onerror = (err) => {
    console.error('EventSource 连接错误:', err);
    source.close();
    
    if (retryCount.value < MAX_RETRIES) {
      retryCount.value++;
      statusOutput.value += `\n连接中断，尝试重连 (${retryCount.value}/${MAX_RETRIES})...`;
      setTimeout(connectSSE, 2000);
    } else {
      statusOutput.value = '连接服务器失败，请检查后端是否启动。';
      loading.value = { status: false, data: false, wordcloud: false, analysis: false };
      message.error('连接失败，请重试！');
    }
  };
};

// 重置按钮
const handleReset = () => {
  enterpriseName.value = '';
  statusOutput.value = '';
  dataOutput.value = '';
  enterpriseInfoTextRaw.value = '';
  enterpriseInfoTextHtml.value = '';
  evaluationImage.value = '';
  retryCount.value = 0;
  message.success('已重置所有数据！');
};
</script>

<template>
  <div class="page-container">
    <div class="container">
      <!-- 左侧部分 -->
      <div class="left-panel">
        <!-- 上方输入框和按钮 -->
        <a-card class="input-section">
          <template #title>企业查询</template>
          <div class="input-group">
            <a-input v-model:value="enterpriseName" placeholder="请输入企业名称..." size="large" />
            <div class="buttons">
              <a-button type="primary" @click="handleConfirm" size="large">
                查询
              </a-button>
              <a-button @click="handleReset" size="large">
                重置
              </a-button>
            </div>
          </div>
        </a-card>

        <!-- 下方状态输出框 -->
        <a-card class="status-section">
          <template #title>查询状态与原始数据</template>
          <div class="status-container">
            <div class="section-subtitle">查询状态</div>
            <a-spin :spinning="loading.status">
              <div class="status-output">{{ statusOutput }}</div>
            </a-spin>

            <div class="section-subtitle mt-4">原始数据</div>
            <div class="data-skeleton-container">
              <template v-if="loading.data">
                <a-skeleton :paragraph="{ rows: 6 }" active />
              </template>
              <div v-else class="data-output">{{ dataOutput }}</div>
            </div>
          </div>
        </a-card>
      </div>

      <!-- 右侧部分 -->
      <div class="right-panel">
        <!-- 企业评价云图 -->
        <a-card class="evaluation-section">
          <template #title>企业评价云图</template>
          <a-spin :spinning="loading.wordcloud">
            <div class="evaluation-content">
              <img v-if="evaluationImage" :src="evaluationImage" alt="企业评价云图" class="evaluation-image" />
              <a-empty v-else description="暂无数据" />
            </div>
          </a-spin>
        </a-card>

        <!-- 企业评价 -->
        <a-card class="info-section">
          <template #title>AI 分析报告</template>
          <div class="analysis-skeleton-container">
            
            <div class="markdown-content" v-html="enterpriseInfoTextHtml"></div>
          </div>
        </a-card>
      </div>
    </div>
  </div>
</template>
<style scoped>
.page-container {
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background-color: #f0f2f5;
}

.container {
  display: flex;
  max-width: 80vw;
  width: 100%;
  gap: 2rem;
}

.left-panel {
  width: 35%;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.right-panel {
  width: 65%;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.input-section,
.status-section,
.evaluation-section,
.info-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e9ecef;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-box {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.input-box:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
}

.buttons {
  display: flex;
  gap: 1rem;
}

.button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.confirm-btn {
  background-color: #4299e1;
  color: white;
}

.confirm-btn:hover {
  background-color: #3182ce;
  transform: translateY(-1px);
}

.reset-btn {
  background-color: #e2e8f0;
  color: #4a5568;
}

.reset-btn:hover {
  background-color: #cbd5e0;
  transform: translateY(-1px);
}

.status-output,
.data-output {
  background-color: #fafafa;
  padding: 1rem;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
  font-family: monospace;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.evaluation-content {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  max-height: 400px;
  overflow: hidden;
}

.evaluation-image {
  width: 80%;
  height: auto;
  max-width: 300px;
  border-radius: 8px;
}

.markdown-content {
  padding: 1rem;
  line-height: 1.7;
  color: #2d3748;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  font-weight: 600;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1rem;
}

.markdown-content :deep(code) {
  background-color: #f7fafc;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #e2e8f0;
  padding-left: 1rem;
  margin: 1rem 0;
  color: #4a5568;
}

.no-data {
  color: #a0aec0;
  font-size: 1.1rem;
  text-align: center;
}

.mt-4 {
  margin-top: 1.5rem;
}

/* 自定义滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}

.section-subtitle {
  font-size: 1.1rem;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 0.75rem;
}

.status-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.data-skeleton-container,
.analysis-skeleton-container {
  background-color: #fff;
  padding: 1rem;
  border-radius: 4px;
  min-height: 200px;
}

.data-skeleton-container :deep(.ant-skeleton-paragraph) {
  margin-bottom: 0;
}

.analysis-skeleton-container :deep(.ant-skeleton-paragraph) {
  margin: 1rem 0;
}
</style>