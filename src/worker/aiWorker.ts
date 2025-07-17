self.onmessage = async (event) => {
  const { taskId, messages, userApiKey, model, API_URL } = event.data;
  const requestData = {
    model,
    messages,
    stream: true,
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (response.status === 401) {
      self.postMessage({ taskId, isComplete: true, result: '认证失败，请检查 API Key 是否正确' });
      return;
    } else if (!response.ok) {
      self.postMessage({ taskId, isComplete: true, result: `请求失败，错误码: ${response.status}` });
      return;
    }

    if (!response.body) {
      self.postMessage({ taskId, isComplete: true, result: '服务器未返回流数据' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let currentText = '';
    let buffer = '';
    let eventDataLines = []; // 缓存当前SSE事件所有data行内容

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 逐行处理
      let lines = buffer.split('\n');
      // 可能最后一行不完整，留到下一轮处理
      buffer = lines.pop() ?? '';

      for (const lineRaw of lines) {
        const line = lineRaw.trim();

        // 空行表示事件结束，处理之前积累的data行
        if (line === '') {
          if (eventDataLines.length > 0) {
            const dataString = eventDataLines.join('');
            eventDataLines = [];

            if (dataString === '[DONE]') {
              self.postMessage({ taskId, isComplete: true, result: currentText });
              return;
            }

            try {
              const parsed = JSON.parse(dataString);
              const deltaContent = parsed?.choices?.[0]?.delta?.content;
              if (deltaContent) {
                currentText += deltaContent;
                self.postMessage({ taskId, isComplete: false, result: currentText });
              }
            } catch (e) {
              self.postMessage({ taskId, result: '解析流数据时出错，请稍后重试' });
            }
          }
          // 一条事件结束，进入下一条事件
          continue;
        }

        // 忽略注释行或非data行
        if (line.startsWith(':')) continue;

        // 处理data: 开头的行
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          eventDataLines.push(data);
        }
        // 其他字段如 id:, event: 等可以根据需要处理，这里忽略
      }
    }

    // 流结束，处理剩余缓冲区中的事件（若有）
    if (eventDataLines.length > 0) {
      const dataString = eventDataLines.join('');
      if (dataString !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataString);
          const deltaContent = parsed?.choices?.[0]?.delta?.content;
          if (deltaContent) {
            currentText += deltaContent;
          }
        } catch { }
      }
    }

    self.postMessage({ taskId, isComplete: true, result: currentText });

  } catch (error) {
    self.postMessage({ taskId, result: '请求失败，请稍后重试' });
  }
};
