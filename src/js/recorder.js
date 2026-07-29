function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

const WAVE_BARS = 28;

export function createRecorder(onUpdate) {
  const recorderState = {
    mediaRecorder: null,
    stream: null,
    chunks: [],
    audioUrl: "",
    recording: false,
    startedAt: 0,
    durationSec: 0,
    timer: null,
    note: "",
    scores: null,
    wave: new Array(WAVE_BARS).fill(0)
  };

  let audioCtx = null;
  let analyser = null;
  let freqData = null;

  function emit() {
    onUpdate && onUpdate(recorderState);
  }

  function stopStream() {
    if (recorderState.stream) {
      recorderState.stream.getTracks().forEach((track) => track.stop());
      recorderState.stream = null;
    }
  }

  function teardownAnalyser() {
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
    freqData = null;
  }

  function sampleLevel() {
    if (!analyser || !freqData) return 0;
    analyser.getByteTimeDomainData(freqData);
    let sumSquares = 0;
    for (let i = 0; i < freqData.length; i++) {
      const normalized = (freqData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / freqData.length);
    return Math.min(1, rms * 4);
  }

  async function start() {
    if (recorderState.recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      recorderState.note = "Microphone access is not supported on this device/browser.";
      emit();
      return;
    }
    recorderState.note = "";
    recorderState.scores = null;
    recorderState.wave = new Array(WAVE_BARS).fill(0);
    if (recorderState.audioUrl) {
      URL.revokeObjectURL(recorderState.audioUrl);
      recorderState.audioUrl = "";
    }
    try {
      recorderState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      recorderState.mediaRecorder = mimeType ? new MediaRecorder(recorderState.stream, { mimeType }) : new MediaRecorder(recorderState.stream);
      recorderState.chunks = [];
      recorderState.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recorderState.chunks.push(event.data);
      };
      recorderState.mediaRecorder.onstop = () => {
        const blob = new Blob(recorderState.chunks, { type: recorderState.mediaRecorder?.mimeType || "audio/webm" });
        if (recorderState.audioUrl) URL.revokeObjectURL(recorderState.audioUrl);
        recorderState.audioUrl = URL.createObjectURL(blob);
        stopStream();
        teardownAnalyser();
        emit();
      };
      recorderState.mediaRecorder.onerror = () => {
        recorderState.note = "Recording failed unexpectedly.";
        stop();
      };
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          const source = audioCtx.createMediaStreamSource(recorderState.stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          freqData = new Uint8Array(analyser.fftSize);
          source.connect(analyser);
        }
      } catch (_) {
        analyser = null;
      }
      recorderState.startedAt = Date.now();
      recorderState.durationSec = 0;
      recorderState.mediaRecorder.start();
      recorderState.recording = true;
      recorderState.timer = setInterval(() => {
        recorderState.durationSec = (Date.now() - recorderState.startedAt) / 1000;
        recorderState.wave = [...recorderState.wave.slice(1), sampleLevel()];
        onUpdate && onUpdate(recorderState, "tick");
      }, 120);
      emit();
    } catch (_) {
      recorderState.note = "Microphone access denied or unavailable.";
      stopStream();
      emit();
    }
  }

  function stop() {
    if (!recorderState.recording) return;
    recorderState.recording = false;
    if (recorderState.timer) {
      clearInterval(recorderState.timer);
      recorderState.timer = null;
    }
    recorderState.durationSec = (Date.now() - recorderState.startedAt) / 1000;
    try {
      recorderState.mediaRecorder && recorderState.mediaRecorder.state !== "inactive" && recorderState.mediaRecorder.stop();
    } catch (_) { /* recorder already stopped */ }
    emit();
  }

  function reset() {
    stop();
    if (recorderState.audioUrl) URL.revokeObjectURL(recorderState.audioUrl);
    recorderState.audioUrl = "";
    recorderState.chunks = [];
    recorderState.durationSec = 0;
    recorderState.scores = null;
    recorderState.note = "";
    recorderState.wave = new Array(WAVE_BARS).fill(0);
    emit();
  }

  function dispose() {
    if (recorderState.timer) clearInterval(recorderState.timer);
    try { recorderState.mediaRecorder && recorderState.mediaRecorder.state !== "inactive" && recorderState.mediaRecorder.stop(); } catch (_) {}
    stopStream();
    teardownAnalyser();
    if (recorderState.audioUrl) URL.revokeObjectURL(recorderState.audioUrl);
  }

  return { state: recorderState, start, stop, reset, dispose };
}
