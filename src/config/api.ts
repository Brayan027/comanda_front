/**
 * Configuración central de APIs
 * Para cambiar la URL base, edita el archivo .env en la raíz del proyecto.
 */

// URL Base tomada del entorno o fallback a /comandaApi
const BASE = import.meta.env.VITE_API_BASE_URL || "/comandaApi";

// Función auxiliar para limpiar rutas
const join = (base: string, path: string) => `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const API_BASE_URL = BASE;

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