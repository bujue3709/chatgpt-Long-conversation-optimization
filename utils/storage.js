/*
 * ChatGPT Conversation Toolkit - Storage utilities
 */
const getExtensionStorageArea = () =>
  typeof chrome !== "undefined" && chrome?.storage?.local ? chrome.storage.local : null;

const saveMinimizedPosition = (position) => {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch (error) {
    // Ignore storage write failures.
  }
};

const saveTimelineVisibility = (visible) => {
  try {
    localStorage.setItem(TIMELINE_VISIBLE_KEY, visible ? "1" : "0");
  } catch (error) {
    // Ignore storage write failures.
  }
};

const saveTimelinePosition = (position) => {
  try {
    localStorage.setItem(TIMELINE_POSITION_KEY, JSON.stringify(position));
  } catch (error) {
    // Ignore storage write failures.
  }
};

const loadTimelineVisibility = () => {
  try {
    const stored = localStorage.getItem(TIMELINE_VISIBLE_KEY);
    if (stored === null) {
      return true;
    }
    return stored !== "0" && stored !== "false";
  } catch (error) {
    return true;
  }
};

const loadTimelinePosition = () => {
  try {
    const stored = localStorage.getItem(TIMELINE_POSITION_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    const left = Number(parsed?.left);
    const top = Number(parsed?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return null;
    }
    return { left, top };
  } catch (error) {
    return null;
  }
};

const loadMinimizedPosition = () => {
  const stored = localStorage.getItem(POSITION_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
};


