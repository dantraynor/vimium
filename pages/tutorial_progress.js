const tutorialProgressKey = "vimiumTutorialProgress";
const tutorialProgressVersion = 1;

function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createDefaultTutorialProgress() {
  return {
    version: tutorialProgressVersion,
    currentModuleId: null,
    currentLessonId: null,
    completedLessonIds: [],
    statsByLesson: {},
  };
}

function normalizeTutorialProgress(progress, knownLessonIds = []) {
  const known = new Set(knownLessonIds);
  if (
    progress?.version !== tutorialProgressVersion || !Array.isArray(progress.completedLessonIds)
  ) {
    return createDefaultTutorialProgress();
  }

  const normalized = Object.assign(createDefaultTutorialProgress(), clone(progress));
  normalized.completedLessonIds = normalized.completedLessonIds.filter((id) => known.has(id));
  normalized.statsByLesson = Object.fromEntries(
    Object.entries(normalized.statsByLesson || {}).filter(([id]) => known.has(id)),
  );

  if (!known.has(normalized.currentLessonId)) {
    normalized.currentLessonId = null;
  }
  return normalized;
}

function setCurrentLesson(progress, moduleId, lessonId) {
  const next = clone(progress);
  next.currentModuleId = moduleId;
  next.currentLessonId = lessonId;
  return next;
}

function recordLessonAttempt(progress, lessonId, { success, elapsedMs = null, now = null } = {}) {
  const next = clone(progress);
  const stats = next.statsByLesson[lessonId] || {
    attempts: 0,
    successes: 0,
    streak: 0,
    bestMs: null,
    lastCompletedAt: null,
  };

  stats.attempts++;
  if (success) {
    stats.successes++;
    stats.streak++;
    stats.lastCompletedAt = now || new Date().toISOString();
    if (elapsedMs != null) {
      stats.bestMs = stats.bestMs == null ? elapsedMs : Math.min(stats.bestMs, elapsedMs);
    }
    if (!next.completedLessonIds.includes(lessonId)) {
      next.completedLessonIds.push(lessonId);
    }
  } else {
    stats.streak = 0;
  }

  next.statsByLesson[lessonId] = stats;
  return next;
}

async function loadTutorialProgress(knownLessonIds = []) {
  const items = await chrome.storage.local.get(tutorialProgressKey);
  return normalizeTutorialProgress(items[tutorialProgressKey], knownLessonIds);
}

async function saveTutorialProgress(progress) {
  await chrome.storage.local.set({ [tutorialProgressKey]: progress });
}

async function resetTutorialProgress() {
  const progress = createDefaultTutorialProgress();
  await saveTutorialProgress(progress);
  return progress;
}

export {
  createDefaultTutorialProgress,
  loadTutorialProgress,
  normalizeTutorialProgress,
  recordLessonAttempt,
  resetTutorialProgress,
  saveTutorialProgress,
  setCurrentLesson,
  tutorialProgressKey,
};
