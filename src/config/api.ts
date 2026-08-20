/**
 * Configuración central de APIs
 * Para cambiar la URL base, edita el archivo .env en la raíz del proyecto.
 */

import { io, Socket } from "socket.io-client";
import { storage } from "../utils/storage";

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
  transports: ["polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

// Capturar errores de conexión silenciosamente para que no queden expuestos en la consola
socket.on("connect_error", () => {
  // Manejador silencioso
});

socket.on("error", () => {
  // Manejador silencioso
});

// Registrar el terminal en el servidor al conectar/reconectar
// Esto permite al servidor liberar mesas automáticamente si el socket se cae
function registrarTerminalEnServidor() {
  // Usar 'terminal' directamente (es el que el usuario configuró y el que el backend usa)
  const termId = storage.getItem("terminal");
  if (!termId || termId === "TERMINAL 1") return;
  let empresa = "02";
  try {
    const info = JSON.parse(storage.getItem("infoPuntoVenta") || "{}");
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
  const terminalUsuario = (storage.getItem("terminal") || "TERMINAL 1").trim();
  // Si en el almacenamiento local quedó guardado con paréntesis de versiones anteriores, limpiarlo
  return terminalUsuario.replace(/\s*\([^)]*\)/g, "").trim() || "TERMINAL 1";
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

/**
 * Indica si la impresión es obligatoria al guardar/enviar pedidos.
 * Se configura en el archivo .env del BACKEND (OBLIGATORIO_IMPRIMIR="SI" o "NO").
 */
export function isMandatoryPrintEnabled(): boolean {
  const storedVal = storage.getItem("obligatorioImprimir");
  if (storedVal !== null) {
    return storedVal === "true" || storedVal === "SI" || storedVal === "1" || storedVal === "YES";
  }
  const envVal = import.meta.env.VITE_OBLIGATORIO_IMPRIMIR;
  if (envVal !== undefined && envVal !== null && envVal !== "") {
    const clean = String(envVal).trim().toUpperCase();
    return clean === "SI" || clean === "TRUE" || clean === "1" || clean === "YES";
  }
  return false;
}

/**
 * Indica si está permitido seleccionar o cambiar el punto de venta en Login y Dashboard.
 * Se configura en el .env del BACKEND (PERMITE_SELECCIONAR_PUNTO_VENTA="SI" o "NO").
 * Si es "NO", se usa estrictamente el punto de venta fijado en el servidor.
 */
export function isSelectPuntoVentaEnabled(): boolean {
  const storedVal = storage.getItem("permiteSeleccionarPuntoVenta");
  if (storedVal !== null) {
    return storedVal === "true" || storedVal === "SI" || storedVal === "1" || storedVal === "YES";
  }
  return true; // Por defecto permitido
}

/**
 * Obtiene el intervalo de polling en milisegundos configurado desde el backend (POLLING_SEGUNDOS).
 * Valor por defecto: 4000 ms (4 segundos). Mínimo de seguridad: 2000 ms.
 */
export function getPollingIntervalMs(): number {
  const stored = storage.getItem("config_pollingSegundos");
  if (stored !== null && stored !== "") {
    const parsed = Number(stored);
    if (!isNaN(parsed) && parsed >= 2) {
      return parsed * 1000;
    }
  }
  return 4000;
}


/**
 * Detecta si el dispositivo actual es Móvil o Tablet.
 * Permite que cualquier PC (Windows, Mac, Linux) con pantalla >= 1024px sea detectado como PC,
 * mientras que celulares y tablets se detectan como móvil incluso en modo "Sitio para PC".
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";

  // 1. Detección explícita de SO de Escritorio (Windows / Mac)
  const isDesktopOS = /Win32|Win64|Windows|Macintosh|MacIntel/i.test(ua) || /Win32|Win64|Windows|Mac/i.test(platform);
  const maxScreenDim = Math.max(window.screen.width, window.screen.height);
  const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // Si es un computador (Windows / Mac) con pantalla de al menos 1024px, ES UN PC
  if (isDesktopOS && maxScreenDim >= 1024 && !isMobileOS) {
    return false;
  }

  // 2. Para móviles y tablets:
  const isMobileScreenSize = Math.min(window.screen.width, window.screen.height) <= 600;
  const isSmallViewport = window.innerWidth < 1024;

  return isMobileOS || isMobileScreenSize || isSmallViewport;
}

/**
 * Formatea el nombre de la terminal quitando el nombre de PC entre paréntesis.
 * Ejemplo: "TERMINAL 66 (MOV_MSDH-PMM5)" -> "TERMINAL 66"
 */
export function formatTerminalName(terminalStr?: string): string {
  if (!terminalStr) return "";
  return terminalStr.replace(/\s*\(.*?\)/g, "").trim();
}

/**
 * Formatea el nombre de la mesa removiendo el prefijo "Mesa" o "MESA".
 * Ejemplo: "Mesa 2323" -> "2323", "Mesa WE" -> "WE", "MESA 12" -> "12"
 */
export function formatMesaName(mesaStr?: string): string {
  if (!mesaStr) return "";
  return mesaStr.trim().replace(/^mesa\s+/i, "").trim();
}

/**
 * Compara dos nombres de terminales para determinar si se trata del mismo dispositivo/equipo,
 * ignorando etiquetas entre paréntesis o variaciones de prefijo ("1" vs "TERMINAL 1").
 */
export function isSameTerminal(t1?: string, t2?: string): boolean {
  if (!t1 || !t2) return false;
  return t1.trim().toUpperCase() === t2.trim().toUpperCase();
}

/**
 * Wrapper centralizado de fetch que intercepta respuestas 401 (Token Expirado / No Autorizado)
 * e informa a la aplicación para cerrar la sesión limpiamente.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = storage.getItem("token");
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };

  // Inyectar punto de venta configurado en este dispositivo si no está especificado
  let puntoId = storage.getItem("puntoVenta");
  if (!puntoId) {
    try {
      const info = JSON.parse(storage.getItem("infoPuntoVenta") || "{}");
      if (info?.PveIdInPuntoVenta) {
        puntoId = String(info.PveIdInPuntoVenta);
      }
    } catch {}
  }
  if (puntoId && !headers["punto"] && !headers["Punto"] && !headers["x-punto"]) {
    headers["punto"] = puntoId;
  }

  // Siempre inyectar el token en X-Auth-Token para evitar que IIS sobreescriba Authorization
  if (token && token !== "null" && token !== "undefined") {
    headers["X-Auth-Token"] = token;
    // También intentar Authorization por si el proxy no lo toca
    const currentAuth = (headers["Authorization"] || headers["authorization"] || "").trim();
    if (!currentAuth || currentAuth === "Bearer" || currentAuth === "Bearer null" || currentAuth === "Bearer undefined") {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const options: RequestInit = {
    credentials: "include",
    ...init,
    headers,
  };

  const response = await fetch(input, options);

  if (response.status === 401) {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!urlStr.includes("/login")) {
      // Protección: no cerrar sesión si el login fue hace menos de 30 segundos
      const lastLoginStr = storage.getItem("last_login");
      const lastLogin = lastLoginStr ? parseInt(lastLoginStr, 10) : 0;
      const segundosDesdeLogin = (Date.now() - lastLogin) / 1000;
      if (!lastLoginStr || isNaN(lastLogin) || segundosDesdeLogin > 30) {
        window.dispatchEvent(new Event("session_expired"));
      }
    }
  }

  return response;
}