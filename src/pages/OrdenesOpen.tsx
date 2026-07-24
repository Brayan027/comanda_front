import { useEffect, useState, useMemo } from "react";
import { FiLayers, FiSearch, FiEdit3, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { Spinner } from "react-bootstrap";
import { API_BASE_URL } from "../config/api";
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

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(infoPuntoVenta?.PveIdInPuntoVenta || "5")
  }), [token, infoPuntoVenta]);

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

  useEffect(() => {
    cargarOrdenes();
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
        
        {/* Header Premium Estandarizado */}
        <header className="co-header">
          <div className="d-flex align-items-center gap-2">
            {onVolver && (
              <button
                type="button"
                title="Volver a inicio"
                onClick={onVolver}
                style={{
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  color: "#475569",
                  width: "34px",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontSize: "1rem",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.style.background = "#ef4444";
                  btn.style.color = "#fff";
                  btn.style.borderColor = "#ef4444";
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.style.background = "#f8fafc";
                  btn.style.color = "#475569";
                  btn.style.borderColor = "#cbd5e1";
                }}
              >
                &#8592;
              </button>
            )}
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                color: "#fff",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 3px 10px rgba(239,68,68,0.4)",
              }}
            >
              <FiLayers size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="co-header-subtitle">
                Comandas Activas
              </div>
              <h1 className="co-header-title">
                Órdenes Abiertas
              </h1>
            </div>
          </div>
        </header>

        {/* Datatable Card container */}
        <div className="bg-white rounded-4 shadow-premium p-2 p-md-4 border-0">
          
          {/* Controls bar */}
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-4">
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted" style={{ fontSize: "0.9rem" }}>Mostrar</span>
              <select 
                className="form-select form-select-sm" 
                value={limite}
                onChange={(e) => { setLimite(Number(e.target.value)); setPagina(1); }}
                style={{ width: "80px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="text-muted" style={{ fontSize: "0.9rem" }}>registros</span>
            </div>

            <div className="d-flex align-items-center gap-2 w-100 w-md-auto" style={{ maxWidth: "320px" }}>
              <span className="text-muted" style={{ fontSize: "0.9rem" }}>Buscar:</span>
              <div className="position-relative w-100">
                <input
                  type="text"
                  className="form-control form-control-sm pe-4"
                  placeholder="Filtrar mesa o mesero..."
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                  style={{ borderRadius: "8px", border: "1px solid #cbd5e1", height: "34px", fontSize: "0.85rem" }}
                />
                <FiSearch className="position-absolute text-muted" style={{ right: "10px", top: "10px" }} size={14} />
              </div>
            </div>
          </div>

          {/* Table content */}
          {cargando ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="danger" className="mb-3" />
              <div className="text-muted">Cargando listado de mesas abiertas...</div>
            </div>
          ) : ordenes.length === 0 ? (
            <div className="text-center text-muted py-5" style={{ fontSize: "0.95rem" }}>
              No hay pedidos abiertos en este momento.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle" style={{ borderCollapse: "separate", borderSpacing: "0 8px" }}>
                <thead>
                  <tr className="text-muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "bold", borderBottom: "2px solid #f1f5f9" }}>
                    <th style={{ padding: "12px 16px", width: "15%" }}>Mesa</th>
                    <th style={{ padding: "12px 16px", width: "50%" }}>Nombre del mesero</th>
                    <th style={{ padding: "12px 16px", width: "25%", textAlign: "right" }}>Vr. cuenta</th>
                    <th style={{ padding: "12px 16px", width: "10%", textAlign: "center" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesPaginadas.map((o) => (
                    <tr 
                      key={o.OpeIdInOrdenPedido}
                      onClick={() => onEditar(o.OpeIdInOrdenPedido)}
                      style={{ cursor: "pointer", background: "#f8fafc", borderRadius: "10px" }}
                      className="table-row-premium"
                    >
                      <td style={{ padding: "14px 16px", fontWeight: "bold", color: "#1e293b", border: "none", borderTopLeftRadius: "10px", borderBottomLeftRadius: "10px" }}>
                        {o.OpeStMesa}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#475569", border: "none" }}>
                        {o.NombreVendedor ? o.NombreVendedor.toUpperCase() : "MESERO"}
                        {o.CodigoVendedor && <span className="badge bg-light text-secondary ms-2" style={{ fontSize: "0.65rem" }}>Cód: {o.CodigoVendedor}</span>}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "bold", color: "#dc2626", border: "none" }}>
                        {formatMoneda(o.OpeInValor)}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center", border: "none", borderTopRightRadius: "10px", borderBottomRightRadius: "10px" }}>
                        <button 
                          className="btn btn-sm btn-outline-danger p-1 px-2 d-inline-flex align-items-center gap-1"
                          onClick={(e) => { e.stopPropagation(); onEditar(o.OpeIdInOrdenPedido); }}
                          style={{ borderRadius: "6px", fontSize: "0.8rem" }}
                        >
                          <FiEdit3 size={12} />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          {!cargando && total > 0 && (
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3 mt-4 pt-3" style={{ borderTop: "1px solid #f1f5f9" }}>
              <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                Mostrando desde el {startIndex + 1} hasta el {endIndex} ( Total: {total} )
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  className="btn btn-sm btn-light d-flex align-items-center justify-content-center p-2"
                  disabled={pagina <= 1}
                  onClick={() => setPagina(prev => Math.max(1, prev - 1))}
                  style={{ borderRadius: "8px", border: "1px solid #cbd5e1" }}
                >
                  <FiChevronLeft size={16} />
                </button>
                
                <span className="fw-bold px-3 py-1 bg-danger text-white rounded-3" style={{ fontSize: "0.9rem" }}>
                  {pagina}
                </span>

                <button
                  className="btn btn-sm btn-light d-flex align-items-center justify-content-center p-2"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina(prev => Math.min(totalPaginas, prev + 1))}
                  style={{ borderRadius: "8px", border: "1px solid #cbd5e1" }}
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
