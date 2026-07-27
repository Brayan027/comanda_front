import { useState } from "react";
import { FiHome, FiLogOut, FiMenu, FiLayers, FiList } from "react-icons/fi";
import logoReporte from "../../assets/LogoReportes.png";

export type MenuKey = "home" | "comanda" | "ordenes";
type SidebarProps = {
    activo: MenuKey;
    onCambiar: (menu: MenuKey) => void;
    onSalir: () => void;
    empresaNombre?: string;
    puntoNombre?: string;
    fechaActual?: string;
    terminal?: string;
};

export default function Sidebar({ activo, onCambiar, onSalir, empresaNombre, puntoNombre, fechaActual, terminal }: SidebarProps) {
    const [abierto, setAbierto] = useState(false);

    const opciones = [
        { key: "home", label: "Inicio", icon: FiHome },
        { key: "comanda", label: "Crear órdenes", icon: FiLayers },
        { key: "ordenes", label: "Órdenes abiertas", icon: FiList },
    ] as const;

    function seleccionar(menu: MenuKey) {
        onCambiar(menu);
        setAbierto(false);
    }

    return (
        <>
            {/* HEADER MÓVIL (Solo se ve en móvil) */}
            <header className="mobile-header d-lg-none d-flex align-items-center justify-content-between w-100" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
                <div className="d-flex align-items-center" style={{ gap: '8px' }}>
                    <button className="mobile-menu-btn" onClick={() => setAbierto(true)}>
                        <FiMenu size={24} />
                    </button>
                    <div className="mobile-brand">
                        <img src={logoReporte} alt="Logo Dianasis" style={{ width: '90px', height: 'auto' }} onClick={() => setAbierto(false)} />
                    </div>
                </div>
                
                {/* Info de sesión compacta a la derecha */}
                {fechaActual && (
                    <div className="text-end text-muted d-flex flex-column align-items-end justify-content-center" style={{ fontSize: '0.58rem', lineHeight: '1.2', flex: 1, minWidth: 0, paddingLeft: '6px' }}>
                        <span className="fw-bold text-dark" style={{ textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: '0.62rem', lineHeight: '1.2', whiteSpace: 'nowrap' }}>
                            {empresaNombre} {puntoNombre ? `• ${puntoNombre}` : ''}
                        </span>
                        <span className="fw-semibold text-secondary animate__animated animate__fadeIn" style={{ fontSize: '0.56rem', marginTop: '1px', whiteSpace: 'nowrap' }}>
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
                        paddingTop: '0px', 
                        paddingBottom: '8px', 
                        paddingLeft: '16px', 
                        paddingRight: '16px',
                        gap: '0px' 
                    }}
                >
                    <div className="d-flex align-items-center justify-content-start w-100" style={{ marginTop: '-10px' }}>
                        <img
                            src={logoReporte}
                            alt="Logo Reportes"
                            style={{ 
                                width: '160px', 
                                height: 'auto', 
                                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))',
                                marginBottom: '-10px'
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
                        v1.1 • DIANASIS
                    </div>
                </div>
            </aside>
        </>
    );
}




