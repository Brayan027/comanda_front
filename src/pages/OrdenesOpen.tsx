import { useEffect, useState, useMemo } from "react";
import { FiLayers, FiSearch, FiEdit3, FiChevronLeft, FiChevronRight, FiLock, FiArrowLeft, FiUser } from "react-icons/fi";
import { Spinner, Badge } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, socket, getTerminalId } from "../config/api";

import "../styles/crear-ordenes.css";

interface ActiveOrder {
  OpeIdInOrdenPedido: string | number;
  OpeStMesa: string;
  OpeIdStVendedor: string;
  OpeInNumPersonas: number;
  OpeInValor: number;
  OpeDaFechaDoc: string;
  NombreVendedor: string;
  CodigoVendedor: string;
  OpeStMesaAbierta?: string | number;
  OpeStTerminal?: string;
}

interface OrdenesOpenProps {
  onEditar: (id: string | number) => void;
  onVolver?: () => void;
}

export default function OrdenesOpen({ onEditar, onVolver }: OrdenesOpenProps) {
  const [ordenes, setOrdenes] = useState<ActiveOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(10);
  const [pagina, setPagina] = useState(1);

  const infoPuntoVenta = useMemo(() => {
    try {
      const stored = localStorage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const token = localStorage.getItem("token") || "";

  // Terminal ID estable y permanente para este dispositivo (nunca cambia entre recargas)
  const terminalActual = useMemo(() => getTerminalId(), []);


  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(infoPuntoVenta?.PveIdInPuntoVenta || "5"),
    "terminal": terminalActual
  }), [token, infoPuntoVenta, terminalActual]);

  const cargarOrdenes = async (mostrarCargando = true) => {
    try {
      if (mostrarCargando) setCargando(true);
      const resp = await fetch(`${API_BASE_URL}/ordenes/activas`, {
        method: "GET",
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setOrdenes(resData.body || []);
      }
    } catch (e) {
      console.error("Error al cargar ordenes abiertas", e);
    } finally {
      if (mostrarCargando) setCargando(false);
    }
  };

  const [mesaVerificando, setMesaVerificando] = useState<string | null>(null);

  const handleIntentarEditar = async (orden: ActiveOrder) => {
    const mesaId = orden.OpeStMesa;
    if (mesaVerificando === mesaId) return; // Evitar doble click

    try {
      setMesaVerificando(mesaId);

      // Solicitar acceso exclusivo a la mesa directamente en el backend
      // El backend garantiza atomicidad con mutex + transacción SELECT FOR UPDATE
      const resp = await fetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mesa: mesaId,
          terminal: terminalActual
        })
      });

      if (resp.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("last_login");
        await Swal.fire({
          icon: "info",
          title: "Sesión Expirada",
          text: "Su sesión ha expirado, por favor inicie sesión nuevamente.",
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#2563eb"
        });
        window.location.href = "/";
        return;
      }

      const resData = await resp.json();
      if (!resp.ok || resData.locked) {
        const terminalBloqueo = resData.terminal || "otro dispositivo";
        Swal.fire({
          icon: "warning",
          title: "🔒 Mesa Ocupada",
          html: `La mesa ya está siendo editada por <b>${terminalBloqueo}</b>.<br/>No puedes editarla al mismo tiempo.`,
          confirmButtonColor: "#e31b23",
          confirmButtonText: "Entendido"
        });
        return;
      }

      // Acceso concedido → navegar al editor
      onEditar(orden.OpeIdInOrdenPedido);
    } catch (e) {
      console.error("Error al verificar/bloquear mesa:", e);
      // En caso de error de red, permitir acceso para no bloquear la operación
      onEditar(orden.OpeIdInOrdenPedido);
    } finally {
      setMesaVerificando(null);
    }
  };


  useEffect(() => {
    cargarOrdenes(true);

    const onActualizar = () => {
      cargarOrdenes(false);
    };

    // Escuchar evento genérico de actualización de órdenes
    socket.on("ordenes_actualizadas", onActualizar);

    // Escuchar evento específico de bloqueo/desbloqueo de mesa
    // Actualiza solo la orden afectada sin recargar toda la lista → instantáneo
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

    socket.on("mesa_bloqueada", onMesaBloqueada);

    return () => {
      socket.off("ordenes_actualizadas", onActualizar);
      socket.off("mesa_bloqueada", onMesaBloqueada);
    };
  }, [headers]);

  // Filtrado de búsqueda en el lado del cliente
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

  // Cálculos de paginación
  const total = ordenesFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  
  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <section className="ordenes-page px-1 px-md-3 pt-0" style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}>
      <div className="container-fluid pt-2 px-1 px-md-2">
        
        <header className="co-header d-flex align-items-center justify-content-between">
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
              <FiLayers size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="co-header-subtitle">Comandas Activas</div>
              <h1 className="co-header-title">Órdenes Abiertas</h1>
            </div>
          </div>

          {onVolver && (
            <button
              type="button"
              title="Volver a inicio"
              onClick={onVolver}
              className="btn btn-sm d-flex align-items-center gap-1.5 fw-bold"
              style={{
                border: "1.5px solid #cbd5e1",
                borderRadius: "8px",
                background: "#ffffff",
                color: "#334155",
                padding: "5px 12px",
                height: "36px",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: "0.82rem",
                boxShadow: "0 2px 5px rgba(0, 0, 0, 0.04)",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = "#e31b23";
                btn.style.color = "#ffffff";
                btn.style.borderColor = "#e31b23";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = "#ffffff";
                btn.style.color = "#334155";
                btn.style.borderColor = "#cbd5e1";
              }}
            >
              <FiArrowLeft size={16} />
              <span>Volver</span>
            </button>
          )}
        </header>

        {/* Datatable Card container */}
        <div className="bg-white rounded-4 shadow-sm p-3 p-md-4 border" style={{ borderColor: "#e2e8f0" }}>
          
          {/* Controls bar superior: SOLO el filtro de búsqueda */}
          <div className="d-flex justify-content-end align-items-center mb-3">
            <div className="d-flex align-items-center gap-2 w-100 w-sm-auto" style={{ maxWidth: "340px" }}>
              <span className="fw-semibold text-secondary" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Buscar:</span>
              <div className="position-relative w-100">
                <input
                  type="text"
                  className="form-control form-control-sm pe-4 shadow-none"
                  placeholder="Filtrar mesa o mesero..."
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
              <div className="text-muted fw-semibold" style={{ fontSize: "0.9rem" }}>Cargando listado de mesas abiertas...</div>
            </div>
          ) : ordenes.length === 0 ? (
            <div className="text-center text-muted py-5 fw-semibold" style={{ fontSize: "0.92rem" }}>
              No hay pedidos abiertos en este momento.
            </div>
          ) : (
            <>
              {/* Vista Móvil: Tarjetas Nativas Bien Melas */}
              <div className="d-block d-md-none">
                {ordenesPaginadas.map((o) => {
                  const estaAbiertaEnOtraTerminal = String(o.OpeStMesaAbierta) === '1' && 
                    (!o.OpeStTerminal || o.OpeStTerminal.trim().toUpperCase() !== terminalActual.trim().toUpperCase());

                  const estaVerificando = mesaVerificando === o.OpeStMesa;

                  const nombreMesaFormateado = o.OpeStMesa?.trim().toLowerCase().startsWith("mesa") 
                    ? o.OpeStMesa.trim() 
                    : `Mesa ${o.OpeStMesa.trim()}`;

                  return (
                    <div
                      key={o.OpeIdInOrdenPedido}
                      onClick={() => !estaVerificando && handleIntentarEditar(o)}
                      className="card p-3 border"
                      style={{
                        borderRadius: "12px",
                        background: estaAbiertaEnOtraTerminal ? "#fffbeb" : "#ffffff",
                        borderColor: estaAbiertaEnOtraTerminal ? "#fbbf24" : "#e2e8f0",
                        marginBottom: "14px",
                        boxShadow: estaAbiertaEnOtraTerminal 
                          ? "0 2px 8px rgba(251, 191, 36, 0.2)" 
                          : "0 2px 6px rgba(15, 23, 42, 0.05)",
                        cursor: estaVerificando ? "wait" : "pointer",
                        transition: "all 0.15s ease-in-out",
                        opacity: estaVerificando ? 0.75 : 1
                      }}
                    >
                      {/* Fila Superior: Nombre de Mesa + Precio Destacado */}
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                          <span className="fw-bold" style={{ fontSize: "0.92rem", color: "#334155" }}>
                            {nombreMesaFormateado}
                          </span>

                          {estaAbiertaEnOtraTerminal && (
                            <Badge bg="warning" className="text-dark d-inline-flex align-items-center gap-1" style={{ fontSize: "0.65rem", padding: "4px 6px" }}>
                              <FiLock size={10} />
                              {o.OpeStTerminal}
                            </Badge>
                          )}
                        </div>

                        <span className="fw-bold" style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                          {formatMoneda(o.OpeInValor)}
                        </span>
                      </div>

                      {/* Fila Inferior: Icono & Mesero + Botón Editar */}
                      <div className="d-flex align-items-center justify-content-between pt-2 border-top" style={{ borderColor: "#f1f5f9" }}>
                        <div className="d-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: "0.78rem", minWidth: 0, flex: 1, paddingRight: "8px" }}>
                          <FiUser size={13} className="text-muted flex-shrink-0" />
                          <span className="fw-semibold text-truncate" style={{ color: "#64748b" }}>
                            {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                          </span>
                        </div>

                        <button 
                          disabled={estaVerificando}
                          className={`btn btn-sm ${estaAbiertaEnOtraTerminal ? "btn-outline-warning text-dark" : "btn-danger"} py-1 px-3 d-inline-flex align-items-center gap-1.5 fw-bold flex-shrink-0`}
                          onClick={(e) => { e.stopPropagation(); if (!estaVerificando) handleIntentarEditar(o); }}
                          style={{ 
                            borderRadius: "7px", 
                            fontSize: "0.78rem", 
                            height: "30px",
                            background: estaVerificando ? "#94a3b8" : (estaAbiertaEnOtraTerminal ? "transparent" : "#e31b23"),
                            border: estaAbiertaEnOtraTerminal && !estaVerificando ? "1px solid #ffc107" : "none",
                            color: estaVerificando ? "#fff" : (estaAbiertaEnOtraTerminal ? "#212529" : "#ffffff"),
                            boxShadow: estaVerificando || estaAbiertaEnOtraTerminal ? "none" : "0 2px 5px rgba(227, 27, 35, 0.22)",
                            cursor: estaVerificando ? "wait" : "pointer"
                          }}
                        >
                          {estaVerificando 
                            ? <Spinner animation="border" size="sm" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                            : (estaAbiertaEnOtraTerminal ? <FiLock size={12} /> : <FiEdit3 size={12} />)
                          }
                          <span>{estaVerificando ? "Verificando..." : "Editar"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista Escritorio / Tablet: Tabla mela ultra moderna */}
              <div className="table-responsive d-none d-md-block">
                <table className="table align-middle m-0" style={{ borderCollapse: "separate", borderSpacing: "0" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 16px", width: "15%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>Mesa</th>
                      <th style={{ padding: "12px 16px", width: "50%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b" }}>Nombre del mesero</th>
                      <th style={{ padding: "12px 16px", width: "25%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b", textAlign: "right" }}>Vr. cuenta</th>
                      <th style={{ padding: "12px 16px", width: "10%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#64748b", textAlign: "center", borderTopRightRadius: "8px", borderBottomRightRadius: "8px" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesPaginadas.map((o) => {
                      const estaAbiertaEnOtraTerminal = String(o.OpeStMesaAbierta) === '1' && 
                        (!o.OpeStTerminal || o.OpeStTerminal.trim().toUpperCase() !== terminalActual.trim().toUpperCase());

                      const estaVerificando = mesaVerificando === o.OpeStMesa;

                      return (
                        <tr 
                          key={o.OpeIdInOrdenPedido}
                          onClick={() => !estaVerificando && handleIntentarEditar(o)}
                          style={{ 
                            cursor: estaVerificando ? "wait" : "pointer", 
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background-color 0.15s ease-in-out",
                            background: estaAbiertaEnOtraTerminal ? "#fffbeb" : "#ffffff",
                            opacity: estaVerificando ? 0.75 : 1
                          }}
                          onMouseEnter={(e) => { if (!estaVerificando) e.currentTarget.style.backgroundColor = estaAbiertaEnOtraTerminal ? "#fef3c7" : "#f8fafc"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = estaAbiertaEnOtraTerminal ? "#fffbeb" : "#ffffff"; }}
                        >
                          <td style={{ padding: "14px 16px", fontWeight: "600", color: "#334155" }}>
                            <div className="d-flex align-items-center gap-2">
                              <span>{o.OpeStMesa}</span>
                              {estaAbiertaEnOtraTerminal && (
                                <Badge bg="warning" className="text-dark d-inline-flex align-items-center gap-1" style={{ fontSize: "0.68rem", fontWeight: "700" }}>
                                  <FiLock size={10} />
                                  En edición ({o.OpeStTerminal})
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: "500" }}>
                            {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "700", color: "#0f172a", fontSize: "0.92rem" }}>
                            {formatMoneda(o.OpeInValor)}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <button 
                              disabled={estaVerificando}
                              className={`btn btn-sm ${estaAbiertaEnOtraTerminal && !estaVerificando ? "btn-outline-warning text-dark" : "btn-danger"} py-1 px-3 d-inline-flex align-items-center gap-1.5 fw-bold`}
                              onClick={(e) => { e.stopPropagation(); if (!estaVerificando) handleIntentarEditar(o); }}
                              style={{ 
                                borderRadius: "6px", 
                                fontSize: "0.78rem",
                                background: estaVerificando ? "#94a3b8" : (estaAbiertaEnOtraTerminal ? "transparent" : "#e31b23"),
                                border: estaAbiertaEnOtraTerminal && !estaVerificando ? "1px solid #ffc107" : "none",
                                color: estaVerificando ? "#fff" : (estaAbiertaEnOtraTerminal ? "#212529" : "#ffffff"),
                                boxShadow: estaVerificando || estaAbiertaEnOtraTerminal ? "none" : "0 2px 4px rgba(227, 27, 35, 0.25)",
                                cursor: estaVerificando ? "wait" : "pointer"
                              }}
                            >
                              {estaVerificando 
                                ? <Spinner animation="border" size="sm" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                                : (estaAbiertaEnOtraTerminal ? <FiLock size={12} /> : <FiEdit3 size={12} />)
                              }
                              <span>{estaVerificando ? "Verificando..." : "Editar"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination & Records Footer: 'Mostrar X registros' abajo a la izquierda y paginador a la derecha */}
          {!cargando && total > 0 && (
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #e2e8f0" }}>
              {/* Selector 'Mostrar X registros' abajo */}
              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary" style={{ fontSize: "0.85rem" }}>Mostrar</span>
                <select 
                  className="form-select form-select-sm shadow-none" 
                  value={limite}
                  onChange={(e) => { setLimite(Number(e.target.value)); setPagina(1); }}
                  style={{ width: "76px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.82rem" }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-secondary" style={{ fontSize: "0.85rem" }}>registros</span>
              </div>

              {/* Información de rango */}
              <div className="text-secondary" style={{ fontSize: "0.82rem" }}>
                Mostrando desde el <strong>{startIndex + 1}</strong> hasta el <strong>{endIndex}</strong> (Total: <strong>{total}</strong>)
              </div>

              {/* Botones Paginador */}
              <div className="d-flex align-items-center gap-1.5">
                <button
                  className="btn btn-sm btn-light d-flex align-items-center justify-content-center p-1.5"
                  disabled={pagina <= 1}
                  onClick={() => setPagina(prev => Math.max(1, prev - 1))}
                  style={{ borderRadius: "6px", border: "1px solid #cbd5e1", width: "32px", height: "32px" }}
                >
                  <FiChevronLeft size={16} />
                </button>
                
                <span className="fw-bold px-3 py-1 text-white rounded-2 d-flex align-items-center justify-content-center" style={{ fontSize: "0.85rem", background: "#e31b23", minWidth: "32px", height: "32px" }}>
                  {pagina}
                </span>

                <button
                  className="btn btn-sm btn-light d-flex align-items-center justify-content-center p-1.5"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina(prev => Math.min(totalPaginas, prev + 1))}
                  style={{ borderRadius: "6px", border: "1px solid #cbd5e1", width: "32px", height: "32px" }}
                >
                  <FiChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
