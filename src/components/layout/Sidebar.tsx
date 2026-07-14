import { useState } from "react";
import { FiHome, FiLogOut, FiMenu } from "react-icons/fi";
import logoReporte from "../../assets/LogoReportes.png";

export type MenuKey = "home";
type SidebarProps = {
    activo: MenuKey;
    onCambiar: (menu: MenuKey) => void;
    onSalir: () => void;
};

export default function Sidebar({ activo, onCambiar, onSalir }: SidebarProps) {
    const [abierto, setAbierto] = useState(false);

    const opciones = [
        { key: "home", label: "Inicio", icon: FiHome },
    ] as const;

    function seleccionar(menu: MenuKey) {
        onCambiar(menu);
        setAbierto(false);
    }

    return (
        <>
            {/* HEADER MÓVIL (Solo se ve en móvil) */}
            <header className="mobile-header d-lg-none">
                <button className="mobile-menu-btn" onClick={() => setAbierto(true)}>
                    <FiMenu size={24} />
                </button>
                <div className="mobile-brand">
                    {/* <div className="brand-icon-small">
                        <FiLayers size={20} />
                    </div>
                    <span>Reportes</span> */}
                    <img src={logoReporte} alt="Logo Reportes" style={{ width: '100px', height: 'auto' }} onClick={() => setAbierto(false)} />
                </div>
            </header>

            {/* OVERLAY PARA CERRAR EN MÓVIL */}
            {abierto && <div className="sidebar-overlay d-lg-none" onClick={() => setAbierto(false)} />}

            {/* SIDEBAR PRINCIPAL */}
            <aside className={`premium-sidebar ${abierto ? "is-open" : ""}`} style={{ background: '#ffffff' }}>
                <div className="sidebar-header d-flex flex-column align-items-center justify-content-center pt-4 pb-1">
                    <div className="brand-group text-center">
                        <img
                            src={logoReporte}
                            alt="Logo Reportes"
                            style={{ width: '150px', height: 'auto', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))' }}
                            className="animate__animated animate__fadeIn"
                        />
                    </div>
                </div>

                <nav className="sidebar-nav">

                    <ul className="nav-list">
                        {opciones.map((op) => {
                            const Icon = op.icon;
                            const esActivo = activo === op.key;
                            return (
                                <li key={op.key}>
                                    <button
                                        className={`nav-item ${esActivo ? "active" : ""}`}
                                        onClick={() => seleccionar(op.key)}
                                        style={{ position: 'relative' }}
                                    >
                                        <div className="nav-icon-box">
                                            <Icon size={18} />
                                        </div>
                                        <span style={{ flex: 1 }}>{op.label}</span>
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




