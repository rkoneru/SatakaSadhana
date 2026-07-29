// Plays pre-generated Telugu audio files (audio/<poemId>/full.mp3,
// lineN.mp3) instead of the browser's SpeechSynthesis API. This avoids any
// dependency on OS/browser-installed voices — Telugu voice packs are rarely
// present on Windows and inconsistent across mobile platforms, so relying on
// them made "Listen" unreliable or unintelligible for most users.
let currentAudio = null;

export function ttsSupported() {
  return true;
}

function audioUrlFor(poemId, part) {
  return `../audio/${poemId}/${part}.mp3`;
}

export function speakAudio(poemId, part, { onError, onEnd, onProgress, loopCount = 1, playbackRate = 1 } = {}) {
  return speakUrl(audioUrlFor(poemId, part), { onError, onEnd, onProgress, loopCount, playbackRate });
}

export function speakUrl(url, { onError, onEnd, onProgress, loopCount = 1, playbackRate = 1 } = {}) {
  stopSpeaking();
  const audio = new Audio(url);
  audio.playbackRate = playbackRate;
  currentAudio = audio;
  let playsLeft = loopCount === Infinity ? Infinity : Math.max(1, loopCount);
  audio.onended = () => {
    if (currentAudio !== audio) return;
    playsLeft -= 1;
    if (playsLeft > 0) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        currentAudio = null;
        onError && onError("audio-play-blocked");
      });
      return;
    }
    currentAudio = null;
    onEnd && onEnd();
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    onError && onError("audio-not-found");
  };
  if (onProgress) {
    audio.ontimeupdate = () => onProgress(audio.currentTime, audio.duration || 0);
    audio.onloadedmetadata = () => onProgress(audio.currentTime, audio.duration || 0);
  }
  audio.play().catch(() => {
    onError && onError("audio-play-blocked");
  });
  return {
    setRate: (rate) => {
      if (currentAudio === audio) audio.playbackRate = rate;
    },
    seek: (time) => {
      if (currentAudio === audio) audio.currentTime = time;
    },
    restart: () => {
      if (currentAudio !== audio) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  };
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.ontimeupdate = null;
    currentAudio.onloadedmetadata = null;
    currentAudio = null;
  }
}
