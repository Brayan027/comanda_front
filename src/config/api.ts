/**
 * Configuración central de APIs
 * Para cambiar la URL base, edita el archivo .env en la raíz del proyecto.
 */


// URL Base tomada del entorno o fallback a localhost
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// Función auxiliar para limpiar rutas
const join = (base: string, path: string) => `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const API_BASE_URL = BASE;

// --- ENDPOINTS ---
export const LOGIN_URL = join(BASE, "login");
export const CATALOGO_URL = join(BASE, "catalogo");

// Módulo Ventas
export const VENTAS_DIA_URL = join(BASE, "ventas-dia");
export const VENTAS_METAS_URL = join(BASE, "ventas-metas");
export const VENTAS_COMPARATIVO_URL = join(BASE, "ventas-comparativo");
export const VENTAS_MEDIO_PAGO_URL = join(BASE, "ventas-medio-pago");

// Módulo Productos Vendidos
export const PRODUCTOS_VENDIDOS_BASE_URL = join(BASE, "productos-vendidos");
export const VENTAS_URL = join(PRODUCTOS_VENDIDOS_BASE_URL, "ventas");
export const DEVOLUCIONES_URL = join(PRODUCTOS_VENDIDOS_BASE_URL, "devoluciones");

// Módulo Dashboard
export const DASHBOARD_URL = join(BASE, "dashboard");

/**
 * Función para limpiar mensajes de error y evitar que se vea la IP o el puerto
 */
export function sanitizarError(mensaje: string): string {
  if (!mensaje) return "";
  
  // Reemplazar la URL base completa
  let limpio = mensaje.replace(new RegExp(BASE, 'gi'), "[Servidor]");
  
  // Reemplazar patrones de IP y puerto 
  limpio = limpio.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[Dirección IP]");
  limpio = limpio.replace(/localhost(?::\d+)?/gi, "[Servidor Local]");
  
  // Si el error es de conexión fallida
  if (/Failed to fetch|NetworkError|ERR_CONNECTION_REFUSED/i.test(limpio)) {
    return "Error de conexión: No se pudo establecer contacto con el servidor.";
  }
  
  return limpio;
}

/**
 * GUÍA PARA ESCALABILIDAD:
 * 1. Si agregas un nuevo módulo (ej. Inventario), se debe crear una constante BASE_URL.
 * 2. se debe Definir los endpoints específicos usando la función join.
 * 3. Exporta las constantes para usarlas en los servicios de cada feature.
 */
