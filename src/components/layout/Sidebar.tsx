import { useState } from "react";
import { FiHome, FiLogOut, FiMenu, FiLayers, FiList, FiClock } from "react-icons/fi";
import logoReporte from "../../assets/LogoReportes.png";
import { isMandatoryPrintEnabled, isMobileOrTabletDevice } from "../../config/api";


export type MenuKey = "home" | "comanda" | "ordenes" | "pendientes";
type SidebarProps = {
    activo: MenuKey;
    onCambiar: (menu: MenuKey) => void;
    onSalir: () => void;
    empresaNombre?: string;
    puntoNombre?: string;
    fechaActual?: string;
    terminal?: string;
    cantPendientes?: number;
    esObligatorioImprimir?: boolean;
};

export default function Sidebar({ activo, onCambiar, onSalir, empresaNombre, puntoNombre, fechaActual, terminal, cantPendientes = 0, esObligatorioImprimir }: SidebarProps) {
    const [abierto, setAbierto] = useState(false);

    const esObligatorio = esObligatorioImprimir !== undefined ? esObligatorioImprimir : isMandatoryPrintEnabled();
    const esMovilOTablet = isMobileOrTabletDevice();
    const usarInterfazClasica = esObligatorio || esMovilOTablet;

    const opciones = usarInterfazClasica
      ? [
          { key: "home" as const, label: "Inicio", icon: FiHome },
          { key: "comanda" as const, label: "Crear órdenes", icon: FiLayers },
          { key: "ordenes" as const, label: "Órdenes abiertas", icon: FiList },
        ]
      : [
          { key: "home" as const, label: "Inicio", icon: FiHome },
          { key: "comanda" as const, label: "Crear órdenes", icon: FiLayers },
          { key: "pendientes" as const, label: "Pedidos pendientes", icon: FiClock },
        ];






    function seleccionar(menu: MenuKey) {
        onCambiar(menu);
        setAbierto(false);
    }


    return (
        <>
            {/* HEADER MÓVIL (Solo se ve en móvil) */}
            <header className="mobile-header d-lg-none d-flex align-items-center justify-content-between w-100" style={{ paddingLeft: '8px', paddingRight: '8px', paddingTop: '3px', paddingBottom: '3px', gap: '8px', minHeight: '48px' }}>
                <div className="d-flex align-items-center flex-shrink-0" style={{ gap: '6px' }}>
                    <button 
                      className="mobile-menu-btn m-0 flex-shrink-0" 
                      onClick={() => setAbierto(true)} 
                      style={{ 
                        width: '28px', 
                        height: '28px', 
                        minWidth: '28px',
                        minHeight: '28px',
                        maxWidth: '28px',
                        maxHeight: '28px',
                        borderRadius: '7px', 
                        background: '#e31b23', 
                        border: 'none', 
                        color: '#ffffff', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        boxShadow: '0 1px 3px rgba(227, 27, 35, 0.25)', 
                        padding: 0,
                        lineHeight: 1
                      }}
                    >
                        <FiMenu size={14} />
                    </button>
                    <div className="mobile-brand flex-shrink-0 d-flex align-items-center" style={{ margin: 0, padding: 0 }}>
                        <img 
                          src={logoReporte} 
                          alt="Logo Dianasis" 
                          style={{ height: '48px', maxHeight: '48px', width: 'auto', display: 'block', cursor: 'pointer' }} 
                          onClick={() => setAbierto(false)} 
                        />
                    </div>
                </div>
                
                {/* Info de sesión compacta a la derecha alineada verticalmente */}
                {fechaActual && (
                    <div className="text-end text-muted d-flex flex-column align-items-end justify-content-center flex-grow-1" style={{ minWidth: 0, overflow: 'hidden', paddingLeft: '4px', height: '28px' }}>
                        <span className="fw-bold text-dark text-truncate w-100" style={{ textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: '0.58rem', lineHeight: '1.1', display: 'block' }}>
                            {empresaNombre} {puntoNombre ? `• ${puntoNombre}` : ''}
                        </span>
                        <span className="fw-semibold text-secondary text-truncate w-100 animate__animated animate__fadeIn" style={{ fontSize: '0.54rem', marginTop: '1px', lineHeight: '1.1', display: 'block' }}>
                            {fechaActual} {terminal ? `• ${terminal.toUpperCase()}` : ''}
                        </span>
                    </div>
                )}
            </header>

            {/* OVERLAY PARA CERRAR EN MÓVIL */}
            {abierto && <div className="sidebar-overlay d-lg-none" onClick={() => setAbierto(false)} />}

            {/* SIDEBAR PRINCIPAL */}
            <aside className={`premium-sidebar ${abierto ? "is-open" : ""}`} style={{ background: '#ffffff' }}>
                <div 
                    className="sidebar-header d-flex flex-column align-items-start justify-content-start border-bottom w-100" 
                    style={{ 
                        paddingTop: '16px', 
                        paddingBottom: '12px', 
                        paddingLeft: '16px', 
                        paddingRight: '16px',
                        gap: '4px' 
                    }}
                >
                    <div className="d-flex align-items-center justify-content-start w-100">
                        <img
                            src={logoReporte}
                            alt="Logo Reportes"
                            style={{ 
                                width: '150px', 
                                height: 'auto', 
                                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))',
                            }}
                            className="animate__animated animate__fadeIn"
                        />
                    </div>
                    
                    {/* Información de Sesión Activa debajo del Logo (Texto limpio sin tarjeta) */}
                    {(empresaNombre || fechaActual) && (
                        <div 
                            className="session-info-sidebar w-100 text-start ps-1 pe-1 mt-1 mb-2 animate__animated animate__fadeIn" 
                            style={{ 
                                lineHeight: '1.35'
                            }}
                        >
                            <div 
                                className="fw-bold text-truncate"
                                style={{ 
                                    fontSize: '0.74rem', 
                                    color: '#334155', 
                                    letterSpacing: '0.02em', 
                                    textTransform: 'uppercase' 
                                }}
                                title={`${empresaNombre || ''} ${puntoNombre ? `• ${puntoNombre}` : ''}`}
                            >
                                {empresaNombre} {puntoNombre ? `• ${puntoNombre}` : ''}
                            </div>

                            <div 
                                className="d-flex align-items-center gap-1.5 flex-wrap mt-1" 
                                style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 500, 
                                    color: '#64748b' 
                                }}
                            >
                                <span>{fechaActual}</span>
                                {terminal && (
                                    <>
                                        <span style={{ color: '#cbd5e1' }}>•</span>
                                        <span className="d-inline-flex align-items-center gap-1 text-success fw-bold" style={{ fontSize: '0.68rem' }}>
                                            <span 
                                                className="rounded-circle d-inline-block bg-success"
                                                style={{ width: '5px', height: '5px' }}
                                            ></span>
                                            {terminal.toUpperCase()}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>


                <nav className="sidebar-nav" style={{ paddingTop: '10px' }}>

                    <ul className="nav-list">
                        {opciones.map((op) => {
                            const Icon = op.icon;
                            const esActivo = activo === op.key;
                            return (
                                <li key={op.key}>
                                    <button
                                        className={`nav-item ${esActivo ? "active" : ""}`}
                                        onClick={() => seleccionar(op.key)}
                                        style={{ position: 'relative', textAlign: 'left' }}
                                    >
                                        <div className="nav-icon-box">
                                            <Icon size={18} />
                                        </div>
                                        <span style={{ flex: 1, textAlign: 'left' }}>{op.label}</span>
                                        {op.key === "pendientes" && cantPendientes > 0 && (
                                            <span 
                                                className="badge rounded-pill bg-danger text-white me-2 px-2 py-1 fw-bold badge-latido"
                                                style={{ fontSize: '0.7rem', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' }}
                                            >
                                                {cantPendientes}
                                            </span>
                                        )}

                                        {esActivo && (
                                            <div className="animate__animated animate__fadeInRight" style={{ width: '4px', height: '18px', background: '#ef4444', borderRadius: '2px' }}></div>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="sidebar-footer">
                    <button className="btn-logout-sidebar shadow-sm" onClick={onSalir}>
                        <FiLogOut size={18} />
                        <span>Cerrar Sesión</span>
                    </button>
                    <div className="text-center mt-3" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        v1.2 • DIANASIS
                    </div>
                </div>
            </aside>
        </>
    );
}




