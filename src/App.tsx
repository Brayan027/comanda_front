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
import { API_BASE_URL, socket } from "./config/api";

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

    const fetchFechaTrabajo = () => {
      fetch(`${API_BASE_URL}/ordenes/fecha-trabajo`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data && data.body) {
            if (data.body.fecha) {
              setFechaTrabajoRaw(data.body.fecha);
              try {
                const stored = localStorage.getItem("infoPuntoVenta");
                if (stored) {
                  const info = JSON.parse(stored);
                  if (info.PveDtFechaTrabajo !== data.body.fecha) {
                    info.PveDtFechaTrabajo = data.body.fecha;
                    localStorage.setItem("infoPuntoVenta", JSON.stringify(info));
                  }
                }
              } catch (e) {
                console.error(e);
              }
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
    };

    fetchFechaTrabajo();

    // Listener de socket para recibir actualización de fecha de trabajo en tiempo real
    const handleFechaTrabajoActualizada = (data: { fecha?: string; bloqueada?: boolean }) => {
      if (data?.fecha) {
        setFechaTrabajoRaw(data.fecha);
        try {
          const stored = localStorage.getItem("infoPuntoVenta");
          if (stored) {
            const info = JSON.parse(stored);
            info.PveDtFechaTrabajo = data.fecha;
            localStorage.setItem("infoPuntoVenta", JSON.stringify(info));
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (data?.bloqueada !== undefined) {
        localStorage.setItem("comanderaBloqueada", String(data.bloqueada));
      } else {
        localStorage.removeItem("comanderaBloqueada");
      }
    };

    const handleOrdenesActualizadas = (data?: { evento?: string }) => {
      if (data?.evento === "cerrarBeacon") return;
      fetchFechaTrabajo();
    };

    socket.on("fecha_trabajo_actualizada", handleFechaTrabajoActualizada);
    socket.on("ordenes_actualizadas", handleOrdenesActualizadas);

    // Solicitar fecha de trabajo mediante Socket al conectar y mantener intervalo de refresco automático
    socket.emit("obtener_fecha_trabajo", {
      empresa: headers["empresa"] || "02",
      punto: headers["punto"] || "5"
    });

    const intervalId = setInterval(() => {
      fetchFechaTrabajo();
      if (socket.connected) {
        socket.emit("obtener_fecha_trabajo", {
          empresa: headers["empresa"] || "02",
          punto: headers["punto"] || "5"
        });
      }
    }, 4000);

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
      clearInterval(intervalId);
      socket.off("fecha_trabajo_actualizada", handleFechaTrabajoActualizada);
      socket.off("ordenes_actualizadas", handleOrdenesActualizadas);
      window.removeEventListener("pagehide", handleSendBeaconGlobal);
      window.removeEventListener("beforeunload", handleSendBeaconGlobal);
    };
  }, [logueado]);

  const getFechaActual = (rawDate: string | null) => {
    let dateStr = rawDate;
    if (!dateStr) {
      const stored = localStorage.getItem("infoPuntoVenta");
      if (stored) {
        try {
          const info = JSON.parse(stored);
          if (info && info.PveDtFechaTrabajo) {
            dateStr = info.PveDtFechaTrabajo;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (!dateStr) {
      const now = new Date();
      const f = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const cleanDate = String(dateStr).split("T")[0].split(" ")[0];
    const parts = cleanDate.split("-");

    if (parts.length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const baseDate = new Date(Date.UTC(year, month, day));
      const f = baseDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const fallbackDate = new Date(dateStr);
    if (!isNaN(fallbackDate.getTime())) {
      const f = fallbackDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const now = new Date();
    const f = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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
            className="premium-home-panel pt-3"
            aria-label="Pantalla de inicio"
            style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px", paddingLeft: "12px", paddingRight: "12px" }}
          >
            <div className="w-100 m-0 p-0">
              {/* Header Premium Limpio en Texto */}
              <header
                className="bg-white py-2 mb-3 mt-0 rounded-3 border d-flex align-items-center justify-content-between flex-wrap gap-3 w-100"
                style={{ borderColor: "#e2e8f0", minHeight: "52px", boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)", paddingLeft: "12px", paddingRight: "12px" }}
              >
                {/* Lado izquierdo: Icono y Título alineados */}
                <div className="d-flex align-items-center gap-3">
                  {/* Icono Red Home */}
                  <div
                    className="premium-icon-box flex-shrink-0"
                    style={{
                      width: "28px",
                      height: "28px",
                      background: "#e31b23",
                      color: "#ffffff",
                      borderRadius: "7px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 5px rgba(227, 27, 35, 0.2)",
                    }}
                  >
                    <FiHome size={14} />
                  </div>

                  {/* Título de la sección */}
                  <div className="d-flex flex-column">
                    <span className="text-uppercase fw-bold mb-0" style={{ fontSize: "0.6rem", letterSpacing: "0.08em", color: "#64748b" }}>
                      Comanda
                    </span>
                    <h1 className="m-0 text-uppercase fw-bold" style={{ fontSize: "1.05rem", color: "#1e293b", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                      Inicio
                    </h1>
                  </div>
                </div>
              </header>

              <main className="pt-1 px-0 w-100">
                <div className="row g-3 m-0 w-100">
                  {/* Tarjeta Nuevo Pedido */}
                  <div className="col-12 col-md-6 p-0 pe-md-2 mb-3 mb-md-0">
                    <div
                      className="bg-white py-3 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer w-100"
                      style={{ 
                        cursor: "pointer", 
                        borderColor: "#e2e8f0",
                        transition: "all 0.15s ease-in-out",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)",
                        paddingLeft: "12px",
                        paddingRight: "12px"
                      }}
                      onClick={handleNavCrearOrdenes}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#cbd5e1";
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02)";
                      }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "7px",
                            background: "#e31b23",
                            color: "#ffffff",
                            flexShrink: 0,
                            boxShadow: "0 2px 6px rgba(227, 27, 35, 0.25)"
                          }}
                        >
                          <FiPlus size={14} />
                        </div>
                        <div className="d-flex flex-column text-start">
                          <h3 className="m-0 fw-bold" style={{ fontSize: "0.98rem", color: "#1e293b" }}>
                            Nuevo Pedido
                          </h3>
                          <p className="m-0 text-muted" style={{ fontSize: "0.78rem", marginTop: "2px" }}>
                            Crear y registrar un nuevo pedido para un cliente de forma rápida.
                          </p>
                        </div>
                      </div>
                      <div className="text-muted ps-2">
                        <FiChevronRight size={18} />
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Órdenes Abiertas */}
                  <div className="col-12 col-md-6 p-0 ps-md-2">
                    <div
                      className="bg-white py-3 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer w-100"
                      style={{ 
                        cursor: "pointer", 
                        borderColor: "#e2e8f0",
                        transition: "all 0.15s ease-in-out",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)",
                        paddingLeft: "12px",
                        paddingRight: "12px"
                      }}
                      onClick={async () => {
                        const puedeNavegar = await solicitarConfirmacionNavegacion();
                        if (puedeNavegar) setMenuActivo("ordenes");
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#cbd5e1";
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02)";
                      }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "7px",
                            background: "#e31b23",
                            color: "#ffffff",
                            flexShrink: 0,
                            boxShadow: "0 2px 6px rgba(227, 27, 35, 0.25)"
                          }}
                        >
                          <FiLayers size={14} />
                        </div>
                        <div className="d-flex flex-column text-start">
                          <h3 className="m-0 fw-bold" style={{ fontSize: "0.98rem", color: "#1e293b" }}>
                            Órdenes Abiertas
                          </h3>
                          <p className="m-0 text-muted" style={{ fontSize: "0.78rem", marginTop: "2px" }}>
                            Visualizar, editar y gestionar pedidos que aún están en proceso.
                          </p>
                        </div>
                      </div>
                      <div className="text-muted ps-2">
                        <FiChevronRight size={18} />
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

