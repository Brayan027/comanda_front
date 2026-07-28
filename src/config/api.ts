/**
 * Configuración central de APIs
 * Para cambiar la URL base, edita el archivo .env en la raíz del proyecto.
 */

import { io, Socket } from "socket.io-client";

// URL Base tomada del entorno o fallback a /comandaApi
const BASE = import.meta.env.VITE_API_BASE_URL || "/comandaApi";

// Función auxiliar para limpiar rutas
const join = (base: string, path: string) => `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const API_BASE_URL = BASE;

const getSocketUrl = () => {
  try {
    if (BASE.startsWith("http")) {
      const url = new URL(BASE);
      return `${url.protocol}//${url.host}`;
    }
    return window.location.origin;
  } catch {
    return window.location.origin;
  }
};

export const socket: Socket = io(getSocketUrl(), {
  path: "/comandaApi/socket.io",
  autoConnect: true,
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// Registrar el terminal en el servidor al conectar/reconectar
// Esto permite al servidor liberar mesas automáticamente si el socket se cae
function registrarTerminalEnServidor() {
  // Usar 'terminal' directamente (es el que el usuario configuró y el que el backend usa)
  const termId = localStorage.getItem("terminal");
  if (!termId || termId === "TERMINAL 1") return;
  let empresa = "02";
  try {
    const info = JSON.parse(localStorage.getItem("infoPuntoVenta") || "{}");
    empresa = info?.PveIdStEmpresa || "02";
  } catch { /* ignorar */ }
  socket.emit("registrar_terminal", { terminal: termId, empresa });
}

socket.on("connect", () => {
  registrarTerminalEnServidor();
});

socket.on("reconnect", () => {
  registrarTerminalEnServidor();
});


/**
 * Obtiene el ID de terminal de este dispositivo.
 * PRIORIDAD:
 *   1. El valor que el usuario ya tenia configurado en 'terminal' (respetarlo siempre)
 *   2. Solo si no hay nada o era 'TERMINAL 1', generar uno automático y guardarlo
 * NUNCA sobreescribe un terminal que el usuario configuró manualmente.
 */
export function getTerminalId(): string {
  let deviceId = localStorage.getItem("device_unique_id");
  if (!deviceId) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const prefix = isMobile ? "MOV" : "POS";
    let uid: string;
    try {
      uid = crypto.randomUUID().replace(/-/g, "").substring(0, 4).toUpperCase();
    } catch {
      uid = Date.now().toString(36).toUpperCase().substring(0, 4);
    }
    deviceId = `${prefix}_${uid}`;
    localStorage.setItem("device_unique_id", deviceId);
  }

  let tabId = sessionStorage.getItem("tab_session_id");
  if (!tabId) {
    try {
      tabId = crypto.randomUUID().replace(/-/g, "").substring(0, 4).toUpperCase();
    } catch {
      tabId = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    sessionStorage.setItem("tab_session_id", tabId);
  }

  const terminalUsuario = (localStorage.getItem("terminal") || "TERMINAL 1").trim();
  const fullTag = `${deviceId}-${tabId}`;

  if (!terminalUsuario.includes(fullTag)) {
    return `${terminalUsuario} (${fullTag})`;
  }

  return terminalUsuario;
}


// --- ENDPOINTS ---
export const LOGIN_URL = join(BASE, "login");

/**
 * Función para limpiar mensajes de error y evitar que se vea la IP o el puerto
 */
export function sanitizarError(mensaje: string): string {
  if (!mensaje) return "";
  
  // Reemplazar la URL base completa
  const limpioBase = mensaje.replace(new RegExp(BASE, "gi"), "[Servidor]");
  
  // Reemplazar patrones de IP y puerto 
  let limpio = limpioBase.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[Dirección IP]");
  limpio = limpio.replace(/localhost(?::\d+)?/gi, "[Servidor Local]");
  
  // Si el error es de conexión fallida
  if (/Failed to fetch|NetworkError|ERR_CONNECTION_REFUSED/i.test(limpio)) {
    return "Error de conexión: No se pudo establecer contacto con el servidor.";
  } 
  return limpio;
}