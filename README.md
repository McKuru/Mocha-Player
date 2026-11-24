# 🎵 Mocha Player

**Mocha Player**, Tauri v2 (Rust), React 19 ve Web Audio API ile geliştirilmiş; düşük bellek tüketimli, reklamsız, modern ve özelleştirilebilir bir yerel masaüstü müzik çalardır.

---

## ✨ Özellikler

- **🎧 Equal-Power Crossfade (Otomatik & Manuel):**
  - Şarkılar biterken veya manuel olarak şarkı değiştirdiğinizde $\cos(t \cdot \pi/2)$ ve $\sin(t \cdot \pi/2)$ eğrileriyle ses seviyesinde düşüş yaşanmadan pürüzsüz geçiş sağlar.
  - Art arda hızlı şarkı atlamalarında seslerin üst üste binmesini önleyen akıllı geçiş koruması içerir.
- **🎚️ 5-Bant Ekolayzır & Hazır Profiller:**
  - `60 Hz`, `250 Hz`, `1 kHz`, `4 kHz`, `12 kHz` bantlarında gerçek zamanlı ses filtreleme ve hazır ses profilleri (*Düz, Bas Artırma, Vokal/Akustik, Tiz, Elektronik/Dans, Rock/Metal, Pop*).
- **📊 Canlı Ses Görselleştirici (Audio Visualizer):**
  - Oynatıcı ekranında müziğin frekanslarına gerçek zamanlı tepki veren spektrum çubukları.
- **🎤 Senkronize Şarkı Sözleri (LRCLIB):**
  - Çalan şarkının sözlerini otomatik bulur; zaman senkronlu (`.lrc`) sözlerde aktif satırı vurgular ve tıklanan satıra anında sarar.
- **🖼️ Çoklu Kaynaklı Görsel Kapak Seçici:**
  - Şarkı ve playlist kapaklarını **iTunes**, **Deezer** ve **YouTube** üzerinden aynı anda arayarak görsel bir pencereden seçmenize veya tek tıkla alternatif kapak denemenize olanak tanır.
- **📥 Entegre `yt-dlp` Müzik İndirici:**
  - YouTube şarkı ve çalma listesi bağlantılarını doğrudan en yüksek kaliteli `.mp3` ses dosyası olarak indirir (video indirmez).
  - Playlist indirirken yeni playlist ismini, tekli şarkı indirirken ise hangi playliste ekleneceğini (veya yeni boş klasör oluşturulacağını) sorar.
- **🎨 Catppuccin & Özel Tema Motoru:**
  - *Latte, Frappé, Macchiato, Mocha* temaları, 14 farklı vurgu rengi ve tamamen özelleştirilebilir renk paleti.
- **⌨️ Hızlı Klavye & Windows Medya Tuşları (SMTC) Desteği:**
  - `Boşluk`: Oynat / Duraklat
  - `Sağ / Sol Ok`: ±5 saniye sar
  - `Yukarı / Aşağı Ok`: Ses seviyesi (±%5)
  - `M`: Sesi kapat / aç
  - `S`: Karışık çalma (Shuffle)
  - `R`: Tekrar modu (Repeat)
  - `Esc`: Oynatıcıdan o anki playliste, playlistten ana kütüphaneye hızlı dönüş
  - Windows kilit ekranı ve klavye medya tuşlarıyla tam uyum.

---

## 🚀 Kurulum ve Geliştirme

### Gereksinimler
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (Tauri v2 için)
- *(İsteğe bağlı - YouTube indirme özelliği için)* `yt-dlp.exe` ve `ffmpeg.exe`

### Geliştirme Modunda Çalıştırma
```bash
npm install
npm run tauri dev
```

### Yayın (`.exe` & Kurulum Paketi) Derlemesi
```bash
npm run tauri build
```
Derleme tamamlandığında:
- **Tek başına çalışan `.exe`:** `src-tauri/target/release/mocha-player.exe`
- **Kurulum dosyaları (Installer):** `src-tauri/target/release/bundle/nsis/` ve `src-tauri/target/release/bundle/msi/` klasörlerinde oluşturulur.

---

## 📄 Lisans

Bu proje [MIT Lisansı](./LICENSE) altında açık kaynak olarak sunulmuştur.
