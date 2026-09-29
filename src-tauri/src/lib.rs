mod commands;
mod state;

use state::AppState;
use tauri::{Emitter, Manager};
use trm_core::transfer::EngineEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // `AppState::new` builds the `TransferEngine`, which spawns its
            // background dispatcher via `tokio::spawn` and therefore needs
            // an entered Tokio runtime context - the setup closure itself
            // runs on Tauri's event loop thread, outside of one.
            let state = tauri::async_runtime::block_on(async { AppState::new() })?;
            let mut events = state.transfer_engine.subscribe();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match events.recv().await {
                        Ok(EngineEvent::Progress {
                            task_id,
                            transferred_bytes,
                            total_bytes,
                            speed_bps,
                            eta_secs,
                        }) => {
                            let _ = handle.emit(
                                "transfer://progress",
                                serde_json::json!({
                                    "taskId": task_id,
                                    "transferredBytes": transferred_bytes,
                                    "totalBytes": total_bytes,
                                    "speedBps": speed_bps,
                                    "etaSecs": eta_secs,
                                }),
                            );
                        }
                        Ok(EngineEvent::StatusChanged { task_id, status, error }) => {
                            let _ = handle.emit(
                                "transfer://status",
                                serde_json::json!({
                                    "taskId": task_id,
                                    "status": status,
                                    "error": error,
                                }),
                            );
                        }
                        Ok(EngineEvent::ChecksumComputed { task_id, checksum }) => {
                            let _ = handle.emit(
                                "transfer://checksum",
                                serde_json::json!({
                                    "taskId": task_id,
                                    "checksum": checksum,
                                }),
                            );
                        }
                        Ok(EngineEvent::QueueReordered) => {
                            let _ = handle.emit("transfer://queue-reordered", ());
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sites::list_sites,
            commands::sites::save_site,
            commands::sites::delete_site,
            commands::connection::connect_saved_site,
            commands::connection::quick_connect,
            commands::connection::disconnect,
            commands::connection::ping_site,
            commands::browse::list_remote_dir,
            commands::browse::remote_canonicalize,
            commands::browse::remote_mkdir,
            commands::browse::remote_remove_file,
            commands::browse::remote_remove_dir,
            commands::browse::remote_remove_empty_dir,
            commands::browse::remote_rename,
            commands::browse::remote_chmod,
            commands::browse::remote_stat,
            commands::browse::quick_look_remote,
            commands::browse::read_text_preview,
            commands::browse::list_local_dir,
            commands::browse::local_mkdir,
            commands::browse::local_remove_file,
            commands::browse::local_remove_dir,
            commands::browse::local_remove_empty_dir,
            commands::browse::local_rename,
            commands::browse::local_home_dir,
            commands::browse::local_stat,
            commands::transfer::enqueue_download,
            commands::transfer::enqueue_upload,
            commands::transfer::list_transfers,
            commands::transfer::pause_transfer,
            commands::transfer::resume_transfer,
            commands::transfer::cancel_transfer,
            commands::transfer::pause_all_transfers,
            commands::transfer::resume_all_transfers,
            commands::transfer::cancel_all_transfers,
            commands::transfer::reorder_transfer,
            commands::transfer::prioritize_transfer,
            commands::transfer::set_global_bandwidth_limit,
            commands::transfer::set_transfer_bandwidth_limit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
