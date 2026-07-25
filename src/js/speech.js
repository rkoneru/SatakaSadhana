const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createSpeech(onTranscript, onError) {
  const s = { engine: null, transcript: "", supported: !!SR, active: false };

  function start() {
    s.transcript = "";
    if (!s.supported) return;
    try {
      s.engine = new SR();
      s.engine.lang = "te-IN";
      s.engine.interimResults = true;
      s.engine.continuous = true;
      s.engine.onresult = (e) => {
        let out = "";
        for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript + " ";
        s.transcript = out.trim();
        onTranscript && onTranscript(s.transcript);
      };
      s.engine.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          onError && onError("Microphone/speech permission denied for live transcription.");
        }
      };
      s.engine.onend = () => {
        s.active = false;
      };
      s.engine.start();
      s.active = true;
    } catch (_) {
      s.engine = null;
      s.active = false;
    }
  }

  function stop() {
    try {
      s.engine && s.engine.stop();
    } catch (_) { /* already stopped */ }
    s.active = false;
  }

  return { state: s, start, stop };
}
