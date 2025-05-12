use gstreamer::prelude::*;
use gstreamer_app::AppSink;
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::{APIBuilder, API};
use webrtc::peer_connection::RTCPeerConnection;

static GSTREAMER_INITIALIZED: Lazy<Result<(), gstreamer::glib::Error>> =
    Lazy::new(|| gstreamer::init());

static BUFFER_COUNT: AtomicUsize = AtomicUsize::new(0);

struct AudioState {
    pipeline: Option<gstreamer::Pipeline>,
    is_playing: bool,
}

static AUDIO_STATE: Lazy<Mutex<AudioState>> =
    Lazy::new(|| Mutex::new(AudioState { pipeline: None, is_playing: false }));

#[tauri::command]
fn initialize_gstreamer() -> Result<(), String> {
    GSTREAMER_INITIALIZED
        .as_ref()
        .map_err(|e| format!("Failed to initialize GStreamer: {}", e))?;
    Ok(())
}

#[tauri::command]
fn start_audio_capture() -> Result<(), String> {
    println!("Attempting to start audio capture...");
    let mut state = AUDIO_STATE.lock().unwrap();

    if state.is_playing {
        println!("Audio capture already playing.");
        return Ok(());
    }

    // By default we have 20 ms packets of 48khz opus
    let pipeline_str =
        "autoaudiosrc ! audioconvert ! audioresample ! opusenc ! rtpopuspay ! appsink name=sink";

    let pipeline = gstreamer::parse::launch(pipeline_str)
        .map_err(|e| format!("Failed to create pipeline: {}", e))?;

    let pipeline = pipeline
        .dynamic_cast::<gstreamer::Pipeline>()
        .map_err(|_| "Failed to cast to pipeline".to_string())?;

    // --- Get and Configure AppSink ---
    let appsink = pipeline
        .by_name("sink") // Get sink element by name
        .ok_or_else(|| "Failed to get sink element from pipeline".to_string())?
        .dynamic_cast::<AppSink>() // Cast to AppSink
        .map_err(|_| "Failed to cast element to AppSink".to_string())?;

    // We want GStreamer to push buffers to us when they are ready.
    // Don't block the main loop, don't drop buffers too quickly.
    appsink.set_property("emit-signals", true);
    appsink.set_property("max-buffers", 10u32);
    appsink.set_property("drop", false); // Don't drop buffers silently

    // Callbacks for new signals
    appsink.set_callbacks(
        gstreamer_app::AppSinkCallbacks::builder()
            .new_sample(|appsink| {
                match appsink.pull_sample() {
                    Ok(sample) => {
                        let count =
                            BUFFER_COUNT.fetch_add(1, Ordering::Relaxed);
                        if count % 100 == 0 {
                            // Log every 100 buffers
                            println!("Received buffer #{}", count);
                            // Todo: Access buffer data via sample.buffer().map_readable()
                        }
                        Ok(gstreamer::FlowSuccess::Ok)
                    },
                    Err(_) => {
                        eprintln!("Failed to pull sample from appsink");
                        Err(gstreamer::FlowError::Error)
                    },
                }
            })
            .build(),
    );

    pipeline
        .set_state(gstreamer::State::Playing)
        .map_err(|e| format!("Failed to set pipeline to playing: {}", e))?;

    println!("Pipeline set to playing.");
    state.pipeline = Some(pipeline);
    //state.appsink = Some(appsink);
    state.is_playing = true;

    // Counter reset
    BUFFER_COUNT.store(0, Ordering::Relaxed);

    Ok(())
}

#[tauri::command]
fn stop_audio_capture() -> Result<(), String> {
    let mut state = AUDIO_STATE.lock().unwrap();

    if let Some(pipeline) = state.pipeline.take() {
        pipeline
            .set_state(gstreamer::State::Null)
            .map_err(|e| format!("Failed to stop pipeline: {}", e))?;
        state.is_playing = false;
    } else {
        println!("Pipeline was not running."); // Added log
    }

    Ok(())
}

#[tauri::command]
fn is_playing() -> bool {
    let state = AUDIO_STATE.lock().unwrap();
    state.is_playing
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            initialize_gstreamer,
            start_audio_capture,
            stop_audio_capture,
            is_playing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// WEBRTC

struct WebRTCState {
    api: Option<Arc<webrtc::api::API>>,
    peer_connection: Option<Arc<RTCPeerConnection>>,
}

static WEBRTC_STATE: Lazy<Mutex<WebRTCState>> =
    Lazy::new(|| Mutex::new(WebRTCState { api: None, peer_connection: None }));

// Helper function to get or create the WebRTC API
fn get_api() -> Result<Arc<webrtc::api::API>, String> {
    let mut state = WEBRTC_STATE.lock().unwrap();
    if state.api.is_none() {
        let mut m = MediaEngine::default();
        // Setup desired codecs (minimal: Opus for audio)
        m.register_default_codecs()
            .map_err(|e| format!("Failed to register default codecs: {}", e))?;

        let api = APIBuilder::new().with_media_engine(m).build();
        state.api = Some(Arc::new(api));
        println!("WebRTC API Initialized.");
    }
    state
        .api
        .clone()
        .ok_or_else(|| "API should exist now".to_string())
}

/*
fn create_rtc_config() -> RTCConfiguration {
    let config = RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            // https://dev.to/alakkadshaw/google-stun-server-list-21n4
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }],
        ..Default::default()
    };
    config
}
*/
