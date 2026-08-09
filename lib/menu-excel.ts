"use client";

import type { Producto } from "./types";

export type TipoPlantillaMenu = "precios" | "productos";

export interface FilaMenuExcel {
  fila: number;
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  icono: string;
  color: string;
  imagenUrl: string;
}

export interface ResultadoMenuExcel {
  tipo: TipoPlantillaMenu;
  filas: FilaMenuExcel[];
  errores: string[];
}

const COLUMNAS_PRECIOS = ["ID", "Nombre", "Precio base COP", "Disponible"];
const COLUMNAS_PRODUCTOS = [
  "ID", "Nombre", "Categoría", "Descripción", "Foto URL", "Precio base COP", "Disponible", "Icono", "Color HEX",
];

function slug(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function textoCelda(celda: { text: string }) {
  return celda.text.trim();
}

function descargar(bytes: BlobPart, nombre: string) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

export async function descargarPlantillaMenu(productos: Producto[], tipo: TipoPlantillaMenu) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nocta";
  workbook.created = new Date();

  const esPrecios = tipo === "precios";
  const columnas = esPrecios ? COLUMNAS_PRECIOS : COLUMNAS_PRODUCTOS;
  const menu = workbook.addWorksheet(esPrecios ? "Actualizar precios" : "Productos nuevos", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });
  menu.columns = esPrecios
    ? [{ width: 24 }, { width: 32 }, { width: 20 }, { width: 15 }]
    : [
        { width: 24 }, { width: 30 }, { width: 18 }, { width: 52 }, { width: 42 },
        { width: 20 }, { width: 15 }, { width: 12 }, { width: 16 },
      ];
  menu.addRow(columnas);

  if (esPrecios) {
    productos.forEach((producto) => menu.addRow([
      producto.id, producto.nombre, producto.precio, producto.disponible ? "SI" : "NO",
    ]));
  } else {
    for (let i = 0; i < 20; i += 1) menu.addRow(["", "", "", "", "", "", "SI", "", ""]);
  }

  const header = menu.getRow(1);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17142A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  menu.autoFilter = { from: "A1", to: esPrecios ? "D1" : "I1" };
  const precioColumna = esPrecios ? 3 : 6;
  const disponibleColumna = esPrecios ? 4 : 7;
  menu.getColumn(precioColumna).numFmt = '"$"#,##0';
  menu.getColumn(precioColumna).alignment = { horizontal: "right" };
  if (!esPrecios) menu.getColumn(4).alignment = { wrapText: true, vertical: "top" };

  for (let row = 2; row <= Math.max(menu.rowCount, 100); row += 1) {
    menu.getCell(row, disponibleColumna).dataValidation = {
      type: "list", allowBlank: false, formulae: ['"SI,NO"'],
    };
    if (!esPrecios) {
      menu.getCell(row, 3).dataValidation = {
        type: "list", allowBlank: false,
        formulae: ['"cocteles,licores,cervezas,shots,sinalcohol"'],
      };
    }
  }
  menu.eachRow((row, numero) => {
    if (numero > 1 && numero % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2FA" } };
      });
    }
  });

  const instrucciones = workbook.addWorksheet("Instrucciones", { properties: { defaultRowHeight: 24 } });
  instrucciones.columns = [{ width: 28 }, { width: 90 }];
  const reglas = esPrecios
    ? [
        ["Objetivo", "Actualizar precios y disponibilidad del catálogo actual sin crear ni eliminar productos."],
        ["ID y Nombre", "Son referencias. No cambies el ID: Nocta lo usa para localizar cada producto."],
        ["Precio", "Escribe un número entero en pesos colombianos, sin símbolos ni texto."],
        ["Disponible", "Usa SI o NO. Para ocultar un producto usa NO."],
      ]
    : [
        ["Objetivo", "Crear el menú inicial o agregar productos nuevos. No uses esta plantilla para cambios de precio."],
        ["ID", "Opcional. Si queda vacío, Nocta lo genera a partir del nombre."],
        ["Campos obligatorios", "Nombre, Categoría y Precio base COP."],
        ["Categorías válidas", "cocteles, licores, cervezas, shots, sinalcohol."],
        ["Disponible", "Usa SI o NO."],
        ["Foto URL", "Opcional. Pega una URL pública HTTPS de la fotografía del producto."],
        ["Color HEX", "Opcional. Formato #RRGGBB; si se omite se usa el color violeta de Nocta."],
      ];
  instrucciones.addRows([
    [esPrecios ? "ACTUALIZACIÓN DE PRECIOS" : "CREACIÓN DE PRODUCTOS", "Edita la primera hoja y carga el mismo archivo desde Administración."],
    ["Regla", "Detalle"],
    ...reglas,
    ["Seguridad", "La importación se valida y muestra una vista previa antes de aplicar cambios."],
  ]);
  instrucciones.getRow(1).height = 38;
  instrucciones.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: esPrecios ? "FFFF2D9A" : "FFB644FF" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  instrucciones.getRow(2).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17142A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  instrucciones.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const bytes = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  descargar(
    bytes as BlobPart,
    esPrecios ? `nocta-actualizar-precios-${fecha}.xlsx` : `nocta-productos-nuevos-${fecha}.xlsx`,
  );
}

export async function leerPlantillaMenu(archivo: File): Promise<ResultadoMenuExcel> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await archivo.arrayBuffer());
  const sheet = workbook.getWorksheet("Actualizar precios")
    ?? workbook.getWorksheet("Productos nuevos")
    ?? workbook.worksheets[0];
  if (!sheet) return { tipo: "productos", filas: [], errores: ["El archivo no contiene hojas."] };

  const headers = sheet.getRow(1).values as unknown[];
  const encabezados = headers.slice(1).map((value) => String(value ?? "").trim());
  const tipo: TipoPlantillaMenu = encabezados.includes("Categoría") ? "productos" : "precios";
  const columnas = tipo === "precios" ? COLUMNAS_PRECIOS : COLUMNAS_PRODUCTOS;
  const faltantes = columnas.filter((header) => !encabezados.includes(header));
  if (faltantes.length) {
    return { tipo, filas: [], errores: [`Faltan columnas obligatorias: ${faltantes.join(", ")}.`] };
  }

  const indice = Object.fromEntries(columnas.map((header) => [header, encabezados.indexOf(header) + 1]));
  const filas: FilaMenuExcel[] = [];
  const errores: string[] = [];
  const ids = new Set<string>();

  sheet.eachRow((row, numeroFila) => {
    if (numeroFila === 1) return;
    const nombre = textoCelda(row.getCell(indice.Nombre));
    const precioTexto = textoCelda(row.getCell(indice["Precio base COP"])).replace(/[$.,\s]/g, "");
    const categoria = tipo === "productos"
      ? textoCelda(row.getCell(indice["Categoría"])).toLowerCase()
      : "";
    if (!nombre && !categoria && !precioTexto) return;

    const idOriginal = textoCelda(row.getCell(indice.ID));
    const id = tipo === "productos" ? (idOriginal || slug(nombre)) : idOriginal;
    const precio = Number(precioTexto);
    const disponibleTexto = textoCelda(row.getCell(indice.Disponible)).toUpperCase();
    const icono = tipo === "productos" ? (textoCelda(row.getCell(indice.Icono)) || "🍸") : "";
    const imagenUrl = tipo === "productos" ? textoCelda(row.getCell(indice["Foto URL"])) : "";
    const colorTexto = tipo === "productos" ? textoCelda(row.getCell(indice["Color HEX"])) : "";
    const color = /^#[0-9A-F]{6}$/i.test(colorTexto) ? colorTexto : "#b644ff";

    if (!id) errores.push(`Fila ${numeroFila}: falta el ID.`);
    if (ids.has(id)) errores.push(`Fila ${numeroFila}: el ID “${id}” está duplicado.`);
    if (!nombre) errores.push(`Fila ${numeroFila}: falta el nombre.`);
    if (tipo === "productos" && !["cocteles", "licores", "cervezas", "shots", "sinalcohol"].includes(categoria)) {
      errores.push(`Fila ${numeroFila}: categoría “${categoria || "vacía"}” no válida.`);
    }
    if (!Number.isFinite(precio) || precio <= 0) errores.push(`Fila ${numeroFila}: precio no válido.`);
    if (imagenUrl && !/^https:\/\//i.test(imagenUrl)) {
      errores.push(`Fila ${numeroFila}: Foto URL debe comenzar por https://.`);
    }
    if (!["SI", "SÍ", "NO", "TRUE", "FALSE", "1", "0"].includes(disponibleTexto)) {
      errores.push(`Fila ${numeroFila}: Disponible debe ser SI o NO.`);
    }
    ids.add(id);

    if (id && nombre && Number.isFinite(precio) && precio > 0) {
      filas.push({
        fila: numeroFila,
        id,
        nombre,
        categoria,
        descripcion: tipo === "productos" ? textoCelda(row.getCell(indice["Descripción"])) : "",
        precio,
        disponible: ["SI", "SÍ", "TRUE", "1"].includes(disponibleTexto),
        icono,
        color,
        imagenUrl,
      });
    }
  });

  return { tipo, filas, errores };
}
