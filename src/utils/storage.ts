/**
 * Utilidades de almacenamiento local (localStorage / sessionStorage) aisladas.
 * Genera un prefijo único por URL de API (VITE_API_BASE_URL) para que múltiples
 * instancias o proyectos con el mismo código en la misma IP/dominio NO interfieran entre sí.
 */

const rawApi = (import.meta.env.VITE_API_BASE_URL || "default_app").trim();
const apiTag = rawApi.replace(/[^a-zA-Z0-9]/g, "_");
const PRIMARY_PREFIX = `cmd_${apiTag}_`;
const FALLBACK_PREFIX = "comanda_";

export const storage = {
  getItem(key: string): string | null {
    // 1. Clave primaria con el tag del API
    const tagVal = localStorage.getItem(`${PRIMARY_PREFIX}${key}`);
    if (tagVal !== null) return tagVal;

    // 2. Fallback a prefijo comanda_
    const cmdVal = localStorage.getItem(`${FALLBACK_PREFIX}${key}`);
    if (cmdVal !== null) {
      localStorage.setItem(`${PRIMARY_PREFIX}${key}`, cmdVal);
      return cmdVal;
    }
    
    return null;
  },

  setItem(key: string, value: string): void {
    localStorage.setItem(`${PRIMARY_PREFIX}${key}`, value);
  },

  removeItem(key: string): void {
    localStorage.removeItem(`${PRIMARY_PREFIX}${key}`);
    localStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
    localStorage.removeItem(key);
  },

  clearSession(): void {
    const keysToRemove = [
      "token",
      "last_login",
      "last_activity_time",
      "config_inactividadHoras",
      "obligatorioImprimir",
      "config_tipoSonidoPendientes",
      "vendedor",
      "infoPuntoVenta",
      "usuario",
      "usuarioLogueado",
      "comanderaBloqueada"
    ];

    keysToRemove.forEach((k) => {
      localStorage.removeItem(`${PRIMARY_PREFIX}${k}`);
      localStorage.removeItem(`${FALLBACK_PREFIX}${k}`);
      localStorage.removeItem(k);
    });
  }
};
