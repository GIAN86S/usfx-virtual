// Exportes en el propio celular o compu: no cargan al servidor y las librerías solo se bajan al usarlas.
export type Celda = string | number | null | undefined;
export interface Reporte { titulo: string; subtitulo?: string; columnas: string[]; filas: Celda[][]; archivo: string; horizontal?: boolean; pie?: string }

const INSTITUCION = 'Universidad Mayor, Real y Pontificia de San Francisco Xavier de Chuquisaca';
const AZUL: [number, number, number] = [0, 59, 144];
const generado = () => 'Generado el ' + new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/La_Paz' }).format(new Date());

function guardar(blob: Blob, nombre: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function emblema(): Promise<string | null> {
  try {
    const b = await (await fetch(import.meta.env.BASE_URL + 'logos/usfx-emblema.png')).blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.readAsDataURL(b); });
  } catch { return null; }
}

export async function aPDF(r: Reporte) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: r.horizontal ? 'landscape' : 'portrait', unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const logo = await emblema();
  if (logo) doc.addImage(logo, 'PNG', 14, 10, 15, 20);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(70).text(INSTITUCION, 33, 14, { maxWidth: ancho - 47 });
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...AZUL).text(r.titulo, 33, 22);
  if (r.subtitulo) doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(50).text(r.subtitulo, 33, 28, { maxWidth: ancho - 47 });
  autoTable(doc, {
    startY: 35, head: [r.columnas], body: r.filas.map((f) => f.map((c) => (c ?? '') as any)),
    styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: AZUL, textColor: 255 }, alternateRowStyles: { fillColor: [245, 247, 251] },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5).setTextColor(110).text(generado(), 14, h - 8);
      doc.text(`Página ${doc.getNumberOfPages()}`, ancho - 14, h - 8, { align: 'right' });
    },
  });
  if (r.pie) doc.setFontSize(9).setTextColor(40).text(r.pie, 14, (doc as any).lastAutoTable.finalY + 8, { maxWidth: ancho - 28 });
  guardar(doc.output('blob'), r.archivo + '.pdf');
}

export async function aExcel(r: Reporte) {
  const ExcelJS = (await import('exceljs')).default;
  const lb = new ExcelJS.Workbook();
  lb.creator = 'USFX Virtual';
  const h = lb.addWorksheet(r.titulo.slice(0, 30).replace(/[\\/*?:[\]]/g, ' '));
  const n = r.columnas.length;
  h.mergeCells(1, 1, 1, n); h.getCell(1, 1).value = INSTITUCION; h.getCell(1, 1).font = { size: 9, color: { argb: 'FF555555' } };
  h.mergeCells(2, 1, 2, n); h.getCell(2, 1).value = r.titulo; h.getCell(2, 1).font = { size: 14, bold: true, color: { argb: 'FF003B90' } };
  h.mergeCells(3, 1, 3, n); h.getCell(3, 1).value = r.subtitulo ?? ''; h.getCell(3, 1).font = { size: 10 };
  const cab = h.getRow(5); cab.values = r.columnas;
  cab.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003B90' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  r.filas.forEach((f) => h.addRow(f.map((c) => (c ?? null) as any)));
  h.views = [{ state: 'frozen', ySplit: 5 }];
  h.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };
  h.columns.forEach((col, i) => {
    const largo = Math.max(r.columnas[i].length, ...r.filas.slice(0, 500).map((f) => String(f[i] ?? '').length));
    col.width = Math.min(Math.max(8, largo + 2), 44);
  });
  if (r.pie) h.addRow([]), h.addRow([r.pie]);
  h.addRow([generado()]).getCell(1).font = { size: 8, color: { argb: 'FF777777' } };
  guardar(new Blob([await lb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), r.archivo + '.xlsx');
}
