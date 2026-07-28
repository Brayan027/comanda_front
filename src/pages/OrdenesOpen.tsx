import { useEffect, useState, useMemo } from "react";
import { FiLayers, FiSearch, FiEdit3, FiChevronLeft, FiChevronRight, FiLock, FiArrowLeft, FiUser } from "react-icons/fi";
import { Spinner, Badge } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, socket } from "../config/api";
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

  const terminalActual = useMemo(() => {
    let term = localStorage.getItem("terminal");
    if (!term) {
      term = "TERMINAL 1";
      localStorage.setItem("terminal", term);
    }
    return term;
  }, []);

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(infoPuntoVenta?.PveIdInPuntoVenta || "5"),
    "terminal": terminalActual
  }), [token, infoPuntoVenta, terminalActual]);

  const cargarOrdenes = async () => {
    try {
      setCargando(true);
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
      setCargando(false);
    }
  };

  const handleIntentarEditar = async (orden: ActiveOrder) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mesa: orden.OpeStMesa,
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
        Swal.fire({
          icon: "warning",
          title: "Mesa Ocupada",
          text: resData.mensaje || "La mesa ya se encuentra abierta en otro dispositivo",
          confirmButtonColor: "#ef4444"
        });
        return;
      }

      onEditar(orden.OpeIdInOrdenPedido);
    } catch (e) {
      console.error("Error al abrir/bloquear mesa:", e);
      onEditar(orden.OpeIdInOrdenPedido);
    }
  };

  useEffect(() => {
    cargarOrdenes();

    const onActualizar = () => {
      cargarOrdenes();
    };

    socket.on("ordenes_actualizadas", onActualizar);

    return () => {
      socket.off("ordenes_actualizadas", onActualizar);
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
                    o.OpeStTerminal && 
                    o.OpeStTerminal.trim().toUpperCase() !== terminalActual.trim().toUpperCase();

                  const nombreMesaFormateado = o.OpeStMesa?.trim().toLowerCase().startsWith("mesa") 
                    ? o.OpeStMesa.trim() 
                    : `Mesa ${o.OpeStMesa.trim()}`;

                  return (
                    <div
                      key={o.OpeIdInOrdenPedido}
                      onClick={() => handleIntentarEditar(o)}
                      className="card p-3 border"
                      style={{
                        borderRadius: "12px",
                        background: "#ffffff",
                        borderColor: "#e2e8f0",
                        marginBottom: "14px",
                        boxShadow: "0 2px 6px rgba(15, 23, 42, 0.05)",
                        cursor: "pointer",
                        transition: "all 0.15s ease-in-out"
                      }}
                    >
                      {/* Fila Superior: Nombre de Mesa + Precio Destacado */}
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                          <span className="fw-extrabold text-dark" style={{ fontSize: "0.95rem" }}>
                            {nombreMesaFormateado}
                          </span>

                          {estaAbiertaEnOtraTerminal && (
                            <Badge bg="warning" className="text-dark d-inline-flex align-items-center gap-1" style={{ fontSize: "0.65rem", padding: "4px 6px" }}>
                              <FiLock size={10} />
                              {o.OpeStTerminal}
                            </Badge>
                          )}
                        </div>

                        <span className="fw-bold" style={{ fontSize: "1rem", color: "#e31b23" }}>
                          {formatMoneda(o.OpeInValor)}
                        </span>
                      </div>

                      {/* Fila Inferior: Icono & Mesero + Botón Editar */}
                      <div className="d-flex align-items-center justify-content-between pt-2 border-top" style={{ borderColor: "#f1f5f9" }}>
                        <div className="d-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: "0.78rem", minWidth: 0, flex: 1, paddingRight: "8px" }}>
                          <FiUser size={13} className="text-muted flex-shrink-0" />
                          <span className="fw-semibold text-truncate" style={{ color: "#334155" }}>
                            {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                          </span>
                        </div>

                        <button 
                          className={`btn btn-sm ${estaAbiertaEnOtraTerminal ? "btn-outline-warning text-dark" : "btn-danger"} py-1 px-3 d-inline-flex align-items-center gap-1.5 fw-bold flex-shrink-0`}
                          onClick={(e) => { e.stopPropagation(); handleIntentarEditar(o); }}
                          style={{ 
                            borderRadius: "7px", 
                            fontSize: "0.78rem", 
                            height: "30px",
                            background: estaAbiertaEnOtraTerminal ? "transparent" : "#e31b23",
                            border: estaAbiertaEnOtraTerminal ? "1px solid #ffc107" : "none",
                            color: estaAbiertaEnOtraTerminal ? "#212529" : "#ffffff",
                            boxShadow: estaAbiertaEnOtraTerminal ? "none" : "0 2px 5px rgba(227, 27, 35, 0.22)"
                          }}
                        >
                          {estaAbiertaEnOtraTerminal ? <FiLock size={12} /> : <FiEdit3 size={12} />}
                          <span>Editar</span>
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
                      <th style={{ padding: "12px 16px", width: "15%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#475569", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>Mesa</th>
                      <th style={{ padding: "12px 16px", width: "50%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#475569" }}>Nombre del mesero</th>
                      <th style={{ padding: "12px 16px", width: "25%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#475569", textAlign: "right" }}>Vr. cuenta</th>
                      <th style={{ padding: "12px 16px", width: "10%", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700", color: "#475569", textAlign: "center", borderTopRightRadius: "8px", borderBottomRightRadius: "8px" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesPaginadas.map((o) => {
                      const estaAbiertaEnOtraTerminal = String(o.OpeStMesaAbierta) === '1' && 
                        o.OpeStTerminal && 
                        o.OpeStTerminal.trim().toUpperCase() !== terminalActual.trim().toUpperCase();

                      return (
                        <tr 
                          key={o.OpeIdInOrdenPedido}
                          onClick={() => handleIntentarEditar(o)}
                          style={{ 
                            cursor: "pointer", 
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background-color 0.15s ease-in-out"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fdf2f2"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#ffffff"; }}
                        >
                          <td style={{ padding: "14px 16px", fontWeight: "700", color: "#1e293b" }}>
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
                          <td style={{ padding: "14px 16px", color: "#334155", fontWeight: "500" }}>
                            {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "800", color: "#e31b23", fontSize: "0.95rem" }}>
                            {formatMoneda(o.OpeInValor)}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <button 
                              className={`btn btn-sm ${estaAbiertaEnOtraTerminal ? "btn-outline-warning text-dark" : "btn-danger"} py-1 px-3 d-inline-flex align-items-center gap-1.5 fw-bold`}
                              onClick={(e) => { e.stopPropagation(); handleIntentarEditar(o); }}
                              style={{ 
                                borderRadius: "6px", 
                                fontSize: "0.78rem",
                                background: estaAbiertaEnOtraTerminal ? "transparent" : "#e31b23",
                                border: estaAbiertaEnOtraTerminal ? "1px solid #ffc107" : "none",
                                color: estaAbiertaEnOtraTerminal ? "#212529" : "#ffffff",
                                boxShadow: estaAbiertaEnOtraTerminal ? "none" : "0 2px 4px rgba(227, 27, 35, 0.25)"
                              }}
                            >
                              {estaAbiertaEnOtraTerminal ? <FiLock size={12} /> : <FiEdit3 size={12} />}
                              <span>Editar</span>
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
