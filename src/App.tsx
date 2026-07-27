import { useState, useEffect, useRef } from "react";
import "./styles/App.css";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import CrearOrdenes from "./pages/CrearOrdenes";
import OrdenesOpen from "./pages/OrdenesOpen";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { FiHome, FiPlus, FiLayers, FiChevronRight } from "react-icons/fi";
import type { MenuKey } from "./components/layout/Sidebar";
import { API_BASE_URL } from "./config/api";

export default function App() {
  const [logueado, setLogueado] = useState(() => {
    const token = localStorage.getItem("token");
    return Boolean(token);
  });

  const [menuActivo, setMenuActivo] = useState<MenuKey>("home");
  const [ordenIdEdicion, setOrdenIdEdicion] = useState<string | number | null>(null);
  const [comandaResetKey, setComandaResetKey] = useState(0);
  const [fechaTrabajoRaw, setFechaTrabajoRaw] = useState<string | null>(null);

  const navCheckRef = useRef<((() => Promise<boolean>)) | null>(null);

  const solicitarConfirmacionNavegacion = async (): Promise<boolean> => {
    if (navCheckRef.current) {
      return await navCheckRef.current();
    }
    return true;
  };

  const unlockCurrentOrder = async (id: string | number | null) => {
    if (!id) return;
    try {
      const token = localStorage.getItem("token") || "";
      const info = JSON.parse(localStorage.getItem("infoPuntoVenta") || "{}");
      await fetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "empresa": info?.PveIdStEmpresa || "02",
          "punto": String(info?.PveIdInPuntoVenta || "5")
        },
        body: JSON.stringify({ mesa: id })
      });
    } catch (e) {
      console.error("Error al liberar mesa:", e);
    }
  };

  const handleNavCrearOrdenes = async () => {
    const puedeNavegar = await solicitarConfirmacionNavegacion();
    if (!puedeNavegar) return;

    if (ordenIdEdicion) {
      unlockCurrentOrder(ordenIdEdicion);
    }
    setOrdenIdEdicion(null);
    setMenuActivo("comanda");
    setComandaResetKey(prev => prev + 1);
  };

  const infoPuntoVenta = (() => {
    try {
      const stored = localStorage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!logueado) {
      setFechaTrabajoRaw(null);
      return;
    }

    const token = localStorage.getItem("token") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    const storedInfo = localStorage.getItem("infoPuntoVenta");
    if (storedInfo) {
      try {
        const info = JSON.parse(storedInfo);
        if (info) {
          headers["empresa"] = info.PveIdStEmpresa || "";
          headers["punto"] = String(info.PveIdInPuntoVenta || "");
        }
      } catch (e) {
        console.error(e);
      }
    }

    let terminalName = localStorage.getItem("terminal");
    if (!terminalName) {
      terminalName = "TERMINAL 1";
      localStorage.setItem("terminal", terminalName);
    }
    headers["terminal"] = terminalName;

    fetch(`${API_BASE_URL}/ordenes/mesa/cerrar-terminal`, {
      method: "POST",
      headers,
      body: JSON.stringify({ terminal: terminalName })
    }).catch(err => console.error("Error al limpiar mesas de terminal:", err));

    fetch(`${API_BASE_URL}/ordenes/fecha-trabajo`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data && data.body) {
          if (data.body.fecha) {
            setFechaTrabajoRaw(data.body.fecha);
          }
          if (data.body.bloqueada !== undefined) {
            localStorage.setItem("comanderaBloqueada", String(data.body.bloqueada));
          } else {
            localStorage.removeItem("comanderaBloqueada");
          }
        }
      })
      .catch(err => {
        console.error("Error al obtener la fecha de trabajo:", err);
      });

    const handleSendBeaconGlobal = () => {
      const term = localStorage.getItem("terminal") || "TERMINAL 1";
      let info: any = {};
      try {
        info = JSON.parse(localStorage.getItem("infoPuntoVenta") || "{}");
      } catch (e) {}

      const payload = JSON.stringify({
        terminal: term,
        empresa: info?.PveIdStEmpresa || "02",
        punto: String(info?.PveIdInPuntoVenta || "5")
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`${API_BASE_URL}/ordenes/mesa/cerrar-beacon`, blob);
      }
    };

    window.addEventListener("pagehide", handleSendBeaconGlobal);
    window.addEventListener("beforeunload", handleSendBeaconGlobal);

    return () => {
      window.removeEventListener("pagehide", handleSendBeaconGlobal);
      window.removeEventListener("beforeunload", handleSendBeaconGlobal);
    };
  }, [logueado]);

  const getFechaActual = (rawDate: string | null) => {
    let baseDate = new Date();
    const stored = localStorage.getItem("infoPuntoVenta");
    
    if (rawDate) {
      const parts = rawDate.split("-");
      baseDate = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    } else if (stored) {
      try {
        const info = JSON.parse(stored);
        if (info && info.PveDtFechaTrabajo) {
          const dateStr = info.PveDtFechaTrabajo.split("T")[0];
          const parts = dateStr.split("-");
          baseDate = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        }
      } catch (e) {
        console.error(e);
      }
    }
    const f = baseDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  };

  const fechaActual = getFechaActual(fechaTrabajoRaw);

  useEffect(() => {
    if (!logueado) return;

    let ultimoGuardado = Date.now();
    const registrarActividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoGuardado > 30000) {
        localStorage.setItem("last_login", ahora.toString());
        ultimoGuardado = ahora;
      }
    };

    const eventos = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];
    eventos.forEach((ev) => window.addEventListener(ev, registrarActividad));

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, registrarActividad));
    };
  }, [logueado]);

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activo={menuActivo}
        onCambiar={async (menu) => {
          if (menu === "comanda") {
            handleNavCrearOrdenes();
          } else {
            const puedeNavegar = await solicitarConfirmacionNavegacion();
            if (!puedeNavegar) return;

            if (ordenIdEdicion) {
              unlockCurrentOrder(ordenIdEdicion);
            }
            setOrdenIdEdicion(null);
            setMenuActivo(menu);
          }
        }}
        onSalir={async () => {
          const puedeSalir = await solicitarConfirmacionNavegacion();
          if (!puedeSalir) return;

          localStorage.removeItem("token");
          localStorage.removeItem("last_login");
          setMenuActivo("home");
          setLogueado(false);
        }}
        empresaNombre={infoPuntoVenta?.gmpnomb || infoPuntoVenta?.PveStNombreEmpresa}
        puntoNombre={infoPuntoVenta?.PveStNombre}
        fechaActual={fechaActual}
        terminal={localStorage.getItem("terminal") || "Terminal Desconocida"}
      />

      <section className="app-content">
        {menuActivo === "home" ? (
          <section
            className="premium-home-panel px-0 px-md-3 pt-0"
            aria-label="Pantalla de inicio"
            style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}
          >
            <div className="container-fluid">
              {/* Header Premium Limpio en Texto */}
              <header
                className="bg-white px-3 py-2 mb-2 rounded-4 shadow-sm border d-flex align-items-center justify-content-between flex-wrap gap-3"
                style={{ borderColor: "#e2e8f0", minHeight: "56px" }}
              >
                {/* Lado izquierdo: Icono y Título alineados */}
                <div className="d-flex align-items-center gap-2">
                  {/* Icono Red Home */}
                  <div
                    className="premium-icon-box flex-shrink-0"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                      color: "#fff",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(239, 68, 68, 0.15)",
                    }}
                  >
                    <FiHome size={16} />
                  </div>

                  {/* Título de la sección */}
                  <div className="d-flex flex-column">
                    <span className="text-uppercase fw-bold mb-0" style={{ fontSize: "0.6rem", letterSpacing: "0.08em", color: "#94a3b8" }}>
                      Comanda
                    </span>
                    <h1 className="m-0 text-uppercase fw-bold" style={{ fontSize: "1.1rem", color: "#0f172a", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                      Inicio
                    </h1>
                  </div>
                </div>
              </header>

              <main className="pt-0 px-0">
                <div className="row g-4 mt-0">
                  {/* Tarjeta Nuevo Pedido */}
                  <div className="col-12 col-md-6">
                    <div
                      className="bg-white p-3 rounded-4 shadow-premium border-0 d-flex align-items-center justify-content-between cursor-pointer"
                      style={{ cursor: "pointer", transition: "transform 0.2s ease, box-shadow 0.2s ease" }}
                      onClick={handleNavCrearOrdenes}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center animate-hover"
                          style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "14px",
                            background: "rgba(239, 68, 68, 0.08)",
                            color: "#ef4444"
                          }}
                        >
                          <FiPlus size={24} />
                        </div>
                        <div className="d-flex flex-column text-start">
                          <h3 className="m-0 fw-bold" style={{ fontSize: "1.1rem", color: "#1e293b" }}>
                            Nuevo Pedido
                          </h3>
                          <p className="m-0 text-muted" style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                            Crear y registrar un nuevo pedido para un cliente de forma rápida.
                          </p>
                        </div>
                      </div>
                      <div className="text-muted ps-2">
                        <FiChevronRight size={20} />
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Órdenes Abiertas */}
                  <div className="col-12 col-md-6">
                    <div
                      className="bg-white p-3 rounded-4 shadow-premium border-0 d-flex align-items-center justify-content-between cursor-pointer"
                      style={{ cursor: "pointer", transition: "transform 0.2s ease, box-shadow 0.2s ease" }}
                      onClick={async () => {
                        const puedeNavegar = await solicitarConfirmacionNavegacion();
                        if (puedeNavegar) setMenuActivo("ordenes");
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "14px",
                            background: "rgba(245, 158, 11, 0.08)",
                            color: "#f59e0b"
                          }}
                        >
                          <FiLayers size={22} />
                        </div>
                        <div className="d-flex flex-column text-start">
                          <h3 className="m-0 fw-bold" style={{ fontSize: "1.1rem", color: "#1e293b" }}>
                            Órdenes Abiertas
                          </h3>
                          <p className="m-0 text-muted" style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                            Visualizar, editar y gestionar pedidos que aún están en proceso.
                          </p>
                        </div>
                      </div>
                      <div className="text-muted ps-2">
                        <FiChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </section>
        ) : menuActivo === "comanda" ? (
          <CrearOrdenes 
            key={`comanda-reset-${comandaResetKey}-${ordenIdEdicion || 'new'}`}
            initialOrdenId={ordenIdEdicion} 
            onClearInitial={() => {
              setOrdenIdEdicion(null);
              setMenuActivo("home");
            }} 
            onRegisterNavigationCheck={(fn) => { navCheckRef.current = fn; }}
          />
        ) : menuActivo === "ordenes" ? (
          ordenIdEdicion !== null ? (
            <CrearOrdenes 
              key={`ordenes-edit-${ordenIdEdicion}`}
              initialOrdenId={ordenIdEdicion} 
              onClearInitial={() => {
                setOrdenIdEdicion(null);
                setMenuActivo("ordenes");
              }} 
              onRegisterNavigationCheck={(fn) => { navCheckRef.current = fn; }}
            />
          ) : (
            <OrdenesOpen 
              onEditar={(id) => {
                setOrdenIdEdicion(id);
                setMenuActivo("ordenes");
              }} 
              onVolver={() => setMenuActivo("home")}
            />
          )
        ) : null}
      </section>
    </div>
  );
}

