/*
 * ChatGPT Conversation Toolkit - Conversation export
 */
const exportMessages = () => {
  ensureConversationState();
  const visibleNodes = getMessageNodes();
  const nodesForExport = state.isCollapsed
    ? [...state.cachedNodes, ...visibleNodes.filter((node) => !state.cachedNodes.includes(node))]
    : visibleNodes;
  const messages = buildMessagePayload(nodesForExport);

  const payload = {
    exportedAt: new Date().toISOString(),
    url: window.location.href,
    messageCount: messages.length,
    messages,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });

  const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `chatgpt-session-${dateTag}.json`;

  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  updateStatus("导出已开始，请检查下载文件。", "success");
};
