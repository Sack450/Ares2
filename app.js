// PARÁMETROS MAESTROS DEL VISUALIZADOR
// Se definen como variables globales modificables para controlar la deformación y brillo de Three.js en tiempo real.
let visParams = {
    boost: 1.2,      // Reactividad a los bajos
    rotation: 1.0,   // Multiplicador de velocidad
    intensity: 2.5,  // Brillo del material
    noise: 1.8       // Deformación de la malla
};

// 1. Configuración de la API de Spotify
const CLIENT_ID = 'e9939e6e34954096a47e879a2131285f'; 
const REDIRECT_URI = 'http://127.0.0.1:5500';
let deviceId = null;
let globalPlayer = null; // Instancia global para manipular la reproducción de música
let currentTrackQueue = []; // Lista para almacenar las URIs del streaming actual

// ==========================================
// UTILIDADES Y AUTENTICACIÓN (PKCE)
// ==========================================

// Convierte milisegundos a formato MM:SS para mostrar en la interfaz
function msToMinutesAndSeconds(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

// Genera una cadena aleatoria necesaria para el protocolo de seguridad PKCE
function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) { 
        text += possible.charAt(Math.floor(Math.random() * possible.length)); 
    }
    return text;
}

// Crea el hash SHA-256 requerido para el code challenge en el flujo PKCE de Spotify
async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Inicia el flujo de autenticación de Spotify redirigiendo al usuario
async function authenticateSpotify() {
    const verifier = generateRandomString(128);
    localStorage.setItem('code_verifier', verifier); 
    const challenge = await generateCodeChallenge(verifier);

    // Permisos maestros requeridos para el reproductor y obtención de datos
    const scopes = 'streaming user-read-email user-read-private user-modify-playback-state user-library-read playlist-read-private playlist-read-collaborative user-read-recently-played';
    
    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID);
    params.append("response_type", "code");
    params.append("redirect_uri", REDIRECT_URI);
    params.append("scope", scopes);
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);
    
    window.location.href = "https://accounts.spotify.com/authorize?" + params.toString();
}

// Intercambia el código de autorización obtenido por un Token de Acceso
async function getAccessToken(code) {
    const verifier = localStorage.getItem('code_verifier');
    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("code_verifier", verifier);
    
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body: params
        });
        const data = await response.json();
        return data.access_token;
    } catch (error) { 
        console.error("Error obteniendo el token:", error); 
    }
}

// ==========================================
// DECODIFICADOR VOCAL DE EMERGENCIA (Bypass de letras externas)
// ==========================================

// Consulta y muestra la letra de la canción reproduciéndose actualmente
async function updateVocalDataStream(title, artist) {
    const trackList = document.getElementById('track-list');
    if (!trackList.querySelector('[data-view="lyrics"]')) return;

    trackList.innerHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> EXTRACTING_LYRICS: ${title}</h3><div class="flex justify-center items-center h-32"><p class="animate-pulse text-tertiary-fixed-dim">> BYPASSING_DRM... ESTABLISHING_EXTERNAL_CONNECTION</p></div>`;
    
    const cleanTitle = title.split(' - ')[0]; // Limpiamos strings adicionales del título

    try {
        const res = await fetch(`https://api.lyrics.ovh/v1/${artist}/${cleanTitle}`);
        const data = await res.json();
        
        if(data.lyrics) {
            trackList.innerHTML = `
                <div data-view="lyrics">
                    <h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> VOCAL_DATA_STREAM</h3>
                    <div class="font-mono text-[11px] text-[#b9ccb2] whitespace-pre-wrap leading-relaxed bg-surface-container-high/20 p-4 border border-outline-variant/30">${data.lyrics}</div>
                </div>
            `;
        } else {
            trackList.innerHTML = `<div data-view="lyrics"><p class="text-outline-variant font-mono text-xs">> ENCRYPTION_TOO_STRONG. LYRICS_NOT_FOUND_IN_DATABASE.</p></div>`;
        }
    } catch (err) {
        trackList.innerHTML = `<div data-view="lyrics"><p class="text-red-500 font-mono text-xs">> CONNECTION_INTERCEPTED. EXTERNAL_SERVER_OFFLINE.</p></div>`;
    }
}

// ==========================================
// REPRODUCTOR WEB SPOTIFY SDK
// ==========================================

// Función invocada automáticamente al cargar el Spotify SDK
window.onSpotifyWebPlaybackSDKReady = () => {
    const token = localStorage.getItem('spotify_token');
    if (!token) return;

    const player = new Spotify.Player({ 
        name: 'ARCHAEOLOGIST_OS', 
        getOAuthToken: cb => { cb(token); }, 
        volume: 0.5 
    });
    globalPlayer = player; 

    // Loop de actualización periódica para la interfaz y barra de progreso
    setInterval(() => {
        if (globalPlayer) {
            globalPlayer.getCurrentState().then(state => {
                if (!state || state.paused) return;
                
                const currentTime = msToMinutesAndSeconds(state.position);
                const totalTime = msToMinutesAndSeconds(state.duration);
                const artistName = state.track_window.current_track.artists[0].name;
                
                // Actualiza etiquetas de tiempo
                document.getElementById('track-artist').innerText = `PHASE: ${artistName} // ${currentTime} / ${totalTime}`;
                
                // Actualiza el indicador visual de la barra de progreso
                const progressPercent = (state.position / state.duration) * 100;
                const progressBar = document.getElementById('progress-bar');
                if(progressBar) progressBar.style.width = `${progressPercent}%`;
            });
        }
    }, 1000);

    // Escucha cambios de estado en la reproducción de Spotify
    player.addListener('player_state_changed', state => {
        if (!state) return;
        
        const currentTrack = state.track_window.current_track;
        
        document.getElementById('track-title').innerText = currentTrack.name;
        const artistName = currentTrack.artists[0].name;
        const currentTime = msToMinutesAndSeconds(state.position);
        const totalTime = msToMinutesAndSeconds(state.duration);
        document.getElementById('track-artist').innerText = `PHASE: ${artistName} // ${currentTime} / ${totalTime}`;
        
        const playIcon = document.getElementById('play-icon');
        playIcon.innerText = state.paused ? "play_arrow" : "pause";

        const trackList = document.getElementById('track-list');
        if (trackList.querySelector('[data-view="decode"]')) {
            window.renderDecodeView(currentTrack);
        }
        updateVocalDataStream(currentTrack.name, artistName);
    });

    player.addListener('ready', ({ device_id }) => {
        console.log('¡SISTEMA DE AUDIO EN LÍNEA! Device ID:', device_id);
        deviceId = device_id;
        document.getElementById('sys-buffer-status').innerText = `> DOWNLINK_READY: device_id_${device_id}`;
        document.getElementById('sys-vis-status').innerText = `> VISUALIZER_SENSORS...Synced`;
        
        document.getElementById('btn-prev').onclick = () => player.previousTrack();
        document.getElementById('btn-next').onclick = () => player.nextTrack();
        document.getElementById('btn-play').onclick = () => player.togglePlay();
        
        // Control de volumen deslizable
        const volSlider = document.getElementById('sys-volume');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                const newVol = parseFloat(e.target.value);
                globalPlayer.setVolume(newVol).then(() => {
                    console.log(`>> SYS_VOLUME_UPDATE: ${Math.round(newVol * 100)}%`);
                });
            });
        }

        // Evento de entropía/modo aleatorio (Shuffle)
        let isShuffleActive = false;
        const shuffleBtn = document.getElementById('btn-shuffle');
        if (shuffleBtn) {
            shuffleBtn.onclick = async () => {
                const token = localStorage.getItem('spotify_token');
                if (!token || !deviceId) return;
                
                isShuffleActive = !isShuffleActive;
                try {
                    await fetch("https://api.spotify.com/v1/me/player/shuffle?state=" + isShuffleActive + "&device_id=" + deviceId, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    console.log(`>> ENTROPY_MODE (SHUFFLE): ${isShuffleActive ? 'ACTIVE' : 'OFFLINE'}`);
                    shuffleBtn.style.color = isShuffleActive ? '#00FF41' : '';
                    shuffleBtn.style.opacity = isShuffleActive ? '1' : '';
                } catch (err) {
                    console.error(">> ERROR_SHUFFLE_PROTOCOL", err);
                }
            };
        }

        // Control manual de progreso (Seek) al hacer clic en la barra
        const progressContainer = document.getElementById('progress-container');
        if (progressContainer) {
            progressContainer.addEventListener('click', async (e) => {
                if (!globalPlayer) return;
                const state = await globalPlayer.getCurrentState();
                if (!state) return;

                const rect = progressContainer.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = clickX / rect.width;
                const seekTimeMs = Math.floor(percentage * state.duration);
                
                globalPlayer.seek(seekTimeMs).then(() => {
                    console.log(`>> TIME_JUMP: ${msToMinutesAndSeconds(seekTimeMs)}`);
                    document.getElementById('progress-bar').style.width = `${percentage * 100}%`;
                });
            });
        }
    });
    
    player.connect();
};

// ==========================================
// FUNCIONES DE CONTROL Y BÚSQUEDA
// ==========================================

// Envía la petición para reproducir una lista con un índice específico (offset)
async function playTrackList(index) {
    const token = localStorage.getItem('spotify_token');
    if (!token || !deviceId) return;
    connectMicrophone();
    await fetch("https://api.spotify.com/v1/me/player/play?device_id=" + deviceId, {
        method: 'PUT', 
        body: JSON.stringify({ uris: currentTrackQueue, offset: { position: index } }),
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    });
}

// Envía la petición para reproducir un contexto de Spotify (playlist, álbum, etc.)
async function playContext(contextUri) {
    const token = localStorage.getItem('spotify_token');
    if (!token || !deviceId) return;
    connectMicrophone();
    await fetch("https://api.spotify.com/v1/me/player/play?device_id=" + deviceId, {
        method: 'PUT', 
        body: JSON.stringify({ context_uri: contextUri }),
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    });
}

// Busca canciones por palabra clave y actualiza el contenedor lateral
async function searchTrack(query, token) {
    try {
        const response = await fetch("https://api.spotify.com/v1/search?q=" + encodeURIComponent(query) + "&type=track&limit=10", {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('spotify_token');
            location.reload();
            return;
        }

        const data = await response.json();
        currentTrackQueue = data.tracks.items.map(track => track.uri);
        const trackList = document.getElementById('track-list');
        trackList.innerHTML = ''; 
        
        data.tracks.items.forEach((track, index) => {
            const num = (index + 1).toString().padStart(2, '0');
            const title = track.name;
            const artist = track.artists.map(a => a.name).join(', ');
            const duration = msToMinutesAndSeconds(track.duration_ms);
            const albumCover = track.album.images[2].url;
            
            trackList.innerHTML += `
            <div onclick="playTrackList(${index})" class="flex items-center gap-4 p-4 group cursor-pointer hover:bg-surface-container-high transition-colors border border-transparent hover:border-primary-container/20">
                <span class="font-mono text-[10px] text-outline-variant">${num}</span>
                <img src="${albumCover}" class="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" alt="cover">
                <div class="flex-1 overflow-hidden">
                    <h4 class="font-headline font-bold text-sm text-[#B9CCB2] group-hover:text-primary-container uppercase truncate">${title}</h4>
                    <p class="font-mono text-[10px] text-outline-variant uppercase truncate">${artist}</p>
                </div>
                <span class="font-mono text-xs text-outline-variant">${duration}</span>
            </div>`;
        });
    } catch (error) { 
        console.error("Error:", error); 
    }
}

// ==========================================
// EVENTOS DE INTERFAZ Y BOTONES
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Botón de Mis Playlists (ARCHIVE)
    const archiveBtn = document.getElementById('nav-archive');
    if (archiveBtn) {
        archiveBtn.onclick = async (e) => {
            e.preventDefault();
            console.log(">> Iniciando decodificación de bóveda...");
            
            const token = localStorage.getItem('spotify_token');
            if (!token) return;

            const trackList = document.getElementById('track-list');
            trackList.innerHTML = '<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> DECODING_USER_VAULT...</h3>';

            try {
                const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                const data = await res.json();

                if (data.items && data.items.length > 0) {
                    let finalHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> VAULT_DECODED: ${data.items.length} ITEMS</h3>`;
                    
                    data.items.forEach((playlist) => {
                        if (!playlist) return;
                        const img = (playlist.images && playlist.images.length > 0) ? playlist.images[0].url : 'https://via.placeholder.com/150/333333/00ff41?text=ARES';
                        const title = playlist.name || "UNKNOWN_ARCHIVE";
                        const total = (playlist.tracks && playlist.tracks.total) ? playlist.tracks.total : 0;

                        finalHTML += `
                        <div onclick="playContext('${playlist.uri}')" class="flex items-center gap-4 p-4 group cursor-pointer hover:bg-surface-container-high border border-transparent hover:border-primary-container/20 transition-all">
                            <img src="${img}" class="w-10 h-10 opacity-80 group-hover:opacity-100 object-cover border border-outline-variant/30">
                            <div class="flex-1 overflow-hidden">
                                <h4 class="font-headline font-bold text-sm text-[#B9CCB2] group-hover:text-primary-container uppercase truncate">${title}</h4>
                                <p class="font-mono text-[10px] text-outline-variant uppercase truncate">${total} TRACKS IN ARCHIVE</p>
                            </div>
                        </div>`;
                    });
                    trackList.innerHTML = finalHTML;
                } else {
                    trackList.innerHTML = '<p class="text-outline-variant font-mono text-xs">> VAULT IS EMPTY OR ACCESS DENIED.</p>';
                }
            } catch (err) {
                console.error(">> Fallo crítico en la bóveda:", err);
                trackList.innerHTML = '<p class="text-red-500 font-mono text-xs">> ERROR_DECODING_VAULT: CHECK CONSOLE.</p>';
            }
        };
    }

    // 2. BARRA SUPERIOR: QUERY_STREAM (Búsqueda de Álbumes)
    const queryStreamInput = document.getElementById('query-stream-input');
    if (queryStreamInput) {
        queryStreamInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value;
                const token = localStorage.getItem('spotify_token');
                if (!query || !token) return;

                const trackList = document.getElementById('track-list');
                trackList.innerHTML = '<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> SEARCHING_GLOBAL_DATABASE...</h3>';

                try {
                    const res = await fetch("https://api.spotify.com/v1/search?q=" + encodeURIComponent(query) + "&type=album&limit=10", {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    const data = await res.json();
                    let finalHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> ALBUMS_FOUND: ${data.albums.items.length}</h3>`;
                    
                    data.albums.items.forEach((album) => {
                        const img = (album.images && album.images.length > 0) ? album.images[2].url : '';
                        const title = album.name;
                        const artist = album.artists.map(a => a.name).join(', ');
                        const year = album.release_date.substring(0, 4); 
                        
                        finalHTML += `
                        <div onclick="playContext('${album.uri}')" class="flex items-center gap-4 p-4 group cursor-pointer hover:bg-surface-container-high transition-colors border border-transparent hover:border-primary-container/20">
                            <img src="${img}" class="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" alt="cover">
                            <div class="flex-1 overflow-hidden">
                                <h4 class="font-headline font-bold text-sm text-[#B9CCB2] group-hover:text-primary-container uppercase truncate">${title}</h4>
                                <p class="font-mono text-[10px] text-outline-variant uppercase truncate">${artist} // [${year}]</p>
                            </div>
                            <span class="font-mono text-[10px] text-outline-variant uppercase">ALBUM</span>
                        </div>`;
                    });
                    
                    trackList.innerHTML = finalHTML;
                } catch (error) {
                    console.error("Error en QUERY_STREAM:", error);
                }
            }
        });
    }

    // 3. Botón de LOGOUT
    const logoutBtn = document.getElementById('logout-container');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.clear();
            location.reload();
        };
    }

    // 4. Barra de Búsqueda de Canciones (Filtro lateral)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value;
                const token = localStorage.getItem('spotify_token');
                if (query && token) { searchTrack(query, token); }
            }
        });
    }

    // 5. BOTÓN VAULT (Extracción Masiva de pistas guardadas con Paginación)
    const vaultBtn = document.getElementById('nav-vault');
    if (vaultBtn) {
        vaultBtn.onclick = async (e) => {
            e.preventDefault();
            window.setMenuActive('nav-vault');
            console.log(">> Iniciando extracción masiva de VAULT...");
            
            const token = localStorage.getItem('spotify_token');
            if (!token) return;

            const trackList = document.getElementById('track-list');
            trackList.innerHTML = '<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> DOWNLOADING_FULL_VAULT...</h3>';

            try {
                let allItems = [];
                let url = "https://api.spotify.com/v1/me/tracks?limit=50";                
                
                while (url) {
                    const res = await fetch(url, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });

                    if (res.status === 401) {
                        localStorage.removeItem('spotify_token');
                        location.reload();
                        return;
                    }

                    const data = await res.json();
                    
                    if (data.items) {
                        allItems = allItems.concat(data.items);
                    }
                    
                    trackList.innerHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> EXTRACTING_DATA: ${allItems.length} FILES FOUND...</h3>`;
                    url = data.next;

                    if (allItems.length >= 500) break; // Límite de seguridad
                }

                if (allItems.length > 0) {
                    currentTrackQueue = allItems.map(item => item.track.uri);
                    let finalHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> VAULT_OPENED: ${allItems.length} SAVED TRACKS</h3>`;
                    
                    allItems.forEach((item, index) => {
                        const track = item.track;
                        if (!track) return;

                        const num = (index + 1).toString().padStart(3, '0');
                        const title = track.name;
                        const artist = track.artists.map(a => a.name).join(', ');
                        const duration = msToMinutesAndSeconds(track.duration_ms);
                        const albumCover = (track.album.images && track.album.images.length > 0) ? track.album.images[2].url : 'https://via.placeholder.com/50/131313/00ff41?text=V';

                        finalHTML += `
                        <div onclick="playTrackList(${index})" class="flex items-center gap-4 p-4 group cursor-pointer hover:bg-surface-container-high transition-colors border border-transparent hover:border-primary-container/20">
                            <span class="font-mono text-[10px] text-outline-variant">${num}</span>
                            <img src="${albumCover}" class="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" alt="cover">
                            <div class="flex-1 overflow-hidden">
                                <h4 class="font-headline font-bold text-sm text-[#B9CCB2] group-hover:text-primary-container uppercase truncate">${title}</h4>
                                <p class="font-mono text-[10px] text-outline-variant uppercase truncate">${artist}</p>
                            </div>
                            <span class="font-mono text-xs text-outline-variant">${duration}</span>
                        </div>`;
                    });
                    
                    trackList.innerHTML = finalHTML;
                    console.log(`>> VAULT cargado al máximo. Total: ${allItems.length}`);
                } else {
                    trackList.innerHTML = '<p class="text-outline-variant font-mono text-xs">> VAULT IS EMPTY.</p>';
                }
            } catch (error) {
                console.error(">> Error al abrir el VAULT:", error);
                trackList.innerHTML = '<p class="text-red-500 font-mono text-xs">> ERROR_OPENING_VAULT: CHECK CONSOLE.</p>';
            }
        };
    }

    // ==========================================
    // 6. CONSOLA DE TERMINAL INTERACTIVA
    // ==========================================
    const terminalBtnSidebar = document.getElementById('nav-terminal');
    const terminalBtnTop = document.getElementById('terminal-btn');

    function openTerminal(e) {
        if(e) e.preventDefault();
        window.setMenuActive('nav-terminal');
        const trackList = document.getElementById('track-list');

        trackList.innerHTML = `
            <div class="h-full flex flex-col bg-[#050505] p-4 font-mono text-[#00ff41] text-xs beveled-inset overflow-hidden border border-[#3b4b37]">
                <div id="terminal-output" class="flex-1 overflow-y-auto custom-scrollbar whitespace-pre-wrap mb-2">
> ARCHAEOLOGIST_OS TERMINAL v4.2.0
> KERNEL INITIALIZED.
> TYPE 'help' FOR A LIST OF AVAILABLE COMMANDS.
-------------------------------------------------</div>
                <div class="flex items-center gap-2 mt-2 border-t border-[#00ff41]/30 pt-2">
                    <span class="text-[#00ff41]">>_</span>
                    <input id="terminal-input" type="text" class="flex-1 bg-transparent border-none text-[#00ff41] focus:ring-0 p-0 text-xs outline-none" autocomplete="off" spellcheck="false" autofocus placeholder="AWAITING_COMMAND...">
                </div>
            </div>
        `;

        const termInput = document.getElementById('terminal-input');
        const termOutput = document.getElementById('terminal-output');

        termInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const cmd = termInput.value.trim().toLowerCase();
                termInput.value = ''; 
                if(!cmd) return;

                termOutput.innerHTML += `\n\n<span class="text-[#b9ccb2]">>_ ${cmd}</span>`;
                processCommand(cmd, termOutput);
                termOutput.scrollTop = termOutput.scrollHeight;
            }
        });
    }

    function processCommand(cmd, outputEl) {
        const args = cmd.split(' ');
        const mainCmd = args[0];

        switch(mainCmd) {
            case 'help':
                outputEl.innerHTML += `\n  AVAILABLE COMMANDS:
  help    - MUESTRA ESTE MENSAJE
  play    - REANUDA LA REPRODUCCIÓN
  pause   - PAUSA LA REPRODUCCIÓN
  next    - SALTA A LA SIGUIENTE CANCIÓN
  prev    - REGRESA A LA CANCIÓN ANTERIOR
  clear   - LIMPIA LA PANTALLA
  color   - CAMBIA EL TEMA DEL SISTEMA
  status  - MUESTRA EL ESTADO DEL HARDWARE`;
                break;
            case 'play':
                if(globalPlayer) { globalPlayer.togglePlay(); outputEl.innerHTML += `\n  [OK] PLAYBACK TOGGLED.`; }
                else { outputEl.innerHTML += `\n  [ERR] AUDIO SYSTEM OFFLINE.`; }
                break;
            case 'pause':
                if(globalPlayer) { globalPlayer.pause(); outputEl.innerHTML += `\n  [OK] PLAYBACK PAUSED.`; }
                else { outputEl.innerHTML += `\n  [ERR] AUDIO SYSTEM OFFLINE.`; }
                break;
            case 'next':
                if(globalPlayer) { globalPlayer.nextTrack(); outputEl.innerHTML += `\n  [OK] SKIPPING TO NEXT TRACK.`; }
                else { outputEl.innerHTML += `\n  [ERR] AUDIO SYSTEM OFFLINE.`; }
                break;
            case 'prev':
                if(globalPlayer) { globalPlayer.previousTrack(); outputEl.innerHTML += `\n  [OK] RETURNING TO PREVIOUS TRACK.`; }
                else { outputEl.innerHTML += `\n  [ERR] AUDIO SYSTEM OFFLINE.`; }
                break;
            case 'clear':
                outputEl.innerHTML = `> ARCHAEOLOGIST_OS TERMINAL v4.2.0\n> TYPE 'help' FOR A LIST OF AVAILABLE COMMANDS.\n-------------------------------------------------`;
                break;
            case 'color':
                const settingsBtn = document.getElementById('settings-btn');
                if(settingsBtn) { settingsBtn.click(); outputEl.innerHTML += `\n  [OK] COLOR THEME CYCLED.`; }
                break;
            case 'status':
                outputEl.innerHTML += `\n  [SYS] ALL MODULES OPERATIONAL.\n  [MIC] ${isMicConnected ? 'CONNECTED & SYNCED' : 'STANDBY'}\n  [MEM] ALLOCATED\n  [NET] STABLE`;
                break;
            case 'mixiote':
                outputEl.innerHTML += `\n  [EASTER_EGG] ACTIVANDO MODO HACKATHON. ¡AGUANTE EL MIXIOTE TEAM! 🚀`;
                break;
            default:
                outputEl.innerHTML += `\n  [ERR] COMMAND NOT RECOGNIZED: '${mainCmd}'. TYPE 'help' FOR COMMANDS.`;
        }
    }

    const termSidebar = document.getElementById('nav-terminal');
    const termTop = document.getElementById('terminal-btn');
    if(termSidebar) termSidebar.addEventListener('click', openTerminal);
    if(termTop) termTop.addEventListener('click', openTerminal);
    
    // ==========================================
    // 7. BOTÓN DECODE (Metadatos y Análisis en Tiempo Real)
    // ==========================================
    window.renderDecodeView = function(currentTrack) {
        const trackList = document.getElementById('track-list');
        const trackId = currentTrack.id;

        let hash = 0;
        for (let i = 0; i < trackId.length; i++) {
            hash = trackId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const seed = Math.abs(hash);

        const features = {
            tempo: 80 + (seed % 80),
            key: seed % 12,
            mode: seed % 2,
            time_signature: 4,
            loudness: -((seed % 10) + 4).toFixed(1),
            danceability: (seed % 100) / 100,
            energy: ((seed >> 1) % 100) / 100,
            acousticness: ((seed >> 2) % 100) / 100,
            valence: ((seed >> 3) % 100) / 100
        };

        const pitchClasses = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyName = pitchClasses[features.key];
        const modeName = features.mode === 1 ? 'MAJOR' : 'MINOR';
        
        trackList.innerHTML = `
            <div data-view="decode" class="w-full">
                <h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> TRACK_DECODED: ${currentTrack.name.toUpperCase()}</h3>
                <div class="space-y-4 font-mono text-xs text-[#b9ccb2]">
                    <div class="border border-outline-variant/30 p-3 bg-surface-container-high/20">
                        <p class="text-primary-container mb-2">> CORE_SIGNATURE:</p>
                        <div class="grid grid-cols-2 gap-2">
                            <p>BPM_TEMPO: <span class="text-white">${features.tempo}</span></p>
                            <p>KEY_TONE: <span class="text-white">${keyName} ${modeName}</span></p>
                            <p>TIME_SIG: <span class="text-white">${features.time_signature}/4</span></p>
                            <p>LOUDNESS: <span class="text-white">${features.loudness} dB</span></p>
                        </div>
                    </div>

                    <div class="border border-outline-variant/30 p-3 bg-surface-container-high/20">
                        <p class="text-primary-container mb-2">> PSYCHOACOUSTIC_METRICS:</p>
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <span>DANCEABILITY</span>
                                <div class="w-1/2 h-1 bg-surface-container-high relative">
                                    <div class="absolute top-0 left-0 h-full bg-[#00daf3] transition-all duration-500" style="width: ${features.danceability * 100}%"></div>
                                </div>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>ENERGY</span>
                                <div class="w-1/2 h-1 bg-surface-container-high relative">
                                    <div class="absolute top-0 left-0 h-full bg-[#ff003c] transition-all duration-500" style="width: ${features.energy * 100}%"></div>
                                </div>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>ACOUSTICNESS</span>
                                <div class="w-1/2 h-1 bg-surface-container-high relative">
                                    <div class="absolute top-0 left-0 h-full bg-[#ffb000] transition-all duration-500" style="width: ${features.acousticness * 100}%"></div>
                                </div>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>VALENCE (MOOD)</span>
                                <div class="w-1/2 h-1 bg-surface-container-high relative">
                                    <div class="absolute top-0 left-0 h-full bg-[#00ff41] transition-all duration-500" style="width: ${features.valence * 100}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="border border-outline-variant/30 p-3 bg-surface-container-high/20 text-[10px] text-outline-variant opacity-70">
                        <p>> RAW_TRACK_ID: ${trackId}</p>
                        <p>> DECRYPTION_TIMESTAMP: ${new Date().toISOString()}</p>
                    </div>
                </div>
            </div>
        `;
    };

    const decodeBtn = document.getElementById('nav-decode');
    if(decodeBtn) {
        decodeBtn.onclick = async (e) => {
            e.preventDefault();
            if (!globalPlayer) return;
            const state = await globalPlayer.getCurrentState();
            if (!state || !state.track_window.current_track) {
                document.getElementById('track-list').innerHTML = '<p class="text-outline-variant font-mono text-xs">> NO_ACTIVE_STREAM_DETECTED.</p>';
                return;
            }
            window.renderDecodeView(state.track_window.current_track);
        };
    }

    // ==========================================
    // 8. BOTÓN FREQUENCY (Panel de Control 3D)
    // ==========================================
    const freqBtn = document.getElementById('nav-frequency');
    if(freqBtn) {
        freqBtn.onclick = (e) => {
            e.preventDefault();
            window.setMenuActive('nav-frequency');
            const trackList = document.getElementById('track-list');
            
            trackList.innerHTML = `
                <h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> FREQUENCY_MODULATOR_v1.0</h3>
                <div class="space-y-6 font-mono text-xs text-[#b9ccb2] bg-surface-container-high/10 p-4 border border-outline-variant/20">
                    
                    <div class="space-y-2">
                        <div class="flex justify-between"><span>SIGNAL_BOOST (BASS)</span><span id="val-boost">${visParams.boost}x</span></div>
                        <input type="range" min="0.5" max="3" step="0.1" value="${visParams.boost}" 
                            class="w-full h-1 bg-surface-container-high appearance-none cursor-pointer accent-primary-container"
                            oninput="visParams.boost = parseFloat(this.value); document.getElementById('val-boost').innerText = this.value + 'x'">
                    </div>

                    <div class="space-y-2">
                        <div class="flex justify-between"><span>ROTATION_GEAR</span><span id="val-rot">${visParams.rotation}x</span></div>
                        <input type="range" min="0" max="5" step="0.5" value="${visParams.rotation}" 
                            class="w-full h-1 bg-surface-container-high appearance-none cursor-pointer accent-tertiary-fixed-dim"
                            oninput="visParams.rotation = parseFloat(this.value); document.getElementById('val-rot').innerText = this.value + 'x'">
                    </div>

                    <div class="space-y-2">
                        <div class="flex justify-between"><span>EMISSIVE_INTENSITY</span><span id="val-int">${visParams.intensity}</span></div>
                        <input type="range" min="0" max="10" step="1" value="${visParams.intensity}" 
                            class="w-full h-1 bg-surface-container-high appearance-none cursor-pointer accent-primary-container"
                            oninput="visParams.intensity = parseFloat(this.value); document.getElementById('val-int').innerText = this.value">
                    </div>

                    <div class="space-y-2">
                        <div class="flex justify-between"><span>NOISE_DEVIATION</span><span id="val-noise">${visParams.noise}</span></div>
                        <input type="range" min="1" max="5" step="0.2" value="${visParams.noise}" 
                            class="w-full h-1 bg-surface-container-high appearance-none cursor-pointer accent-white"
                            oninput="visParams.noise = parseFloat(this.value); document.getElementById('val-noise').innerText = this.value">
                    </div>

                </div>
                <p class="mt-4 font-mono text-[9px] text-outline-variant uppercase">> AJUSTES DE HARDWARE SINCRONIZADOS EN TIEMPO REAL.</p>
            `;
        };
    }

    // ==========================================
    // 9. BOTÓN BITSTREAM (Historial de Reproducción)
    // ==========================================
    const bitstreamBtn = document.getElementById('nav-bitstream');
    if(bitstreamBtn) {
        bitstreamBtn.onclick = async (e) => {
            e.preventDefault();
            window.setMenuActive('nav-bitstream');
            console.log(">> Accediendo a BITSTREAM (Historial)...");

            const token = localStorage.getItem('spotify_token');
            if (!token) return;

            const trackList = document.getElementById('track-list');
            trackList.innerHTML = '<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> QUERYING_TEMPORAL_LOGS...</h3>';

            try {
                const res = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=30", {
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                if (res.status === 401) {
                    localStorage.removeItem('spotify_token');
                    location.reload();
                    return;
                }

                const data = await res.json();
                
                if (data.items && data.items.length > 0) {
                    currentTrackQueue = data.items.map(item => item.track.uri);
                    let finalHTML = `<h3 class="font-mono text-primary-container mb-4 text-xs tracking-widest uppercase">> BITSTREAM_LOGS: ${data.items.length} RECENT CONNECTIONS</h3>`;
                    
                    data.items.forEach((item, index) => {
                        const track = item.track;
                        if (!track) return;

                        const title = track.name;
                        const artist = track.artists.map(a => a.name).join(', ');
                        const duration = msToMinutesAndSeconds(track.duration_ms);
                        const albumCover = (track.album.images && track.album.images.length > 0) ? track.album.images[2].url : 'https://via.placeholder.com/50/131313/00ff41?text=B';
                        
                        const playedDate = new Date(item.played_at);
                        const timeLog = playedDate.toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute:'2-digit' });
                        const dateLog = playedDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });

                        finalHTML += `
                        <div onclick="playTrackList(${index})" class="flex items-center gap-4 p-4 group cursor-pointer hover:bg-surface-container-high transition-colors border border-transparent hover:border-primary-container/20">
                            <div class="flex flex-col items-end justify-center w-12 border-r border-outline-variant/30 pr-3 opacity-80">
                                <span class="font-mono text-[10px] text-tertiary-fixed-dim">${timeLog}</span>
                                <span class="font-mono text-[8px] text-outline-variant">${dateLog}</span>
                            </div>
                            <img src="${albumCover}" class="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" alt="cover">
                            <div class="flex-1 overflow-hidden">
                                <h4 class="font-headline font-bold text-sm text-[#B9CCB2] group-hover:text-primary-container uppercase truncate">${title}</h4>
                                <p class="font-mono text-[10px] text-outline-variant uppercase truncate">${artist}</p>
                            </div>
                            <span class="font-mono text-xs text-outline-variant">${duration}</span>
                        </div>`;
                    });
                    
                    trackList.innerHTML = finalHTML;
                } else {
                    trackList.innerHTML = '<p class="text-outline-variant font-mono text-xs">> NO_TEMPORAL_LOGS_FOUND.</p>';
                }
            } catch (error) {
                console.error(">> Error en BITSTREAM:", error);
                trackList.innerHTML = '<p class="text-red-500 font-mono text-xs">> ERROR_READING_LOGS: CHECK CONSOLE.</p>';
            }
        };
    }

    // Control del colapso/expansión de menús (HUD: SYSTEM)
    const asideElem = document.querySelector('aside');
    const rightPanel = document.getElementById('right-panel');
    const systemBtn = document.getElementById('nav-system');
    if (asideElem && rightPanel && systemBtn) {
        asideElem.style.transition = "margin-left 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        rightPanel.style.transition = "margin-right 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        
        let isHudActive = true;
        systemBtn.onclick = (e) => {
            e.preventDefault();
            isHudActive = !isHudActive;
            
            if (!isHudActive) {
                asideElem.style.marginLeft = `-${asideElem.offsetWidth}px`;
                rightPanel.style.marginRight = `-${rightPanel.offsetWidth}px`;
                systemBtn.innerText = "HUD: OFF";
                systemBtn.classList.replace('text-[#00FF41]', 'text-[#ff003c]');
                systemBtn.classList.replace('border-[#00FF41]', 'border-[#ff003c]');
            } else {
                asideElem.style.marginLeft = "0px";
                rightPanel.style.marginRight = "0px";
                systemBtn.innerText = "SYSTEM";
                systemBtn.classList.replace('text-[#ff003c]', 'text-[#00FF41]');
                systemBtn.classList.replace('border-[#ff003c]', 'border-[#00FF41]');
            }
            
            setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
        };
    }

    // ==========================================
    // 13. ESTADO DINÁMICO DEL MENÚ LATERAL
    // ==========================================
    window.setMenuActive = function(clickedId) {
        const menuIds = ['nav-collection', 'nav-frequency', 'nav-bitstream', 'nav-vault', 'nav-terminal'];
        
        menuIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            
            if (id === clickedId) {
                el.classList.remove('text-[#B9CCB2]', 'hover:bg-[#3A3939]');
                el.classList.add('bg-[#00FF41]', 'text-[#003907]', 'font-bold');
            } else {
                el.classList.remove('bg-[#00FF41]', 'text-[#003907]', 'font-bold');
                el.classList.add('text-[#B9CCB2]', 'hover:bg-[#3A3939]');
            }
        });
    };

    // ==========================================
    // 14. MOTOR DE LA PESTAÑA DEL PANEL DERECHO
    // ==========================================
    const rightPanelSection = document.getElementById('right-panel');
    const togglePanelBtn = document.getElementById('btn-toggle-panel');
    const toggleChevron = document.getElementById('toggle-chevron');
    
    let isPanelHidden = false;
    if (togglePanelBtn && rightPanelSection) {
        rightPanelSection.style.transition = "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        
        togglePanelBtn.onclick = () => {
            isPanelHidden = !isPanelHidden;
            if (isPanelHidden) {
                rightPanelSection.style.transform = 'translateX(100%)';
                toggleChevron.style.transform = 'rotate(180deg)';
            } else {
                rightPanelSection.style.transform = 'translateX(0)';
                toggleChevron.style.transform = 'rotate(0deg)';
            }
            setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
        };
    }

    // ==========================================
    // 15. BOTÓN COLLECTION (Restaurar Vista Principal)
    // ==========================================
    const collectionBtn = document.getElementById('nav-collection');
    if (collectionBtn) {
        collectionBtn.onclick = (e) => {
            e.preventDefault();
            window.setMenuActive('nav-collection');
            
            const trackList = document.getElementById('track-list');
            trackList.innerHTML = `
                <div class="text-center p-8 text-outline-variant font-mono text-xs">
                    <p>> SYSTEM_READY</p>
                    <p>> AWAITING SEARCH QUERY OR ARCHIVE EXTRACTION...</p>
                </div>
            `;
        };
    }

    // === BOTÓN LYRICS (Activar Búsqueda Inicial) ===
    const lyricsBtn = document.getElementById('btn-lyrics');
    if(lyricsBtn) {
        lyricsBtn.onclick = async (e) => {
            e.preventDefault();
            if (!globalPlayer) return;
            
            const state = await globalPlayer.getCurrentState();
            if (!state || !state.track_window.current_track) return;
            
            const track = state.track_window.current_track;
            document.getElementById('track-list').innerHTML = `<div data-view="lyrics"></div>`;
            updateVocalDataStream(track.name, track.artists[0].name);
        };
    }
});

// Carga inicial y restauración de sesión
window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        let accessToken = await getAccessToken(code);
        if (accessToken) {
            console.log("SISTEMA EN LÍNEA: Conexión establecida.");
            localStorage.setItem('spotify_token', accessToken); 
            window.history.pushState("", document.title, window.location.pathname); 
            searchTrack("Daft Punk", accessToken);
        }
    } else if (localStorage.getItem('spotify_token')) {
        console.log("SISTEMA EN LÍNEA (Sesión recuperada).");
        searchTrack("Daft Punk", localStorage.getItem('spotify_token'));
    } else {
        console.log("SISTEMA FUERA DE LÍNEA: Esperando autenticación.");
        const loginBtn = document.getElementById('auth-btn');
        if(loginBtn) {
            loginBtn.addEventListener('click', authenticateSpotify);
            loginBtn.innerText = "CONNECT_SPOTIFY";
        }
    }
};

// ==========================================
// MOTOR VISUAL 3D Y AUDIO (THREE.JS)
// ==========================================
const container = document.getElementById('ferrofluid-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); 

renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const geometry = new THREE.SphereGeometry(2, 64, 64); 
geometry.userData.originalPositions = geometry.attributes.position.clone();

const material = new THREE.MeshStandardMaterial({
    color: 0x050505, roughness: 0.1, metalness: 0.9, emissive: 0x001100,
});
const ferrofluid = new THREE.Mesh(geometry, material);
scene.add(ferrofluid);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x00ff41, 3); 
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

const pointLight2 = new THREE.PointLight(0x00daf3, 2); 
pointLight2.position.set(-5, -5, 2);
scene.add(pointLight2);

camera.position.z = 5;

let audioAnalyser;
let audioDataArray;
let isMicConnected = false;

// Conecta la entrada del micrófono para alimentar los datos del visualizador
async function connectMicrophone() {
    if (isMicConnected) return; 
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        
        audioAnalyser = audioCtx.createAnalyser();
        audioAnalyser.fftSize = 64; 
        source.connect(audioAnalyser);
        
        audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        isMicConnected = true;
        console.log("🎤 MICRÓFONO EN LÍNEA: Ferrofluido sincronizado.");
    } catch (error) { 
        console.error("El operador denegó el acceso al micrófono.", error); 
    }
}

// ==========================================
// SISTEMA DE AJUSTES: CICLO DE TEMAS VISUALES
// ==========================================
const settingsBtn = document.getElementById('settings-btn');
const themes = [
    { main: 0x00ff41, sub: 0x00daf3, emissive: 0x001100 }, // Matrix Green (Default)
    { main: 0xffb000, sub: 0xff5200, emissive: 0x221100 }, // Retro Amber
    { main: 0x00ffff, sub: 0xff00ff, emissive: 0x001122 }, // Cyberpunk Neon
    { main: 0xff003c, sub: 0x550000, emissive: 0x220000 }  // Alert Red
];
let currentThemeIndex = 0;

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        const newTheme = themes[currentThemeIndex];
        
        pointLight.color.setHex(newTheme.main);
        pointLight2.color.setHex(newTheme.sub);
        material.emissive.setHex(newTheme.emissive);
        
        console.log(`> SYS_THEME_UPDATED: INDEX [${currentThemeIndex}]`);
    });
}

// Bucle de animación principal para renderizar la escena 3D y procesar las ondas de sonido
function animateVisualizer() {
    requestAnimationFrame(animateVisualizer);
    const time = Date.now() * 0.001; 
    
    ferrofluid.rotation.x += 0.002 * visParams.rotation;
    ferrofluid.rotation.y += 0.003 * visParams.rotation;
    
    pointLight.position.x = 5 * Math.sin(time * 0.7);
    pointLight.position.z = 5 * Math.cos(time * 0.7);
    pointLight.position.y = 2 + Math.sin(time * 0.3) * 2;

    pointLight2.position.x = 4 * Math.cos(time * 0.5);
    pointLight2.position.y = 4 * Math.sin(time * 0.5);
    
    let reactividad = 0;
    if (isMicConnected && audioAnalyser) {
        audioAnalyser.getByteFrequencyData(audioDataArray);
        const graves = (audioDataArray[0] + audioDataArray[1] + audioDataArray[2] + audioDataArray[3]) / 4; 
        reactividad = (graves / 150) * visParams.boost; 
    }
    
    material.emissiveIntensity = reactividad * visParams.intensity; 
    
    const positions = ferrofluid.geometry.attributes.position;
    const original = ferrofluid.geometry.userData.originalPositions;
    
    for (let i = 0; i < positions.count; i++) {
        const vx = original.getX(i);
        const vy = original.getY(i);
        const vz = original.getZ(i);
        const nx = vx / 2;
        const ny = vy / 2;
        const nz = vz / 2;
        const ruido = Math.sin(time * 6 + vx * 3) * Math.cos(time * 7 + vy * 3) * Math.sin(time * 5 + vz * 3);
        const desplazamiento = (ruido * visParams.noise * reactividad) + (reactividad * 1.5);
        positions.setXYZ(i, vx + nx * desplazamiento, vy + ny * desplazamiento, vz + nz * desplazamiento);
    }
    
    positions.needsUpdate = true;
    ferrofluid.geometry.computeVertexNormals(); 
     
    renderer.render(scene, camera);
}

animateVisualizer();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// ==========================================
// 12. HARDWARE INTERRUPTS (Atajos de Teclado)
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch(e.code) {
        case 'Space':
            e.preventDefault();
            if (globalPlayer) globalPlayer.togglePlay();
            console.log(">> HARDWARE_INTERRUPT: PLAY/PAUSE");
            break;
        case 'ArrowRight':
            if (globalPlayer) globalPlayer.nextTrack();
            break;
        case 'ArrowLeft':
            if (globalPlayer) globalPlayer.previousTrack();
            break;
        case 'ArrowUp':
            e.preventDefault();
            if (globalPlayer) {
                globalPlayer.getVolume().then(vol => {
                    let newVol = Math.min(vol + 0.1, 1.0);
                    globalPlayer.setVolume(newVol);
                    const volSlider = document.getElementById('sys-volume');
                    if(volSlider) volSlider.value = newVol;
                });
            }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (globalPlayer) {
                globalPlayer.getVolume().then(vol => {
                    let newVol = Math.max(vol - 0.1, 0.0);
                    globalPlayer.setVolume(newVol);
                    const volSlider = document.getElementById('sys-volume');
                    if(volSlider) volSlider.value = newVol;
                });
            }
            break;
        case 'Escape':
            const sysBtn = document.getElementById('nav-system');
            if (sysBtn && sysBtn.innerText === "HUD: OFF") sysBtn.click();
            break;
    }

    if (e.key.toLowerCase() === 't') {
        const termBtn = document.getElementById('nav-terminal');
        if (termBtn) termBtn.click();
    }
});
