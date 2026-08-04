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
  FiEdit3
} from "react-icons/fi";


import { Spinner, Badge, Modal, Button } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, socket, getTerminalId, isMandatoryPrintEnabled, isMobileOrTabletDevice, formatTerminalName } from "../config/api";


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


export default function PedidosPendientes({ onEditarMesa, onVolver, onUpdateCantPendientes }: PedidosPendientesProps) {



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

  // Estado del Sonido de Alertas (persistido en localStorage)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem("sonidoPendientesHabilitado");
    return stored !== null ? stored === "true" : true;
  });

  const infoPuntoVenta = useMemo(() => {
    try {
      const stored = localStorage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const token = localStorage.getItem("token") || "";
  const terminalActual = useMemo(() => getTerminalId(), []);

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(infoPuntoVenta?.PveIdInPuntoVenta || "5"),
    "terminal": terminalActual
  }), [token, infoPuntoVenta, terminalActual]);

  const toggleSound = () => {
    // Solo permitir toggle en PC
    if (esMovil) return;
    setSoundEnabled(prev => {
      const nextVal = !prev;
      localStorage.setItem("sonidoPendientesHabilitado", String(nextVal));
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
        fetch(`${API_BASE_URL}/ordenes/activas`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/ordenes/pendientes`, { headers }).catch(() => null)
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

      const mapSinImprimir = new Map<string | number, number>();
      pendientes.forEach(p => {
        mapSinImprimir.set(p.OpeIdInOrdenPedido, p.totalSinImprimir || 1);
      });

      // Combinar todas las órdenes abiertas, asociando su conteo de items sin imprimir y estado de bloqueo
      const ordenesCombinadas: PendingOrder[] = activas.map(a => {
        const sinImp = mapSinImprimir.get(a.OpeIdInOrdenPedido) || 0;
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

    // Polling cada 4 segundos para detectar compras/facturaciones hechas desde Dianasis Desktop
    const pollingInterval = setInterval(() => {
      cargarPendientes(false);
    }, 4000);

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
      const resp = await fetch(`${API_BASE_URL}/ordenes/${orden.OpeIdInOrdenPedido}`, {
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
    const estaBloqueadaPorOtro = String(orden.OpeStMesaAbierta) === '1' && Boolean(orden.OpeStTerminal) && orden.OpeStTerminal !== terminalActual;

    if (estaBloqueadaPorOtro) {
      Swal.fire({
        icon: "warning",
        title: "🔒 Mesa Ocupada",
        html: `La <b>Mesa ${mesaId}</b> está siendo editada en este momento por <b>${formatTerminalName(orden.OpeStTerminal)}</b>.<br/>No puedes modificarla ni procesarla al mismo tiempo.`,
        confirmButtonColor: "#e31b23",
        confirmButtonText: "Entendido"
      });
      return false;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
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
          const term = resData.terminal || "otro dispositivo";
          Swal.fire({
            icon: "warning",
            title: "🔒 Mesa Ocupada",
            html: `La <b>Mesa ${mesaId}</b> está siendo editada en este momento por <b>${term}</b>.<br/>No puedes modificarla ni procesarla al mismo tiempo.`,
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

  const handleEditarMesaAccion = async (orden: PendingOrder) => {
    if (!onEditarMesa) return;
    const ok = await verificarBloqueoMesa(orden);
    if (!ok) return;
    onEditarMesa(orden.OpeIdInOrdenPedido);
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
      const resp = await fetch(`${API_BASE_URL}/ordenes/${targetId}/confirmar-impresos`, {
        method: "PUT",
        headers
      });

      Swal.close();
      if (resp.ok) {
        Swal.fire({
          icon: "success",
          title: "Pedido Confirmado",
          text: `Mesa ${orden.OpeStMesa} marcada como procesada sin impresión física.`,
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
      fetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ mesa: orden.OpeStMesa })
      }).catch(() => null);
    }
  };

  const handleImprimir = async (orden: PendingOrder) => {
    const ok = await verificarBloqueoMesa(orden);
    if (!ok) return;

    const targetId = orden.OpeIdInOrdenPedido;
    setProcesandoId(targetId);

    Swal.fire({
      title: "Enviando a impresión...",
      text: "Conectando con la impresora de comandas...",
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/${targetId}/imprimir-pendiente`, {
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
      fetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
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
        
        {/* Header de la vista */}
        <header className="co-header d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3">
            <div
              style={{
                width: "28px",
                height: "28px",
                background: "#e31b23",
                color: "#fff",
                borderRadius: "7px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(227, 27, 35, 0.25)",
              }}
            >
              <FiClock size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="co-header-subtitle">Comandas sin Confirmar</div>
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


          <div className="d-flex align-items-center gap-2">
            {/* Toggle de Alerta Sonora - SOLO visible en PC */}
            {!esMovil && (
            <button
              type="button"
              onClick={toggleSound}
              className={`btn btn-sm d-flex align-items-center gap-1.5 fw-bold ${soundEnabled ? "btn-outline-danger" : "btn-outline-secondary"}`}
              style={{
                borderRadius: "8px",
                height: "36px",
                fontSize: "0.8rem",
                padding: "5px 12px"
              }}
              title={soundEnabled ? "Desactivar sonido de notificación" : "Activar sonido de notificación"}
            >
              {soundEnabled ? <FiVolume2 size={16} className="text-danger" /> : <FiVolumeX size={16} />}
              <span>{soundEnabled ? "Sonido ON" : "Sonido OFF"}</span>
            </button>
            )}

            {onVolver && (
              <button
                type="button"
                onClick={onVolver}
                className="btn btn-sm d-flex align-items-center gap-1.5 fw-bold"
                style={{
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "8px",
                  background: "#ffffff",
                  color: "#334155",
                  padding: "5px 12px",
                  height: "36px"
                }}
              >
                <FiArrowLeft size={16} />
                <span>Volver</span>
              </button>
            )}
          </div>
        </header>

        {/* Datatable Card container */}
        <div className="bg-white rounded-4 shadow-sm p-3 p-md-4 border" style={{ borderColor: "#e2e8f0" }}>
          
          {/* Controls bar superior: Filtro de búsqueda */}
          <div className="d-flex justify-content-end align-items-center mb-3">
            <div className="d-flex align-items-center gap-2 w-100 w-sm-auto" style={{ maxWidth: "340px" }}>
              <span className="fw-semibold text-secondary" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Buscar:</span>
              <div className="position-relative w-100">
                <input
                  type="text"
                  className="form-control form-control-sm pe-4 shadow-none"
                  placeholder="Filtrar por mesa o mesero..."
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                  style={{ borderRadius: "8px", border: "1px solid #cbd5e1", height: "36px", fontSize: "0.85rem", paddingLeft: "12px" }}
                />
                <FiSearch className="position-absolute text-muted" style={{ right: "12px", top: "11px" }} size={14} />
              </div>
            </div>
          </div>

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
                  const estaBloqueadaPorOtro = String(o.OpeStMesaAbierta) === '1' && Boolean(o.OpeStTerminal) && o.OpeStTerminal !== terminalActual;
                  const nombreMesaFormateado = o.OpeStMesa?.trim().toLowerCase().startsWith("mesa") 
                    ? o.OpeStMesa.trim() 
                    : `Mesa ${o.OpeStMesa.trim()}`;

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
                              🔒 EN USO POR {formatTerminalName(o.OpeStTerminal)}
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

                        {tienePendientes ? (
                          !isMandatoryPrintEnabled() && (
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
                          )
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary fw-semibold"
                            onClick={() => handleEditarMesaAccion(o)}
                            style={{
                              height: "36px",
                              fontSize: "0.78rem",
                              borderRadius: "7px",
                              flex: 1,
                              opacity: estaBloqueadaPorOtro ? 0.6 : 1
                            }}
                          >
                            <FiEdit3 size={14} className="me-1" />
                            <span>Editar</span>
                          </button>
                        )}


                        {tienePendientes && (
                          <button
                            type="button"
                            disabled={estaProcesando}
                            className="btn btn-sm btn-danger fw-bold shadow-sm"
                            onClick={() => handleImprimir(o)}
                            style={{
                              height: "36px",
                              fontSize: "0.78rem",
                              borderRadius: "7px",
                              background: "#e31b23",
                              border: "none",
                              flex: 1,
                              gap: "4px",
                              opacity: estaBloqueadaPorOtro ? 0.6 : 1
                            }}
                          >
                            <FiPrinter size={14} />
                            <span>ENVIAR E IMPRIMIR</span>
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
                      const estaBloqueadaPorOtro = String(o.OpeStMesaAbierta) === '1' && Boolean(o.OpeStTerminal) && o.OpeStTerminal !== terminalActual;
                      const nombreMesaFormateado = o.OpeStMesa?.trim().toLowerCase().startsWith("mesa") 
                        ? o.OpeStMesa.trim() 
                        : `Mesa ${o.OpeStMesa.trim()}`;

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
                                <Badge bg="dark" className="text-white fw-bold flex-shrink-0" style={{ fontSize: "0.68rem", minWidth: "115px", textAlign: "center", display: "inline-block", padding: "5px 8px", background: "#334155" }} title={`Editando por ${formatTerminalName(o.OpeStTerminal)}`}>
                                  🔒 {formatTerminalName(o.OpeStTerminal)}
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
                              {o.OpeInNumPersonas || 1} pers.
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

                          {/* Columna Acciones (Alineación perfecta por slots rígidos) */}
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <div className="d-flex align-items-center justify-content-end gap-2">
                              {/* Slot 1: Ver Pedido */}
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary fw-semibold flex-shrink-0"
                                onClick={() => cargarDetallesDeOrden(o)}
                                style={{
                                  height: "34px",
                                  width: "92px",
                                  fontSize: "0.76rem",
                                  borderRadius: "7px",
                                  whiteSpace: "nowrap",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "0"
                                }}
                              >
                                <span>Ver Pedido</span>
                              </button>

                              {tienePendientes ? (
                                !isMandatoryPrintEnabled() ? (
                                  <button
                                    type="button"
                                    disabled={estaProcesando}
                                    className="btn btn-sm btn-outline-primary fw-bold flex-shrink-0"
                                    onClick={() => handleConfirmar(o)}
                                    style={{
                                      height: "34px",
                                      width: "84px",
                                      fontSize: "0.76rem",
                                      borderRadius: "7px",
                                      whiteSpace: "nowrap",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "0",
                                      opacity: estaBloqueadaPorOtro ? 0.6 : 1
                                    }}
                                    title="Guardar y confirmar pedido sin imprimir físicamente"
                                  >
                                    <FiCheckCircle size={13} className="me-1" />
                                    <span>Guardar</span>
                                  </button>
                                ) : (
                                  <div style={{ width: "84px" }} className="flex-shrink-0" />
                                )
                              ) : (
                                <div style={{ width: "84px" }} className="flex-shrink-0" />
                              )}



                              {/* Slot 3: Acción de Impresión (Reserva 152px fijos para alineación impecable) */}
                              <div style={{ width: "152px" }} className="flex-shrink-0 d-flex justify-content-end">
                                {tienePendientes && (
                                  <button
                                    type="button"
                                    disabled={estaProcesando}
                                    className="btn btn-sm btn-danger fw-bold shadow-sm w-100"
                                    onClick={() => handleImprimir(o)}
                                    style={{
                                      height: "34px",
                                      fontSize: "0.74rem",
                                      borderRadius: "7px",
                                      whiteSpace: "nowrap",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: "#e31b23",
                                      border: "none",
                                      gap: "4px",
                                      padding: "0 6px",
                                      opacity: estaBloqueadaPorOtro ? 0.6 : 1
                                    }}
                                  >
                                    <FiPrinter size={13} />
                                    <span>ENVIAR E IMPRIMIR</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {/* Paginador */}

              {totalPaginas > 1 && (
                <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-3" style={{ borderColor: "#f1f5f9" }}>
                  <span className="text-muted small">
                    Mostrando {startIndex + 1} a {endIndex} de {total} órdenes abiertas ({cantSinImprimir} pendientes)

                  </span>
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
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODAL DETALLE DEL PEDIDO */}
      <Modal 
        show={selectedOrder !== null} 
        onHide={() => setSelectedOrder(null)}
        centered
        size="lg"
      >
        <Modal.Header closeButton style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}>
          <Modal.Title className="fw-bold text-dark" style={{ fontSize: "1.1rem" }}>
            Detalle del Pedido - {(() => {
              const m = selectedOrder?.OpeStMesa?.trim() || "";
              return m.toLowerCase().startsWith("mesa") ? m : `Mesa ${m}`;
            })()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3 p-md-4">
          {loadingDetails ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="danger" className="mb-2" />
              <div className="text-muted small">Cargando productos del pedido...</div>
            </div>
          ) : (
            <div>
              <div className="d-flex align-items-center justify-content-between border-bottom pb-2 mb-3 text-secondary small">
                <div>Mesero: <strong>{selectedOrder?.NombreVendedor?.toUpperCase() || 'MESERO'}</strong></div>
                <div>Total: <strong>{selectedOrder && formatMoneda(selectedOrder.OpeInValor)}</strong></div>
              </div>

              <div className="table-responsive">
                <table className="table align-middle m-0">
                  <thead>
                    <tr className="table-light text-uppercase small text-muted">
                      <th style={{ width: "10%" }}>CANT.</th>
                      <th style={{ width: "45%" }}>PRODUCTO</th>
                      <th style={{ width: "20%" }} className="text-end">PRECIO</th>
                      <th style={{ width: "25%" }} className="text-end">ESTADO</th>
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
                          <td className="fw-bold text-dark">{item.cantidad}</td>
                          <td>
                            <div className="fw-bold text-dark text-uppercase" style={{ fontSize: "0.9rem" }}>
                              {descLimpia}
                            </div>
                            {obsTexto && (
                              <small className="text-danger d-block fw-bold mt-0.5" style={{ fontSize: "0.78rem" }}>
                                📌 Obs: {obsTexto}
                              </small>
                            )}
                            {item.adicionales && item.adicionales.length > 0 && (
                              <div className="ps-2 border-start border-2 border-danger mt-1">
                                {item.adicionales.map((ad, sIdx) => (
                                  <small key={sIdx} className="d-block text-muted">
                                    + {ad.cantidad} {ad.ProStDescripcion} {ad.precioVenta > 0 ? `(${formatMoneda(ad.precioVenta)})` : ""}
                                  </small>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="text-end fw-semibold text-dark" style={{ fontSize: "0.9rem" }}>
                            {formatMoneda(precioUnitario)}
                          </td>
                          <td className="text-end">
                            {esSinImprimir ? (
                              <Badge bg="warning" className="text-dark fw-bold px-2 py-1" style={{ fontSize: "0.72rem" }}>
                                ⚠️ SIN IMPRIMIR / NUEVO
                              </Badge>
                            ) : (
                              <Badge bg="secondary" className="px-2 py-1" style={{ fontSize: "0.72rem" }}>
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
                    disabled={estaProcesando}
                    onClick={() => handleConfirmar(selectedOrder)}
                  >
                    <FiCheckCircle className="me-1" /> Confirmar (Guardar)
                  </Button>
                )}
                <Button
                  variant="danger"
                  className="fw-bold rounded-3"
                  style={{ background: "#e31b23" }}
                  disabled={estaProcesando}
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
