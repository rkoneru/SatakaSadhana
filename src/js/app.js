import { poems } from "../data/poems.js";
import { loadState, saveState } from "./storage.js";
import {
  scorePronunciation, scoreSpeed, scoreSound, scoreTone, decodeAudio, idealSpeedFor
} from "./scoring.js";
import { createRecorder } from "./recorder.js";
import { createSpeech } from "./speech.js";
import { ttsSupported, speakAudio, speakUrl, stopSpeaking } from "./tts.js";

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

const navItems = [["home", "Home"],["lib", "Library"],["prac", "Practice"], ["set", "Settings"]];
/* ["prog", "Progress"], */
const viewSections = {
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
const appState = {
  currentView: "home",
  searchQuery: "",
  levelFilter: "all",
  collectionFilter: "all",
  currentIndex: 0,
  showMeaning: false,
  loopCount: 1,
  theme: "calm",
  filtersOpen: false,
  bestScores: {},
  ...saved
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function persist() {
  saveState(appState);
}

function filteredPoems() {
  return poems.filter(
    (poem) =>
      (appState.levelFilter === "all" || poem.level.toLowerCase() === appState.levelFilter) &&
      (appState.collectionFilter === "all" || poem.collection === appState.collectionFilter) &&
      (poem.title + poem.collection + poem.text + poem.meaning).toLowerCase().includes(appState.searchQuery.toLowerCase())
  );
}

const DIFF_META = {
  easy: { label: "Beginner", cls: "diff-easy" },
  medium: { label: "Intermediate", cls: "diff-medium" },
  hard: { label: "Advanced", cls: "diff-hard" }
};

function diffPill(level) {
  const meta = DIFF_META[(level || "").toLowerCase()] || { label: level, cls: "diff-medium" };
  return `<span class="pill diff-pill ${meta.cls}">${meta.label}</span>`;
}

function filterIconSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"></path></svg>`;
}

function boldFirstWord(text) {
  return (text || "").replace(/^([\s\u00A0]*)(\S+)/, '$1<span class="poem-first-word">$2</span>');
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

function waveformHtml(wave, recording) {
  const bars = (wave || [])
    .map((level) => `<span class="wave-bar" style="height:${Math.max(6, Math.round(level * 100))}%"></span>`)
    .join("");
  return `<div class="waveform ${recording ? "waveform-live" : ""}">${bars}</div>`;
}

function applyKidMode() {
  document.body.classList.toggle("kid-mode", appState.kidMode);
}

function applyTheme() {
  const themes = ["calm", "bold", "minimal"];
  const selected = themes.includes(appState.theme) ? appState.theme : "calm";
  document.documentElement.setAttribute("data-ui-theme", selected);
}

function setView(viewId) {
  if (appState.currentView === "lib" && viewId !== "lib") stopPlayAll18();
  appState.currentView = viewId;
  for (const key in viewSections) viewSections[key].classList.toggle("hide", key !== viewId);
  renderNav();
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

function renderNav() {
  const buildNavHtml = (mobile) =>
    navItems
      .map(
        ([navId, navLabel]) =>
          `<button data-v="${navId}" class="${appState.currentView === navId ? (mobile ? "on" : "nav-button active") : ""} ${mobile ? "" : "nav-button"}">${navLabel}</button>`
      )
      .join("");
  side.innerHTML = `<div class="side-nav">${buildNavHtml(false)}</div>`;
  bottom.style.setProperty("--nav-count", navItems.length);
  bottom.innerHTML = buildNavHtml(true);
  document.querySelectorAll("[data-v]").forEach((navBtn) => (navBtn.onclick = () => setView(navBtn.dataset.v)));
}

function viewHome() {
  const nextPoem = poems[appState.currentIndex % poems.length];
  const completionPct = Math.min(100, Math.round((appState.learned.length / poems.length) * 100));
  streakEl.textContent = `Daily streak: ${appState.streakDays} days`;
  viewSections.home.innerHTML = `<h3>Learning Dashboard</h3><div class="row"><div class="kpi"><div class="small">Completion</div><b>${completionPct}%</b></div><div class="kpi"><div class="small">Sessions</div><b>${appState.sessionCount}</b></div><div class="kpi"><div class="small">Next Verse</div><b style="font-size:1rem">${nextPoem.title}</b></div></div><div class="controls"><button id="go" class="btn">Start Practice</button><button id="openLib" class="btn2">Open Library</button></div><p class="small">Practice daily to improve memory, pronunciation, and rhythm.</p>`;
  document.getElementById("go").onclick = () => setView("prac");
  document.getElementById("openLib").onclick = () => setView("lib");
}

  /*  <div class="it-tags">
             <h4>${poem.title}</h4>
            <span class="ch">${poem.collection}</span>
            ${diffPill(poem.level)}
            ${Number.isFinite(best) ? `<span class="pill best-pill">Best: ${Math.round(best)}%</span>` : ""}
            ${done ? `<span class="pill done-pill">✓ Done</span>` : ""}
            <div class="small it-meta">📄 ${lineCount} lines</div>
          </div> 
         <div class="it-tags">  </div> */

const FULL18_URL = "../audio/All18/Full18.mp4";
let playAll18State = { playing: false, index: 0 };

function stopPlayAll18() {
  playAll18State.playing = false;
  stopSpeaking();
}

function startPlayAll18() {
  stopSpeaking();
  playAll18State = { playing: true, index: 0 };
  viewLibrary();
  speakUrl(FULL18_URL, {
    loopCount: 1,
    onEnd: () => {
      playAll18State.playing = false;
      viewLibrary();
    },
    onError: () => {
      // Full18.mp4 unavailable — fall back to chaining each poem's own audio.
      playAll18Next();
    }
  });
}

function playAll18Next() {
  if (!playAll18State.playing || playAll18State.index >= poems.length) {
    playAll18State.playing = false;
    viewLibrary();
    return;
  }
  const poem = poems[playAll18State.index];
  viewLibrary();
  speakAudio(poem.id, "full", {
    loopCount: 1,
    onEnd: () => {
      if (!playAll18State.playing) return;
      playAll18State.index += 1;
      playAll18Next();
    },
    onError: () => {
      if (!playAll18State.playing) return;
      playAll18State.index += 1;
      playAll18Next();
    }
  });
}

function viewLibrary() {
  const groups = [...new Set(poems.map((poem) => poem.collection))];
  const groupChips = [["all", "All Padyalu"], ...groups.map((group) => [group, group])]
    .map(
      ([groupValue, groupLabel]) =>
        `<button data-g="${groupValue}" class="chip ${appState.collectionFilter === groupValue ? "chip-on" : ""}">${groupLabel}</button>`
    )
    .join("");

  const playAll18Label = playAll18State.playing ? "⏹ Stop" : "▶ Play All 18";

  viewSections.lib.innerHTML = `<div class="lib-header"><h3>Poem Library</h3><button id="playAll18" class="btn2" type="button">${playAll18Label}</button><button id="filterToggle" class="filter-toggle" type="button" aria-label="${appState.filtersOpen ? "Hide filters" : "Show filters"}" aria-expanded="${appState.filtersOpen ? "true" : "false"}" title="${appState.filtersOpen ? "Hide filters" : "Show filters"}">${filterIconSvg()}</button></div>
    <div id="filtersPanel" class="filters-panel ${appState.filtersOpen ? "" : "hide"}">
      <div class="controls"><input id="q" placeholder="Search by title or meaning" value="${appState.searchQuery}"><select id="f"><option value="all" ${appState.levelFilter === "all" ? "selected" : ""}>All Levels</option><option value="easy" ${appState.levelFilter === "easy" ? "selected" : ""}>Beginner</option><option value="medium" ${appState.levelFilter === "medium" ? "selected" : ""}>Intermediate</option><option value="hard" ${appState.levelFilter === "hard" ? "selected" : ""}>Advanced</option></select></div>
      <div class="chip-row">${groupChips}</div>
    </div>
    <div id="list" class="list"></div>`;
  const filterToggle = document.getElementById("filterToggle");
  if (filterToggle) {
    filterToggle.onclick = () => {
      appState.filtersOpen = !appState.filtersOpen;
      persist();
      viewLibrary();
    };
  }
  const playAll18Btn = document.getElementById("playAll18");
  if (playAll18Btn) {
    playAll18Btn.onclick = () => {
      if (playAll18State.playing) {
        stopPlayAll18();
        viewLibrary();
      } else {
        startPlayAll18();
      }
    };
  }
  const list = document.getElementById("list");
  const results = filteredPoems();
  list.innerHTML =
    results
      .map((poem) => {
        const lineCount = poem.text.split("\n").length;
        const done = appState.learned.includes(poem.id);
        const best = appState.bestScores[poem.id];
        return `<article class="it">

          <p>${boldFirstWord(poem.text).replace(/\n/g, "<br>")}</p>
          <div class="small" style="margin-top:6px">${poem.meaning}</div>
          ${ttsSupported() ? `<div class="controls" style="margin-top:6px"><button class="btn2 lib-listen" data-id="${poem.id}" ${playAll18State.playing ? "disabled" : ""}>🔊 Listen</button></div>` : ""}
        </article>`;
      })
      .join("") || "<div class='small'>No results found.</div>";
  document.getElementById("q").oninput = (event) => {
    appState.searchQuery = event.target.value;
    viewLibrary();
  };
  document.getElementById("f").onchange = (event) => {
    appState.levelFilter = event.target.value;
    viewLibrary();
  };
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      appState.collectionFilter = chip.dataset.g;
      viewLibrary();
    };
  });
  document.querySelectorAll(".lib-listen").forEach((listenBtn) => {
    const tile = listenBtn.closest(".it");
    listenBtn.onclick = () => {
      if (listenBtn.dataset.playing === "1") {
        stopSpeaking();
        listenBtn.dataset.playing = "";
        listenBtn.textContent = "🔊 Listen";
        tile.classList.remove("playing");
        return;
      }
      document.querySelectorAll(".it.playing").forEach((playingTile) => playingTile.classList.remove("playing"));
      document.querySelectorAll('.lib-listen[data-playing="1"]').forEach((otherBtn) => {
        otherBtn.dataset.playing = "";
        otherBtn.textContent = "🔊 Listen";
      });
      listenBtn.dataset.playing = "1";
      listenBtn.textContent = "⏹ Stop";
      tile.classList.add("playing");
      speakAudio(listenBtn.dataset.id, "full", {
        loopCount: appState.loopCount,
        onEnd: () => { listenBtn.dataset.playing = ""; listenBtn.textContent = "🔊 Listen"; tile.classList.remove("playing"); },
        onError: () => { listenBtn.dataset.playing = ""; listenBtn.textContent = "⚠ Audio not available"; tile.classList.remove("playing"); }
      });
    };
  });
}

let recorder;
let speech;
let player = null;
let playerRate = 1;
let playerPlaying = false;

function fmtTime(totalSeconds) {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return `${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
}

function viewPractice() {
  const poem = poems[appState.currentIndex % poems.length];
  const recState = recorder.state;
  const scores = recState.scores || { tone: 0, sound: 0, speed: 0, pronunciation: 0, cps: 0 };
  const diffBadge = { easy: "🟢 Easy", medium: "🟡 Medium", hard: "🔴 Hard" }[poem.level.toLowerCase()] || poem.level;
  const alreadyLearned = appState.learned.includes(poem.id);
  const lines = poem.text.split("\n");
  const lineMeanings = poem.lineMeanings || [];

  const linesHtml = lines
    .map((line, idx) => `
      <div class="line-row">
        <p class="line-text">${idx === 0 ? boldFirstWord(line) : line}</p>
        ${
          appState.showMeaning && lineMeanings[idx]
            ? `<div class="small line-meaning">${lineMeanings[idx]}</div>`
            : ""
        }
        ${ttsSupported() ? `<button class="line-listen" data-line="${idx}" title="Listen to this line">🔊</button>` : ""}
      </div>`)
    .join("");
     /* 
      <span class="ch">${poem.collection}</span>
      <span class="ch" style="margin-left:4px">${diffBadge}</span>
*/
  viewSections.prac.innerHTML = `
    
    <div>
      
      <div class="controls" style="margin:8px 0 4px">
      <h3>Practice Mode</h3>
      <button id="tog" class="btn2">${appState.showMeaning ? "Hide" : "Show"} Meaning</button>
      </div>
      ${ttsSupported() ? `
      <div class="player">
        <div class="controls" style="margin-bottom:8px">
          <button id="playToggle" class="btn2">${playerPlaying ? "⏸ Pause" : "▶ Play Full Verse"}</button>
          <button id="playRestart" class="btn3">↺ Restart</button>
          <div class="rate-group">
            ${[0.75, 1, 1.25].map((rate) => `<button class="rate-btn ${playerRate === rate ? "rate-on" : ""}" data-rate="${rate}">${rate}×</button>`).join("")}
          </div>
        </div>
        <div class="player-bar" id="playerBar">
          <div class="player-fill" id="playerFill" style="width:0%"></div>
        </div>
        <div class="small player-time"><span id="playerElapsed">0:00</span> / <span id="playerTotal">0:00</span></div>
      </div>` : ""}
      <div class="verse-lines">${linesHtml}</div>
    </div>
    <div class="it kid-hide" style="margin-top:10px">
      <h4 style="margin:0 0 4px">🎙 Record &amp; Playback</h4>
      <div class="small" style="margin-bottom:8px">Sing along · record your recital, then tap Gauge Accuracy — we'll compare it against tone, sound, speed, and pronunciation.</div>
      <div class="controls">
        <button id="recStart" class="btn"  ${recState.recording ? "disabled" : ""}>▶ Start</button>
        <button id="recStop"  class="btnw" ${recState.recording ? "" : "disabled"}>■ Stop</button>
        <button id="analyze"  class="btn2" ${recState.audioUrl && !recState.recording ? "" : "disabled"}>📊 Gauge Accuracy</button>
      </div>
      ${recState.recording ? waveformHtml(recState.wave, true) : ""}
      <div class="small rec-status" style="margin:6px 0">
        Duration: <span id="rec-dur" class="mono">${recState.durationSec.toFixed(1)}s</span>
        ${recState.recording ? "<span class='rec-live'>● Recording…</span>" : ""}
      </div>
      ${recState.audioUrl ? `<audio id="rec-audio" controls style="width:100%;margin-top:6px" src="${recState.audioUrl}"></audio>` : ""}
      ${recState.note ? `<div class="small" style="margin-top:8px;color:var(--muted)">${recState.note}</div>` : ""}
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
        recState.scores
          ? `<div class="small" style="margin-top:6px">
            Speed: ${scores.cps} chars/sec &nbsp;|&nbsp;
            Target for <em>${poem.level}</em>: ${idealSpeedFor(poem.level).toFixed(1)} chars/sec
          </div>`
          : ""
      }
    </div>
    <div class="it kid-only" style="margin-top:10px">
      <h4 style="margin:0 0 4px">🎙 Practice Out Loud</h4>
      <div class="small" style="margin-bottom:8px">Tap Start, say the verse, then tap Stop to hear yourself!</div>
      <div class="controls">
        <button id="recStartKid" class="btn"  ${recState.recording ? "disabled" : ""}>▶ Start</button>
        <button id="recStopKid"  class="btnw" ${recState.recording ? "" : "disabled"}>■ Stop</button>
      </div>
      ${recState.recording ? waveformHtml(recState.wave, true) : ""}
      <div class="small rec-status" style="margin:6px 0">
        Duration: <span id="rec-dur-kid" class="mono">${recState.durationSec.toFixed(1)}s</span>
        ${recState.recording ? "<span class='rec-live'>● Recording…</span>" : ""}
      </div>
      ${recState.audioUrl ? `<audio controls style="width:100%;margin-top:6px" src="${recState.audioUrl}"></audio>` : ""}
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
  if (analyzeBtn) analyzeBtn.onclick = () => analyzeRecording(poem.id, poem.text, poem.level);
  document.getElementById("tog").onclick = () => {
    appState.showMeaning = !appState.showMeaning;
    viewPractice();
  };
  const ttsOpts = {
    onError: () => {
      recorder.state.note = "Audio not available for this verse yet.";
      viewPractice();
    }
  };
  const playToggleBtn = document.getElementById("playToggle");
  const playRestartBtn = document.getElementById("playRestart");
  const playerFill = document.getElementById("playerFill");
  const playerElapsed = document.getElementById("playerElapsed");
  const playerTotal = document.getElementById("playerTotal");
  const playerBar = document.getElementById("playerBar");

  const startPlayer = () => {
    playerPlaying = true;
    if (playToggleBtn) playToggleBtn.textContent = "⏸ Pause";
    player = speakAudio(poem.id, "full", {
      playbackRate: playerRate,
      onProgress: (currentTime, duration) => {
        if (playerFill) playerFill.style.width = duration ? `${Math.min(100, (currentTime / duration) * 100)}%` : "0%";
        if (playerElapsed) playerElapsed.textContent = fmtTime(currentTime);
        if (playerTotal) {
          playerTotal.textContent = fmtTime(duration);
          playerTotal.dataset.sec = duration || 0;
        }
      },
      onEnd: () => {
        playerPlaying = false;
        player = null;
        if (playToggleBtn) playToggleBtn.textContent = "▶ Play Full Verse";
        if (playerFill) playerFill.style.width = "0%";
      },
      onError: () => {
        playerPlaying = false;
        player = null;
        recorder.state.note = "Audio not available for this verse yet.";
        viewPractice();
      }
    });
  };

  if (playToggleBtn) {
    playToggleBtn.onclick = () => {
      if (playerPlaying) {
        stopSpeaking();
        playerPlaying = false;
        player = null;
        playToggleBtn.textContent = "▶ Play Full Verse";
        if (playerFill) playerFill.style.width = "0%";
        return;
      }
      startPlayer();
    };
  }
  if (playRestartBtn) {
    playRestartBtn.onclick = () => {
      if (playerPlaying && player) {
        player.restart();
      } else {
        startPlayer();
      }
    };
  }
  document.querySelectorAll(".rate-btn").forEach((rateBtn) => {
    rateBtn.onclick = () => {
      playerRate = Number(rateBtn.dataset.rate);
      document.querySelectorAll(".rate-btn").forEach((otherRateBtn) => otherRateBtn.classList.toggle("rate-on", Number(otherRateBtn.dataset.rate) === playerRate));
      if (player) player.setRate(playerRate);
    };
  });
  if (playerBar) {
    playerBar.onclick = (event) => {
      if (!player) return;
      const rect = playerBar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const duration = Number(playerTotal.dataset.sec || 0);
      player.seek(ratio * duration);
    };
  }
  document.querySelectorAll(".line-listen").forEach((lineBtn) => {
    lineBtn.onclick = () => speakAudio(poem.id, `line${+lineBtn.dataset.line}`, ttsOpts);
  });
  document.getElementById("done").onclick = () => {
    if (!appState.learned.includes(poem.id)) {
      appState.learned.push(poem.id);
      appState.completedCount = appState.learned.length;
      const today = todayKey();
      if (appState.lastPracticeDate !== today) {
        appState.streakDays++;
        appState.lastPracticeDate = today;
      }
      appState.sessionCount++;
      persist();
      render();
    }
  };
  document.getElementById("prev").onclick = () => {
    appState.currentIndex = (appState.currentIndex - 1 + poems.length) % poems.length;
    appState.showMeaning = false;
    recorder.reset();
    speech.state.transcript = "";
    stopSpeaking();
    player = null;
    playerPlaying = false;
    viewPractice();
  };
  document.getElementById("next").onclick = () => {
    appState.currentIndex = (appState.currentIndex + 1) % poems.length;
    appState.showMeaning = false;
    recorder.reset();
    speech.state.transcript = "";
    stopSpeaking();
    player = null;
    playerPlaying = false;
    viewPractice();
  };
}

async function analyzeRecording(poemId, targetText, level) {
  const recState = recorder.state;
  if (!recState.audioUrl || !recState.chunks.length) {
    recState.note = "Record audio first to gauge accuracy.";
    viewPractice();
    return;
  }
  try {
    recState.note = "Analyzing…";
    viewPractice();
    const blob = new Blob(recState.chunks, { type: recState.mediaRecorder?.mimeType || "audio/webm" });
    const { samples, sampleRate } = await decodeAudio(blob);
    const tone = scoreTone(samples, sampleRate);
    const sound = scoreSound(samples);
    const speedInfo = scoreSpeed(recState.durationSec, targetText, level);
    const pronunciation = scorePronunciation(speech.state.transcript, targetText);
    recState.scores = { tone, sound, speed: speedInfo.score, pronunciation, cps: speedInfo.cps };
    recState.note = "Analysis complete.";
    const overall = (tone + sound + speedInfo.score + pronunciation) / 4;
    if (!Number.isFinite(appState.bestScores[poemId]) || overall > appState.bestScores[poemId]) {
      appState.bestScores[poemId] = overall;
      persist();
    }
  } catch (_) {
    recState.note = "Could not analyze audio on this browser/device.";
  }
  viewPractice();
}

function viewProgress() {
  const completionPct = Math.round((appState.learned.length / poems.length) * 100);
  viewSections.prog.innerHTML = `<h3>Progress Insights</h3><div class="it"><h4>Learning Completion</h4><div class="small">${appState.learned.length} of ${poems.length} verses learned (${completionPct}%).</div><div style="height:10px;background:#ecf2f2;border-radius:999px;margin-top:10px"><div style="height:100%;width:${completionPct}%;background:linear-gradient(90deg,#0f766e,#164e63)"></div></div></div><div class="it" style="margin-top:10px"><h4>Streak &amp; Sessions</h4><div class="small">${appState.streakDays} day streak &middot; ${appState.sessionCount} practice sessions logged</div></div>`;
}

function viewSettings() {
  viewSections.set.innerHTML = `<h3>Settings</h3>
    <div class="it">
      <h4 style="margin:0 0 4px">Learning Mode</h4>
      <div class="small" style="margin-bottom:8px">Kid Mode shows bigger text, line-by-line meanings, and hides scoring details. Adult Mode shows full pronunciation analytics.</div>
      <div class="controls">
        <button id="modeKid"   class="${appState.kidMode ? "btn" : "btn2"}">🧒 Kid Mode</button>
        <button id="modeAdult" class="${appState.kidMode ? "btn2" : "btn"}">🎓 Adult Mode</button>
      </div>
    </div>
    <div class="it" style="margin-top:10px">
      <h4 style="margin:0 0 4px">App Theme</h4>
      <div class="small" style="margin-bottom:8px">Pick a visual style for your learning experience.</div>
      <div class="controls">
        <button id="themeCalm" class="theme-choice ${appState.theme === "calm" ? "btn" : "btn2"}"><span class="theme-swatch swatch-calm" aria-hidden="true"></span>Calm Classroom</button>
        <button id="themeBold" class="theme-choice ${appState.theme === "bold" ? "btn" : "btn2"}"><span class="theme-swatch swatch-bold" aria-hidden="true"></span>Bold Gamified</button>
        <button id="themeMinimal" class="theme-choice ${appState.theme === "minimal" ? "btn" : "btn2"}"><span class="theme-swatch swatch-minimal" aria-hidden="true"></span>Minimal Premium</button>
      </div>
    </div>
    <div class="it" style="margin-top:10px">
      <h4 style="margin:0 0 4px">Listen Loop Count</h4>
      <div class="small" style="margin-bottom:8px">How many times the full verse audio repeats when you tap Listen in the Library.</div>
      <select id="loopCount">
        ${[1, 2, 3, 5].map((count) => `<option value="${count}" ${appState.loopCount === count ? "selected" : ""}>${count}x</option>`).join("")}
        <option value="0" ${appState.loopCount === Infinity ? "selected" : ""}>Repeat until stopped</option>
      </select>
    </div>
    <div class="it" style="margin-top:10px"><div class="small">Progress is saved in browser localStorage.</div></div>
    <div class="controls"><button id="reset" class="btnw">Reset Progress</button></div>
    <div class="small">Tip: add this page to your home screen for an app-like launch.</div>`;
  document.getElementById("loopCount").onchange = (event) => {
    const selectedValue = Number(event.target.value);
    appState.loopCount = selectedValue === 0 ? Infinity : selectedValue;
    persist();
  };
  const setTheme = (theme) => {
    appState.theme = theme;
    persist();
    applyTheme();
    viewSettings();
  };
  document.getElementById("themeCalm").onclick = () => setTheme("calm");
  document.getElementById("themeBold").onclick = () => setTheme("bold");
  document.getElementById("themeMinimal").onclick = () => setTheme("minimal");
  document.getElementById("modeKid").onclick = () => {
    appState.kidMode = true;
    persist();
    applyKidMode();
    render();
  };
  document.getElementById("modeAdult").onclick = () => {
    appState.kidMode = false;
    persist();
    applyKidMode();
    render();
  };
  document.getElementById("reset").onclick = () => {
    appState.completedCount = 0;
    appState.streakDays = 0;
    appState.sessionCount = 0;
    appState.currentIndex = 0;
    appState.showMeaning = false;
    appState.learned = [];
    appState.lastPracticeDate = null;
    appState.bestScores = {};
    persist();
    render();
  };
}

function render() {
  if (appState.currentView === "home") viewHome();
  if (appState.currentView === "lib") viewLibrary();
  if (appState.currentView === "prac") viewPractice();
  if (appState.currentView === "prog") viewProgress();
  if (appState.currentView === "set") viewSettings();
}

function init() {
  recorder = createRecorder((_recState, mode) => {
    if (mode === "tick") {
      const durationText = recorder.state.durationSec.toFixed(1) + "s";
      const durationEl = document.getElementById("rec-dur");
      const durationKidEl = document.getElementById("rec-dur-kid");
      if (durationEl) durationEl.textContent = durationText;
      if (durationKidEl) durationKidEl.textContent = durationText;
      document.querySelectorAll(".waveform").forEach((waveformEl) => {
        const bars = waveformEl.querySelectorAll(".wave-bar");
        recorder.state.wave.forEach((level, idx) => {
          if (bars[idx]) bars[idx].style.height = `${Math.max(6, Math.round(level * 100))}%`;
        });
      });
      return;
    }
    if (appState.currentView === "prac") viewPractice();
  });
  speech = createSpeech(
    (transcript) => {
      const transcriptEl = document.getElementById("rec-trans");
      if (transcriptEl) transcriptEl.textContent = transcript;
    },
    (message) => {
      recorder.state.note = message;
      if (appState.currentView === "prac") viewPractice();
    }
  );
  window.addEventListener("beforeunload", () => recorder.dispose());
  applyKidMode();
  applyTheme();
  renderNav();
  setView("home");
}

init();
