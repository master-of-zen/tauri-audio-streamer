#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_audio_streamer_lib::run()
}
