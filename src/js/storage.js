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
    c: Number.isFinite(saved.c) ? saved.c : 0,
    d: Number.isFinite(saved.d) ? saved.d : 0,
    s: Number.isFinite(saved.s) ? saved.s : 0,
    learned: Array.isArray(saved.learned) ? saved.learned : [],
    lastPracticeDate: saved.lastPracticeDate || null,
    kidMode: typeof saved.kidMode === "boolean" ? saved.kidMode : true
  };
}

export function saveState(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      c: st.c, d: st.d, s: st.s, learned: st.learned, lastPracticeDate: st.lastPracticeDate,
      kidMode: st.kidMode
    }));
  } catch (_) {
    // storage unavailable (private mode / quota) — silently ignore
  }
}
