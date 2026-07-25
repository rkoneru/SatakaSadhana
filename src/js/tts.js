// Plays pre-generated Telugu audio files (src/audio/<poemId>/full.mp3,
// lineN.mp3) instead of the browser's SpeechSynthesis API. This avoids any
// dependency on OS/browser-installed voices — Telugu voice packs are rarely
// present on Windows and inconsistent across mobile platforms, so relying on
// them made "Listen" unreliable or unintelligible for most users.
let currentAudio = null;

export function ttsSupported() {
  return true;
}

function audioUrlFor(poemId, part) {
  return `./audio/${poemId}/${part}.mp3`;
}

export function speakAudio(poemId, part, { onError, onEnd } = {}) {
  stopSpeaking();
  const audio = new Audio(audioUrlFor(poemId, part));
  currentAudio = audio;
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    onEnd && onEnd();
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    onError && onError("audio-not-found");
  };
  audio.play().catch(() => {
    onError && onError("audio-play-blocked");
  });
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}
