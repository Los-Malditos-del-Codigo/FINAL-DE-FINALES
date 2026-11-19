export interface SerieGrafico {
  nombre: string;
  valores: number[];
}

export interface GraficoIA {
  tipo: 'barras' | 'lineas' | 'torta';
  titulo: string;
  descripcion?: string;
  unidad?: string;
  etiquetas: string[];
  series: SerieGrafico[];
}

export interface DiagramaIA {
  titulo?: string;
  descripcion?: string;
  mermaid: string;
}

/** Bloque de una respuesta del asistente, listo para dibujar. */
export type BloqueRespuesta =
  | { tipo: 'texto'; html: string }
  | { tipo: 'grafico'; grafico: GraficoIA }
  | { tipo: 'diagrama'; diagrama: DiagramaIA }
  | { tipo: 'codigo'; lenguaje: string; codigo: string };

/** Valida y completa el JSON de un gráfico propuesto por la IA. Devuelve null si no se puede dibujar. */
export function normalizarGrafico(g: any): GraficoIA | null {
  if (!g || typeof g !== 'object') return null;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const tipo = (['barras', 'lineas', 'torta'].includes(g.tipo) ? g.tipo : 'barras') as GraficoIA['tipo'];
  const etiquetas = arr<unknown>(g.etiquetas).map(String).slice(0, 12);
  const series = arr<any>(g.series)
    .slice(0, tipo === 'torta' ? 1 : 6)
    .map((s) => ({
      nombre: String(s?.nombre ?? 'Serie'),
      valores: etiquetas.map((_, i) => Number(arr<unknown>(s?.valores)[i]) || 0),
    }));
  if (!etiquetas.length || !series.length || !series.some((s) => s.valores.some((v) => v !== 0))) return null;
  return {
    tipo,
    titulo: String(g.titulo ?? 'Gráfico'),
    descripcion: g.descripcion ? String(g.descripcion) : undefined,
    unidad: g.unidad ? String(g.unidad) : undefined,
    etiquetas,
    series,
  };
}
