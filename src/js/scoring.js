export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function normalizeTeluguText(t) {
  return (t || "")
    .replace(/[‌‍]/g, "")
    .replace(/[\n\r\t\s.,;:!?"'()\[\]{}<>\-]/g, "")
    .toLowerCase();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
    }
  }
  return dp[m][n];
}

export function scorePronunciation(transcript, targetText) {
  const t1 = normalizeTeluguText(transcript);
  const t2 = normalizeTeluguText(targetText);
  if (!t1 || !t2) return 0;
  const dist = levenshtein(t1, t2);
  const similarity = 1 - dist / Math.max(t1.length, t2.length);
  return Math.round(clamp(similarity, 0, 1) * 100);
}

const SPEED_IDEAL = { easy: 5.0, medium: 5.8, hard: 6.5 };
const SPEED_K = { easy: 14, medium: 18, hard: 24 };

export function idealSpeedFor(level) {
  return SPEED_IDEAL[(level || "medium").toLowerCase()] || 5.8;
}

export function scoreSpeed(durationSec, targetText, level) {
  const chars = normalizeTeluguText(targetText).length || 1;
  const cps = chars / Math.max(durationSec, 0.5);
  const lv = (level || "medium").toLowerCase();
  const ideal = SPEED_IDEAL[lv] || 5.8;
  const k = SPEED_K[lv] || 18;
  const diff = Math.abs(cps - ideal);
  const raw = 100 - diff * k;
  return { score: Math.round(clamp(raw, 0, 100)), cps: +cps.toFixed(2) };
}

export async function decodeAudio(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Web Audio API not supported");
  const ac = new AC();
  try {
    const arr = await blob.arrayBuffer();
    const buf = await ac.decodeAudioData(arr.slice(0));
    const samples = buf.getChannelData(0);
    const sampleRate = buf.sampleRate;
    return { samples, sampleRate };
  } finally {
    await ac.close();
  }
}

export function scoreSound(samples) {
  let sum = 0, clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sum += s * s;
    if (Math.abs(s) > 0.98) clipped++;
  }
  const rms = Math.sqrt(sum / Math.max(samples.length, 1));
  const clipRatio = clipped / Math.max(samples.length, 1);
  const volumePart = clamp((rms - 0.02) / 0.12, 0, 1) * 80;
  const clipPenalty = clamp(clipRatio * 1800, 0, 40);
  return Math.round(clamp(volumePart + 20 - clipPenalty, 0, 100));
}

export function scoreTone(samples, sampleRate) {
  const win = Math.floor(sampleRate * 0.08);
  if (win < 16) return 0;
  const energies = [];
  for (let i = 0; i + win < samples.length; i += win) {
    let e = 0;
    for (let j = 0; j < win; j++) e += samples[i + j] * samples[i + j];
    e = Math.sqrt(e / win);
    if (e > 0.015) energies.push(e);
  }
  if (energies.length < 4) return 40;
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const variance = energies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / energies.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / Math.max(mean, 0.0001);
  const raw = 100 - cv * 120;
  return Math.round(clamp(raw, 0, 100));
}
