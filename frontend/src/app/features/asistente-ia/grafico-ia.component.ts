import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraficoIA } from './tipos';

/** Paleta categórica validada (orden fijo; CVD ΔE ≥ 10 entre vecinos, contraste ≥ 3:1). */
export const SERIES = ['#2a78d6', '#7f9a1e', '#6250d6', '#eb6834', '#1c9e8a', '#e34948'];

const W = 640;
const GRID = '#e3e8e6';

interface Tick { valor: number; pos: number; texto: string; }
interface Marca { d: string; color: string; }
interface Zona { x: number; y: number; w: number; h: number; indice: number; }
interface EtiquetaEje { x: number; y: number; texto: string; completo: string; ancla: 'start' | 'middle' | 'end'; }
interface Linea { d: string; color: string; puntos: { x: number; y: number }[]; nombre: string; fin: { x: number; y: number } }
interface Porcion { d: string; color: string; nombre: string; valor: number; pct: number; }

interface Geometria {
  alto: number;
  orientacion: 'vertical' | 'horizontal';
  ticks: Tick[];
  ejeX: EtiquetaEje[];
  marcas: Marca[];
  lineas: Linea[];
  zonas: Zona[];
  base: { x1: number; y1: number; x2: number; y2: number };
  destacado?: { x: number; y: number; texto: string; ancla: 'start' | 'middle' };
  izquierda: number;
  derecha: number;
  arriba: number;
  abajo: number;
}

@Component({
  selector: 'app-grafico-ia',
  standalone: true,
  imports: [CommonModule],
  template: `
    <figure class="chart">
      <figcaption class="chart-head">
        <div>
          <h4>{{ grafico().titulo }}</h4>
          @if (grafico().descripcion) { <p>{{ grafico().descripcion }}</p> }
        </div>
        <button type="button" class="chart-toggle" (click)="tabla.set(!tabla())" [attr.aria-pressed]="tabla()">
          {{ tabla() ? 'Ver gráfico' : 'Ver tabla' }}
        </button>
      </figcaption>

      @if (grafico().tipo !== 'torta' && grafico().series.length > 1 && !tabla()) {
        <ul class="legend" aria-label="Leyenda">
          @for (s of grafico().series; track $index) {
            <li><span class="swatch" [style.background]="color($index)"></span>{{ s.nombre }}</li>
          }
        </ul>
      }

      @if (tabla()) {
        <div class="chart-table-wrap">
          <table class="chart-table">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                @for (s of grafico().series; track $index) { <th scope="col" class="num">{{ s.nombre }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (et of grafico().etiquetas; track $index; let i = $index) {
                <tr>
                  <th scope="row">{{ et }}</th>
                  @for (s of grafico().series; track $index) { <td class="num">{{ formato(s.valores[i]) }}</td> }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (grafico().tipo === 'torta') {
        <div class="donut-layout">
          <svg class="donut" viewBox="0 0 220 220" role="img" [attr.aria-label]="grafico().titulo">
            @for (p of porciones(); track $index) {
              <path [attr.d]="p.d" [attr.fill]="p.color" stroke="#fff" stroke-width="2"
                [class.dim]="hoverPorcion() !== null && hoverPorcion() !== $index"
                (mouseenter)="hoverPorcion.set($index)" (mouseleave)="hoverPorcion.set(null)"></path>
            }
            <text x="110" y="104" text-anchor="middle" class="donut-total">{{ hoverPorcion() !== null ? pctTexto(porciones()[hoverPorcion()!].pct) : formatoCorto(totalTorta()) }}</text>
            <text x="110" y="126" text-anchor="middle" class="donut-label">{{ hoverPorcion() !== null ? porciones()[hoverPorcion()!].nombre : 'Total' }}</text>
          </svg>
          <ul class="donut-legend">
            @for (p of porciones(); track $index) {
              <li [class.active]="hoverPorcion() === $index" (mouseenter)="hoverPorcion.set($index)" (mouseleave)="hoverPorcion.set(null)">
                <span class="swatch" [style.background]="p.color"></span>
                <span class="dl-name">{{ p.nombre }}</span>
                <span class="dl-value">{{ formato(p.valor) }}</span>
                <span class="dl-pct">{{ pctTexto(p.pct) }}</span>
              </li>
            }
          </ul>
        </div>
      } @else {
        <div class="plot" (mouseleave)="hover.set(null)">
          <svg [attr.viewBox]="'0 0 ' + ancho() + ' ' + geo().alto" role="img" [attr.aria-label]="grafico().titulo">
            <!-- Rejilla y eje de valores -->
            @for (t of geo().ticks; track t.valor) {
              @if (geo().orientacion === 'vertical') {
                <line [attr.x1]="geo().izquierda" [attr.x2]="ancho() - geo().derecha" [attr.y1]="t.pos" [attr.y2]="t.pos" [attr.stroke]="grid" stroke-width="1"></line>
                <text [attr.x]="geo().izquierda - 10" [attr.y]="t.pos" class="tick" text-anchor="end" dominant-baseline="middle">{{ t.texto }}</text>
              } @else {
                <line [attr.y1]="geo().arriba" [attr.y2]="geo().alto - geo().abajo" [attr.x1]="t.pos" [attr.x2]="t.pos" [attr.stroke]="grid" stroke-width="1"></line>
                <text [attr.x]="t.pos" [attr.y]="geo().alto - geo().abajo + 18" class="tick" text-anchor="middle">{{ t.texto }}</text>
              }
            }

            <!-- Etiquetas de categorías -->
            @for (e of geo().ejeX; track $index) {
              <text [attr.x]="e.x" [attr.y]="e.y" class="cat" [attr.text-anchor]="e.ancla" dominant-baseline="middle"><title>{{ e.completo }}</title>{{ e.texto }}</text>
            }

            <!-- Crosshair (líneas) -->
            @if (grafico().tipo === 'lineas' && hover(); as h) {
              <line [attr.x1]="h.x" [attr.x2]="h.x" [attr.y1]="geo().arriba" [attr.y2]="geo().alto - geo().abajo" stroke="#9aa5ad" stroke-width="1"></line>
            }

            @for (m of geo().marcas; track $index) {
              <path [attr.d]="m.d" [attr.fill]="m.color"></path>
            }

            @for (l of geo().lineas; track $index) {
              <path [attr.d]="l.d" fill="none" [attr.stroke]="l.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
              <circle [attr.cx]="l.fin.x" [attr.cy]="l.fin.y" r="4" [attr.fill]="l.color" stroke="#fff" stroke-width="2"></circle>
              @if (hover(); as h) {
                <circle [attr.cx]="l.puntos[h.indice].x" [attr.cy]="l.puntos[h.indice].y" r="5" [attr.fill]="l.color" stroke="#fff" stroke-width="2"></circle>
              }
            }

            <line [attr.x1]="geo().base.x1" [attr.y1]="geo().base.y1" [attr.x2]="geo().base.x2" [attr.y2]="geo().base.y2" stroke="#b9c2c7" stroke-width="1"></line>

            @if (geo().destacado; as d) {
              <text [attr.x]="d.x" [attr.y]="d.y" class="value-label" [attr.text-anchor]="d.ancla" dominant-baseline="middle">{{ d.texto }}</text>
            }

            <!-- Zonas de interacción (más grandes que la marca) -->
            @for (z of geo().zonas; track $index) {
              <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" fill="transparent"
                [class.zone-active]="hover()?.indice === z.indice"
                (mouseenter)="mostrar(z)" (focus)="mostrar(z)" tabindex="0"
                [attr.aria-label]="grafico().etiquetas[z.indice]"></rect>
            }
          </svg>

          @if (hover(); as h) {
            <div class="tooltip" [style.left.%]="(h.x / ancho()) * 100" [style.top.%]="(h.y / geo().alto) * 100" [class.flip]="h.x + 200 > ancho()">
              <strong>{{ grafico().etiquetas[h.indice] }}</strong>
              @for (s of grafico().series; track $index) {
                <span class="tt-row"><span class="swatch" [style.background]="color($index)"></span>{{ s.nombre }}<b>{{ formato(s.valores[h.indice]) }}</b></span>
              }
            </div>
          }
        </div>
      }
    </figure>
  `,
  styles: [`
    :host { display: block; }
    .chart { margin: 0; }
    .chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
    .chart-head h4 { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .chart-head p { margin-top: 3px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
    .chart-toggle { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--surface-card); color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; }
    .chart-toggle:hover { border-color: var(--border-strong); color: var(--text-primary); }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 10px; padding: 0; list-style: none; font-size: 12px; color: var(--text-secondary); }
    .legend li { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex: 0 0 10px; }
    .plot { position: relative; }
    svg { display: block; width: 100%; height: auto; overflow: visible; font-family: var(--font-sans); }
    .tick { font-size: 11px; fill: #66727b; font-variant-numeric: tabular-nums; }
    .cat { font-size: 11.5px; fill: #4f5b64; }
    .value-label { font-size: 11.5px; font-weight: 700; fill: var(--text-primary); font-variant-numeric: tabular-nums; }
    rect[tabindex] { outline: none; cursor: default; }
    rect.zone-active { fill: rgba(38, 53, 63, 0.04); }
    .tooltip { position: absolute; z-index: 2; transform: translate(12px, -50%); min-width: 150px; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: 10px; background: #fff; box-shadow: 0 8px 24px rgba(24, 34, 42, .14); pointer-events: none; font-size: 12px; }
    .tooltip.flip { transform: translate(calc(-100% - 12px), -50%); }
    .tooltip strong { display: block; margin-bottom: 5px; color: var(--text-primary); font-size: 12.5px; }
    .tt-row { display: flex; align-items: center; gap: 7px; white-space: nowrap; color: var(--text-secondary); line-height: 1.7; }
    .tt-row b { margin-left: auto; padding-left: 12px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
    .donut-layout { display: grid; grid-template-columns: minmax(160px, 220px) 1fr; gap: 24px; align-items: center; }
    .donut path { transition: opacity 150ms ease; }
    .donut path.dim { opacity: .35; }
    .donut-total { font-size: 22px; font-weight: 750; fill: var(--text-primary); font-variant-numeric: tabular-nums; }
    .donut-label { font-size: 11.5px; fill: #66727b; }
    .donut-legend { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
    .donut-legend li { display: grid; grid-template-columns: 10px 1fr auto 52px; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; font-size: 12.5px; }
    .donut-legend li.active { background: var(--surface-subtle); }
    .dl-name { color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dl-value { color: var(--text-primary); font-weight: 650; font-variant-numeric: tabular-nums; }
    .dl-pct { color: var(--text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
    .chart-table-wrap { overflow-x: auto; border: 1px solid var(--border-color); border-radius: 10px; }
    .chart-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .chart-table th, .chart-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-color); text-align: left; }
    .chart-table thead th { background: #f5f7f6; color: var(--text-secondary); font-size: 11px; font-weight: 700; }
    .chart-table tbody th { font-weight: 500; color: var(--text-primary); }
    .chart-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .chart-table tr:last-child th, .chart-table tr:last-child td { border-bottom: 0; }
    @media (max-width: 560px) { .donut-layout { grid-template-columns: 1fr; } .donut { max-width: 220px; margin: 0 auto; } }
  `],
})
export class GraficoIaComponent {
  readonly grafico = input.required<GraficoIA>();
  readonly tabla = signal(false);
  readonly hover = signal<{ x: number; y: number; indice: number } | null>(null);
  readonly hoverPorcion = signal<number | null>(null);
  readonly ancho = signal(W);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const w = Math.round(entry.contentRect.width);
        if (w > 0 && Math.abs(w - this.ancho()) > 4) this.ancho.set(Math.max(300, w));
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
  readonly grid = GRID;

  color(i: number): string {
    return SERIES[i % SERIES.length];
  }

  mostrar(z: Zona): void {
    this.hover.set({ x: z.x + z.w / 2, y: z.y + z.h / 2, indice: z.indice });
  }

  formato(v: number): string {
    const unidad = (this.grafico().unidad ?? '').trim();
    const n = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(v ?? 0);
    if (/^s\/|soles/i.test(unidad)) return `S/ ${n}`;
    if (unidad === '%') return `${n}%`;
    return unidad && unidad.length <= 12 ? `${n} ${unidad}` : n;
  }

  formatoCorto(v: number): string {
    const unidad = (this.grafico().unidad ?? '').trim();
    const n = new Intl.NumberFormat('es-PE', { notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);
    return /^s\/|soles/i.test(unidad) ? `S/ ${n}` : unidad === '%' ? `${n}%` : n;
  }

  pctTexto(p: number): string {
    return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(p)}%`;
  }

  readonly totalTorta = computed(() => (this.grafico().series[0]?.valores ?? []).reduce((a, b) => a + Math.max(0, b), 0));

  readonly porciones = computed<Porcion[]>(() => {
    const g = this.grafico();
    let items = g.etiquetas.map((nombre, i) => ({ nombre, valor: Math.max(0, g.series[0]?.valores[i] ?? 0) })).filter((x) => x.valor > 0);
    items.sort((a, b) => b.valor - a.valor);
    if (items.length > 6) {
      const resto = items.slice(5).reduce((a, b) => a + b.valor, 0);
      items = [...items.slice(0, 5), { nombre: 'Otros', valor: resto }];
    }
    const total = items.reduce((a, b) => a + b.valor, 0) || 1;
    const cx = 110, cy = 110, R = 100, r = 66;
    let ang = -Math.PI / 2;
    return items.map((it, i) => {
      const barrido = (it.valor / total) * Math.PI * 2;
      const a0 = ang, a1 = ang + Math.min(barrido, Math.PI * 2 - 0.0001);
      ang += barrido;
      const largo = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      const d = `M ${p(R, a0)} A ${R} ${R} 0 ${largo} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${largo} 0 ${p(r, a0)} Z`;
      return { d, color: it.nombre === 'Otros' ? '#9aa5ad' : SERIES[i], nombre: it.nombre, valor: it.valor, pct: (it.valor / total) * 100 };
    });
  });

  readonly geo = computed<Geometria>(() => {
    const g = this.grafico();
    const n = g.etiquetas.length;
    const todos = g.series.flatMap((s) => s.valores);
    const largoEtiqueta = Math.max(...g.etiquetas.map((e) => e.length));
    const W = this.ancho();
    const horizontal = g.tipo === 'barras' && (n > 8 || largoEtiqueta > 12 || (W < 520 && n > 5));

    if (horizontal) return this.barrasHorizontales(g, todos);

    const izquierda = 56, derecha = 20, arriba = 18, abajo = 36, alto = W < 520 ? 240 : 280;
    const plotW = W - izquierda - derecha, plotH = alto - arriba - abajo;
    const incluirCero = g.tipo === 'barras' || Math.min(...todos) >= 0;
    const ticks = escala(incluirCero ? Math.min(0, ...todos) : Math.min(...todos), Math.max(incluirCero ? 0 : -Infinity, ...todos));
    const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
    const y = (v: number) => arriba + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const y0 = y(Math.max(lo, Math.min(0, hi)));

    const geo: Geometria = {
      alto, orientacion: 'vertical', izquierda, derecha, arriba, abajo,
      ticks: ticks.map((v) => ({ valor: v, pos: y(v), texto: this.formatoCorto(v) })),
      ejeX: [], marcas: [], lineas: [], zonas: [],
      base: { x1: izquierda, x2: W - derecha, y1: g.tipo === 'barras' ? y0 : arriba + plotH, y2: g.tipo === 'barras' ? y0 : arriba + plotH },
    };

    if (g.tipo === 'barras') {
      const banda = plotW / n;
      const k = g.series.length;
      const grosor = Math.min(24, (banda * 0.72 - (k - 1) * 2) / k);
      const grupo = k * grosor + (k - 1) * 2;
      let max = { v: -Infinity, x: 0, y: 0 };
      g.etiquetas.forEach((et, i) => {
        const x0 = izquierda + banda * i + (banda - grupo) / 2;
        g.series.forEach((s, j) => {
          const v = s.valores[i];
          const x = x0 + j * (grosor + 2);
          geo.marcas.push({ d: barraVertical(x, grosor, y0, y(v)), color: SERIES[j] });
          if (v > max.v) max = { v, x: x + grosor / 2, y: y(v) };
        });
        geo.ejeX.push({ x: izquierda + banda * (i + 0.5), y: alto - abajo + 18, texto: truncar(et, Math.max(6, Math.floor(banda / 7))), completo: et, ancla: 'middle' });
        geo.zonas.push({ x: izquierda + banda * i, y: arriba, w: banda, h: plotH, indice: i });
      });
      if (k === 1 && max.v > 0) geo.destacado = { x: max.x, y: max.y - 10, texto: this.formatoCorto(max.v), ancla: 'middle' };
    } else {
      const paso = n > 1 ? plotW / (n - 1) : 0;
      const xs = g.etiquetas.map((_, i) => (n > 1 ? izquierda + paso * i : izquierda + plotW / 2));
      const cada = Math.ceil(n / (W < 520 ? 4 : 8));
      g.etiquetas.forEach((et, i) => {
        if (i % cada === 0 || i === n - 1) {
          geo.ejeX.push({ x: xs[i], y: alto - abajo + 18, texto: truncar(et, 12), completo: et, ancla: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
        }
        const w = n > 1 ? paso : plotW;
        geo.zonas.push({ x: xs[i] - w / 2, y: arriba, w, h: plotH, indice: i });
      });
      geo.lineas = g.series.map((s, j) => {
        const puntos = s.valores.map((v, i) => ({ x: xs[i], y: y(v) }));
        return { d: puntos.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '), color: SERIES[j], puntos, nombre: s.nombre, fin: puntos[puntos.length - 1] };
      });
    }
    return geo;
  });

  private barrasHorizontales(g: GraficoIA, todos: number[]): Geometria {
    const W = this.ancho();
    const n = g.etiquetas.length, k = g.series.length;
    const grosor = k === 1 ? 18 : Math.max(8, Math.min(14, 30 / k));
    const fila = k * grosor + (k - 1) * 2 + 14;
    const izquierda = W < 520 ? 108 : 150, derecha = 48, arriba = 6, abajo = 30;
    const alto = arriba + n * fila + abajo;
    const plotW = W - izquierda - derecha;
    const ticks = escala(Math.min(0, ...todos), Math.max(0, ...todos));
    const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
    const x = (v: number) => izquierda + ((v - lo) / (hi - lo || 1)) * plotW;
    const x0 = x(Math.max(lo, Math.min(0, hi)));
    const geo: Geometria = {
      alto, orientacion: 'horizontal', izquierda, derecha, arriba, abajo,
      ticks: ticks.map((v) => ({ valor: v, pos: x(v), texto: this.formatoCorto(v) })),
      ejeX: [], marcas: [], lineas: [], zonas: [],
      base: { x1: x0, x2: x0, y1: arriba, y2: alto - abajo },
    };
    let max = { v: -Infinity, x: 0, y: 0 };
    g.etiquetas.forEach((et, i) => {
      const yFila = arriba + i * fila;
      g.series.forEach((s, j) => {
        const v = s.valores[i];
        const y = yFila + 7 + j * (grosor + 2);
        geo.marcas.push({ d: barraHorizontal(y, grosor, x0, x(v)), color: SERIES[j] });
        if (v > max.v) max = { v, x: x(v), y: y + grosor / 2 };
      });
      geo.ejeX.push({ x: izquierda - 10, y: yFila + fila / 2, texto: truncar(et, W < 520 ? 15 : 22), completo: et, ancla: 'end' });
      geo.zonas.push({ x: izquierda, y: yFila, w: plotW, h: fila, indice: i });
    });
    if (k === 1 && max.v > 0) geo.destacado = { x: max.x + 8, y: max.y, texto: this.formatoCorto(max.v), ancla: 'start' };
    return geo;
  }
}

function escala(min: number, max: number, cantidad = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max === min) { max = min + (Math.abs(min) || 1); }
  const paso0 = (max - min) / cantidad;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const err = paso0 / mag;
  const paso = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / paso) * paso;
  const hi = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/** Barra vertical: esquina redondeada (4px) solo en el extremo del dato, recta en la base. */
function barraVertical(x: number, w: number, base: number, fin: number): string {
  const h = Math.abs(base - fin);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (fin < base) {
    return `M${x},${base} V${fin + r} Q${x},${fin} ${x + r},${fin} H${x + w - r} Q${x + w},${fin} ${x + w},${fin + r} V${base} Z`;
  }
  return `M${x},${base} V${fin - r} Q${x},${fin} ${x + r},${fin} H${x + w - r} Q${x + w},${fin} ${x + w},${fin - r} V${base} Z`;
}

function barraHorizontal(y: number, h: number, base: number, fin: number): string {
  const w = Math.abs(fin - base);
  if (w < 0.5) return '';
  const r = Math.min(4, h / 2, w);
  if (fin > base) {
    return `M${base},${y} H${fin - r} Q${fin},${y} ${fin},${y + r} V${y + h - r} Q${fin},${y + h} ${fin - r},${y + h} H${base} Z`;
  }
  return `M${base},${y} H${fin + r} Q${fin},${y} ${fin},${y + r} V${y + h - r} Q${fin},${y + h} ${fin + r},${y + h} H${base} Z`;
}
