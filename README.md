# ChatGPT Conversation Toolkit


适用于ChatGPT web端插件，提供：

- **优化长会话卡顿**：一键隐藏旧消息，减少页面渲染压力。
- **一键导出当前会话**：导出为 JSON 文件，包含所有消息内容，JSON格式如下。

```js
{
  "exportedAt": "导出时间（ ISO 8601 扩展格式日期时间字符串 0 时区）,
  "url": "导出会话链接",
  "messageCount": 对话数量,
  "messages": [
    {
      "index": 消息序号,
      "role": "user",
      "text": "你的消息"
    },
    {
      "index": 消息序号,
      "role": "assistant",
      "text": "ChatGPT的消息"
    }
}
```

## 功能说明

1. **优化长会话卡顿**
   - 点击「优化长会话」按钮后，会隐藏较早的消息，仅保留最新 20 条。
   - 需要查看完整内容时，可点击「恢复隐藏消息」。

2. **一键导出当前会话全部消息**
   - 点击「一键导出」按钮，会生成 JSON 文件并自动下载。
   - 导出的内容包括隐藏的旧消息（如果曾执行优化）。

3. **浮层收起与拖动**
   - 点击右上角「收起」按钮，浮层会变成圆形按钮。
   - 拖动圆形按钮可调整位置，点击即可重新展开。


## 安装方式

### Firefox

1. 打开 `about:debugging`或则浏览器打开`about:debugging#/runtime/this-firefox`
2. 点击「此 Firefox」→「临时载入附加组件」。
3. 选择本项目根目录下的 `manifest.json`。

### Microsoft Edge

1. 点击管理拓展程序或打开 `edge://extensions`。
2. 开启右上角「开发人员模式」。
3. 点击「加载已解压的扩展」并选择本项目根目录。

### Google Chrome

1. 点击管理拓展程序或浏览器打开`chrome://extensions/`
2. 开启右上角「开发人员模式」。
3. 点击「加载已解压的扩展」并选择本项目根目录。

## 使用方法

1. 打开 `https://chat.openai.com/` 或 `https://chatgpt.com/` 的对话页面。
2. 页面右下角会出现「ChatGPT 工具」浮层。
3. 点击对应按钮执行优化或导出。
![alt text](/image/image.png)

## 可选配置

如需修改保留消息数量，可以在 `contentScript.js` 中调整 `keepLatest` 值。

```js
const state = {
  isCollapsed: false,
  keepLatest: 20, // 修改这里
  collapsedNodes: [],
  cachedNodes: [],
};
```

## 文件说明

- `manifest.json`：插件清单文件，定义脚本注入范围。
- `contentScript.js`：核心逻辑（隐藏旧消息、导出会话）。
- `styles.css`：工具浮层样式。
- `image`：README说明图片。


## 请作者喝杯奶茶

如果这个插件对你有用，顺手点个star吧，拜托了这对我真的很重要！

<img src="./image/收款码.jpg" width = "250"/>
