# ARES Retro Edition (ARES_OS)

ARES Retro Edition es un cliente reproductor web de Spotify premium con una estética retro-futurista, simulando un sistema operativo antiguo (`ARCHAEOLOGIST_OS`). Cuenta con interfaces interactivas en 3D, consola de terminal simulada y controles avanzados de audio.

## Características Principales

*   **Estética Cyberpunk/Retro:** Pantalla de fósforo verde con efecto CRT analógico dinámico y texturas de dither.
*   **Visualizador 3D Ferrofluid:** Esfera interactiva de ferrofluido construida con **Three.js** que reacciona en tiempo real a las frecuencias de audio a través de la API de micrófono del navegador.
*   **Integración Completa con Spotify:** Conexión con Spotify Web Playback SDK (requiere Spotify Premium) para controlar reproducción, pausa, salto de pistas, volumen, modo aleatorio (Shuffle Protokol) y barra de progreso interactiva (Seek).
*   **Decodificador de Letras Integrado:** Extracción en tiempo real de letras a través de la API de *lyrics.ovh*.
*   **Consola Interactiva:** Terminal funcional que permite interactuar con el reproductor mediante comandos de terminal clásicos (`play`, `pause`, `next`, `prev`, `status`, etc.).
*   **Selector de Temas de Color:** Alternancia dinámica de paletas cromáticas inspiradas en interfaces retro (Matrix Green, Retro Amber, Cyberpunk Neon, Alert Red).

## Estructura del Proyecto

*   `index.html`: Estructura principal de la interfaz de usuario con Tailwind CSS.
*   `app.js`: Lógica de JavaScript extraída y corregida, que interactúa con Spotify SDK, controla el visualizador en Three.js y gestiona los eventos del DOM.

## Requisitos de Ejecución

1.  Se requiere un servidor local para cargar el SDK de Spotify Web Playback (por ejemplo, la extensión *Live Server* en VS Code en el puerto `5500` o ejecutando `python -m http.server 5500`).
2.  Deberás iniciar sesión con tu cuenta de Spotify Premium para montar el lector virtual de audio en tu navegador.
