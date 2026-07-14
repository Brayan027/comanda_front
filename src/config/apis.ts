import { CATALOGO_URL, VENTAS_MEDIO_PAGO_URL, VENTAS_DIA_URL, VENTAS_METAS_URL, VENTAS_COMPARATIVO_URL, DASHBOARD_URL, sanitizarError } from "./api";
export { sanitizarError };

export type ApiWrapper<T> = {
  error?: boolean | string | number;
  status?: number;
  body?: T;
  data?: T;
  result?: T;
  rows?: T;
  items?: T;
  message?: string;
};

export type VentasMedioPagoRow = {
  VenIdInPuntoVenta?: number;
  PveStNombre?: string;
  mes: number;
  MpaStDescripcion: string;
  NETO: number;
};

export type VentasMedioPagoBody = {
  porPuntoVenta: VentasMedioPagoRow[];
  consolidado: VentasMedioPagoRow[];
};

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function detectarError(obj: Record<string, unknown> | null): string {
  if (!obj) return "";

  const raw = obj.error as unknown;
  const esError = raw !== false && raw !== "false" && raw !== 0 && raw !== "0" && Boolean(raw);

  if (!esError) return "";
  const message = typeof obj.message === "string" ? obj.message : "";
  return message || "La API respondió con error";
}

export function extraerLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;

  if (typeof valor === "string") {
    try {
      return extraerLista(JSON.parse(valor) as unknown);
    } catch {
      return [];
    }
  }

  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    const candidato = obj.body ?? obj.data ?? obj.result ?? obj.rows ?? obj.items;
    return extraerLista(candidato);
  }

  return [];
}

export function attachCacheInfo(dest: any, source: any): any {
  if (dest && typeof dest === "object" && source && typeof source === "object" && "fromCache" in source) {
    Object.defineProperty(dest, "fromCache", {
      value: source.fromCache,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }
  return dest;
}

/**
 * Función centralizada para peticiones GET con JWT
 */
export async function apiGetJson<T>(url: URL | string): Promise<T> {
  const token = localStorage.getItem("token");
  const urlString = url.toString();

  let res: Response;
  let text: string;
  try {
    res = await fetch(urlString, {
      headers: {
        Authorization: `Bearer ${token || ""}`,
        "Content-Type": "application/json",
      },
    });

    // Manejo de error 401 - Unauthorized
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("last_login");
      // Redirigir al inicio para forzar el login
      window.location.href = "/";
      throw new Error("Sesión expirada o inválida. Redirigiendo...");
    }

    text = await res.text();
  } catch (err) {
    if (err instanceof Error && err.message.includes("Redirigiendo")) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(sanitizarError(msg));
  }

  const data = text.trim() ? (JSON.parse(text) as unknown) : null;
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

  const msgError = detectarError(obj);
  if (!res.ok || msgError) {
    const errorMsg = msgError || `No fue posible consultar la API (${res.status})`;
    const e = new Error(sanitizarError(errorMsg)) as Error & { status?: number; url?: string };
    e.status = res.status;
    e.url = urlString;
    throw e;
  }

  return data as T;
}

export type VentasPorPuntosApiRow = {
  VenIdInPuntoVenta?: number;
  PveStNombre?: string;
  TOTALREGISTROS?: number;
  NETO?: number;
};

export async function obtenerVentasPorPuntosPorRango(params: {
  fechaInicio: string;
  fechaFin: string;
  forceRefresh?: boolean;
}): Promise<VentasPorPuntosApiRow[]> {
  const url = withQuery(`${CATALOGO_URL}/VentasPorPuntos`, {
    fechaInicio: params.fechaInicio,
    fechaFin: params.fechaFin,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<unknown>(url);
  return attachCacheInfo(extraerLista(data), data) as VentasPorPuntosApiRow[];
}

export async function obtenerVentasPorPuntosPorMes(params: { mes: string; forceRefresh?: boolean }): Promise<VentasPorPuntosApiRow[]> {
  const url = withQuery(`${CATALOGO_URL}/VentasPorPuntos`, { mes: params.mes, forceRefresh: params.forceRefresh });

  const data = await apiGetJson<unknown>(url);
  return attachCacheInfo(extraerLista(data), data) as VentasPorPuntosApiRow[];
}

export async function obtenerVentasPorDia(params: {
  mes?: string;
  fechaInicio?: string;
  fechaFin?: string;
  puntoVentaId?: number;
  forceRefresh?: boolean;
}): Promise<any[]> {
  const url = withQuery(VENTAS_DIA_URL, {
    mes: params.mes,
    desde: params.fechaInicio,
    hasta: params.fechaFin,
    puntoVenta: params.puntoVentaId,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<unknown>(url);
  return attachCacheInfo(extraerLista(data), data);
}

export async function obtenerTodosLosPuntos(): Promise<any[]> {
  const data = await apiGetJson<unknown>(CATALOGO_URL);
  return extraerLista(data);
}

export type VentasMetasApiRow = {
  idPuntoVenta: number;
  puntoVenta: string;
  mes: number;
  totalRegistros: number;
  neto: number;
  meta: number;
  puntoEquilibrio: number;
};

export async function obtenerVentasMetas(params: {
  desde?: string;
  hasta?: string;
  anio?: number;
  forceRefresh?: boolean;
}): Promise<VentasMetasApiRow[]> {
  const url = withQuery(VENTAS_METAS_URL, {
    desde: params.desde,
    hasta: params.hasta,
    anio: params.anio,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<unknown>(url);
  return attachCacheInfo(extraerLista(data), data) as VentasMetasApiRow[];
}

export type KpiResumen = {
  title: string;
  value: number;
  change: number;
  isCurrency: boolean;
  prevLabel: string;
};

export async function obtenerResumenDashboard(params: {
  mes?: string;
  desde?: string;
  hasta?: string;
  forceRefresh?: boolean;
}): Promise<KpiResumen[]> {
  const url = withQuery(DASHBOARD_URL, {
    mes: params.mes,
    desde: params.desde,
    hasta: params.hasta,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<unknown>(url);
  return attachCacheInfo(extraerLista(data), data) as KpiResumen[];
}

export async function obtenerConfiguracionDashboard(): Promise<{ autoLoadDashboard: boolean }> {
  const url = `${DASHBOARD_URL}/config`;
  const data = await apiGetJson<any>(url);
  return data?.body || { autoLoadDashboard: true };
}
export type ReporteComparativo = {
  mes?: number;
  mesNombre?: string;
  semana?: number;
  semanaNombre?: string;
  ventasActual: number;
  ventasAnterior: number;
};

export type PuntoComparativo = {
  idPuntoVenta: number;
  nombrePunto: string;
  totalActual?: number;
  totalAnterior?: number;
  reporte: ReporteComparativo[];
};

export type VentasComparativoBody = {
  anioActual: number;
  anioAnterior: number;
  mesInicial?: number;
  mesFinal?: number;
  mesCorte?: number;
  totalGlobalActual?: number;
  totalGlobalAnterior?: number;
  puntos: PuntoComparativo[];
};

export async function obtenerVentasComparativoAnual(params: {
  anio?: number;
  puntoVenta?: number;
  forceRefresh?: boolean;
}): Promise<VentasComparativoBody> {
  const url = withQuery(`${VENTAS_COMPARATIVO_URL}/anual`, {
    anio: params.anio,
    puntoVenta: params.puntoVenta,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<ApiWrapper<VentasComparativoBody>>(url);
  return attachCacheInfo(data.body!, data);
}

export async function obtenerVentasComparativoMensual(params: {
  anio: number;
  mesInicial: number;
  mesFinal: number;
  puntoVenta?: number;
  modo?: string;
  forceRefresh?: boolean;
}): Promise<VentasComparativoBody> {
  const url = withQuery(`${VENTAS_COMPARATIVO_URL}/mensual`, {
    anio: params.anio,
    mesInicial: params.mesInicial,
    mesFinal: params.mesFinal,
    puntoVenta: params.puntoVenta,
    modo: params.modo,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<ApiWrapper<VentasComparativoBody>>(url);
  return attachCacheInfo(data.body!, data);
}

export async function obtenerVentasMedioPago(params: {
  desde: string;
  hasta: string;
  forceRefresh?: boolean;
}): Promise<VentasMedioPagoBody> {
  const url = withQuery(VENTAS_MEDIO_PAGO_URL, {
    desde: params.desde,
    hasta: params.hasta,
    forceRefresh: params.forceRefresh,
  });

  const data = await apiGetJson<ApiWrapper<VentasMedioPagoBody>>(url);
  return attachCacheInfo(data.body!, data);
}
