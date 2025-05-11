const { invoke } = window.__TAURI__.core;

let greetInputEl;
let greetMsgEl;
let toggleButton;
let statusElement;
let errorMsgElement;
let isPlaying = false;

async function greet() {
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

async function initializeAudio() {
  try {
    await invoke("initialize_gstreamer");
    console.log("GStreamer initialized successfully");
  } catch (error) {
    console.error("Failed to initialize GStreamer:", error);
    showError("Failed to initialize audio system: " + error);
  }
}

async function toggleAudio() {
  try {
    clearError();

    if (isPlaying) {
      await invoke("stop_audio_capture");
      isPlaying = false;
      updateUI();
    } else {
      await invoke("start_audio_capture");
      isPlaying = true;
      updateUI();
    }
  } catch (error) {
    console.error("Audio operation failed:", error);
    showError("Audio operation failed: " + error);

    // Try to get the actual state
    try {
      isPlaying = await invoke("is_playing");
      updateUI();
    } catch (e) {
      console.error("Failed to get audio state:", e);
    }
  }
}

function updateUI() {
  if (isPlaying) {
    toggleButton.textContent = "Stop Audio";
    toggleButton.classList.add("active");
    statusElement.textContent = "Status: Playing";
    statusElement.classList.add("playing");
  } else {
    toggleButton.textContent = "Start Audio";
    toggleButton.classList.remove("active");
    statusElement.textContent = "Status: Stopped";
    statusElement.classList.remove("playing");
  }
}

function showError(message) {
  errorMsgElement.textContent = message;
}

function clearError() {
  errorMsgElement.textContent = "";
}

window.addEventListener("DOMContentLoaded", async () => {
  // Original demo elements
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  // Audio elements
  toggleButton = document.querySelector("#toggle-audio");
  statusElement = document.querySelector("#status");
  errorMsgElement = document.querySelector("#error-msg");

  toggleButton.addEventListener("click", toggleAudio);

  // Initialize GStreamer
  await initializeAudio();

  // Check initial state
  try {
    isPlaying = await invoke("is_playing");
    updateUI();
  } catch (error) {
    console.error("Failed to get initial audio state:", error);
  }
});