const KEY = "sataka_state_v1";

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function loadState() {
  const saved = readRaw() || {};
  return {
    completedCount: Number.isFinite(saved.c) ? saved.c : 0,
    streakDays: Number.isFinite(saved.d) ? saved.d : 0,
    sessionCount: Number.isFinite(saved.s) ? saved.s : 0,
    learned: Array.isArray(saved.learned) ? saved.learned : [],
    lastPracticeDate: saved.lastPracticeDate || null,
    kidMode: typeof saved.kidMode === "boolean" ? saved.kidMode : true,
    loopCount: saved.loopCount === 0 ? Infinity : (Number.isFinite(saved.loopCount) && saved.loopCount > 0 ? saved.loopCount : 1),
    theme: ["calm", "bold", "minimal"].includes(saved.theme) ? saved.theme : "calm",
    filtersOpen: typeof saved.filtersOpen === "boolean" ? saved.filtersOpen : false,
    bestScores: (saved.bestScores && typeof saved.bestScores === "object") ? saved.bestScores : {}
  };
}

export function saveState(appState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      c: appState.completedCount, d: appState.streakDays, s: appState.sessionCount,
      learned: appState.learned, lastPracticeDate: appState.lastPracticeDate,
      kidMode: appState.kidMode,
      loopCount: appState.loopCount === Infinity ? 0 : appState.loopCount,
      theme: appState.theme,
      filtersOpen: appState.filtersOpen,
      bestScores: appState.bestScores
    }));
  } catch (_) {
    // storage unavailable (private mode / quota) — silently ignore
  }
}
