const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event; // Import listen

// --- UI Elements ---
// GStreamer/Audio Capture
let toggleButton;
let statusElement;
// WebRTC Signaling
let createPeerButton;
let createOfferButton;
let offerSdpTextarea;
let answerSdpTextarea;
let remoteSdpTextarea;
let handleOfferButton;
let handleAnswerButton;
let iceCandidateTextarea;
let addIceCandidateButton;
let webrtcStatusElement;
let closePeerButton;
// General
let errorMsgElement;

// --- State ---
let isAudioPlaying = false;
let localIceCandidates = []; // Store locally generated candidates

// --- GStreamer Functions ---
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
    if (isAudioPlaying) {
      await invoke("stop_audio_capture");
      isAudioPlaying = false;
      updateAudioUI();
    } else {
      await invoke("start_audio_capture");
      isAudioPlaying = true;
      updateAudioUI();
    }
  } catch (error) {
    console.error("Audio operation failed:", error);
    showError("Audio operation failed: " + error);
    try {
      isAudioPlaying = await invoke("is_playing"); // Sync state on error
      updateAudioUI();
    } catch (e) {
      console.error("Failed to get audio state:", e);
    }
  }
}

function updateAudioUI() {
  if (isAudioPlaying) {
    toggleButton.textContent = "Stop Audio Capture";
    toggleButton.classList.add("active");
    statusElement.textContent = "Capture: Running";
    statusElement.classList.add("playing");
  } else {
    toggleButton.textContent = "Start Audio Capture";
    toggleButton.classList.remove("active");
    statusElement.textContent = "Capture: Stopped";
    statusElement.classList.remove("playing");
  }
}

// --- WebRTC Functions ---

async function setupWebRTCListeners() {
  await listen('ice_candidate', (event) => {
    console.log('Received ICE candidate from Rust:', event.payload);
    const candidate = JSON.parse(event.payload); // Payload is the JSON stringified candidate_init
    localIceCandidates.push(candidate); // Store it maybe?
    // Display the candidate for the user to copy
    iceCandidateTextarea.value += JSON.stringify(candidate, null, 2) + "\n\n";
    webrtcStatusElement.textContent = "Status: Generated ICE Candidate (copy below)";
  });

  // TODO: Listen for connection state changes if needed
  // await listen('connection_state_change', (event) => { ... });
  console.log("WebRTC event listeners setup.");
}

async function createPeer() {
  clearError();
  try {
    webrtcStatusElement.textContent = "Status: Creating Peer Connection...";
    await invoke("create_peer_connection");
    webrtcStatusElement.textContent = "Status: Peer Connection Ready. Add audio transceiver done. Create Offer or expect Offer.";
    // Enable/disable buttons appropriately
    createPeerButton.disabled = true;
    createOfferButton.disabled = false;
    handleOfferButton.disabled = false; // Can now receive an offer
    closePeerButton.disabled = false;
  } catch (error) {
    console.error("Failed to create peer connection:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error creating Peer";
  }
}

async function createOffer() {
  clearError();
  try {
    webrtcStatusElement.textContent = "Status: Creating Offer...";
    const offerSdp = await invoke("create_offer");
    offerSdpTextarea.value = offerSdp;
    webrtcStatusElement.textContent = "Status: Offer created (copy below). Waiting for Answer.";
    handleOfferButton.disabled = true; // Can't handle offer if we just made one
    handleAnswerButton.disabled = false; // Ready to handle the answer
  } catch (error) {
    console.error("Failed to create offer:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error creating Offer";
  }
}

async function handleOffer() {
  clearError();
  const offerSdp = remoteSdpTextarea.value.trim();
  if (!offerSdp) {
    showError("Please paste the remote Offer SDP first.");
    return;
  }
  try {
    webrtcStatusElement.textContent = "Status: Handling Offer, creating Answer...";
    // handle_offer_and_create_answer also creates the peer connection if needed
    const answerSdp = await invoke("handle_offer_and_create_answer", { offerSdp });
    answerSdpTextarea.value = answerSdp;
    webrtcStatusElement.textContent = "Status: Answer created (copy below). Connection negotiating...";
    // Enable/disable buttons
    createPeerButton.disabled = true; // PC created implicitly
    closePeerButton.disabled = false;
    createOfferButton.disabled = true; // Cannot create offer now
    handleOfferButton.disabled = true;
    handleAnswerButton.disabled = true; // We created answer, not handling one
  } catch (error) {
    console.error("Failed to handle offer/create answer:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error handling Offer";
  }
}

async function handleAnswer() {
  clearError();
  const answerSdp = remoteSdpTextarea.value.trim();
  if (!answerSdp) {
    showError("Please paste the remote Answer SDP first.");
    return;
  }
  try {
    webrtcStatusElement.textContent = "Status: Handling Answer...";
    await invoke("handle_answer", { answerSdp });
    webrtcStatusElement.textContent = "Status: Answer received. Connection negotiating...";
    handleAnswerButton.disabled = true; // Answer handled
  } catch (error) {
    console.error("Failed to handle answer:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error handling Answer";
  }
}

async function addIceCandidate() {
  clearError();
  const candidateJson = remoteSdpTextarea.value.trim(); // Reuse remote SDP textarea for pasting candidate JSON
  if (!candidateJson) {
    showError("Please paste the remote ICE Candidate JSON first.");
    return;
  }
  try {
    webrtcStatusElement.textContent = "Status: Adding remote ICE Candidate...";
    await invoke("add_ice_candidate", { candidateJson });
    remoteSdpTextarea.value = ""; // Clear the input area after adding
    webrtcStatusElement.textContent = "Status: Added remote ICE Candidate. Connection negotiating...";
  } catch (error) {
    console.error("Failed to add ICE candidate:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error adding ICE Candidate";
  }
}

async function closePeer() {
  clearError();
  try {
    webrtcStatusElement.textContent = "Status: Closing Peer Connection...";
    await invoke("close_peer_connection");
    webrtcStatusElement.textContent = "Status: Peer Connection Closed.";
    resetWebRTCUI();
  } catch (error) {
    console.error("Failed to close peer connection:", error);
    showError("WebRTC Error: " + error);
    webrtcStatusElement.textContent = "Status: Error closing Peer Connection";
  }
}

function resetWebRTCUI() {
  offerSdpTextarea.value = "";
  answerSdpTextarea.value = "";
  remoteSdpTextarea.value = "";
  iceCandidateTextarea.value = "";
  localIceCandidates = [];
  createPeerButton.disabled = false;
  createOfferButton.disabled = true;
  handleOfferButton.disabled = true;
  handleAnswerButton.disabled = true;
  addIceCandidateButton.disabled = false; // Should technically wait until PC exists
  closePeerButton.disabled = true;
  webrtcStatusElement.textContent = "Status: Idle";
}


// --- General Utility ---
function showError(message) {
  errorMsgElement.textContent = message;
  console.error("Error displayed:", message);
}

function clearError() {
  errorMsgElement.textContent = "";
}

// --- DOMContentLoaded ---
window.addEventListener("DOMContentLoaded", async () => {
  // GStreamer elements
  toggleButton = document.querySelector("#toggle-audio");
  statusElement = document.querySelector("#status");
  toggleButton.addEventListener("click", toggleAudio);

  // WebRTC elements
  createPeerButton = document.querySelector("#create-peer");
  createOfferButton = document.querySelector("#create-offer");
  offerSdpTextarea = document.querySelector("#offer-sdp");
  answerSdpTextarea = document.querySelector("#answer-sdp");
  remoteSdpTextarea = document.querySelector("#remote-sdp"); // Used for incoming offer/answer/candidate
  handleOfferButton = document.querySelector("#handle-offer");
  handleAnswerButton = document.querySelector("#handle-answer");
  iceCandidateTextarea = document.querySelector("#ice-candidates");
  addIceCandidateButton = document.querySelector("#add-ice-candidate");
  webrtcStatusElement = document.querySelector("#webrtc-status");
  closePeerButton = document.querySelector("#close-peer");


  createPeerButton.addEventListener("click", createPeer);
  createOfferButton.addEventListener("click", createOffer);
  handleOfferButton.addEventListener("click", handleOffer);
  handleAnswerButton.addEventListener("click", handleAnswer);
  addIceCandidateButton.addEventListener("click", addIceCandidate);
  closePeerButton.addEventListener("click", closePeer);

  // General elements
  errorMsgElement = document.querySelector("#error-msg");

  // Initialize GStreamer first
  await initializeAudio();

  // Check initial audio state
  try {
    isAudioPlaying = await invoke("is_playing");
    updateAudioUI();
  } catch (error) {
    console.error("Failed to get initial audio state:", error);
  }

  // Setup WebRTC event listeners
  await setupWebRTCListeners();

  // Set initial WebRTC UI state
  resetWebRTCUI();

  // Original greet functionality (optional)
  let greetInputEl = document.querySelector("#greet-input");
  let greetMsgEl = document.querySelector("#greet-msg");
  if (greetInputEl && greetMsgEl) {
    document.querySelector("#greet-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
    });
  } else {
    console.warn("Greet elements not found, skipping setup.");
  }

});