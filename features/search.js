/*
 * ChatGPT Conversation Toolkit - Search
 */
// ============ 搜索功能 ============

const updateSearchUI = () => {
  const searchResult = document.getElementById('chatgpt-toolkit-search-result');
  const prevBtn = document.getElementById('chatgpt-toolkit-search-prev');
  const nextBtn = document.getElementById('chatgpt-toolkit-search-next');

  if (!searchResult) return;

  if (state.searchMatches.length === 0) {
    if (state.searchQuery) {
      searchResult.textContent = '未找到匹配';
    } else {
      searchResult.textContent = '';
    }
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  } else {
    searchResult.textContent = `${state.currentMatchIndex + 1} / ${state.searchMatches.length}`;
    prevBtn.disabled = state.searchMatches.length <= 1;
    nextBtn.disabled = state.searchMatches.length <= 1;
  }
};

const clearSearchHighlight = () => {
  document.querySelectorAll('.chatgpt-toolkit-search-highlight').forEach(el => {
    el.classList.remove('chatgpt-toolkit-search-highlight');
  });
};

const highlightCurrentMatch = () => {
  clearSearchHighlight();
  if (state.currentMatchIndex >= 0 && state.currentMatchIndex < state.searchMatches.length) {
    const node = state.searchMatches[state.currentMatchIndex];
    node.classList.add('chatgpt-toolkit-search-highlight');
  }
};

const performSearch = (query) => {
  state.searchQuery = query.trim().toLowerCase();
  state.searchMatches = [];
  state.currentMatchIndex = -1;

  // 检查是否处于隐藏状态
  if (state.isCollapsed) {
    updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
    updateSearchUI();
    return;
  }

  if (!state.searchQuery) {
    clearSearchHighlight();
    updateSearchUI();
    return;
  }

  // 搜索所有消息节点
  const nodes = getMessageNodes();
  nodes.forEach(node => {
    const text = (node.textContent || '').toLowerCase();
    if (text.includes(state.searchQuery)) {
      state.searchMatches.push(node);
    }
  });

  if (state.searchMatches.length > 0) {
    state.currentMatchIndex = 0;
    highlightCurrentMatch();
    scrollToCurrentMatch();
  }

  updateSearchUI();
};

const scrollToCurrentMatch = () => {
  if (state.currentMatchIndex >= 0 && state.currentMatchIndex < state.searchMatches.length) {
    const node = state.searchMatches[state.currentMatchIndex];
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

const navigateToPrevMatch = () => {
  if (state.isCollapsed) {
    updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
    return;
  }
  if (state.searchMatches.length === 0) return;

  state.currentMatchIndex = (state.currentMatchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
  highlightCurrentMatch();
  scrollToCurrentMatch();
  updateSearchUI();
};

const navigateToNextMatch = () => {
  if (state.isCollapsed) {
    updateStatus('请先恢复隐藏消息，才能使用搜索功能。', 'info');
    return;
  }
  if (state.searchMatches.length === 0) return;

  state.currentMatchIndex = (state.currentMatchIndex + 1) % state.searchMatches.length;
  highlightCurrentMatch();
  scrollToCurrentMatch();
  updateSearchUI();
};

// ============ 时间线功能 ============
