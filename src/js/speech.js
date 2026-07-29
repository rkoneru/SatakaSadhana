const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createSpeech(onTranscript, onError) {
  const speechState = { engine: null, transcript: "", supported: !!SpeechRecognitionCtor, active: false };

  function start() {
    speechState.transcript = "";
    if (!speechState.supported) return;
    try {
      speechState.engine = new SpeechRecognitionCtor();
      speechState.engine.lang = "te-IN";
      speechState.engine.interimResults = true;
      speechState.engine.continuous = true;
      speechState.engine.onresult = (event) => {
        let combinedTranscript = "";
        for (let i = 0; i < event.results.length; i++) combinedTranscript += event.results[i][0].transcript + " ";
        speechState.transcript = combinedTranscript.trim();
        onTranscript && onTranscript(speechState.transcript);
      };
      speechState.engine.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          onError && onError("Microphone/speech permission denied for live transcription.");
        }
      };
      speechState.engine.onend = () => {
        speechState.active = false;
      };
      speechState.engine.start();
      speechState.active = true;
    } catch (_) {
      speechState.engine = null;
      speechState.active = false;
    }
  }

  function stop() {
    try {
      speechState.engine && speechState.engine.stop();
    } catch (_) { /* already stopped */ }
    speechState.active = false;
  }

  return { state: speechState, start, stop };
}
