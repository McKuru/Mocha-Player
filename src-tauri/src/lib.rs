use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Belirtilen üst klasör (parent_dir) içinde verilen isimle yeni bir playlist klasörü oluşturur,
/// Tauri fs kapsamına ekler ve oluşturulan klasörün tam yolunu döner.
#[tauri::command]
fn create_playlist_folder(
    app: AppHandle,
    parent_dir: String,
    name: String,
) -> Result<String, String> {
    let parent = Path::new(parent_dir.trim());
    if !parent.exists() || !parent.is_dir() {
        return Err("Üst klasör bulunamadı veya geçersiz.".into());
    }
    let sanitized: String = name
        .trim()
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let sanitized = sanitized.trim_matches('.').trim().to_string();
    if sanitized.is_empty() {
        return Err("Geçerli bir playlist / klasör ismi girin.".into());
    }
    let target = parent.join(&sanitized);
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    app.fs_scope()
        .allow_directory(&target, true)
        .map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

/// Satır satır okur; UTF-8 olmayan baytlar bozulmadan (lossy) çevrilir, böylece boru asla tıkanmaz.
fn pump_lines<R: Read>(reader: R, on_line: &Channel<String>) {
    let mut r = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match r.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let s = String::from_utf8_lossy(&buf).trim_end().to_string();
                if !s.is_empty() {
                    let _ = on_line.send(s);
                }
            }
        }
    }
}

/// yt-dlp ile verilen `out_dir` (hedef playlist klasörü) içine indirir.
/// Dönen değer: dosyaların indirildiği klasör.
#[tauri::command]
async fn ytdlp_download(
    app: AppHandle,
    ytdlp_dir: String,
    url: String,
    out_dir: String,
    new_playlist: bool,
    on_line: Channel<String>,
) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Geçersiz bağlantı".into());
    }
    let exe = Path::new(&ytdlp_dir).join("yt-dlp.exe");
    if !exe.exists() {
        return Err(format!("yt-dlp.exe bulunamadı: {}", exe.display()));
    }
    if out_dir.trim().is_empty() {
        return Err("Hedef playlist klasörü seçilmedi".into());
    }

    let target = PathBuf::from(&out_dir);
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    // Frontend'in bu klasörü okuyabilmesi için fs kapsamına ekle (persisted-scope kalıcı yapar).
    app.fs_scope()
        .allow_directory(&target, true)
        .map_err(|e| e.to_string())?;

    let target_str = target.to_string_lossy().to_string();
    let ffmpeg_exists = Path::new(&ytdlp_dir).join("ffmpeg.exe").exists();
    let ytdlp_dir_clone = ytdlp_dir.clone();
    let target_for_check = target.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut cmd = Command::new(&exe);
        cmd.args([
            "--newline",
            "--encoding",
            "utf-8",
            "--windows-filenames",
            "--ignore-errors",
            "--no-warnings",
            "--write-thumbnail",
        ]);

        if ffmpeg_exists {
            cmd.args([
                "--ffmpeg-location",
                &ytdlp_dir_clone,
                "-x",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0",
                "--convert-thumbnails",
                "jpg",
                "-f",
                "bestaudio/best",
            ]);
        } else {
            // ffmpeg yoksa yalnızca ses akışını indir (video indirme)
            cmd.args(["-f", "bestaudio[ext=m4a]/bestaudio"]);
        }

        cmd.args([
            "-o",
            "%(title)s.%(ext)s",
            if new_playlist { "--yes-playlist" } else { "--no-playlist" },
            "--",
        ])
        .arg(&url)
        .current_dir(&target)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stderr = child.stderr.take().ok_or("stderr alınamadı")?;
        let stdout = child.stdout.take().ok_or("stdout alınamadı")?;

        let err_ch = on_line.clone();
        let t = std::thread::spawn(move || pump_lines(stderr, &err_ch));
        pump_lines(stdout, &on_line);
        let _ = t.join();

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }

        // Playlist indirirken bazı videolar gizli/silinmiş olduğunda yt-dlp --ignore-errors
        // ile diğer şarkıları indirse bile çıkış kodu 1 dönebiliyor. Klasöre en az 1 ses dosyası
        // indiyse başarılı kabul et.
        let has_audio = std::fs::read_dir(&target_for_check)
            .ok()
            .map(|entries| {
                entries.flatten().any(|e| {
                    e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .map(|ext| {
                            matches!(
                                ext.to_ascii_lowercase().as_str(),
                                "mp3" | "m4a" | "flac" | "wav" | "ogg" | "oga" | "opus" | "aac" | "webm"
                            )
                        })
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);

        if new_playlist && has_audio {
            Ok(())
        } else {
            if new_playlist && !has_audio {
                // Yalnızca tamamen boşsa sil
                let _ = std::fs::remove_dir(&target_for_check);
            }
            Err(format!("yt-dlp hata kodu: {:?}", status.code()))
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;
    Ok(target_str)
}

/// yt-dlp ile arama yaparak ilk sonucun kapak görseli (thumbnail) URL'sini döner.
#[tauri::command]
async fn ytdlp_search_thumbnail(ytdlp_dir: String, query: String) -> Result<String, String> {
    let exe = Path::new(&ytdlp_dir).join("yt-dlp.exe");
    if !exe.exists() {
        return Err("yt-dlp.exe bulunamadı".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&exe);
        cmd.args([
            "--print",
            "thumbnail",
            "--no-playlist",
            "--no-warnings",
            &format!("ytsearch1:{query}"),
        ]);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

        let output = cmd.output().map_err(|e| e.to_string())?;
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !s.is_empty() {
                return Ok(s);
            }
        }
        Err("Thumbnail bulunamadı".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Frontend hatalarını/teşhis mesajlarını terminale yazar (hata ayıklama için).
#[tauri::command]
fn log_frontend(level: String, msg: String) {
    eprintln!("[frontend:{level}] {msg}");
    let path = std::env::temp_dir().join("mocha-player-frontend.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(f, "[{level}] {msg}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebView2'nin bozuk/eski HTTP modül önbelleğini temizle (Local Storage / ayarlar korunur)
    #[cfg(windows)]
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let def = Path::new(&local)
            .join("com.melihloq.mocha-player")
            .join("EBWebView")
            .join("Default");
        let _ = std::fs::remove_dir_all(def.join("Cache"));
        let _ = std::fs::remove_dir_all(def.join("Code Cache"));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        // fs kapsamını (dialog ile seçilen klasörler) uygulama yeniden başlayınca da korur
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            ytdlp_download,
            ytdlp_search_thumbnail,
            create_playlist_folder,
            log_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
