use gstreamer::prelude::*;
use once_cell::sync::Lazy;
use std::sync::Mutex;

static GSTREAMER_INITIALIZED: Lazy<Result<(), gstreamer::glib::Error>> =
    Lazy::new(|| gstreamer::init());

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
    let mut state = AUDIO_STATE.lock().unwrap();

    if state.is_playing {
        return Ok(());
    }

    let pipeline_str =
        "autoaudiosrc ! audioconvert ! audioresample ! autoaudiosink";

    let pipeline = gstreamer::parse::launch(pipeline_str)
        .map_err(|e| format!("Failed to create pipeline: {}", e))?;

    let pipeline = pipeline
        .dynamic_cast::<gstreamer::Pipeline>()
        .map_err(|_| "Failed to cast to pipeline")?;

    pipeline
        .set_state(gstreamer::State::Playing)
        .map_err(|e| format!("Failed to set pipeline to playing: {}", e))?;

    state.pipeline = Some(pipeline);
    state.is_playing = true;

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
