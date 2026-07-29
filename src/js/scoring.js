export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTeluguText(text) {
  return (text || "")
    .replace(/[‌‍]/g, "")
    .replace(/[\n\r\t\s.,;:!?"'()\[\]{}<>\-]/g, "")
    .toLowerCase();
}

export function levenshtein(strA, strB) {
  const lenA = strA.length, lenB = strB.length;
  if (!lenA) return lenB;
  if (!lenB) return lenA;
  const dp = Array.from({ length: lenA + 1 }, () => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[lenA][lenB];
}

export function scorePronunciation(transcript, targetText) {
  const normalizedTranscript = normalizeTeluguText(transcript);
  const normalizedTarget = normalizeTeluguText(targetText);
  if (!normalizedTranscript || !normalizedTarget) return 0;
  const distance = levenshtein(normalizedTranscript, normalizedTarget);
  const similarity = 1 - distance / Math.max(normalizedTranscript.length, normalizedTarget.length);
  return Math.round(clamp(similarity, 0, 1) * 100);
}

const SPEED_IDEAL = { easy: 5.0, medium: 5.8, hard: 6.5 };
const SPEED_K = { easy: 14, medium: 18, hard: 24 };

export function idealSpeedFor(level) {
  return SPEED_IDEAL[(level || "medium").toLowerCase()] || 5.8;
}

export function scoreSpeed(durationSec, targetText, level) {
  const charCount = normalizeTeluguText(targetText).length || 1;
  const charsPerSec = charCount / Math.max(durationSec, 0.5);
  const levelKey = (level || "medium").toLowerCase();
  const ideal = SPEED_IDEAL[levelKey] || 5.8;
  const penaltyFactor = SPEED_K[levelKey] || 18;
  const diff = Math.abs(charsPerSec - ideal);
  const rawScore = 100 - diff * penaltyFactor;
  return { score: Math.round(clamp(rawScore, 0, 100)), cps: +charsPerSec.toFixed(2) };
}

export async function decodeAudio(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("Web Audio API not supported");
  const audioCtx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    return { samples, sampleRate };
  } finally {
    await audioCtx.close();
  }
}

export function scoreSound(samples) {
  let sumSquares = 0, clippedCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    sumSquares += sample * sample;
    if (Math.abs(sample) > 0.98) clippedCount++;
  }
  const rms = Math.sqrt(sumSquares / Math.max(samples.length, 1));
  const clipRatio = clippedCount / Math.max(samples.length, 1);
  const volumePart = clamp((rms - 0.02) / 0.12, 0, 1) * 80;
  const clipPenalty = clamp(clipRatio * 1800, 0, 40);
  return Math.round(clamp(volumePart + 20 - clipPenalty, 0, 100));
}

export function scoreTone(samples, sampleRate) {
  const windowSize = Math.floor(sampleRate * 0.08);
  if (windowSize < 16) return 0;
  const energies = [];
  for (let i = 0; i + windowSize < samples.length; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) energy += samples[i + j] * samples[i + j];
    energy = Math.sqrt(energy / windowSize);
    if (energy > 0.015) energies.push(energy);
  }
  if (energies.length < 4) return 40;
  const mean = energies.reduce((sum, val) => sum + val, 0) / energies.length;
  const variance = energies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energies.length;
  const stdev = Math.sqrt(variance);
  const coeffVariation = stdev / Math.max(mean, 0.0001);
  const rawScore = 100 - coeffVariation * 120;
  return Math.round(clamp(rawScore, 0, 100));
}
