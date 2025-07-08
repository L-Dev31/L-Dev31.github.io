if (typeof PrismApp === 'undefined') {
    class PrismApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.audio = null;
            this.currentTrack = null;
            this.playlist = [];
            this.currentIndex = 0;
            this.isPlaying = false;
            this.volume = 0.7;
            this.currentTime = 0;
            this.duration = 0;
            this.isShuffled = false;
            this.isRepeating = false;
        }

        async init(options = {}) {
            try {
                this.windowManager = options.windowManager;
                this.appConfig = options.appConfig;
                
                window.prismAppInstance = this;
                await this.open(options.fileName, options.filePath);
                console.log('✅ Prism app initialized');
                return true;
            } catch (error) {
                console.error('❌ Failed to initialize Prism app:', error);
                return false;
            }
        }

        async open(fileName = null, filePath = null) {
            if (this.windowId && this.windowManager) {
                if (fileName && filePath) {
                    await this.loadTrack(fileName, filePath);
                }
                return;
            }

            const content = this.createPrismContent();
            const windowObj = this.windowManager.createWindow({
                id: `prism-${Date.now()}`,
                title: 'Prism - Music Player',
                width: 900,
                height: 650,
                icon: this.appConfig?.icon || 'images/app5.png',
                appId: this.appConfig?.id || 'app5',
                content: content,
                footerText: this.getFooterText(),
                className: 'prism-app-window'
            });

            this.windowId = windowObj.id;
            this.setupEventListeners();
            
            if (fileName && filePath) {
                await this.loadTrack(fileName, filePath);
            } else {
                await this.loadDefaultPlaylist();
            }
            
            console.log('✅ Prism app opened successfully');
        }

        createPrismContent() {
            return `
                <div class="prism-container">
                    <div class="prism-header">
                        <div class="prism-logo"></div>
                        <div class="prism-controls-mini">
                            <button id="shuffleBtn" class="control-btn-mini" title="Shuffle">
                                <i class="fas fa-random"></i>
                            </button>
                            <button id="repeatBtn" class="control-btn-mini" title="Repeat">
                                <i class="fas fa-redo"></i>
                            </button>
                        </div>
                    </div>

                    <div class="prism-main">
                        <div class="now-playing-section">
                            <div class="album-art">
                                <img id="coverImage" class="cover-image" src="" alt="Cover" style="display:none;" />
                                <div class="album-art-placeholder" id="coverPlaceholder">
                                    <!-- No icon -->
                                </div>
                            </div>
                            <div class="track-info">
                                <h2 id="trackTitle">No track selected</h2>
                                <p id="trackArtist">Unknown Artist</p>
                                <div class="track-progress">
                                    <span id="currentTime">0:00</span>
                                    <div class="progress-bar">
                                        <div id="progressFill" class="progress-fill"></div>
                                        <input type="range" id="progressSlider" min="0" max="100" value="0" class="progress-slider">
                                    </div>
                                    <span id="duration">0:00</span>
                                </div>
                            </div>
                        </div>

                        <div class="controls-section">
                            <div class="main-controls">
                                <button id="prevBtn" class="control-btn" title="Previous">
                                    <i class="fas fa-step-backward"></i>
                                </button>
                                <button id="playPauseBtn" class="control-btn play-pause" title="Play">
                                    <i class="fas fa-play"></i>
                                </button>
                                <button id="nextBtn" class="control-btn" title="Next">
                                    <i class="fas fa-step-forward"></i>
                                </button>
                            </div>
                            <div class="volume-control">
                                <i class="fas fa-volume-up"></i>
                                <input type="range" id="volumeSlider" min="0" max="100" value="70" class="volume-slider">
                            </div>
                        </div>

                        <div class="playlist-section">
                            <div class="playlist-header">
                                <h3>Playlist</h3>
                            </div>
                            <div id="playlistContainer" class="playlist-container">
                                <!-- Playlist items will be loaded here -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        setupEventListeners() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const element = window.element;

            // Control buttons
            element.querySelector('#playPauseBtn')?.addEventListener('click', () => this.togglePlayPause());
            element.querySelector('#prevBtn')?.addEventListener('click', () => this.previousTrack());
            element.querySelector('#nextBtn')?.addEventListener('click', () => this.nextTrack());
            element.querySelector('#shuffleBtn')?.addEventListener('click', () => this.toggleShuffle());
            element.querySelector('#repeatBtn')?.addEventListener('click', () => this.toggleRepeat());
            element.querySelector('#loadMusicBtn')?.addEventListener('click', () => this.loadMusicFolder());

            // Sliders
            const progressSlider = element.querySelector('#progressSlider');
            const volumeSlider = element.querySelector('#volumeSlider');

            progressSlider?.addEventListener('input', (e) => this.seekTo(e.target.value));
            volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value / 100));

            // Audio events
            if (this.audio) {
                this.audio.addEventListener('timeupdate', () => this.updateProgress());
                this.audio.addEventListener('ended', () => this.onTrackEnded());
                this.audio.addEventListener('loadedmetadata', () => this.onTrackLoaded());
            }
        }

        async loadTrack(fileName, filePath) {
            try {
                if (this.audio) {
                    this.audio.pause();
                    this.audio = null;
                }

                this.audio = new Audio(filePath);
                this.currentTrack = {
                    name: fileName,
                    path: filePath,
                    title: fileName.replace(/\.[^/.]+$/, ""),
                    artist: "Unknown Artist"
                };

                this.setupAudioEvents();
                this.updateTrackInfo();
                this.updatePlayButton();
                this.updateCoverImage();

                // Add to playlist if not already there
                const existingIndex = this.playlist.findIndex(track => track.path === filePath);
                if (existingIndex === -1) {
                    this.playlist.push(this.currentTrack);
                    this.currentIndex = this.playlist.length - 1;
                } else {
                    this.currentIndex = existingIndex;
                }

                this.renderPlaylist();
                console.log('✅ Track loaded:', fileName);
            } catch (error) {
                console.error('❌ Error loading track:', error);
            }
        }

        async loadDefaultPlaylist() {
            try {
                // Load sample music files
                const musicFiles = [
                    { name: 'sample.mp3', path: 'home/Music/sample.mp3' },
                    { name: 'song.wav', path: 'home/Music/song.wav' }
                ];

                this.playlist = musicFiles.map(file => ({
                    name: file.name,
                    path: file.path,
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    artist: "Sample Artist"
                }));

                if (this.playlist.length > 0) {
                    this.currentIndex = 0;
                    await this.loadCurrentTrack();
                }

                this.renderPlaylist();
            } catch (error) {
                console.error('❌ Error loading default playlist:', error);
            }
        }

        async loadCurrentTrack() {
            if (this.playlist.length > 0 && this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
                const track = this.playlist[this.currentIndex];
                await this.loadTrack(track.name, track.path);
            }
        }

        setupAudioEvents() {
            if (!this.audio) return;

            this.audio.addEventListener('timeupdate', () => this.updateProgress());
            this.audio.addEventListener('ended', () => this.onTrackEnded());
            this.audio.addEventListener('loadedmetadata', () => this.onTrackLoaded());
            this.audio.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                this.onTrackError();
            });
        }

        togglePlayPause() {
            if (!this.audio) return;

            if (this.isPlaying) {
                this.audio.pause();
                this.isPlaying = false;
            } else {
                this.audio.play().catch(error => {
                    console.error('Error playing audio:', error);
                });
                this.isPlaying = true;
            }

            this.updatePlayButton();
        }

        previousTrack() {
            if (this.playlist.length === 0) return;

            if (this.isShuffled) {
                this.currentIndex = Math.floor(Math.random() * this.playlist.length);
            } else {
                this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
            }

            this.loadCurrentTrack();
        }

        nextTrack() {
            if (this.playlist.length === 0) return;

            if (this.isShuffled) {
                this.currentIndex = Math.floor(Math.random() * this.playlist.length);
            } else {
                this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
            }

            this.loadCurrentTrack();
        }

        toggleShuffle() {
            this.isShuffled = !this.isShuffled;
            const shuffleBtn = document.querySelector('#shuffleBtn');
            if (shuffleBtn) {
                shuffleBtn.classList.toggle('active', this.isShuffled);
            }
        }

        toggleRepeat() {
            this.isRepeating = !this.isRepeating;
            const repeatBtn = document.querySelector('#repeatBtn');
            if (repeatBtn) {
                repeatBtn.classList.toggle('active', this.isRepeating);
            }
        }

        seekTo(percentage) {
            if (!this.audio) return;
            const time = (percentage / 100) * this.audio.duration;
            this.audio.currentTime = time;
        }

        setVolume(volume) {
            this.volume = volume;
            if (this.audio) {
                this.audio.volume = volume;
            }
        }

        updateProgress() {
            if (!this.audio) return;

            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            this.currentTime = this.audio.currentTime;
            this.duration = this.audio.duration || 0;

            const progressFill = window.element.querySelector('#progressFill');
            const progressSlider = window.element.querySelector('#progressSlider');
            const currentTimeEl = window.element.querySelector('#currentTime');

            if (this.duration > 0) {
                const percentage = (this.currentTime / this.duration) * 100;
                if (progressFill) progressFill.style.width = `${percentage}%`;
                if (progressSlider) progressSlider.value = percentage;
            }

            if (currentTimeEl) {
                currentTimeEl.textContent = this.formatTime(this.currentTime);
            }
        }

        onTrackEnded() {
            if (this.isRepeating) {
                this.audio.currentTime = 0;
                this.audio.play();
            } else {
                this.nextTrack();
            }
        }

        onTrackLoaded() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const durationEl = window.element.querySelector('#duration');
            if (durationEl && this.audio) {
                durationEl.textContent = this.formatTime(this.audio.duration || 0);
            }
        }

        onTrackError() {
            console.error('Failed to load audio track');
            this.isPlaying = false;
            this.updatePlayButton();
        }

        updateTrackInfo() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window || !this.currentTrack) return;

            const titleEl = window.element.querySelector('#trackTitle');
            const artistEl = window.element.querySelector('#trackArtist');

            if (titleEl) titleEl.textContent = this.currentTrack.title;
            if (artistEl) artistEl.textContent = this.currentTrack.artist;
            this.updateCoverImage();
        }

        updatePlayButton() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const playPauseBtn = window.element.querySelector('#playPauseBtn');
            const icon = playPauseBtn?.querySelector('i');

            if (icon) {
                icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
            }
            if (playPauseBtn) {
                playPauseBtn.title = this.isPlaying ? 'Pause' : 'Play';
            }
        }

        renderPlaylist() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const container = window.element.querySelector('#playlistContainer');
            if (!container) return;

            if (this.playlist.length === 0) {
                container.innerHTML = '<div class="playlist-empty">No tracks in playlist</div>';
                return;
            }

            container.innerHTML = this.playlist.map((track, index) => `
                <div class="playlist-item ${index === this.currentIndex ? 'active' : ''}" 
                     onclick="window.prismAppInstance.selectTrack(${index})">
                    <div class="track-icon">
                        <i class="fas ${index === this.currentIndex && this.isPlaying ? 'fa-volume-up' : 'fa-music'}"></i>
                    </div>
                    <div class="track-details">
                        <div class="track-name">${track.title}</div>
                        <div class="track-artist">${track.artist}</div>
                    </div>
                    <div class="track-duration">
                        ${this.formatTime(0)}
                    </div>
                </div>
            `).join('');
        }

        selectTrack(index) {
            if (index >= 0 && index < this.playlist.length) {
                this.currentIndex = index;
                this.loadCurrentTrack();
            }
        }

        loadMusicFolder() {
            // This would typically open a file dialog
            // For now, we'll just reload the default playlist
            this.loadDefaultPlaylist();
        }

        formatTime(seconds) {
            if (!seconds || isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        getFooterText() {
            if (this.currentTrack) {
                return `Playing: ${this.currentTrack.title} | ${this.playlist.length} tracks`;
            }
            return `${this.playlist.length} tracks in playlist`;
        }

        close() {
            if (this.audio) {
                this.audio.pause();
                this.audio = null;
            }

            if (this.windowId && this.windowManager) {
                this.windowManager.closeWindow(this.windowId);
            }
            
            if (window.prismAppInstance === this) {
                window.prismAppInstance = null;
            }
            
            console.log('🎵 Prism app closed');
    }

    updateCoverImage() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window || !this.currentTrack) return;
        const coverImg = window.element.querySelector('#coverImage');
        const placeholder = window.element.querySelector('#coverPlaceholder');
        let fileNameNoExt = this.currentTrack.name.replace(/\.[^/.]+$/, "");
        // Encode for URL (spaces, special chars)
        const encodedName = encodeURIComponent(fileNameNoExt);
        const coverJpg = `covers/${encodedName}.jpg`;
        const coverPng = `covers/${encodedName}.png`;
        function setCover(src) {
            coverImg.src = src;
            coverImg.style.display = '';
            if (placeholder) placeholder.style.display = 'none';
        }
        function hideCover() {
            coverImg.src = '';
            coverImg.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
        }
        // Preload image to check if it exists
        const testImg = new window.Image();
        testImg.onload = () => setCover(testImg.src);
        testImg.onerror = () => {
            // Try png if jpg failed
            if (testImg.src.endsWith('.jpg')) {
                testImg.src = coverPng;
            } else {
                hideCover();
            }
        };
        testImg.src = coverJpg;
        }
    }

    window.PrismApp = PrismApp;
}

