import { strFromU8, unzipSync } from 'fflate';


export type TipoArchivoIA = 'imagen' | 'pdf' | 'hoja' | 'documento' | 'texto';

export interface ArchivoIA {
  id: string;
  nombre: string;
  tipo: TipoArchivoIA;
  tamano: number;
  /** Miniatura (solo imágenes). */
  vistaPrevia?: string;
  /** Detalle legible, p. ej. "3 hojas · 240 filas". */
  detalle: string;
  /** Bytes aproximados que viajan al servidor (para el límite por mensaje). */
  peso: number;
  adjunto: AdjuntoIA;
}

/** Lo que se envía al backend: binario en base64 (imágenes, PDF) o texto ya extraído. */
export interface AdjuntoIA {
  nombre: string;
  mimeType?: string;
  datos?: string;
  texto?: string;
}

export const MAX_ARCHIVO = 15 * 1024 * 1024;
export const MAX_TOTAL = 15 * 1024 * 1024;
const MAX_TEXTO = 150_000;
const MAX_FILAS = 2000;

const IMAGENES_GEMINI = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const EXT_TEXTO = ['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log'];

export const ACEPTADOS = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.pdf,.xlsx,.docx,.txt,.csv,.tsv,.md,.json,.xml';

export async function prepararArchivo(file: File): Promise<ArchivoIA> {
  if (file.size > MAX_ARCHIVO) {
    throw new Error(`${file.name} supera el máximo de 15 MB por archivo.`);
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const base = { id: crypto.randomUUID(), nombre: file.name, tamano: file.size };

  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic'].includes(ext)) {
    let mime = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    let dataUrl = await leerDataUrl(file);
    if (!IMAGENES_GEMINI.includes(mime)) {
      dataUrl = await convertirAPng(dataUrl);
      mime = 'image/png';
    }
    const data = dataUrl.split(',')[1];
    return { ...base, tipo: 'imagen', vistaPrevia: dataUrl, detalle: 'Imagen', peso: data.length, adjunto: { nombre: file.name, mimeType: mime, datos: data } };
  }

  if (file.type === 'application/pdf' || ext === 'pdf') {
    const data = (await leerDataUrl(file)).split(',')[1];
    return { ...base, tipo: 'pdf', detalle: 'Documento PDF', peso: data.length, adjunto: { nombre: file.name, mimeType: 'application/pdf', datos: data } };
  }

  if (ext === 'xlsx') {
    const { texto, hojas, filas } = extraerXlsx(new Uint8Array(await file.arrayBuffer()));
    const contenido = recortar(texto);
    return {
      ...base,
      tipo: 'hoja',
      detalle: `${hojas} ${hojas === 1 ? 'hoja' : 'hojas'} · ${filas} filas`,
      peso: contenido.length,
      adjunto: { nombre: file.name, texto: `Hoja de cálculo convertida a CSV (separador ;):\n${contenido}` },
    };
  }

  if (ext === 'docx') {
    const texto = recortar(extraerDocx(new Uint8Array(await file.arrayBuffer())));
    return {
      ...base,
      tipo: 'documento',
      detalle: `Documento Word · ${contarPalabras(texto)} palabras`,
      peso: texto.length,
      adjunto: { nombre: file.name, texto },
    };
  }

  if (file.type.startsWith('text/') || EXT_TEXTO.includes(ext)) {
    const texto = recortar(await file.text());
    return {
      ...base,
      tipo: 'texto',
      detalle: ext === 'csv' || ext === 'tsv' ? `${texto.split('\n').length} filas` : `${contarPalabras(texto)} palabras`,
      peso: texto.length,
      adjunto: { nombre: file.name, texto },
    };
  }

  throw new Error(`${file.name}: formato no compatible. Usa imágenes, PDF, Excel (.xlsx), Word (.docx), CSV o texto.`);
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function recortar(texto: string): string {
  return texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}\n[… contenido recortado por longitud]` : texto;
}

function contarPalabras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

function leerDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function convertirAPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
    img.src = dataUrl;
  });
}

function xml(texto: string): Document {
  return new DOMParser().parseFromString(texto, 'application/xml');
}

function porNombre(doc: Document | Element, nombre: string): Element[] {
  return Array.from(doc.getElementsByTagNameNS('*', nombre));
}

function indiceColumna(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function celdaCsv(valor: string): string {
  return /[;"\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function extraerXlsx(bytes: Uint8Array): { texto: string; hojas: number; filas: number } {
  const zip = unzipSync(bytes);
  const compartidas = zip['xl/sharedStrings.xml']
    ? porNombre(xml(strFromU8(zip['xl/sharedStrings.xml'])), 'si').map((si) => porNombre(si, 't').map((t) => t.textContent ?? '').join(''))
    : [];
  const nombres = zip['xl/workbook.xml']
    ? porNombre(xml(strFromU8(zip['xl/workbook.xml'])), 'sheet').map((s) => s.getAttribute('name') ?? '')
    : [];
  const archivosHoja = Object.keys(zip)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  let total = 0;
  const bloques = archivosHoja.map((ruta, i) => {
    const filas = porNombre(xml(strFromU8(zip[ruta])), 'row').slice(0, MAX_FILAS);
    total += filas.length;
    const lineas = filas.map((fila) => {
      const valores: string[] = [];
      for (const c of porNombre(fila, 'c')) {
        const tipo = c.getAttribute('t');
        const v = porNombre(c, 'v')[0]?.textContent ?? '';
        let valor = v;
        if (tipo === 's') valor = compartidas[Number(v)] ?? '';
        else if (tipo === 'inlineStr') valor = porNombre(c, 't').map((t) => t.textContent ?? '').join('');
        else if (tipo === 'b') valor = v === '1' ? 'VERDADERO' : 'FALSO';
        valores[indiceColumna(c.getAttribute('r') ?? 'A1')] = valor;
      }
      return Array.from(valores, (x) => celdaCsv(x ?? '')).join(';');
    });
    return `--- Hoja: ${nombres[i] || `Hoja ${i + 1}`} ---\n${lineas.join('\n')}`;
  });
  return { texto: bloques.join('\n\n'), hojas: archivosHoja.length, filas: total };
}

function extraerDocx(bytes: Uint8Array): string {
  const zip = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  const doc = zip['word/document.xml'];
  if (!doc) throw new Error('El documento Word no tiene contenido legible.');
  return porNombre(xml(strFromU8(doc)), 'p')
    .map((p) => porNombre(p, 't').map((t) => t.textContent ?? '').join(''))
    .filter((linea) => linea.trim())
    .join('\n');
}
