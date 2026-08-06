import { isMobileOrTabletDevice, isMandatoryPrintEnabled, API_BASE_URL } from "../config/api";

let audioCtx: AudioContext | null = null;
let activeNodes: (OscillatorNode | GainNode)[] = [];
let currentAudioElement: HTMLAudioElement | null = null;
let isCurrentlyPlaying = false;
let isPlayingTimeout: any = null;

/**
 * Bloquea la ejecución concurrente de sonidos durante un intervalo de tiempo (2.2 segundos)
 * para garantizar que NUNCA suenen 2 sonidos a la vez.
 */
function lockPlayback(durationMs: number = 2200) {
  isCurrentlyPlaying = true;
  if (isPlayingTimeout) clearTimeout(isPlayingTimeout);
  isPlayingTimeout = setTimeout(() => {
    isCurrentlyPlaying = false;
  }, durationMs);
}

/**
 * Detiene y desconecta inmediatamente cualquier nodo de audio o elemento MP3 en ejecución.
 */
function stopAllActiveAudio() {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Ignorar
    }
    currentAudioElement = null;
  }
  activeNodes.forEach((node) => {
    try {
      if ("stop" in node && typeof node.stop === "function") {
        node.stop();
      }
      node.disconnect();
    } catch {
      // Ignorar nodos ya detenidos
    }
  });
  activeNodes = [];
}

export interface SoundResolution {
  mode: number;
  fileName?: string;
}

/**
 * Obtiene la resolución del sonido configurado desde el backend (o .env local).
 * Admite tanto números (1, 2, 3, 4) como nombres de archivo directos (ej: 'SONIDO2.mp3', 'alerta.wav', 'SONIDO2').
 */
export function getTipoSonidoConfig(): SoundResolution {
  let val: string | null = null;

  try {
    const apiVal = localStorage.getItem("config_tipoSonidoPendientes");
    if (apiVal !== null && apiVal !== "") {
      val = String(apiVal).trim();
    } else {
      const envVal = import.meta.env.VITE_TIPO_SONIDO_PENDIENTES;
      if (envVal !== undefined && envVal !== null && envVal !== "") {
        val = String(envVal).trim();
      }
    }
  } catch {
    // Ignorar
  }

  if (!val) {
    return { mode: 1 };
  }

  // Si es un número puro (1, 2, 3, 4)
  if (/^[1-4]$/.test(val)) {
    const num = parseInt(val, 10);
    return { mode: num, fileName: num === 4 ? "SONIDO2.mp3" : undefined };
  }

  // Si se le pasa el nombre de un archivo de audio (ej: "SONIDO2.mp3", "alerta.wav", "SONIDO2")
  const hasExt = val.includes(".");
  const fileName = hasExt ? val : `${val}.mp3`;
  return { mode: 4, fileName };
}

export function getTipoSonidoPendientes(): number {
  return getTipoSonidoConfig().mode;
}

export function setTipoSonidoPendientes(tipo: number) {
  try {
    if (tipo >= 1 && tipo <= 4) {
      localStorage.setItem("tipoSonidoPendientes", String(tipo));
    }
  } catch {
    // Ignorar
  }
}

/**
 * Reproduce UN ÚNICO sonido de alerta de pedidos pendientes cargado dinámicamente desde el backend.
 * Soporta números de modo (1, 2, 3) o la búsqueda de archivos MP3/WAV por nombre directamente en el backend (/comandaApi/audio/<fileName>).
 * 
 * Ejemplos en Backend_comanda/.env:
 *   TIPO_SONIDO_PENDIENTES=1
 *   TIPO_SONIDO_PENDIENTES=2
 *   TIPO_SONIDO_PENDIENTES=3
 *   TIPO_SONIDO_PENDIENTES=SONIDO2.mp3
 */
export function playNewOrderSound(forcedModeOrFile?: number | string) {
  // El sonido NUNCA debe sonar en dispositivos móviles/tablets
  // Y SOLO se debe escuchar cuando NO es obligatorio imprimir (OBLIGATORIO_IMPRIMIR = "NO")
  if (isMobileOrTabletDevice() || isMandatoryPrintEnabled()) {
    return;
  }

  // SI YA HAY UN SONIDO REPRODUCIÉNDOSE, RECHAZAR NUEVAS PETICIONES PARALELAS
  if (isCurrentlyPlaying && forcedModeOrFile === undefined) {
    return;
  }

  // Activar candado de reproducción única por 2.2s
  lockPlayback(2200);

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    // DETENER CUALQUIER AUDIO ANTERIOR ANTES DE INICIAR
    stopAllActiveAudio();

    let config: SoundResolution;
    if (typeof forcedModeOrFile === "string") {
      const hasExt = forcedModeOrFile.includes(".");
      config = { mode: 4, fileName: hasExt ? forcedModeOrFile : `${forcedModeOrFile}.mp3` };
    } else if (typeof forcedModeOrFile === "number") {
      config = { mode: forcedModeOrFile, fileName: forcedModeOrFile === 4 ? "SONIDO2.mp3" : undefined };
    } else {
      config = getTipoSonidoConfig();
    }

    const now = audioCtx.currentTime;

    if (config.mode === 1) {
      // MODO 1: SONIDO CLÁSICO
      playTone(audioCtx, now, 587.33, 0.18, 0.3, "sine");
      playTone(audioCtx, now + 0.12, 880.00, 0.26, 0.4, "sine");
    } else if (config.mode === 2) {
      // MODO 2: TIMBRE DE COCINA POS
      playBellNote(audioCtx, now, 1046.50, 0.40, 0.7);
      playBellNote(audioCtx, now + 0.08, 1318.51, 0.40, 0.8);
      playBellNote(audioCtx, now + 0.16, 1567.98, 0.45, 0.85);
      playBellNote(audioCtx, now + 0.26, 2093.00, 0.60, 0.95);
    } else if (config.mode === 3) {
      // MODO 3: ALERTA URGENTE
      playTone(audioCtx, now, 392.00, 0.20, 0.95, "sawtooth");
      playTone(audioCtx, now + 0.12, 987.77, 0.16, 1.0, "square");
      playTone(audioCtx, now + 0.28, 698.46, 0.24, 1.0, "square");
    } else {
      // MODO 4: REPRODUCIR DINÁMICAMENTE ARCHIVO MP3 DESDE EL BACKEND (/comandaApi/audio/<fileName>)
      const targetFile = config.fileName || "SONIDO2.mp3";
      playAudioFileWithFallbacks(targetFile, audioCtx, now);
    }
  } catch (e) {
    console.error("Error reproduciendo alerta sonora:", e);
    isCurrentlyPlaying = false;
  }
}

/**
 * Reproduce un archivo de audio MP3 dinámicamente servido por la API del backend.
 */
function playAudioFileWithFallbacks(fileName: string, ctx: AudioContext, fallbackNow: number) {
  const backendAudioUrl = `${API_BASE_URL}/audio/${fileName}`;
  const frontendAudioUrl = `/sonido/${fileName}`;

  try {
    const audio = new Audio(backendAudioUrl);
    audio.volume = 1.0;
    currentAudioElement = audio;

    audio.onended = () => {
      isCurrentlyPlaying = false;
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback a la carpeta local del frontend /sonido/
        const frontendAudio = new Audio(frontendAudioUrl);
        frontendAudio.volume = 1.0;
        currentAudioElement = frontendAudio;

        frontendAudio.onended = () => {
          isCurrentlyPlaying = false;
        };

        frontendAudio.play().catch(() => {
          // Fallback a sintetizador si no se puede cargar el archivo
          playGongSynth(ctx, fallbackNow);
        });
      });
    }
  } catch {
    playGongSynth(ctx, fallbackNow);
  }
}

function playGongSynth(ctx: AudioContext, now: number) {
  playBellNote(ctx, now, 349.23, 0.60, 0.8);
  playBellNote(ctx, now + 0.12, 523.25, 0.60, 0.85);
  playBellNote(ctx, now + 0.24, 698.46, 0.70, 0.90);
  playBellNote(ctx, now + 0.36, 1046.50, 0.90, 1.0);
}

function playBellNote(ctx: AudioContext, startTime: number, freq: number, duration: number, volume: number) {
  try {
    const oscMain = ctx.createOscillator();
    const oscHarm = ctx.createOscillator();
    const gain = ctx.createGain();

    oscMain.type = "sine";
    oscMain.frequency.setValueAtTime(freq, startTime);

    oscHarm.type = "triangle";
    oscHarm.frequency.setValueAtTime(freq * 1.5, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscMain.connect(gain);
    oscHarm.connect(gain);
    gain.connect(ctx.destination);

    activeNodes.push(oscMain, oscHarm, gain);

    oscMain.start(startTime);
    oscHarm.start(startTime);
    oscMain.stop(startTime + duration);
    oscHarm.stop(startTime + duration);
  } catch {
    // Ignorar
  }
}

function playTone(
  ctx: AudioContext,
  startTime: number,
  freq: number,
  duration: number,
  maxGain: number,
  type: OscillatorType = "sine"
) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(maxGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    activeNodes.push(osc, gain);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch {
    // Ignorar
  }
}
