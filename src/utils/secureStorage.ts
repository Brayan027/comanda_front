/**
 * Transparent encrypted and namespaced LocalStorage / SessionStorage interceptor
 * Prevents raw credentials or JWT tokens from being exposed in plain text in DevTools.
 * NOTA: El JWT y datos de sesión se almacenan cifrados, y se descifran al leerlos.
 * Se eliminan automáticamente residuos corruptos de "cookie_session".
 */

const ENCRYPTION_PREFIX = "__secure__:";
const SECRET_KEY = "comanda_secure_session_key_2026_dianasis";

function rc4(key: string, str: string): string {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  let i = 0; j = 0; let res = "";
  for (let y = 0; y < str.length; y++) {
    i = (i + 1) % 256; j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
  }
  return res;
}

function encrypt(value: string): string {
  if (!value) return value;
  const encoded = encodeURIComponent(value);
  const encrypted = rc4(SECRET_KEY, encoded);
  return ENCRYPTION_PREFIX + Array.from(encrypted).map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function decrypt(value: string): string {
  if (!value || !value.startsWith(ENCRYPTION_PREFIX)) return value;
  try {
    const hex = value.slice(ENCRYPTION_PREFIX.length);
    let encrypted = "";
    for (let i = 0; i < hex.length; i += 2) {
      encrypted += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return decodeURIComponent(rc4(SECRET_KEY, encrypted));
  } catch (e) { return value; }
}

const SECURE_KEYS = ["token", "last_login", "empresa_activa", "nombre_usuario", "grupo_usuario", "nit_usuario", "usuario", "vendedor"];

const shouldSecure = (key: string): boolean => {
  if (!key) return false;
  return key.includes("cmd_") || SECURE_KEYS.some(k => key.includes(k));
};

function sanitizarStorageExistente(storageObj: Storage) {
  try {
    // 1. Eliminar cualquier clave corrupta con "cookie_session"
    const keysToRemove: string[] = [];
    for (let i = 0; i < storageObj.length; i++) {
      const k = storageObj.key(i);
      if (k) {
        const val = storageObj.getItem(k);
        if (val === "cookie_session" || (val && val.startsWith(ENCRYPTION_PREFIX) && decrypt(val) === "cookie_session")) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach(k => storageObj.removeItem(k));

    // 2. Re-cifrar claves inseguras
    for (let i = 0; i < storageObj.length; i++) {
      const k = storageObj.key(i);
      if (k && shouldSecure(k)) {
        const val = storageObj.getItem(k);
        if (val && !val.startsWith(ENCRYPTION_PREFIX)) {
          storageObj.setItem(k, encrypt(val));
        }
      }
    }
  } catch (e) {}
}

if (typeof window !== "undefined" && typeof Storage !== "undefined") {
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;

  if (typeof localStorage !== "undefined") sanitizarStorageExistente(localStorage);
  if (typeof sessionStorage !== "undefined") sanitizarStorageExistente(sessionStorage);

  Storage.prototype.getItem = function (key: string): string | null {
    const val = originalGetItem.call(this, key);
    if (val === null) return null;
    if (shouldSecure(key)) {
      const decrypted = decrypt(val);
      if (decrypted === "cookie_session") return null;
      return decrypted;
    }
    if (val === "cookie_session") return null;
    return val;
  };

  Storage.prototype.setItem = function (key: string, value: string): void {
    if (value === "cookie_session") return;
    if (shouldSecure(key)) {
      originalSetItem.call(this, key, encrypt(value));
    } else {
      originalSetItem.call(this, key, value);
    }
  };
}

export {};
