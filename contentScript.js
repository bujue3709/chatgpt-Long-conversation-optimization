/*
 * ChatGPT Conversation Toolkit - Bootstrap and DOM observers
 */
if (!window[TOOLKIT_BOOTSTRAP_FLAG]) {
  window[TOOLKIT_BOOTSTRAP_FLAG] = true;

  timelineState.visible = loadTimelineVisibility();
  timelineState.manualPosition = loadTimelinePosition();

  let resizeListenerAdded = false;

  const setupResizeListener = () => {
    if (resizeListenerAdded) {
      return;
    }
    resizeListenerAdded = true;

    window.addEventListener("resize", () => {
      const btn = document.getElementById(MINIMIZED_ID);
      if (btn && btn.classList.contains("is-visible")) {
        ensureButtonVisible(btn);
      }
      updateTimelinePosition();
      scheduleTimelineRefresh();
    });
  };

  setupThemeSync();
  attachToolbar();
  renderTimeline();
  setupResizeListener();

  const observer = new MutationObserver(() => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimizedButton = document.getElementById(MINIMIZED_ID);
    const timeline = document.getElementById(TIMELINE_ID);
    const promptModal = document.getElementById(PROMPT_MODAL_ID);

    if (!toolbar) {
      attachToolbar();
      observeThemeOnBodyIfNeeded();
      syncToolkitTheme();
      scheduleTimelineRefresh();
      return;
    }

    if (!minimizedButton) {
      ensureMinimizedButton();
    }

    if (!timeline) {
      ensureTimeline();
      renderTimeline();
    }

    if (promptState.isOpen && !promptModal) {
      const restoredModal = ensurePromptModal();
      if (restoredModal) {
        restoredModal.classList.add("is-visible");
        renderPromptList();
      }
    }

    observeThemeOnBodyIfNeeded();
    syncToolkitTheme();
    scheduleTimelineRefresh();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
