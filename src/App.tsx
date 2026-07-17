import { useState, useEffect } from "react";
import "./styles/App.css";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import CrearOrdenes from "./pages/CrearOrdenes";
import OrdenesOpen from "./pages/OrdenesOpen";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { FiHome, FiPlus, FiLayers, FiChevronRight, FiCalendar, FiMonitor } from "react-icons/fi";
import type { MenuKey } from "./components/layout/Sidebar";

export default function App() {
  const [logueado, setLogueado] = useState(() => {
    const token = localStorage.getItem("token");
    const lastLogin = localStorage.getItem("last_login");
    /**Validar sesión y si el tiempo ha expirado */
    if (token && lastLogin) {
      const dosHoras = 2 * 60 * 60 * 1000;
      if (Date.now() - Number(lastLogin) > dosHoras) {
        localStorage.removeItem("token");
        localStorage.removeItem("last_login");
        return false;
      }
      return true;
    }
    return Boolean(token);
  });

  const [menuActivo, setMenuActivo] = useState<MenuKey>("home");
  const [ordenIdEdicion, setOrdenIdEdicion] = useState<number | null>(null);
  const [fechaActual] = useState(() => {
    const f = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  });
  const [fechaCorta] = useState(() => {
    return new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  });

  useEffect(() => {
    if (!logueado) return;

    // Registrar actividad del usuario para prolongar la sesión si está interactuando
    let ultimoGuardado = Date.now();
    const registrarActividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoGuardado > 30000) { // Actualizar last_login como máximo cada 30 segundos
        localStorage.setItem("last_login", ahora.toString());
        ultimoGuardado = ahora;
      }
    };

    const revisarSesion = () => {
      const lastLogin = localStorage.getItem("last_login");
      if (lastLogin) {
        const dosHoras = 2 * 60 * 60 * 1000;
        if (Date.now() - Number(lastLogin) > dosHoras) {
          localStorage.removeItem("token");
          localStorage.removeItem("last_login");
          setLogueado(false);
        }
      }
    };

    // Prolongar sesión automáticamente si la pestaña está visible
    const intervaloVisible = setInterval(() => {
      if (document.visibilityState === "visible") {
        localStorage.setItem("last_login", Date.now().toString());
      }
    }, 300000); // Cada 5 minutos

    const eventos = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];
    eventos.forEach((ev) => window.addEventListener(ev, registrarActividad));

    // Revisar cada minuto y al volver a la pestaña
    const intervaloRevisar = setInterval(revisarSesion, 60000);
    window.addEventListener("focus", revisarSesion);

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, registrarActividad));
      clearInterval(intervaloVisible);
      clearInterval(intervaloRevisar);
      window.removeEventListener("focus", revisarSesion);
    };
  }, [logueado]);

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activo={menuActivo}
        onCambiar={setMenuActivo}
        onSalir={() => {
          localStorage.removeItem("token");
          localStorage.removeItem("last_login");
          setMenuActivo("home");
          setLogueado(false);
        }}
      />

      <section className="app-content">
        {menuActivo === "home" ? (
          <section
            className="premium-home-panel px-3 pt-0"
            aria-label="Pantalla de inicio"
            style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}
          >
            <div className="container-fluid">
              {/* Header Premium Simplificado */}
              <header
                className="bg-white p-3 px-4 mb-4 rounded-4 shadow-premium d-flex justify-content-between align-items-center gap-2 border border-light"
                style={{ minHeight: "75px" }}
              >
                {/* Izquierda: Titulo */}
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="premium-icon-box"
                    style={{
                      width: "38px",
                      height: "38px",
                      background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                      color: "#fff",
                      borderRadius: "12px",
                      display : "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 12px rgba(239, 68, 68, 0.18)",
                    }}
                  >
                    <FiHome size={18} />
                  </div>
                  <div className="d-flex flex-column">
                    <span className="text-muted fw-bold text-uppercase mb-0" style={{ fontSize: "0.6rem", letterSpacing: "0.12em", color: "#94a3b8" }}>
                      Comanda
                    </span>
                    <h1 className="m-0 text-uppercase" style={{ fontSize: "1.25rem", color: "#1e293b", fontWeight: 700, letterSpacing: "0.02em" }}>
                      Inicio
                    </h1>
                  </div>
                </div>

                {/* Derecha: Meta Información (Siempre en una misma línea alineados) */}
                <div className="d-flex align-items-center gap-2 ms-auto flex-nowrap">
                  {/* Fecha */}
                  <div 
                    className="d-flex align-items-center gap-2 px-3 py-2 rounded-3 border flex-nowrap"
                    style={{ 
                      fontSize: "0.85rem", 
                      backgroundColor: "#f8fafc", 
                      borderColor: "#e2e8f0",
                      color: "#475569",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <FiCalendar style={{ color: "#ef4444" }} size={16} />
                    <span className="fw-medium d-none d-md-inline">{fechaActual}</span>
                    <span className="fw-medium d-inline d-md-none">{fechaCorta}</span>
                  </div>

                  {/* Terminal */}
                  <div 
                    className="d-flex align-items-center gap-2 px-3 py-2 rounded-3 border flex-nowrap"
                    style={{ 
                      fontSize: "0.85rem", 
                      backgroundColor: "#f8fafc", 
                      borderColor: "#e2e8f0",
                      color: "#475569",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <div className="position-relative d-flex align-items-center justify-content-center">
                      <FiMonitor style={{ color: "#64748b" }} size={16} />
                      <span 
                        className="position-absolute rounded-circle border border-white"
                        style={{ 
                          top: "-2px", 
                          right: "-2px", 
                          width: "8px", 
                          height: "8px", 
                          backgroundColor: "#22c55e",
                          boxShadow: "0 0 4px #22c55e"
                        }}
                      ></span>
                    </div>
                    <span className="fw-bold text-uppercase" style={{ letterSpacing: "0.03em" }}>
                      {localStorage.getItem("terminal") || "Terminal Desconocida"}
                    </span>
                  </div>
                </div>
              </header>

              {/* Accesos Rápidos de Inicio matching Screenshot */}
              <main className="container-fluid pt-2 px-1 px-md-3">
                <div className="row g-4 mt-1">
                  {/* Tarjeta Nuevo Pedido */}
                  <div className="col-12 col-md-6">
                    <div
                      className="bg-white p-3 rounded-4 shadow-premium border-0 d-flex align-items-center justify-content-between cursor-pointer"
                      style={{ cursor: "pointer", transition: "transform 0.2s ease, box-shadow 0.2s ease" }}
                      onClick={() => setMenuActivo("comanda")}
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
                      onClick={() => setMenuActivo("ordenes")}
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
          <CrearOrdenes initialOrdenId={ordenIdEdicion} onClearInitial={() => setOrdenIdEdicion(null)} />
        ) : menuActivo === "ordenes" ? (
          ordenIdEdicion !== null ? (
            <CrearOrdenes initialOrdenId={ordenIdEdicion} onClearInitial={() => setOrdenIdEdicion(null)} />
          ) : (
            <OrdenesOpen onEditar={(id) => {
              setOrdenIdEdicion(id);
              setMenuActivo("comanda");
            }} />
          )
        ) : null}
      </section>
    </div>
  );
}

