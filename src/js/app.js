import { poems } from "../data/poems.js";
import { loadState, saveState } from "./storage.js";
import {
  scorePronunciation, scoreSpeed, scoreSound, scoreTone, decodeAudio, idealSpeedFor
} from "./scoring.js";
import { createRecorder } from "./recorder.js";
import { createSpeech } from "./speech.js";
import { ttsSupported, speakAudio, stopSpeaking } from "./tts.js";

// Debug logging panel
window.debugLogs = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
console.log = (...args) => { window.debugLogs.push("LOG: " + args.join(" ")); if (window.debugLogs.length > 50) window.debugLogs.shift(); originalLog(...args); };
console.error = (...args) => { window.debugLogs.push("ERROR: " + args.join(" ")); if (window.debugLogs.length > 50) window.debugLogs.shift(); originalError(...args); };
console.warn = (...args) => { window.debugLogs.push("WARN: " + args.join(" ")); if (window.debugLogs.length > 50) window.debugLogs.shift(); originalWarn(...args); };

window.showLogs = () => {
  alert("Recent logs:\n\n" + window.debugLogs.slice(-20).join("\n"));
};

const nav = [["home", "Home"], ["prac", "Practice"],  ["lib", "Library"], ["set", "Settings"]];
/* ["prog", "Progress"], */
const el = {
  home: document.getElementById("v-home"),
  lib: document.getElementById("v-lib"),
  prac: document.getElementById("v-prac"),
  prog: document.getElementById("v-prog"),
  set: document.getElementById("v-set")
};
const side = document.getElementById("side");
const bottom = document.getElementById("bottom");
const streakEl = document.getElementById("streak");

const saved = loadState();
const st = { v: "home", q: "", f: "all", i: 0, r: false, loopCount: 1, theme: "calm", ...saved };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function persist() {
  saveState(st);
}

function fdata() {
  return poems.filter(
    (p) =>
      (st.f === "all" || p.l.toLowerCase() === st.f) &&
      (p.t + p.s + p.x + p.m).toLowerCase().includes(st.q.toLowerCase())
  );
}

function fixAudioDuration(audioEl) {
  // Chrome's MediaRecorder-produced webm blobs often report duration as
  // Infinity/NaN until played through once; seeking past the end forces
  // the browser to recompute and cache the real duration.
  const onLoaded = () => {
    if (audioEl.duration === Infinity || Number.isNaN(audioEl.duration)) {
      audioEl.currentTime = 1e9;
      audioEl.ontimeupdate = () => {
        audioEl.ontimeupdate = null;
        audioEl.currentTime = 0;
      };
    }
  };
  audioEl.addEventListener("loadedmetadata", onLoaded, { once: true });
}

function gauge(label, value) {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return `<div class="g"><div class="hd"><span>${label}</span><b>${safe}%</b></div><div class="bar"><div class="fill" style="width:${safe}%"></div></div></div>`;
}

function applyKidMode() {
  document.body.classList.toggle("kid-mode", st.kidMode);
}

function applyTheme() {
  const themes = ["calm", "bold", "minimal"];
  const selected = themes.includes(st.theme) ? st.theme : "calm";
  document.documentElement.setAttribute("data-ui-theme", selected);
}

function setView(v) {
  st.v = v;
  for (const k in el) el[k].classList.toggle("hide", k !== v);
  renderNav();
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

function renderNav() {
  const mk = (mobile) =>
    nav
      .map(
        ([k, l]) =>
          `<button data-v="${k}" class="${st.v === k ? (mobile ? "on" : "nav-button active") : ""} ${mobile ? "" : "nav-button"}">${l}</button>`
      )
      .join("");
  side.innerHTML = `<div class="side-nav">${mk(false)}</div>`;
  bottom.style.setProperty("--nav-count", nav.length);
  bottom.innerHTML = mk(true);
  document.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
}

function viewHome() {
  const n = poems[st.i % poems.length];
  const pct = Math.min(100, Math.round((st.learned.length / poems.length) * 100));
  streakEl.textContent = `Daily streak: ${st.d} days`;
  el.home.innerHTML = `<h3>Learning Dashboard</h3><div class="row"><div class="kpi"><div class="small">Completion</div><b>${pct}%</b></div><div class="kpi"><div class="small">Sessions</div><b>${st.s}</b></div><div class="kpi"><div class="small">Next Verse</div><b style="font-size:1rem">${n.t}</b></div></div><div class="controls"><button id="go" class="btn">Start Practice</button><button id="openLib" class="btn2">Open Library</button></div><p class="small">Practice daily to improve memory, pronunciation, and rhythm.</p>`;
  document.getElementById("go").onclick = () => setView("prac");
  document.getElementById("openLib").onclick = () => setView("lib");
}

function viewLibrary() {
  el.lib.innerHTML = `<h3>Poem Library</h3><div class="controls"><input id="q" placeholder="Search by title or meaning" value="${st.q}"><select id="f"><option value="all" ${st.f === "all" ? "selected" : ""}>All Levels</option><option value="easy" ${st.f === "easy" ? "selected" : ""}>Easy</option><option value="medium" ${st.f === "medium" ? "selected" : ""}>Medium</option><option value="hard" ${st.f === "hard" ? "selected" : ""}>Hard</option></select></div><div id="list" class="list"></div>`;
  const list = document.getElementById("list");
  const results = fdata();
  list.innerHTML =
    results
      .map(
        (p) =>
          `<article class="it"><span class="ch">${p.s} • ${p.l}</span><h4>${p.t}</h4><p>${p.x.replace(/\n/g, "<br>")}</p><div class="small" style="margin-top:6px">${p.m}</div>${ttsSupported() ? `<div class="controls" style="margin-top:6px"><button class="btn2 lib-listen" data-id="${p.id}">🔊 Listen</button></div>` : ""}</article>`
      )
      .join("") || "<div class='small'>No results found.</div>";
  document.getElementById("q").oninput = (e) => {
    st.q = e.target.value;
    viewLibrary();
  };
  document.getElementById("f").onchange = (e) => {
    st.f = e.target.value;
    viewLibrary();
  };
  document.querySelectorAll(".lib-listen").forEach((btn) => {
    const tile = btn.closest(".it");
    btn.onclick = () => {
      if (btn.dataset.playing === "1") {
        stopSpeaking();
        btn.dataset.playing = "";
        btn.textContent = "🔊 Listen";
        tile.classList.remove("playing");
        return;
      }
      document.querySelectorAll(".it.playing").forEach((t) => t.classList.remove("playing"));
      document.querySelectorAll('.lib-listen[data-playing="1"]').forEach((b) => {
        b.dataset.playing = "";
        b.textContent = "🔊 Listen";
      });
      btn.dataset.playing = "1";
      btn.textContent = "⏹ Stop";
      tile.classList.add("playing");
      speakAudio(btn.dataset.id, "full", {
        loopCount: st.loopCount,
        onEnd: () => { btn.dataset.playing = ""; btn.textContent = "🔊 Listen"; tile.classList.remove("playing"); },
        onError: () => { btn.dataset.playing = ""; btn.textContent = "⚠ Audio not available"; tile.classList.remove("playing"); }
      });
    };
  });
}

let recorder;
let speech;

function viewPractice() {
  const p = poems[st.i % poems.length];
  const r = recorder.state;
  const scores = r.scores || { tone: 0, sound: 0, speed: 0, pronunciation: 0, cps: 0 };
  const diffBadge = { easy: "🟢 Easy", medium: "🟡 Medium", hard: "🔴 Hard" }[p.l.toLowerCase()] || p.l;
  const alreadyLearned = st.learned.includes(p.id);
  const lines = p.x.split("\n");
  const lineMeanings = p.lm || [];

  const linesHtml = lines
    .map((line, idx) => `
      <div class="line-row">
        <p class="line-text">${line}</p>
        ${
          st.r && lineMeanings[idx]
            ? `<div class="small line-meaning">${lineMeanings[idx]}</div>`
            : ""
        }
        ${ttsSupported() ? `<button class="line-listen" data-line="${idx}" title="Listen to this line">🔊</button>` : ""}
      </div>`)
    .join("");

  el.prac.innerHTML = `
    <h3>Practice Mode</h3>
    <div class="it">
      <span class="ch">${p.s}</span>
      <span class="ch" style="margin-left:4px">${diffBadge}</span>
      <div class="controls" style="margin:8px 0 4px">
        ${ttsSupported() ? `<button id="listenAll" class="btn2">🔊 Listen to full verse</button>` : ""}
        <button id="tog" class="btn2">${st.r ? "Hide" : "Show"} Meaning</button>
      </div>
      <div class="verse-lines">${linesHtml}</div>
    </div>
    <div class="it kid-hide" style="margin-top:10px">
      <h4 style="margin:0 0 4px">🎙 Record &amp; Playback</h4>
      <div class="small" style="margin-bottom:8px">Record your recital, play it back, then tap Gauge Accuracy.</div>
      <div class="controls">
        <button id="recStart" class="btn"  ${r.recording ? "disabled" : ""}>▶ Start</button>
        <button id="recStop"  class="btnw" ${r.recording ? "" : "disabled"}>■ Stop</button>
        <button id="analyze"  class="btn2" ${r.audioUrl && !r.recording ? "" : "disabled"}>📊 Gauge Accuracy</button>
      </div>
      <div class="small" style="margin:6px 0">
        Duration: <span id="rec-dur" class="mono">${r.durationSec.toFixed(1)}s</span>
        ${r.recording ? "<span style='color:#c2410c;margin-left:6px'>● Recording…</span>" : ""}
      </div>
      ${r.audioUrl ? `<audio id="rec-audio" controls style="width:100%;margin-top:6px" src="${r.audioUrl}"></audio>` : ""}
      ${r.note ? `<div class="small" style="margin-top:8px;color:var(--muted)">${r.note}</div>` : ""}
      ${
        speech.state.transcript
          ? `<div class="small" style="margin-top:6px"><b>🗣 Detected:</b> <span id="rec-trans">${speech.state.transcript}</span></div>`
          : `<span id="rec-trans" style="display:none"></span>`
      }
      <div class="g-grid" style="margin-top:10px">
        ${gauge("🎵 Tone", scores.tone)}
        ${gauge("🔊 Sound", scores.sound)}
        ${gauge("⏱ Speed", scores.speed)}
        ${gauge("🗣 Pronunciation", scores.pronunciation)}
      </div>
      ${
        r.scores
          ? `<div class="small" style="margin-top:6px">
            Speed: ${scores.cps} chars/sec &nbsp;|&nbsp;
            Target for <em>${p.l}</em>: ${idealSpeedFor(p.l).toFixed(1)} chars/sec
          </div>`
          : ""
      }
    </div>
    <div class="it kid-only" style="margin-top:10px">
      <h4 style="margin:0 0 4px">🎙 Practice Out Loud</h4>
      <div class="small" style="margin-bottom:8px">Tap Start, say the verse, then tap Stop to hear yourself!</div>
      <div class="controls">
        <button id="recStartKid" class="btn"  ${r.recording ? "disabled" : ""}>▶ Start</button>
        <button id="recStopKid"  class="btnw" ${r.recording ? "" : "disabled"}>■ Stop</button>
      </div>
      <div class="small" style="margin:6px 0">
        Duration: <span id="rec-dur-kid" class="mono">${r.durationSec.toFixed(1)}s</span>
        ${r.recording ? "<span style='color:#c2410c;margin-left:6px'>● Recording…</span>" : ""}
      </div>
      ${r.audioUrl ? `<audio controls style="width:100%;margin-top:6px" src="${r.audioUrl}"></audio>` : ""}
    </div>
    <div class="controls" style="margin-top:10px">
      <button id="done" class="btn" ${alreadyLearned ? "disabled" : ""}>${alreadyLearned ? "✓ Learned" : "✓ Mark Learned"}</button>
      <button id="prev" class="btn3">← Previous</button>
      <button id="next" class="btn3">Next →</button>
    </div>`;
  const audioEl = document.getElementById("rec-audio");
  if (audioEl) fixAudioDuration(audioEl);
  const bindRec = (startId, stopId) => {
    const startBtn = document.getElementById(startId);
    const stopBtn = document.getElementById(stopId);
    if (startBtn) startBtn.onclick = () => {
      recorder.start();
      speech.start();
    };
    if (stopBtn) stopBtn.onclick = () => {
      recorder.stop();
      speech.stop();
    };
  };
  bindRec("recStart", "recStop");
  bindRec("recStartKid", "recStopKid");
  const analyzeBtn = document.getElementById("analyze");
  if (analyzeBtn) analyzeBtn.onclick = () => analyzeRecording(p.x, p.l);
  document.getElementById("tog").onclick = () => {
    st.r = !st.r;
    viewPractice();
  };
  const ttsOpts = {
    onError: () => {
      recorder.state.note = "Audio not available for this verse yet.";
      viewPractice();
    }
  };
  const listenAllBtn = document.getElementById("listenAll");
  if (listenAllBtn) {
    listenAllBtn.onclick = () => speakAudio(p.id, "full", ttsOpts);
  }
  document.querySelectorAll(".line-listen").forEach((btn) => {
    btn.onclick = () => speakAudio(p.id, `line${+btn.dataset.line}`, ttsOpts);
  });
  document.getElementById("done").onclick = () => {
    if (!st.learned.includes(p.id)) {
      st.learned.push(p.id);
      st.c = st.learned.length;
      const today = todayKey();
      if (st.lastPracticeDate !== today) {
        st.d++;
        st.lastPracticeDate = today;
      }
      st.s++;
      persist();
      render();
    }
  };
  document.getElementById("prev").onclick = () => {
    st.i = (st.i - 1 + poems.length) % poems.length;
    st.r = false;
    recorder.reset();
    speech.state.transcript = "";
    stopSpeaking();
    viewPractice();
  };
  document.getElementById("next").onclick = () => {
    st.i = (st.i + 1) % poems.length;
    st.r = false;
    recorder.reset();
    speech.state.transcript = "";
    stopSpeaking();
    viewPractice();
  };
}

async function analyzeRecording(targetText, level) {
  const r = recorder.state;
  if (!r.audioUrl || !r.chunks.length) {
    r.note = "Record audio first to gauge accuracy.";
    viewPractice();
    return;
  }
  try {
    r.note = "Analyzing…";
    viewPractice();
    const blob = new Blob(r.chunks, { type: r.mediaRecorder?.mimeType || "audio/webm" });
    const { samples, sampleRate } = await decodeAudio(blob);
    const tone = scoreTone(samples, sampleRate);
    const sound = scoreSound(samples);
    const speedInfo = scoreSpeed(r.durationSec, targetText, level);
    const pronunciation = scorePronunciation(speech.state.transcript, targetText);
    r.scores = { tone, sound, speed: speedInfo.score, pronunciation, cps: speedInfo.cps };
    r.note = "Analysis complete.";
  } catch (_) {
    r.note = "Could not analyze audio on this browser/device.";
  }
  viewPractice();
}

function viewProgress() {
  const pct = Math.round((st.learned.length / poems.length) * 100);
  el.prog.innerHTML = `<h3>Progress Insights</h3><div class="it"><h4>Learning Completion</h4><div class="small">${st.learned.length} of ${poems.length} verses learned (${pct}%).</div><div style="height:10px;background:#ecf2f2;border-radius:999px;margin-top:10px"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#0f766e,#164e63)"></div></div></div><div class="it" style="margin-top:10px"><h4>Streak &amp; Sessions</h4><div class="small">${st.d} day streak &middot; ${st.s} practice sessions logged</div></div>`;
}

function viewSettings() {
  el.set.innerHTML = `<h3>Settings</h3>
    <div class="it">
      <h4 style="margin:0 0 4px">Learning Mode</h4>
      <div class="small" style="margin-bottom:8px">Kid Mode shows bigger text, line-by-line meanings, and hides scoring details. Adult Mode shows full pronunciation analytics.</div>
      <div class="controls">
        <button id="modeKid"   class="${st.kidMode ? "btn" : "btn2"}">🧒 Kid Mode</button>
        <button id="modeAdult" class="${st.kidMode ? "btn2" : "btn"}">🎓 Adult Mode</button>
      </div>
    </div>
    <div class="it" style="margin-top:10px">
      <h4 style="margin:0 0 4px">App Theme</h4>
      <div class="small" style="margin-bottom:8px">Pick a visual style for your learning experience.</div>
      <div class="controls">
        <button id="themeCalm" class="theme-choice ${st.theme === "calm" ? "btn" : "btn2"}"><span class="theme-swatch swatch-calm" aria-hidden="true"></span>Calm Classroom</button>
        <button id="themeBold" class="theme-choice ${st.theme === "bold" ? "btn" : "btn2"}"><span class="theme-swatch swatch-bold" aria-hidden="true"></span>Bold Gamified</button>
        <button id="themeMinimal" class="theme-choice ${st.theme === "minimal" ? "btn" : "btn2"}"><span class="theme-swatch swatch-minimal" aria-hidden="true"></span>Minimal Premium</button>
      </div>
    </div>
    <div class="it" style="margin-top:10px">
      <h4 style="margin:0 0 4px">Listen Loop Count</h4>
      <div class="small" style="margin-bottom:8px">How many times the full verse audio repeats when you tap Listen in the Library.</div>
      <select id="loopCount">
        ${[1, 2, 3, 5].map((n) => `<option value="${n}" ${st.loopCount === n ? "selected" : ""}>${n}x</option>`).join("")}
        <option value="0" ${st.loopCount === Infinity ? "selected" : ""}>Repeat until stopped</option>
      </select>
    </div>
    <div class="it" style="margin-top:10px"><div class="small">Progress is saved in browser localStorage.</div></div>
    <div class="controls"><button id="reset" class="btnw">Reset Progress</button></div>
    <div class="small">Tip: add this page to your home screen for an app-like launch.</div>`;
  document.getElementById("loopCount").onchange = (e) => {
    const v = Number(e.target.value);
    st.loopCount = v === 0 ? Infinity : v;
    persist();
  };
  const setTheme = (theme) => {
    st.theme = theme;
    persist();
    applyTheme();
    viewSettings();
  };
  document.getElementById("themeCalm").onclick = () => setTheme("calm");
  document.getElementById("themeBold").onclick = () => setTheme("bold");
  document.getElementById("themeMinimal").onclick = () => setTheme("minimal");
  document.getElementById("modeKid").onclick = () => {
    st.kidMode = true;
    persist();
    applyKidMode();
    render();
  };
  document.getElementById("modeAdult").onclick = () => {
    st.kidMode = false;
    persist();
    applyKidMode();
    render();
  };
  document.getElementById("reset").onclick = () => {
    st.c = 0;
    st.d = 0;
    st.s = 0;
    st.i = 0;
    st.r = false;
    st.learned = [];
    st.lastPracticeDate = null;
    persist();
    render();
  };
}

function render() {
  if (st.v === "home") viewHome();
  if (st.v === "lib") viewLibrary();
  if (st.v === "prac") viewPractice();
  if (st.v === "prog") viewProgress();
  if (st.v === "set") viewSettings();
}

function init() {
  recorder = createRecorder((_r, mode) => {
    if (mode === "tick") {
      const durText = recorder.state.durationSec.toFixed(1) + "s";
      const dur = document.getElementById("rec-dur");
      const durKid = document.getElementById("rec-dur-kid");
      if (dur) dur.textContent = durText;
      if (durKid) durKid.textContent = durText;
      return;
    }
    if (st.v === "prac") viewPractice();
  });
  speech = createSpeech(
    (transcript) => {
      const t = document.getElementById("rec-trans");
      if (t) t.textContent = transcript;
    },
    (msg) => {
      recorder.state.note = msg;
      if (st.v === "prac") viewPractice();
    }
  );
  window.addEventListener("beforeunload", () => recorder.dispose());
  applyKidMode();
  applyTheme();
  renderNav();
  setView("home");
}

init();
