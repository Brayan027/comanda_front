import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface TicketOrden {
  nro_orden: string | number;
  mesa: string;
  mesero: string;
  numPersonas: number;
  fecha: string;
  hora: string;
  productos: {
    cantidad: number;
    ProStDescripcion: string;
    total: number;
    precioVenta: number;
    adicionales: {
      ProStDescripcion: string;
    }[];
    MopStImpreso?: string;
    ImpNombre1?: string;
  }[];
  totales: {
    subtotal: number;
    iva: number;
    impoconsumo: number;
    total: number;
  };
}

export interface TicketEmpresa {
  nombre: string;
  puntoVenta: string;
  empresaId: string;
}

function crearTicketHTML(orden: TicketOrden, empresa: TicketEmpresa): string {
  const lineSeparador = "=".repeat(38);
  const printerTitle = empresa.puntoVenta ? ` - ${empresa.puntoVenta.toUpperCase()}` : "";
  return `
    <div style="font-size:12px;line-height:1.35;font-family:monospace;color:#000;width:100%;box-sizing:border-box;padding:4px;">
      <div style="text-align:center;font-weight:bold;font-size:13px;text-transform:uppercase;">${empresa.nombre || "DIANASIS RESTAURANTE"}</div>
      <div style="text-align:center;font-size:11px;margin-top:2px;">COMANDA${printerTitle}</div>
      <br/>
      <div>MESA: ${orden.mesa}</div>
      <div>Mesero: ${orden.mesero}</div>
      <div>Personas: ${orden.numPersonas}</div>
      <div>Fecha: ${orden.fecha} Hora: ${orden.hora}</div>
      
      <div style="margin:4px 0;letter-spacing:-1px;">${lineSeparador}</div>
      
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:monospace;color:#000;">
        <thead>
          <tr>
            <th style="text-align:left;font-weight:bold;padding-bottom:2px;">PRODUCTO</th>
            <th style="text-align:right;font-weight:bold;padding-bottom:2px;width:20%;">CANT.</th>
          </tr>
          <tr>
            <td colspan="2" style="letter-spacing:-1px;padding:2px 0;">${lineSeparador}</td>
          </tr>
        </thead>
        <tbody>
          ${orden.productos.map((p) => {
            const isNuevo = p.MopStImpreso === '0';
            const rowStyle = isNuevo ? 'font-weight:bold;' : 'font-weight:normal;';
            return `
              <tr style="${rowStyle}">
                <td style="vertical-align:top;padding:3px 0;text-transform:uppercase;">
                  ${p.ProStDescripcion}
                </td>
                <td style="vertical-align:top;text-align:right;padding:3px 0;">${p.cantidad}</td>
              </tr>
              ${p.adicionales && p.adicionales.length > 0 ? p.adicionales.map((ad) => `
                <tr style="${rowStyle}">
                  <td colspan="2" style="vertical-align:top;padding:1px 0 1px 12px;font-size:10.5px;color:#333;text-transform:uppercase;">
                    + ${ad.ProStDescripcion}
                  </td>
                </tr>
              `).join("") : ""}
            `;
          }).join("")}
        </tbody>
      </table>
      
      <div style="border-top:1px solid #000;margin:8px 0;"></div>
      <br/>
      <div style="text-align:center;font-size:10px;font-family:monospace;color:#000;">
        "Impreso por Software DIANASIS WEB"
      </div>
    </div>
  `;
}

export async function generarPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<File> {
  const ticket = document.createElement("div");
  ticket.style.position = "absolute";
  ticket.style.left = "-9999px";
  ticket.style.top = "0";
  ticket.style.width = "300px";
  ticket.style.padding = "16px";
  ticket.style.background = "#ffffff";
  ticket.style.color = "#000000";
  ticket.innerHTML = crearTicketHTML(orden, empresa);

  document.body.appendChild(ticket);

  try {
    const esMovil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const scaleValue = esMovil ? 1.6 : 2.5;

    const canvas = await html2canvas(ticket, {
      scale: scaleValue,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 76;
    const pageHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [imgWidth, pageHeight + 8],
    });
    pdf.addImage(imgData, "PNG", 0, 4, imgWidth, pageHeight);
    const blob = pdf.output("blob");
    return new File([blob], `comanda_mesa_${orden.mesa}_orden_${orden.nro_orden}.pdf`, {
      type: "application/pdf",
    });
  } finally {
    document.body.removeChild(ticket);
  }
}

export async function descargarPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<void> {
  // Agrupar productos por impresora
  const groups = new Map<string, typeof orden.productos>();
  orden.productos.forEach(p => {
    const printer = p.ImpNombre1 || "Comanda General";
    if (!groups.has(printer)) {
      groups.set(printer, []);
    }
    groups.get(printer)!.push(p);
  });

  // Generar un PDF descargable por cada impresora
  for (const [printer, products] of groups.entries()) {
    const splitOrden: TicketOrden = {
      ...orden,
      productos: products
    };
    const splitEmpresa: TicketEmpresa = {
      ...empresa,
      nombre: empresa.nombre,
      puntoVenta: printer
    };
    const pdf = await generarPDF(splitOrden, splitEmpresa);
    const url = URL.createObjectURL(pdf);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${printer.toLowerCase().replace(/\s+/g, '_')}_${pdf.name}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export async function compartirPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<boolean> {
  const groups = new Map<string, typeof orden.productos>();
  orden.productos.forEach(p => {
    const printer = p.ImpNombre1 || "Comanda General";
    if (!groups.has(printer)) {
      groups.set(printer, []);
    }
    groups.get(printer)!.push(p);
  });

  let allSuccess = true;
  for (const [printer, products] of groups.entries()) {
    const splitOrden: TicketOrden = {
      ...orden,
      productos: products
    };
    const splitEmpresa: TicketEmpresa = {
      ...empresa,
      nombre: empresa.nombre,
      puntoVenta: printer
    };
    const pdf = await generarPDF(splitOrden, splitEmpresa);

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdf] }))) {
      try {
        await navigator.share({
          files: [pdf],
          title: `${printer.toUpperCase()} - Comanda Mesa ${orden.mesa}`,
        });
      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && (err as Error).name === "AbortError") {
          continue;
        }
        allSuccess = false;
      }
    } else {
      allSuccess = false;
    }
  }
  return allSuccess;
}
