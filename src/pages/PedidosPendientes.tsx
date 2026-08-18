import { useEffect, useState, useMemo } from "react";
import { 
  FiClock,
  FiSearch, 
  FiChevronLeft, 
  FiChevronRight, 
  FiArrowLeft, 
  FiUser, 
  FiCheckCircle, 
  FiPrinter, 
  FiVolume2, 
  FiVolumeX,
  FiLock
} from "react-icons/fi";


import { Spinner, Badge, Modal, Button } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, socket, getTerminalId, isMandatoryPrintEnabled, isMobileOrTabletDevice, formatMesaName, isSameTerminal, getPollingIntervalMs, apiFetch } from "../config/api";
import { storage } from "../utils/storage";


import { playNewOrderSound } from "../utils/audioAlert";

import "../styles/crear-ordenes.css";

interface PendingOrderItem {
  MopInItem: number;
  ProIdInProducto: number;
  ProStDescripcion: string;
  cantidad: number;
  precioVenta: number;
  total: number;
  MopStImpreso: string;
  observacion?: string;
  adicionales: {
    ApmIdInProducto: number;
    ProStDescripcion: string;
    precioVenta: number;
    cantidad: number;
  }[];
}

interface PendingOrder {
  OpeIdInOrdenPedido: string | number;
  OpeIdStDocumento: string;
  OpeStMesa: string;
  OpeIdStVendedor: string;
  OpeInNumPersonas: number;
  OpeInValor: number;
  OpeDaFechaDoc: string;
  OpeDtFechaHora: string;
  NombreVendedor: string;
  CodigoVendedor: string;
  totalSinImprimir: number;
  OpeStMesaAbierta?: string | number;
  OpeStTerminal?: string;
}

interface PedidosPendientesProps {
  onEditarMesa?: (id: string | number) => void;
  onVolver?: () => void;
  onUpdateCantPendientes?: (cant: number) => void;
}


export default function PedidosPendientes({ onEditarMesa: _onEditarMesa, onVolver, onUpdateCantPendientes }: PedidosPendientesProps) {



  const esMovil = useMemo(() => isMobileOrTabletDevice(), []);

  const [ordenes, setOrdenes] = useState<PendingOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [limite] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [procesandoId, setProcesandoId] = useState<string | number | null>(null);

  // Modal de Detalle Completo de Pedido
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [orderDetails, setOrderDetails] = useState<PendingOrderItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Estado del Sonido de Alertas (persistido en storage)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = storage.getItem("sonidoPendientesHabilitado");
    return stored !== null ? stored === "true" : true;
  });

  const infoPuntoVenta = useMemo(() => {
    try {
      const stored = storage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const token = storage.getItem("token") || "";
  const terminalActual = useMemo(() => getTerminalId(), []);

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(storage.getItem("puntoVenta") || infoPuntoVenta?.PveIdInPuntoVenta || "2"),
    "terminal": terminalActual
  }), [token, infoPuntoVenta, terminalActual]);

  const toggleSound = () => {
    // Solo permitir toggle en PC
    if (esMovil) return;
    setSoundEnabled(prev => {
      const nextVal = !prev;
      storage.setItem("sonidoPendientesHabilitado", String(nextVal));
      if (nextVal) {
        playNewOrderSound(); // audioAlert.ts ya tiene la guarda interna de PC
      }
      return nextVal;
    });
  };

  const [nuevosIds, setNuevosIds] = useState<Set<string | number>>(new Set());

  const marcarNuevosYRemover = (ids: (string | number)[]) => {
    if (ids.length === 0) return;
    setNuevosIds(current => {
      const updated = new Set(current);
      ids.forEach(id => updated.add(id));
      return updated;
    });

    setTimeout(() => {
      setNuevosIds(current => {
        const updated = new Set(current);
        ids.forEach(id => updated.delete(id));
        return updated;
      });
    }, 5000);
  };

  const cargarPendientes = async (mostrarCargando = true) => {
    try {
      if (mostrarCargando) setCargando(true);
      
      const [respActivas, respPendientes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/ordenes/activas`, { headers }).catch(() => null),
        apiFetch(`${API_BASE_URL}/ordenes/pendientes`, { headers }).catch(() => null)
      ]);

      let activas: any[] = [];
      let pendientes: any[] = [];

      if (respActivas && respActivas.ok) {
        const d = await respActivas.json();
        activas = d.body || [];
      }
      if (respPendientes && respPendientes.ok) {
        const d = await respPendientes.json();
        pendientes = d.body || [];
      }

      const mapSinImprimir = new Map<string, number>();
      pendientes.forEach(p => {
        const count = Number(p.totalSinImprimir) || 1;
        if (p.OpeIdInOrdenPedido) mapSinImprimir.set(String(p.OpeIdInOrdenPedido).trim(), count);
        if (p.OpeIdStDocumento) mapSinImprimir.set(String(p.OpeIdStDocumento).trim(), count);
        const numOnly = String(p.OpeIdStDocumento || p.OpeIdInOrdenPedido).replace(/^\D+/, '');
        if (numOnly) mapSinImprimir.set(numOnly, count);
      });

      // Combinar todas las órdenes abiertas, asociando su conteo de items sin imprimir y estado de bloqueo
      const ordenesCombinadas: PendingOrder[] = activas.map(a => {
        const k1 = String(a.OpeIdInOrdenPedido || "").trim();
        const k2 = String(a.OpeIdStDocumento || "").trim();
        const kNum = String(a.OpeIdStDocumento || a.OpeIdInOrdenPedido || "").replace(/^\D+/, '');

        const sinImp = (k1 && mapSinImprimir.has(k1)) 
          ? mapSinImprimir.get(k1)! 
          : (k2 && mapSinImprimir.has(k2)) 
            ? mapSinImprimir.get(k2)! 
            : (kNum && mapSinImprimir.has(kNum)) 
              ? mapSinImprimir.get(kNum)! 
              : 0;

        return {
          OpeIdInOrdenPedido: a.OpeIdInOrdenPedido,
          OpeIdStDocumento: a.OpeIdStDocumento || String(a.OpeIdInOrdenPedido),
          OpeStMesa: a.OpeStMesa,
          OpeIdStVendedor: a.OpeIdStVendedor,
          OpeInNumPersonas: a.OpeInNumPersonas,
          OpeInValor: a.OpeInValor,
          OpeDaFechaDoc: a.OpeDaFechaDoc,
          OpeDtFechaHora: a.OpeDtFechaHora || a.OpeDaFechaDoc,
          NombreVendedor: a.NombreVendedor,
          CodigoVendedor: a.CodigoVendedor,
          totalSinImprimir: sinImp,
          OpeStMesaAbierta: a.OpeStMesaAbierta,
          OpeStTerminal: a.OpeStTerminal
        };
      });

      // También agregar pendientes que no estén en la lista de activas por seguridad
      pendientes.forEach(p => {
        if (!ordenesCombinadas.some(o => o.OpeIdInOrdenPedido === p.OpeIdInOrdenPedido)) {
          ordenesCombinadas.push({
            ...p,
            totalSinImprimir: p.totalSinImprimir || 1
          });
        }
      });

      // Ordenar: primero las que tienen ítems sin imprimir, luego por fecha/ID descendente
      ordenesCombinadas.sort((a, b) => {
        if (b.totalSinImprimir !== a.totalSinImprimir) {
          return b.totalSinImprimir - a.totalSinImprimir;
        }
        return Number(b.OpeIdInOrdenPedido) - Number(a.OpeIdInOrdenPedido);
      });

      setOrdenes(prev => {
        const prevMap = new Map(prev.map(p => [String(p.OpeIdInOrdenPedido).trim(), p.totalSinImprimir]));
        const recienLlegados: (string | number)[] = [];

        ordenesCombinadas.forEach(o => {
          if (o.totalSinImprimir > 0) {
            const keyStr = String(o.OpeIdInOrdenPedido).trim();
            const prevSinImp = prevMap.get(keyStr);
            if (prevSinImp === undefined || o.totalSinImprimir > prevSinImp) {
              recienLlegados.push(o.OpeIdInOrdenPedido);
            }
          }
        });

        if (recienLlegados.length > 0) {
          if (prev.length > 0 && soundEnabled) {
            playNewOrderSound();
          }
          marcarNuevosYRemover(recienLlegados);
        }

        if (onUpdateCantPendientes) {
          const realPendingCount = ordenesCombinadas.filter(o => (o.totalSinImprimir || 0) > 0).length;
          onUpdateCantPendientes(realPendingCount);
        }

        return ordenesCombinadas;
      });
    } catch (e) {
      console.error("Error al cargar pedidos pendientes:", e);
    } finally {
      if (mostrarCargando) setCargando(false);
    }
  };


  useEffect(() => {
    cargarPendientes(true);

    // Polling dinámico (configurable desde el .env del backend via POLLING_SEGUNDOS)
    const pollingInterval = setInterval(() => {
      cargarPendientes(false);
    }, getPollingIntervalMs());

    const onActualizar = () => {
      cargarPendientes(false);
    };

    const onMesaBloqueada = (data: { mesa: string; terminal: string | null; bloqueada: boolean; evento: string }) => {
      if (!data?.mesa) return;
      const mesaEvento = data.mesa.trim().toUpperCase();
      setOrdenes(prev => prev.map(o => {
        if (o.OpeStMesa.trim().toUpperCase() === mesaEvento) {
          return {
            ...o,
            OpeStMesaAbierta: data.bloqueada ? '1' : '0',
            OpeStTerminal: data.bloqueada ? (data.terminal || '') : ''
          };
        }
        return o;
      }));
    };

    socket.on("ordenes_actualizadas", onActualizar);
    socket.on("nuevo_pedido_pendiente", onActualizar);
    socket.on("mesa_bloqueada", onMesaBloqueada);

    return () => {
      clearInterval(pollingInterval);
      socket.off("ordenes_actualizadas", onActualizar);
      socket.off("nuevo_pedido_pendiente", onActualizar);
      socket.off("mesa_bloqueada", onMesaBloqueada);
    };
  }, [headers, soundEnabled]);


  const cargarDetallesDeOrden = async (orden: PendingOrder) => {
    setSelectedOrder(orden);
    setLoadingDetails(true);
    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/${orden.OpeIdInOrdenPedido}`, {
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setOrderDetails(resData.body?.productos || []);
      }
    } catch (e) {
      console.error("Error al cargar detalle del pedido:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const verificarBloqueoMesa = async (orden: PendingOrder): Promise<boolean> => {
    const mesaId = orden.OpeStMesa;
    const estaBloqueadaPorOtro = String(orden.OpeStMesaAbierta) === '1' && Boolean(orden.OpeStTerminal) && !isSameTerminal(orden.OpeStTerminal, terminalActual);

    if (estaBloqueadaPorOtro) {
      Swal.fire({
        icon: "warning",
        title: "🔒 Mesa Ocupada",
        html: `La <b>Mesa ${mesaId}</b> está siendo editada en otro dispositivo.<br/>No puedes modificarla ni procesarla al mismo tiempo.`,
        confirmButtonColor: "#e31b23",
        confirmButtonText: "Entendido"
      });
      return false;
    }

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mesa: mesaId,
          terminal: terminalActual
        })
      });

      if (!resp.ok) {
        const resData = await resp.json().catch(() => null);
        if (resData?.locked) {
          Swal.fire({
            icon: "warning",
            title: "🔒 Mesa Ocupada",
            html: `La <b>Mesa ${mesaId}</b> está siendo editada en otro dispositivo.<br/>No puedes modificarla ni procesarla al mismo tiempo.`,
            confirmButtonColor: "#e31b23",
            confirmButtonText: "Entendido"
          });
          return false;
        }
      }
      return true;
    } catch {
      return true;
    }
  };



  const handleConfirmar = async (orden: PendingOrder) => {
    const ok = await verificarBloqueoMesa(orden);
    if (!ok) return;
    const targetId = orden.OpeIdInOrdenPedido;
    setProcesandoId(targetId);

    Swal.fire({
      title: "Confirmando pedido...",
      text: "Guardando estado como procesado...",
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/${targetId}/confirmar-impresos`, {
        method: "PUT",
        headers
      });

      Swal.close();
      if (resp.ok) {
        Swal.fire({
          icon: "success",
          title: "Pedido Confirmado",
          text: `Mesa: ${orden.OpeStMesa} marcada como procesada.`,
          timer: 1500,
          showConfirmButton: false
        });
        if (selectedOrder?.OpeIdInOrdenPedido === targetId) {
          setSelectedOrder(null);
        }
        cargarPendientes(false);
      } else {
        const resData = await resp.json();
        Swal.fire({
          icon: "error",
          title: "Error al confirmar",
          text: resData.mensaje || "No se pudo actualizar el estado del pedido."
        });
      }
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error de Conexión",
        text: "No se pudo contactar con el servidor."
      });
    } finally {
      setProcesandoId(null);
      apiFetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ mesa: orden.OpeStMesa })
      }).catch(() => null);
    }
  };

  const handleImprimir = async (orden: PendingOrder) => {
    const targetId = orden.OpeIdInOrdenPedido;
    setProcesandoId(targetId);

    Swal.fire({
      title: "Enviando a impresión...",
      text: "Conectando con la impresora de comandas...",
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/${targetId}/imprimir-pendiente`, {
        method: "POST",
        headers
      });

      Swal.close();
      const resData = await resp.json();

      if (resp.ok && resData.body?.impresion?.success !== false) {
        Swal.fire({
          icon: "success",
          title: "Impresión Exitosa",
          text: `Comanda para Mesa ${orden.OpeStMesa} enviada a la impresora.`,
          timer: 1500,
          showConfirmButton: false
        });
        if (selectedOrder?.OpeIdInOrdenPedido === targetId) {
          setSelectedOrder(null);
        }
        cargarPendientes(false);
      } else {
        Swal.fire({
          icon: "warning",
          title: "No se pudo imprimir",
          text: resData.mensaje || resData.body?.error || "La impresora no respondió. Revisa la conexión e intenta de nuevo.",
          showCancelButton: true,
          confirmButtonText: "🔄 Reintentar nuevamente",
          cancelButtonText: "Continuar sin imprimir",
          confirmButtonColor: "#eab308",
          cancelButtonColor: "#64748b"
        }).then((r) => {
          if (r.isConfirmed) {
            handleImprimir(orden);
          }
        });
      }
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error de Conexión",
        text: "Ocurrió un fallo al comunicarse con la impresora."
      });
    } finally {
      setProcesandoId(null);
      apiFetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ mesa: orden.OpeStMesa })
      }).catch(() => null);
    }
  };

  const ordenesFiltradas = useMemo(() => {
    const term = busqueda.toLowerCase().trim();
    if (!term) return ordenes;

    return ordenes.filter(o => 
      o.OpeStMesa.toLowerCase().includes(term) ||
      (o.NombreVendedor || "").toLowerCase().includes(term) ||
      (o.CodigoVendedor || "").toLowerCase().includes(term) ||
      String(o.OpeInValor).includes(term)
    );
  }, [ordenes, busqueda]);

  const total = ordenesFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [totalPaginas, pagina]);

  const startIndex = (pagina - 1) * limite;
  const endIndex = Math.min(startIndex + limite, total);
  const ordenesPaginadas = useMemo(() => {
    return ordenesFiltradas.slice(startIndex, endIndex);
  }, [ordenesFiltradas, startIndex, endIndex]);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0
    }).format(val);
  };

  const cantSinImprimir = useMemo(() => {
    return ordenes.filter(o => (o.totalSinImprimir || 0) > 0).length;
  }, [ordenes]);

  return (
    <section className="ordenes-page px-1 px-md-3 pt-0" style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}>
      <div className="container-fluid pt-2 px-1 px-md-2">
        
        {/* Datatable Card container Unificado Sin Cortes */}
        <div className="co-unified-main-card">
          <header className="co-header d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "#e31b23",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 1px 4px rgba(227, 27, 35, 0.2)"
                }}
              >
                <FiClock size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 className="co-header-title d-flex align-items-center gap-2">
                  <span>PEDIDOS PENDIENTES</span>
                  {cantSinImprimir > 0 ? (
                    <Badge bg="danger" className="rounded-pill px-2.5 py-1 badge-tintineo" style={{ fontSize: "0.75rem" }}>
                      {cantSinImprimir} PENDIENTE{cantSinImprimir > 1 ? "S" : ""}
                    </Badge>
                  ) : (
                    <Badge bg="success" className="rounded-pill px-2.5 py-1" style={{ fontSize: "0.75rem" }}>
                      ✓ AL DÍA
                    </Badge>
                  )}
                </h1>
              </div>
            </div>


            <div className="d-flex align-items-center gap-2 flex-wrap ms-auto">
              {/* Buscador de Mesas/Meseros Integrado en Header */}
              <div 
                className="d-flex align-items-center gap-2 px-2 bg-white rounded-3 border" 
                style={{ borderColor: "#cbd5e1", height: "32px", width: "230px", maxWidth: "100%" }}
              >
                <FiSearch className="text-muted flex-shrink-0" size={14} />
                <input
                  type="text"
                  className="border-0 bg-transparent p-0 shadow-none w-100 fw-medium"
                  placeholder="Filtrar por mesa o mesero..."
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                  style={{ fontSize: "0.78rem", outline: "none", color: "#1e293b" }}
                />
              </div>

              {/* Toggle de Alerta Sonora - SOLO visible en PC */}
              {!esMovil && (
              <button
                type="button"
                onClick={toggleSound}
                className={`btn btn-sm d-flex align-items-center gap-1.5 fw-bold ${soundEnabled ? "btn-outline-danger" : "btn-outline-secondary"}`}
                style={{
                  borderRadius: "8px",
                  height: "32px",
                  fontSize: "0.76rem",
                  padding: "3px 10px"
                }}
                title={soundEnabled ? "Desactivar sonido de notificación" : "Activar sonido de notificación"}
              >
                {soundEnabled ? <FiVolume2 size={14} className="text-danger" /> : <FiVolumeX size={14} />}
                <span>{soundEnabled ? "Sonido ON" : "Sonido OFF"}</span>
              </button>
              )}

              {onVolver && (
                <button
                  type="button"
                  onClick={onVolver}
                  className="btn btn-sm d-flex align-items-center gap-1 fw-bold"
                  style={{
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "6px",
                    background: "#ffffff",
                    color: "#334155",
                    padding: "3px 8px",
                    height: "28px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    flexShrink: 0,
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                    transition: "all 0.15s ease"
                  }}
                >
                  <FiArrowLeft size={14} />
                  <span>Volver</span>
                </button>
              )}
            </div>
          </header>

          <div className="co-panel-body p-3 p-md-4">

          {/* Table content */}
          {cargando ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="danger" className="mb-3" style={{ color: "#e31b23" }} />
              <div className="text-muted fw-semibold" style={{ fontSize: "0.9rem" }}>Cargando listado de pedidos pendientes...</div>
            </div>
          ) : ordenes.length === 0 ? (
            <div className="text-center text-muted py-5 fw-semibold" style={{ fontSize: "0.95rem" }}>
              <div className="mb-2" style={{ fontSize: "2rem" }}>✅</div>
              No hay pedidos pendientes por imprimir en este momento.
            </div>
          ) : (
            <>
              {/* Vista Móvil: Tarjetas */}
              <div className="d-block d-md-none">
                {ordenesPaginadas.map((o) => {
                  const estaProcesando = procesandoId === o.OpeIdInOrdenPedido;
                  const tienePendientes = (o.totalSinImprimir || 0) > 0;
                  const esNuevo = nuevosIds.has(o.OpeIdInOrdenPedido) || tienePendientes;
                  const estaBloqueadaPorOtro = String(o.OpeStMesaAbierta) === '1' && Boolean(o.OpeStTerminal) && !isSameTerminal(o.OpeStTerminal, terminalActual);
                  const nombreMesaFormateado = formatMesaName(o.OpeStMesa);

                  return (
                    <div
                      key={o.OpeIdInOrdenPedido}
                      className={`card p-3 border mb-3 shadow-sm ${tienePendientes ? "tarjeta-tintineo" : ""}`}
                      style={{
                        borderRadius: "12px",
                        background: tienePendientes ? "#fffdf5" : "#ffffff",
                        borderColor: tienePendientes ? "#ef4444" : "#e2e8f0"
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-bold" style={{ fontSize: "1rem", color: "#1e293b" }}>
                            {nombreMesaFormateado}
                          </span>
                          {estaBloqueadaPorOtro ? (
                            <Badge bg="dark" className="text-white fw-bold flex-shrink-0" style={{ fontSize: "0.68rem", background: "#334155" }}>
                              🔒 BLOQUEADO
                            </Badge>
                          ) : tienePendientes ? (
                            <Badge bg="danger" className="text-white fw-bold badge-tintineo" style={{ fontSize: "0.68rem" }}>
                              {esNuevo ? "NUEVO PEDIDO" : `${o.totalSinImprimir} PENDIENTE${o.totalSinImprimir > 1 ? "S" : ""}`}
                            </Badge>
                          ) : (
                            <Badge bg="success" className="text-white fw-bold" style={{ fontSize: "0.68rem" }}>
                              ✓ AL DÍA
                            </Badge>
                          )}
                        </div>
                        <span className="fw-bold text-dark" style={{ fontSize: "0.95rem" }}>
                          {formatMoneda(o.OpeInValor)}
                        </span>
                      </div>

                      <div className="d-flex align-items-center justify-content-between text-secondary mb-3" style={{ fontSize: "0.8rem" }}>
                        <div className="d-flex align-items-center gap-1">
                          <FiUser size={13} className="text-muted" />
                          <span className="fw-semibold">{o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}</span>
                        </div>
                        <div>
                          <strong>{o.OpeInNumPersonas || 1}</strong> pers.
                        </div>
                      </div>

                      {/* Botones de Acción Móvil */}
                      <div className="d-flex align-items-center gap-2 pt-2 border-top w-100 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary fw-semibold"
                          onClick={() => cargarDetallesDeOrden(o)}
                          style={{
                            height: "36px",
                            fontSize: "0.78rem",
                            borderRadius: "7px",
                            flex: 1
                          }}
                        >
                          <span>Ver Pedido</span>
                        </button>

                        {tienePendientes && !isMandatoryPrintEnabled() && (
                          <button
                            type="button"
                            disabled={estaProcesando}
                            className="btn btn-sm btn-outline-primary fw-bold"
                            onClick={() => handleConfirmar(o)}
                            style={{
                              height: "36px",
                              fontSize: "0.78rem",
                              borderRadius: "7px",
                              flex: 1,
                              gap: "4px",
                              opacity: estaBloqueadaPorOtro ? 0.6 : 1
                            }}
                          >
                            <FiCheckCircle size={14} />
                            <span>Guardar</span>
                          </button>
                        )}


                        {tienePendientes && (
                          <button
                            type="button"
                            disabled={estaProcesando}
                            className="btn btn-sm fw-bold shadow-sm"
                            onClick={() => handleImprimir(o)}
                            style={{
                              height: "36px",
                              fontSize: "0.78rem",
                              borderRadius: "8px",
                              background: "#ffffff",
                              border: "1.5px solid #1e293b",
                              color: "#1e293b",
                              flex: 1,
                              gap: "4px",
                              opacity: estaBloqueadaPorOtro ? 0.6 : 1
                            }}
                          >
                            <FiPrinter size={14} />
                            <span>IMPRIMIR</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista Escritorio / Tablet: Tabla */}
              <div className="table-responsive d-none d-md-block">
                <table className="table align-middle m-0" style={{ borderCollapse: "separate", borderSpacing: "0" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 16px", width: "27%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b" }}>Mesa</th>
                      <th style={{ padding: "12px 16px", width: "10%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b" }}>Personas</th>
                      <th style={{ padding: "12px 16px", width: "22%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b" }}>Atendido Por</th>
                      <th style={{ padding: "12px 16px", width: "11%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b", textAlign: "right" }}>Total</th>
                      <th style={{ padding: "12px 16px", width: "30%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b", textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesPaginadas.map((o) => {
                      const estaProcesando = procesandoId === o.OpeIdInOrdenPedido;
                      const tienePendientes = (o.totalSinImprimir || 0) > 0;
                      const esNuevo = nuevosIds.has(o.OpeIdInOrdenPedido) || tienePendientes;
                      const estaBloqueadaPorOtro = String(o.OpeStMesaAbierta) === '1' && Boolean(o.OpeStTerminal) && !isSameTerminal(o.OpeStTerminal, terminalActual);
                      const nombreMesaFormateado = formatMesaName(o.OpeStMesa);

                      return (
                        <tr 
                          key={o.OpeIdInOrdenPedido}
                          className={tienePendientes ? "tarjeta-tintineo" : ""}
                          style={{ borderBottom: "1px solid #f1f5f9", background: tienePendientes ? "#fffdf5" : "#ffffff", height: "52px" }}
                        >
                          {/* Columna Mesa + Badge alineado verticalmente */}
                          <td style={{ padding: "12px 16px" }}>
                            <div className="d-flex align-items-center justify-content-between gap-2" style={{ width: "100%" }}>
                              <span className="fw-bold text-truncate" style={{ fontSize: "0.92rem", color: "#1e293b", maxWidth: "130px" }} title={nombreMesaFormateado}>
                                {nombreMesaFormateado}
                              </span>
                              {estaBloqueadaPorOtro ? (
                                <Badge bg="dark" className="text-white fw-bold flex-shrink-0" style={{ fontSize: "0.68rem", minWidth: "115px", textAlign: "center", display: "inline-block", padding: "5px 8px", background: "#334155" }} title="Bloqueado">
                                  🔒 BLOQUEADO
                                </Badge>
                              ) : tienePendientes ? (
                                <Badge bg="danger" className="text-white fw-bold badge-tintineo flex-shrink-0" style={{ fontSize: "0.68rem", minWidth: "115px", textAlign: "center", display: "inline-block", padding: "5px 8px" }}>
                                  {esNuevo ? "NUEVO PEDIDO" : `${o.totalSinImprimir} SIN IMPRIMIR`}
                                </Badge>
                              ) : (
                                <Badge bg="success" className="text-white fw-bold flex-shrink-0" style={{ fontSize: "0.68rem", minWidth: "115px", textAlign: "center", display: "inline-block", padding: "5px 8px" }}>
                                  ✓ AL DÍA
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* Columna Personas */}
                          <td style={{ padding: "12px 16px" }}>
                            <span className="fw-semibold text-secondary" style={{ fontSize: "0.88rem" }}>
                              {o.OpeInNumPersonas || 1}
                            </span>
                          </td>

                          {/* Columna Atendido Por */}
                          <td style={{ padding: "12px 16px" }}>
                            <div className="d-flex align-items-center gap-1.5" style={{ fontSize: "0.85rem", maxWidth: "200px" }} title={o.NombreVendedor || "MESERO"}>
                              <FiUser size={14} className="text-muted flex-shrink-0" />
                              <span className="fw-bold text-dark text-truncate">
                                {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                              </span>
                            </div>
                          </td>

                          {/* Columna Total */}
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <span className="fw-bold text-dark" style={{ fontSize: "0.95rem" }}>
                              {formatMoneda(o.OpeInValor)}
                            </span>
                          </td>

                          {/* Columna Acciones (Alineación impecable idéntica a captura) */}
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <div className="d-flex align-items-center justify-content-end gap-2">
                              {/* Botón 1: Ver Pedido */}
                              <button
                                type="button"
                                className="btn btn-sm fw-semibold flex-shrink-0"
                                onClick={() => cargarDetallesDeOrden(o)}
                                style={{
                                  height: "34px",
                                  padding: "0 14px",
                                  fontSize: "0.78rem",
                                  borderRadius: "8px",
                                  border: "1.5px solid #94a3b8",
                                  background: "#ffffff",
                                  color: "#475569",
                                  whiteSpace: "nowrap",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center"
                                }}
                              >
                                <span>Ver Pedido</span>
                              </button>

                              {/* Botón 2: Guardar */}
                              {tienePendientes && !isMandatoryPrintEnabled() && (
                                <button
                                  type="button"
                                  disabled={estaProcesando}
                                  className="btn btn-sm fw-bold flex-shrink-0"
                                  onClick={() => handleConfirmar(o)}
                                  style={{
                                    height: "34px",
                                    padding: "0 14px",
                                    fontSize: "0.78rem",
                                    borderRadius: "8px",
                                    border: "1.5px solid #2563eb",
                                    background: "#ffffff",
                                    color: "#2563eb",
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "5px",
                                    opacity: estaBloqueadaPorOtro ? 0.6 : 1
                                  }}
                                  title="Guardar y confirmar pedido sin imprimir físicamente"
                                >
                                  <FiCheckCircle size={14} />
                                  <span>Guardar</span>
                                </button>
                              )}

                              {/* Botón 3: IMPRIMIR (Contorneado Gris Oscuro Slate) */}
                              {tienePendientes && (
                                <button
                                  type="button"
                                  disabled={estaProcesando}
                                  className="btn btn-sm fw-bold flex-shrink-0"
                                  onClick={() => handleImprimir(o)}
                                  style={{
                                    height: "34px",
                                    padding: "0 14px",
                                    fontSize: "0.78rem",
                                    borderRadius: "8px",
                                    border: "1.5px solid #1e293b",
                                    background: "#ffffff",
                                    color: "#1e293b",
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "5px",
                                    opacity: estaBloqueadaPorOtro ? 0.6 : 1
                                  }}
                                >
                                  <FiPrinter size={14} />
                                  <span>IMPRIMIR</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {/* Footer Informativo y Paginador */}
              <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-3" style={{ borderColor: "#f1f5f9" }}>
                <span className="text-muted small fw-medium">
                  Comandas registradas: <strong>{ordenesPaginadas.length} de {ordenes.length}</strong> {cantSinImprimir > 0 ? `(${cantSinImprimir} pendientes)` : ""}
                </span>

                {totalPaginas > 1 && (
                  <div className="d-flex align-items-center gap-1">
                    <button
                      className="btn btn-sm btn-outline-secondary p-1 px-2"
                      disabled={pagina === 1}
                      onClick={() => setPagina(prev => Math.max(1, prev - 1))}
                    >
                      <FiChevronLeft size={16} />
                    </button>
                    <span className="px-2 fw-bold text-dark small">Página {pagina} de {totalPaginas}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary p-1 px-2"
                      disabled={pagina === totalPaginas}
                      onClick={() => setPagina(prev => Math.min(totalPaginas, prev + 1))}
                    >
                      <FiChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* MODAL DETALLE DEL PEDIDO */}
      <Modal 
        show={selectedOrder !== null} 
        onHide={() => setSelectedOrder(null)}
        centered
        size="lg"
      >
        <Modal.Header closeButton style={{ background: "#f8fafc", borderColor: "#e2e8f0", padding: "10px 16px" }}>
          <Modal.Title className="fw-bold text-dark d-flex align-items-center justify-content-between w-100 pe-2" style={{ fontSize: "0.95rem" }}>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span>Detalle del Pedido</span>
              <span className="badge bg-danger text-white px-2 py-1" style={{ fontSize: "0.82rem" }}>
                Mesa {formatMesaName(selectedOrder?.OpeStMesa)}
              </span>
              <span className="text-secondary fw-medium" style={{ fontSize: "0.82rem" }}>
                • Mesero: <strong className="text-dark">{selectedOrder?.NombreVendedor?.toUpperCase() || 'MESERO'}</strong>
              </span>
            </div>
            <div className="text-dark fw-bold ms-auto" style={{ fontSize: "0.95rem" }}>
              Total: <span className="text-danger">{selectedOrder && formatMoneda(selectedOrder.OpeInValor)}</span>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3">
          {loadingDetails ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="danger" className="mb-2" />
              <div className="text-muted small">Cargando productos del pedido...</div>
            </div>
          ) : (
            <div>
              <div className="table-responsive" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <table className="table table-sm align-middle m-0" style={{ fontSize: "0.82rem" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#f8fafc" }}>
                    <tr className="table-light text-uppercase text-muted" style={{ fontSize: "0.72rem" }}>
                      <th style={{ width: "10%", padding: "6px 8px" }}>CANT.</th>
                      <th style={{ width: "45%", padding: "6px 8px" }}>PRODUCTO</th>
                      <th style={{ width: "20%", padding: "6px 8px" }} className="text-end">PRECIO</th>
                      <th style={{ width: "25%", padding: "6px 8px" }} className="text-end">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetails.map((item, idx) => {
                      const esSinImprimir = String(item.MopStImpreso || '0') !== '1';
                      const precioUnitario = Number(item.precioVenta || (item as any).valor || (item.total && item.cantidad ? item.total / item.cantidad : 0)) || 0;
                      
                      // Extraer observación si viene en la descripción o en la propiedad observacion
                      let descLimpia = item.ProStDescripcion || "";
                      let obsTexto = item.observacion || "";
                      if (!obsTexto && descLimpia.includes(" - ")) {
                        const partesDesc = descLimpia.split(" - ");
                        descLimpia = partesDesc[0];
                        obsTexto = partesDesc.slice(1).join(" - ");
                      }

                      return (
                        <tr 
                          key={idx}
                          style={{
                            background: esSinImprimir ? "#fefce8" : "transparent"
                          }}
                        >
                          <td className="fw-bold text-dark" style={{ padding: "4px 8px" }}>{item.cantidad}</td>
                          <td style={{ padding: "4px 8px" }}>
                            <div className="fw-bold text-dark text-uppercase" style={{ fontSize: "0.82rem", lineHeight: "1.2" }}>
                              {descLimpia}
                            </div>
                            {obsTexto && (
                              <small className="text-danger d-block fw-bold mt-0.5" style={{ fontSize: "0.72rem" }}>
                                📌 Obs: {obsTexto}
                              </small>
                            )}
                            {item.adicionales && item.adicionales.length > 0 && (
                              <div className="ps-2 border-start border-2 border-danger mt-0.5">
                                {item.adicionales.map((ad, sIdx) => (
                                  <small key={sIdx} className="d-block text-muted" style={{ fontSize: "0.72rem" }}>
                                    + {ad.cantidad} {ad.ProStDescripcion} {ad.precioVenta > 0 ? `(${formatMoneda(ad.precioVenta)})` : ""}
                                  </small>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="text-end fw-semibold text-dark" style={{ padding: "4px 8px", fontSize: "0.82rem" }}>
                            {formatMoneda(precioUnitario)}
                          </td>
                          <td className="text-end" style={{ padding: "4px 8px" }}>
                            {esSinImprimir ? (
                              <Badge bg="warning" className="text-dark fw-bold px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                                ⚠️ SIN IMPRIMIR
                              </Badge>
                            ) : (
                              <Badge bg="secondary" className="px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                                IMPRESO
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}>
          {selectedOrder && (() => {
            const haySinImprimir = orderDetails.some(item => String(item.MopStImpreso || '0') !== '1');
            const estaProcesando = procesandoId === selectedOrder.OpeIdInOrdenPedido;
            const estaBloqueadaPorOtro = String(selectedOrder.OpeStMesaAbierta) === '1' && Boolean(selectedOrder.OpeStTerminal) && !isSameTerminal(selectedOrder.OpeStTerminal, terminalActual);

            if (estaBloqueadaPorOtro) {
              return (
                <div className="d-flex flex-column gap-2 w-100">
                  <div className="alert alert-dark m-0 py-2 px-3 fw-bold small text-center shadow-sm d-flex align-items-center justify-content-center gap-2" style={{ background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "8px" }}>
                    <FiLock size={15} />
                    <span>ESTA MESA ESTÁ SIENDO EDITADA EN OTRO DISPOSITIVO ({selectedOrder.OpeStTerminal?.toUpperCase() || 'MÓVIL'}). NO SE PUEDE MODIFICAR HASTA QUE SE LIBERE.</span>
                  </div>
                  <div className="d-flex justify-content-end w-100">
                    <Button
                      variant="secondary"
                      className="fw-bold rounded-3"
                      onClick={() => setSelectedOrder(null)}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              );
            }

            if (!haySinImprimir) {
              return (
                <div className="d-flex align-items-center justify-content-between w-100">
                  <span className="text-success fw-bold small d-flex align-items-center gap-1">
                    <FiCheckCircle /> Todos los productos de este pedido ya están impresos.
                  </span>
                  <Button
                    variant="secondary"
                    className="fw-bold rounded-3"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Cerrar
                  </Button>
                </div>
              );
            }

            return (
              <div className="d-flex align-items-center gap-2 w-100 justify-content-end">
                {!isMandatoryPrintEnabled() && (
                  <Button
                    variant="outline-success"
                    className="fw-bold rounded-3"
                    disabled={estaProcesando || estaBloqueadaPorOtro}
                    onClick={() => handleConfirmar(selectedOrder)}
                  >
                    <FiCheckCircle className="me-1" /> Confirmar (Guardar)
                  </Button>
                )}
                <Button
                  variant="outline-dark"
                  className="fw-bold rounded-3"
                  style={{ borderColor: "#1e293b", color: "#1e293b", background: "#ffffff" }}
                  disabled={estaProcesando || estaBloqueadaPorOtro}
                  onClick={() => handleImprimir(selectedOrder)}
                >
                  <FiPrinter className="me-1" /> Imprimir
                </Button>
              </div>
            );
          })()}
        </Modal.Footer>
      </Modal>

    </section>
  );
}
