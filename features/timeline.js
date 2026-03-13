/*
 * ChatGPT Conversation Toolkit - Timeline
 */
// ============ 时间线功能 ============

const getTimelineElements = () => {
  const timeline = document.getElementById(TIMELINE_ID);
  if (!timeline) {
    return null;
  }

  return {
    timeline,
    track: timeline.querySelector(`#${TIMELINE_TRACK_ID}`),
    count: timeline.querySelector(`#${TIMELINE_COUNT_ID}`),
    content: timeline.querySelector(`.${TIMELINE_CONTENT_CLASS}`),
    preview: timeline.querySelector(`#${TIMELINE_PREVIEW_ID}`),
    hint: timeline.querySelector(`#${TIMELINE_HINT_ID}`),
  };
};

const ensureTimelineTrackContent = (track) => {
  if (!(track instanceof HTMLElement)) {
    return null;
  }

  const existingContent = track.querySelector(`.${TIMELINE_CONTENT_CLASS}`);
  if (existingContent instanceof HTMLElement) {
    return existingContent;
  }

  const content = document.createElement("div");
  content.className = TIMELINE_CONTENT_CLASS;
  while (track.firstChild) {
    content.appendChild(track.firstChild);
  }
  track.appendChild(content);
  return content;
};

const getTimelineMessageKey = (node, index) =>
  node.getAttribute("data-message-id") || node.getAttribute("data-testid") || `timeline-user-${index}`;

const normalizeTimelineText = (text) => (text || "").replace(/\s+/g, " ").trim();
const truncateTimelineText = (text, maxLength = 110) =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
const clampTimelineValue = (value, min, max) => Math.min(Math.max(value, min), max);

const parseTimelineTimestampCandidate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{10}$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric * 1000 : null;
  }

  if (/^\d{11,16}$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

const extractTimelineTimestamp = (node, index, previousTimestamp) => {
  const directCandidates = [
    node.getAttribute("data-timestamp"),
    node.getAttribute("data-created-at"),
    node.getAttribute("data-time"),
    node.getAttribute("datetime"),
  ];

  for (const candidate of directCandidates) {
    const parsed = parseTimelineTimestampCandidate(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const nestedSelectors = [
    "time[datetime]",
    "[data-timestamp]",
    "[data-created-at]",
    "[datetime]",
  ];

  for (const selector of nestedSelectors) {
    const element = node.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const parsed = parseTimelineTimestampCandidate(
      element.getAttribute("datetime") ||
      element.getAttribute("data-timestamp") ||
      element.getAttribute("data-created-at") ||
      element.getAttribute("data-time")
    );
    if (parsed !== null) {
      return parsed;
    }
  }

  if (Number.isFinite(previousTimestamp)) {
    return previousTimestamp + 60000;
  }
  return index * 60000;
};

const pickNearestUnselectedIndex = (items, targetTimestamp, selectedIndexes) => {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item, index) => {
    if (selectedIndexes.has(index)) {
      return;
    }
    const distance = Math.abs(item.timestamp - targetTimestamp);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const limitTimelineItems = (items, maxNodes = 20) => {
  if (items.length <= maxNodes) {
    return items.map((item) => ({ ...item }));
  }

  const minTimestamp = items[0].timestamp;
  const maxTimestamp = items[items.length - 1].timestamp;
  const selectedIndexes = new Set();

  if (maxTimestamp <= minTimestamp) {
    for (let i = 0; i < maxNodes; i += 1) {
      const index = Math.round((i * (items.length - 1)) / Math.max(1, maxNodes - 1));
      selectedIndexes.add(index);
    }
  } else {
    for (let i = 0; i < maxNodes; i += 1) {
      const ratio = i / Math.max(1, maxNodes - 1);
      const targetTimestamp = minTimestamp + (maxTimestamp - minTimestamp) * ratio;
      const picked = pickNearestUnselectedIndex(items, targetTimestamp, selectedIndexes);
      if (picked >= 0) {
        selectedIndexes.add(picked);
      }
    }
  }

  const indexes = Array.from(selectedIndexes).sort((left, right) => left - right);
  return indexes.map((index) => ({ ...items[index] }));
};

const assignTimelinePositions = (items) => {
  if (items.length <= 1) {
    return items.map((item) => ({ ...item, position: 0.5 }));
  }

  const minTimestamp = items[0].timestamp;
  const maxTimestamp = items[items.length - 1].timestamp;

  if (maxTimestamp <= minTimestamp) {
    return items.map((item, index) => ({
      ...item,
      position: clampTimelineValue(index / (items.length - 1), 0.02, 0.98),
    }));
  }

  return items.map((item) => ({
    ...item,
    position: clampTimelineValue(
      (item.timestamp - minTimestamp) / (maxTimestamp - minTimestamp),
      0.02,
      0.98
    ),
  }));
};

const buildTimelineSignature = (items) =>
  items.map((item) => `${item.key}:${Math.round(item.position * 1000)}`).join("|");

const calculateTimelineContentHeight = (trackHeight, itemCount) => {
  const safeTrackHeight = Math.max(1, Math.round(trackHeight));
  if (itemCount <= TIMELINE_VISIBLE_NODE_CAPACITY) {
    return safeTrackHeight;
  }
  const ratio = itemCount / TIMELINE_VISIBLE_NODE_CAPACITY;
  return Math.max(safeTrackHeight, Math.round(safeTrackHeight * ratio));
};

const getTimelineTrackMaxScrollTop = (track) =>
  Math.max(0, track.scrollHeight - track.clientHeight);

const normalizeTimelineWheelDelta = (event) => {
  let delta = event.deltaY;
  if (event.deltaMode === 1) {
    delta *= 16;
  } else if (event.deltaMode === 2) {
    delta *= Math.max(window.innerHeight * 0.85, 320);
  }

  if (delta !== 0 && Math.abs(delta) < 2) {
    return delta > 0 ? 2 : -2;
  }
  return delta;
};

const compressTimelineWheelDelta = (delta) => {
  if (delta === 0) {
    return 0;
  }
  const distance = clampTimelineValue(
    Math.abs(delta) * TIMELINE_WHEEL_DISTANCE_SCALE,
    TIMELINE_WHEEL_MIN_STEP,
    TIMELINE_WHEEL_MAX_STEP
  );
  return delta > 0 ? distance : -distance;
};

const updateTimelineBubblePlacement = () => {
  const elements = getTimelineElements();
  const timeline = elements?.timeline;
  if (!(timeline instanceof HTMLElement)) {
    return;
  }

  const timelineRect = timeline.getBoundingClientRect();
  const previewWidth = elements.preview instanceof HTMLElement
    ? Math.max(220, Math.round(elements.preview.getBoundingClientRect().width || 0))
    : 240;
  const hintWidth = elements.hint instanceof HTMLElement
    ? Math.max(120, Math.round(elements.hint.getBoundingClientRect().width || 0))
    : 140;
  const sideBubbleWidth = Math.max(previewWidth, hintWidth);
  const rightSpace = window.innerWidth - timelineRect.right;
  const leftSpace = timelineRect.left;
  const shouldFlip = rightSpace < sideBubbleWidth + 20 && leftSpace > rightSpace;
  timeline.classList.toggle("is-flipped", shouldFlip);

  const hintHeight = elements.hint instanceof HTMLElement
    ? Math.max(30, Math.round(elements.hint.getBoundingClientRect().height || 0))
    : 30;
  const bottomSpace = window.innerHeight - timelineRect.bottom;
  const shouldShowHintOnTop = bottomSpace < hintHeight + 16;
  timeline.classList.toggle("is-hint-top", shouldShowHintOnTop);
};

const hideTimelineHint = () => {
  const elements = getTimelineElements();
  const hint = elements?.hint;
  if (!(hint instanceof HTMLElement)) {
    return;
  }
  hint.classList.remove("is-visible");
  hint.textContent = "";
};

const showTimelineHint = (message) => {
  const elements = getTimelineElements();
  const hint = elements?.hint;
  if (!(hint instanceof HTMLElement)) {
    return;
  }
  if (timelineHintTimer) {
    clearTimeout(timelineHintTimer);
  }
  hint.textContent = message;
  updateTimelineBubblePlacement();
  hint.classList.add("is-visible");
  timelineHintTimer = setTimeout(() => {
    hint.classList.remove("is-visible");
    timelineHintTimer = null;
  }, 2000);
};

const hideTimelinePreview = () => {
  const elements = getTimelineElements();
  const preview = elements?.preview;
  if (!(preview instanceof HTMLElement)) {
    return;
  }
  preview.classList.remove("is-visible");
  preview.textContent = "";
  timelineState.hoverIndex = -1;
};

const showTimelinePreview = (index) => {
  if (index < 0 || index >= timelineState.items.length) {
    hideTimelinePreview();
    return;
  }

  const elements = getTimelineElements();
  const preview = elements?.preview;
  if (!(preview instanceof HTMLElement)) {
    return;
  }

  const item = timelineState.items[index];
  if (!item) {
    hideTimelinePreview();
    return;
  }

  if (timelineState.hoverIndex === index && preview.classList.contains("is-visible")) {
    return;
  }

  timelineState.hoverIndex = index;
  preview.textContent = truncateTimelineText(item.previewText || "");
  updateTimelineBubblePlacement();
  preview.classList.add("is-visible");
};

const updateTimelineActiveUi = () => {
  const elements = getTimelineElements();
  const track = elements?.track;
  if (!(track instanceof HTMLElement)) {
    return;
  }

  const nodes = track.querySelectorAll(".chatgpt-toolkit-timeline-node");
  nodes.forEach((node) => {
    const element = node;
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const index = Number(element.dataset.timelineIndex);
    if (Number.isNaN(index)) {
      return;
    }
    if (index === timelineState.activeIndex) {
      element.classList.add("is-active");
    } else {
      element.classList.remove("is-active");
    }
  });
};

const highlightTimelineMessageNode = (node) => {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (timelineHighlightTimer) {
    clearTimeout(timelineHighlightTimer);
  }
  node.classList.add("chatgpt-toolkit-timeline-target");
  timelineHighlightTimer = setTimeout(() => {
    node.classList.remove("chatgpt-toolkit-timeline-target");
    timelineHighlightTimer = null;
  }, 1400);
};

const setTimelineActiveIndex = (index, options = {}) => {
  if (index < 0 || index >= timelineState.items.length) {
    updateTimelineCount(0, timelineState.totalUserCount);
    return;
  }

  const { scrollToMessage = false, highlightMessage = false } = options;
  timelineState.activeIndex = index;
  updateTimelineActiveUi();

  const item = timelineState.items[index];
  if (!item) {
    updateTimelineCount(0, timelineState.totalUserCount);
    return;
  }
  const currentOrder = Number.isFinite(item.order) ? item.order : index + 1;
  updateTimelineCount(currentOrder, timelineState.totalUserCount);

  if (scrollToMessage && item.node instanceof HTMLElement && item.node.isConnected) {
    item.node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (highlightMessage && item.node instanceof HTMLElement && item.node.isConnected) {
    highlightTimelineMessageNode(item.node);
  }
};

const getTimelineItemsFromMessages = () => {
  const userNodes = getMessageNodes().filter((node) => detectRole(node) === "user");
  const withTimestamps = [];
  let previousTimestamp = null;

  userNodes.forEach((node, index) => {
    const timestamp = extractTimelineTimestamp(node, index, previousTimestamp);
    previousTimestamp = timestamp;
    const previewText = normalizeTimelineText(extractMessageText(node));
    withTimestamps.push({
      key: getTimelineMessageKey(node, index),
      node,
      timestamp,
      order: index + 1,
      previewText: previewText || `用户消息 ${index + 1}`,
    });
  });

  const sortedItems = withTimestamps
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp);
  const limitedItems = limitTimelineItems(sortedItems, TIMELINE_MAX_NODES);
  return {
    items: assignTimelinePositions(limitedItems),
    totalUserCount: withTimestamps.length,
  };
};

const syncTimelineActiveFromViewport = () => {
  if (timelineState.items.length === 0) {
    return;
  }

  const centerY = window.innerHeight / 2;
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  timelineState.items.forEach((item, index) => {
    const node = item.node;
    if (!(node instanceof HTMLElement) || !node.isConnected) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const nodeCenter = rect.top + rect.height / 2;
    const distance = Math.abs(nodeCenter - centerY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex >= 0 && nearestIndex !== timelineState.activeIndex) {
    setTimelineActiveIndex(nearestIndex);
  }
};

const onTimelineWindowScroll = () => {
  if (timelineScrollTicking) {
    return;
  }
  timelineScrollTicking = true;
  requestAnimationFrame(() => {
    timelineScrollTicking = false;
    syncTimelineActiveFromViewport();
  });
};

const getSidebarRightEdge = () => {
  const viewportWidth = window.innerWidth;
  const candidates = [];
  const selectors = [
    'aside',
    '[data-testid*="sidebar"]',
    'nav[aria-label]',
    '[class*="sidebar"]',
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < window.innerHeight * 0.35) {
        return;
      }
      if (rect.left > viewportWidth * 0.5 || rect.right <= 0) {
        return;
      }
      candidates.push(rect.right);
    });
  });

  if (candidates.length === 0) {
    return 16;
  }
  return Math.max(...candidates);
};

const updateTimelinePosition = () => {
  const timeline = document.getElementById(TIMELINE_ID);
  if (!(timeline instanceof HTMLElement)) {
    return;
  }

  if (
    timelineState.manualPosition &&
    Number.isFinite(timelineState.manualPosition.left) &&
    Number.isFinite(timelineState.manualPosition.top)
  ) {
    const rect = timeline.getBoundingClientRect();
    const width = rect.width || timeline.offsetWidth || 64;
    const height = rect.height || timeline.offsetHeight || Math.round(window.innerHeight * 0.65);
    const maxLeft = Math.max(TIMELINE_DRAG_MARGIN, window.innerWidth - width - TIMELINE_DRAG_MARGIN);
    const maxTop = Math.max(TIMELINE_DRAG_MARGIN, window.innerHeight - height - TIMELINE_DRAG_MARGIN);
    const left = clampTimelineValue(
      Math.round(timelineState.manualPosition.left),
      TIMELINE_DRAG_MARGIN,
      maxLeft
    );
    const top = clampTimelineValue(
      Math.round(timelineState.manualPosition.top),
      TIMELINE_DRAG_MARGIN,
      maxTop
    );
    timeline.style.left = `${left}px`;
    timeline.style.top = `${top}px`;
    timeline.style.transform = "none";
    timelineState.manualPosition = { left, top };
    updateTimelineBubblePlacement();
    return;
  }

  const rightEdge = getSidebarRightEdge();
  const maxLeft = Math.max(8, window.innerWidth - 80);
  const left = Math.min(maxLeft, Math.max(8, Math.round(rightEdge + 10)));
  timeline.style.left = `${left}px`;
  timeline.style.top = "50%";
  timeline.style.transform = "translateY(-50%)";
  updateTimelineBubblePlacement();
};

const setTimelineManualPosition = (timeline, left, top, options = {}) => {
  if (!(timeline instanceof HTMLElement)) {
    return;
  }

  const { persist = true, updateBubble = true, bounds = null } = options;
  const rect = bounds ? null : timeline.getBoundingClientRect();
  const width = bounds?.width || rect?.width || timeline.offsetWidth || 64;
  const height = bounds?.height || rect?.height || timeline.offsetHeight || Math.round(window.innerHeight * 0.65);
  const maxLeft =
    bounds?.maxLeft || Math.max(TIMELINE_DRAG_MARGIN, window.innerWidth - width - TIMELINE_DRAG_MARGIN);
  const maxTop =
    bounds?.maxTop || Math.max(TIMELINE_DRAG_MARGIN, window.innerHeight - height - TIMELINE_DRAG_MARGIN);
  const nextLeft = clampTimelineValue(Math.round(left), TIMELINE_DRAG_MARGIN, maxLeft);
  const nextTop = clampTimelineValue(Math.round(top), TIMELINE_DRAG_MARGIN, maxTop);

  timeline.style.left = `${nextLeft}px`;
  timeline.style.top = `${nextTop}px`;
  timeline.style.transform = "none";

  timelineState.manualPosition = {
    left: nextLeft,
    top: nextTop,
  };

  if (persist) {
    saveTimelinePosition(timelineState.manualPosition);
  }
  if (updateBubble) {
    updateTimelineBubblePlacement();
  }
};

const enableTimelineDrag = (timeline) => {
  if (!(timeline instanceof HTMLElement) || timeline.dataset.dragEnabled === "1") {
    return;
  }

  const header = timeline.querySelector(".chatgpt-toolkit-timeline-header");
  if (!(header instanceof HTMLElement)) {
    return;
  }

  timeline.dataset.dragEnabled = "1";
  let isDragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let dragBounds = null;

  const dragController = createRafDragController(({ left, top }) => {
    if (!dragBounds) {
      return;
    }
    setTimelineManualPosition(timeline, left, top, {
      persist: false,
      updateBubble: false,
      bounds: dragBounds,
    });
  });

  const onMouseMove = (event) => {
    if (!isDragging) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (!moved) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance < TIMELINE_DRAG_THRESHOLD) {
        return;
      }
      moved = true;
      timeline.classList.add("is-dragging");
      timeline.style.willChange = "left, top";
      hideTimelinePreview();
      hideTimelineHint();
      document.documentElement.style.userSelect = "none";
    }

    dragController.schedule({
      left: startLeft + deltaX,
      top: startTop + deltaY,
    });
  };

  const stopDragging = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", stopDragging);
    dragController.flush();
    timeline.classList.remove("is-dragging");
    timeline.style.willChange = "";
    document.documentElement.style.userSelect = "";

    if (moved && timelineState.manualPosition) {
      saveTimelinePosition(timelineState.manualPosition);
      updateTimelineBubblePlacement();
    }
    dragBounds = null;
    moved = false;
  };

  header.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const rect = timeline.getBoundingClientRect();
    const width = rect.width || timeline.offsetWidth || 64;
    const height = rect.height || timeline.offsetHeight || Math.round(window.innerHeight * 0.65);
    dragBounds = {
      width,
      height,
      maxLeft: Math.max(TIMELINE_DRAG_MARGIN, window.innerWidth - width - TIMELINE_DRAG_MARGIN),
      maxTop: Math.max(TIMELINE_DRAG_MARGIN, window.innerHeight - height - TIMELINE_DRAG_MARGIN),
    };
    isDragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDragging);
  });
};

const handleTimelineWheel = (event) => {
  event.preventDefault();
  event.stopPropagation();

  const elements = getTimelineElements();
  const track = elements?.track;
  if (!(track instanceof HTMLElement)) {
    return;
  }

  if (timelineState.items.length === 0) {
    showTimelineHint(state.isCollapsed ? "请恢复隐藏消息" : "已经没有消息了");
    return;
  }

  const maxScrollTop = getTimelineTrackMaxScrollTop(track);
  if (maxScrollTop <= 1) {
    if (event.deltaY < 0) {
      showTimelineHint(state.isCollapsed ? "请恢复隐藏消息" : "已经没有消息了");
    }
    return;
  }

  const rawDelta = normalizeTimelineWheelDelta(event);
  if (rawDelta === 0) {
    return;
  }

  const delta = compressTimelineWheelDelta(rawDelta);
  if (delta === 0) {
    return;
  }

  const previousScrollTop = track.scrollTop;
  const nextScrollTop = clampTimelineValue(previousScrollTop + delta, 0, maxScrollTop);
  track.scrollTop = nextScrollTop;

  if (delta < 0 && previousScrollTop <= 0 && nextScrollTop <= 0) {
    showTimelineHint(state.isCollapsed ? "请恢复隐藏消息" : "已经没有消息了");
  }
};

const handleTimelineClick = (event) => {
  const target = event.target;
  const nodeButton =
    target instanceof Element
      ? target.closest("[data-timeline-index]")
      : target instanceof Node && target.parentElement
        ? target.parentElement.closest("[data-timeline-index]")
        : null;

  if (!(nodeButton instanceof HTMLElement)) {
    return;
  }

  const index = Number(nodeButton.dataset.timelineIndex);
  if (Number.isNaN(index)) {
    return;
  }

  setTimelineActiveIndex(index, {
    scrollToMessage: true,
    highlightMessage: true,
  });
};

const resolveTimelineNodeIndex = (target) => {
  const nodeButton =
    target instanceof Element
      ? target.closest("[data-timeline-index]")
      : target instanceof Node && target.parentElement
        ? target.parentElement.closest("[data-timeline-index]")
        : null;

  if (!(nodeButton instanceof HTMLElement)) {
    return -1;
  }

  const index = Number(nodeButton.dataset.timelineIndex);
  return Number.isNaN(index) ? -1 : index;
};

const handleTimelineMouseMove = (event) => {
  const timeline = document.getElementById(TIMELINE_ID);
  if (timeline instanceof HTMLElement && timeline.classList.contains("is-dragging")) {
    return;
  }

  const index = resolveTimelineNodeIndex(event.target);
  if (index < 0) {
    return;
  }
  if (index === timelineState.hoverIndex) {
    return;
  }
  showTimelinePreview(index);
};

const handleTimelineMouseLeave = () => {
  hideTimelinePreview();
};

const updateTimelineCount = (currentNodeOrder, totalCount) => {
  const elements = getTimelineElements();
  const count = elements?.count;
  if (!(count instanceof HTMLElement)) {
    return;
  }
  const current = Number.isFinite(currentNodeOrder) ? Math.max(0, Math.trunc(currentNodeOrder)) : 0;
  const total = Number.isFinite(totalCount) ? Math.max(0, Math.trunc(totalCount)) : 0;
  count.textContent = `${current}/${total}`;
  count.setAttribute("aria-label", `当前节点 ${current}，总用户节点 ${total}`);
};

const updateTimelineToggleButton = () => {
  const button = document.querySelector(`#${TOOLKIT_ID} [data-action="timeline-toggle"]`);
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  if (timelineState.visible) {
    button.textContent = "隐藏时间线";
    button.setAttribute("aria-label", "隐藏时间线");
  } else {
    button.textContent = "显示时间线";
    button.setAttribute("aria-label", "显示时间线");
  }
};

const setTimelineVisibility = (visible, options = {}) => {
  const { persist = true } = options;
  timelineState.visible = !!visible;
  if (persist) {
    saveTimelineVisibility(timelineState.visible);
  }
  updateTimelineToggleButton();

  const timeline = document.getElementById(TIMELINE_ID);
  if (timeline instanceof HTMLElement) {
    timeline.classList.toggle("is-hidden", !timelineState.visible);
  }

  if (!timelineState.visible) {
    hideTimelineHint();
    hideTimelinePreview();
    return;
  }

  renderTimeline();
};

const toggleTimelineVisibility = () => {
  setTimelineVisibility(!timelineState.visible, { persist: true });
};

const ensureTimeline = () => {
  const existingTimeline = document.getElementById(TIMELINE_ID);
  if (existingTimeline) {
    const existingTrack = existingTimeline.querySelector(`#${TIMELINE_TRACK_ID}`);
    ensureTimelineTrackContent(existingTrack);
    const existingCount = existingTimeline.querySelector(`#${TIMELINE_COUNT_ID}`);
    if (!(existingCount instanceof HTMLElement)) {
      const panel = existingTimeline.querySelector(".chatgpt-toolkit-timeline-panel");
      if (panel instanceof HTMLElement) {
        let header = panel.querySelector(".chatgpt-toolkit-timeline-header");
        if (!(header instanceof HTMLElement)) {
          header = document.createElement("div");
          header.className = "chatgpt-toolkit-timeline-header";
          const existingTitle = panel.querySelector(".chatgpt-toolkit-timeline-title");
          if (existingTitle instanceof HTMLElement) {
            header.appendChild(existingTitle);
          } else {
            const title = document.createElement("span");
            title.className = "chatgpt-toolkit-timeline-title";
            title.textContent = "时间线";
            header.appendChild(title);
          }
          panel.prepend(header);
        }
        const count = document.createElement("span");
        count.id = TIMELINE_COUNT_ID;
        count.className = "chatgpt-toolkit-timeline-count";
        count.textContent = "0/0";
        header.appendChild(count);
      }
    }
    existingTimeline.classList.toggle("is-hidden", !timelineState.visible);
    enableTimelineDrag(existingTimeline);
    updateTimelinePosition();
    return existingTimeline;
  }

  if (!document.body) {
    return null;
  }

  const timeline = document.createElement("section");
  timeline.id = TIMELINE_ID;
  timeline.className = "chatgpt-toolkit-timeline";
  if (!timelineState.visible) {
    timeline.classList.add("is-hidden");
  }
  timeline.setAttribute("aria-label", "对话时间线");
  timeline.innerHTML = `
    <div class="chatgpt-toolkit-timeline-panel">
      <div class="chatgpt-toolkit-timeline-header">
        <span class="chatgpt-toolkit-timeline-title">时间线</span>
        <span id="${TIMELINE_COUNT_ID}" class="chatgpt-toolkit-timeline-count">0/0</span>
      </div>
      <div id="${TIMELINE_TRACK_ID}" class="chatgpt-toolkit-timeline-track">
        <div class="${TIMELINE_CONTENT_CLASS}"></div>
      </div>
    </div>
    <div id="${TIMELINE_PREVIEW_ID}" class="chatgpt-toolkit-timeline-preview"></div>
    <div id="${TIMELINE_HINT_ID}" class="chatgpt-toolkit-timeline-hint"></div>
  `;

  timeline.addEventListener("wheel", handleTimelineWheel, { passive: false });
  timeline.addEventListener("click", handleTimelineClick);
  timeline.addEventListener("mousemove", handleTimelineMouseMove);
  timeline.addEventListener("mouseleave", handleTimelineMouseLeave);

  if (!timelineScrollListenerAdded) {
    window.addEventListener("scroll", onTimelineWindowScroll, { passive: true });
    timelineScrollListenerAdded = true;
  }

  document.body.appendChild(timeline);
  enableTimelineDrag(timeline);
  updateTimelinePosition();
  syncToolkitTheme();
  return timeline;
};

const renderTimeline = () => {
  ensureConversationState();
  const timeline = ensureTimeline();
  if (!timeline) {
    return;
  }
  updateTimelineToggleButton();
  timeline.classList.toggle("is-hidden", !timelineState.visible);
  if (!timelineState.visible) {
    hideTimelineHint();
    hideTimelinePreview();
    return;
  }

  updateTimelineBubblePlacement();

  const elements = getTimelineElements();
  const track = elements?.track;
  const content = ensureTimelineTrackContent(elements?.content || track);
  if (!(track instanceof HTMLElement) || !(content instanceof HTMLElement)) {
    return;
  }
  if (track.clientHeight <= 0) {
    scheduleTimelineRefresh();
    return;
  }

  const previousScrollTop = track.scrollTop;
  const previousMaxScroll = Math.max(0, track.scrollHeight - track.clientHeight);
  const previousItems = timelineState.items;
  const previousActiveKey = previousItems[timelineState.activeIndex]?.key || null;
  const previousHoverKey = previousItems[timelineState.hoverIndex]?.key || null;

  const timelineData = getTimelineItemsFromMessages();
  const nextItems = timelineData.items;
  const totalUserCount = timelineData.totalUserCount;
  const nextSignature = buildTimelineSignature(nextItems);
  const contentHeight = calculateTimelineContentHeight(track.clientHeight, nextItems.length);
  content.style.height = `${contentHeight}px`;
  const shouldRebuild =
    !timelineState.rendered ||
    timelineState.signature !== nextSignature ||
    timelineState.contentHeight !== contentHeight;

  if (shouldRebuild) {
    content.innerHTML = "";

    const fragment = document.createDocumentFragment();
    const verticalPadding = 10;
    const usableHeight = Math.max(1, contentHeight - verticalPadding * 2);
    nextItems.forEach((item, index) => {
      const nodeButton = document.createElement("button");
      nodeButton.type = "button";
      nodeButton.className = "chatgpt-toolkit-timeline-node";
      nodeButton.dataset.timelineIndex = String(index);
      nodeButton.setAttribute("aria-label", `跳转到第 ${index + 1} 条用户消息`);
      const topPx = verticalPadding + item.position * usableHeight;
      nodeButton.style.top = `${topPx.toFixed(2)}px`;
      nodeButton.innerHTML = `<span class="chatgpt-toolkit-timeline-dot"></span>`;
      fragment.appendChild(nodeButton);
    });
    content.appendChild(fragment);

    const nextMaxScroll = Math.max(0, contentHeight - track.clientHeight);
    if (nextMaxScroll > 0) {
      if (previousMaxScroll > 0) {
        const scrollRatio = previousScrollTop / previousMaxScroll;
        track.scrollTop = clampTimelineValue(scrollRatio * nextMaxScroll, 0, nextMaxScroll);
      } else {
        track.scrollTop = nextMaxScroll;
      }
    } else {
      track.scrollTop = 0;
    }
  }

  timelineState.items = nextItems;
  timelineState.totalUserCount = totalUserCount;
  timelineState.signature = nextSignature;
  timelineState.contentHeight = contentHeight;
  timelineState.rendered = true;

  if (timelineState.items.length === 0) {
    timelineState.activeIndex = -1;
    track.scrollTop = 0;
    updateTimelineCount(0, timelineState.totalUserCount);
    hideTimelinePreview();
    return;
  }

  let nextActiveIndex = previousActiveKey
    ? timelineState.items.findIndex((item) => item.key === previousActiveKey)
    : -1;
  if (nextActiveIndex < 0) {
    nextActiveIndex = timelineState.items.length - 1;
  }
  setTimelineActiveIndex(nextActiveIndex);
  syncTimelineActiveFromViewport();

  if (previousHoverKey) {
    const nextHoverIndex = timelineState.items.findIndex((item) => item.key === previousHoverKey);
    if (nextHoverIndex >= 0) {
      showTimelinePreview(nextHoverIndex);
    } else {
      hideTimelinePreview();
    }
  }
};

const scheduleTimelineRefresh = () => {
  if (timelineRefreshTimer) {
    return;
  }
  timelineRefreshTimer = setTimeout(() => {
    timelineRefreshTimer = null;
    renderTimeline();
  }, 120);
};
