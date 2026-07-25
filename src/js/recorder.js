function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
}

export function createRecorder(onUpdate) {
  const rec = {
    mediaRecorder: null,
    stream: null,
    chunks: [],
    audioUrl: "",
    recording: false,
    startedAt: 0,
    durationSec: 0,
    timer: null,
    note: "",
    scores: null
  };

  function emit() {
    onUpdate && onUpdate(rec);
  }

  function stopStream() {
    if (rec.stream) {
      rec.stream.getTracks().forEach((t) => t.stop());
      rec.stream = null;
    }
  }

  async function start() {
    if (rec.recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      rec.note = "Microphone access is not supported on this device/browser.";
      emit();
      return;
    }
    rec.note = "";
    rec.scores = null;
    if (rec.audioUrl) {
      URL.revokeObjectURL(rec.audioUrl);
      rec.audioUrl = "";
    }
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      rec.mediaRecorder = mimeType ? new MediaRecorder(rec.stream, { mimeType }) : new MediaRecorder(rec.stream);
      rec.chunks = [];
      rec.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) rec.chunks.push(e.data);
      };
      rec.mediaRecorder.onstop = () => {
        const blob = new Blob(rec.chunks, { type: rec.mediaRecorder?.mimeType || "audio/webm" });
        if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
        rec.audioUrl = URL.createObjectURL(blob);
        stopStream();
        emit();
      };
      rec.mediaRecorder.onerror = () => {
        rec.note = "Recording failed unexpectedly.";
        stop();
      };
      rec.startedAt = Date.now();
      rec.durationSec = 0;
      rec.mediaRecorder.start();
      rec.recording = true;
      rec.timer = setInterval(() => {
        rec.durationSec = (Date.now() - rec.startedAt) / 1000;
        onUpdate && onUpdate(rec, "tick");
      }, 250);
      emit();
    } catch (_) {
      rec.note = "Microphone access denied or unavailable.";
      stopStream();
      emit();
    }
  }

  function stop() {
    if (!rec.recording) return;
    rec.recording = false;
    if (rec.timer) {
      clearInterval(rec.timer);
      rec.timer = null;
    }
    rec.durationSec = (Date.now() - rec.startedAt) / 1000;
    try {
      rec.mediaRecorder && rec.mediaRecorder.state !== "inactive" && rec.mediaRecorder.stop();
    } catch (_) { /* recorder already stopped */ }
    emit();
  }

  function reset() {
    stop();
    if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
    rec.audioUrl = "";
    rec.chunks = [];
    rec.durationSec = 0;
    rec.scores = null;
    rec.note = "";
    emit();
  }

  function dispose() {
    if (rec.timer) clearInterval(rec.timer);
    try { rec.mediaRecorder && rec.mediaRecorder.state !== "inactive" && rec.mediaRecorder.stop(); } catch (_) {}
    stopStream();
    if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
  }

  return { state: rec, start, stop, reset, dispose };
}
