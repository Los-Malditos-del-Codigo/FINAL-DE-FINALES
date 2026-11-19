import { BloqueRespuesta, normalizarGrafico } from './tipos';

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function enLinea(s: string): string {
  return escapar(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

const celdas = (fila: string) => fila.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const esSeparador = (fila: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(fila);

/** Convierte el Markdown de la IA en HTML seguro: todo se escapa antes de aplicar formato. */
export function markdownSeguro(texto: string): string {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const html: string[] = [];
  let lista: 'ul' | 'ol' | null = null;
  const cerrarLista = () => {
    if (lista) html.push(`</${lista}>`);
    lista = null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) {
      cerrarLista();
      continue;
    }

    // Tabla: encabezado + separador + filas
    if (linea.startsWith('|') && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      cerrarLista();
      const encabezado = celdas(linea);
      const alineacion = celdas(lineas[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : 'left'));
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        filas.push(celdas(lineas[i]));
        i++;
      }
      i--;
      const th = encabezado.map((c, j) => `<th class="al-${alineacion[j] ?? 'left'}">${enLinea(c)}</th>`).join('');
      const tb = filas
        .map((f) => `<tr>${encabezado.map((_, j) => `<td class="al-${alineacion[j] ?? 'left'}">${enLinea(f[j] ?? '')}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<div class="md-table"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }

    const titulo = linea.match(/^(#{1,6})\s+(.*)$/);
    const vineta = linea.match(/^[-*•]\s+(.*)$/);
    const numero = linea.match(/^\d+[.)]\s+(.*)$/);
    if (titulo) {
      cerrarLista();
      const nivel = Math.min(6, Math.max(3, titulo[1].length + 1));
      html.push(`<h${nivel}>${enLinea(titulo[2])}</h${nivel}>`);
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(linea)) {
      cerrarLista();
      html.push('<hr>');
    } else if (linea.startsWith('>')) {
      cerrarLista();
      html.push(`<blockquote>${enLinea(linea.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol';
      if (lista !== tipo) {
        cerrarLista();
        html.push(`<${tipo}>`);
        lista = tipo;
      }
      html.push(`<li>${enLinea((vineta ?? numero)![1])}</li>`);
    } else {
      cerrarLista();
      html.push(`<p>${enLinea(linea)}</p>`);
    }
  }
  cerrarLista();
  return html.join('');
}

/**
 * Divide la respuesta del asistente en bloques: texto, gráficos (```grafico JSON),
 * diagramas (```mermaid) y código.
 */
export function bloquesDeRespuesta(contenido: string): BloqueRespuesta[] {
  const bloques: BloqueRespuesta[] = [];
  const patron = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  const agregarTexto = (t: string) => {
    if (t.trim()) bloques.push({ tipo: 'texto', html: markdownSeguro(t) });
  };

  while ((m = patron.exec(contenido))) {
    agregarTexto(contenido.slice(ultimo, m.index));
    ultimo = patron.lastIndex;
    const lenguaje = m[1].toLowerCase();
    const cuerpo = m[2].trim();
    if (lenguaje === 'mermaid') {
      bloques.push({ tipo: 'diagrama', diagrama: { mermaid: cuerpo } });
      continue;
    }
    if (['grafico', 'gráfico', 'chart', 'json'].includes(lenguaje)) {
      try {
        const grafico = normalizarGrafico(JSON.parse(cuerpo));
        if (grafico) {
          bloques.push({ tipo: 'grafico', grafico });
          continue;
        }
      } catch {
        /* no es un gráfico válido: se muestra como código */
      }
    }
    bloques.push({ tipo: 'codigo', lenguaje, codigo: cuerpo });
  }
  // Bloque abierto sin cerrar (respuesta cortada): se muestra como texto
  agregarTexto(contenido.slice(ultimo));
  return bloques;
}

const MARCA_ADJUNTOS = /\n*\[\[adjuntos: (.*)\]\]\s*$/;

/** Separa el texto del usuario de la lista de archivos que adjuntó. */
export function separarAdjuntos(contenido: string): { texto: string; adjuntos: string[] } {
  const m = contenido.match(MARCA_ADJUNTOS);
  if (!m) return { texto: contenido, adjuntos: [] };
  return { texto: contenido.slice(0, m.index).trim(), adjuntos: m[1].split(' | ').map((n) => n.trim()).filter(Boolean) };
}

/** Texto plano para copiar al portapapeles. */
export function textoPlano(contenido: string): string {
  return contenido
    .replace(/```(?:grafico|gráfico|chart)[\s\S]*?```/gi, '[gráfico]')
    .replace(/```mermaid[\s\S]*?```/gi, '[diagrama]')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
