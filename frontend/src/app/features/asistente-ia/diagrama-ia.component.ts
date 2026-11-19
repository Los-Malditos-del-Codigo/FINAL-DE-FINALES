import { Component, HostListener, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DiagramaIA } from './tipos';

let inicializado = false;
let contador = 0;

/**
 * Normaliza código Mermaid para evitar errores de renderizado en Mermaid v10+:
 * 1. Convierte listas numeradas ("1. Texto") dentro de etiquetas a "1) Texto"
 *    para evitar el error "Unsupported markdown: list" de Mermaid.
 * 2. Convierte viñetas ("- Texto") dentro de etiquetas a "• Texto".
 * 3. Convierte saltos "\n" literales en "<br/>".
 * 4. Si es un árbol jerárquico ancho (6+ hojas en flowchart TD), cambia a LR
 *    para que no quede minúsculo e ilegible en horizontal.
 */
export function normalizarMermaid(raw: string, forzarDireccion?: 'TD' | 'LR'): string {
  let codigo = raw.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!codigo) return '';

  // Limpiar contenido dentro de comillas "..."
  codigo = codigo.replace(/"([^"]*)"/g, (_match, inner: string) => {
    const limpio = inner
      .replace(/\\n/g, '<br/>')
      .replace(/(^|<br\s*\/?>|\n)\s*(\d+)\.\s+/g, '$1$2) ')
      .replace(/(^|<br\s*\/?>|\n)\s*[-*+]\s+/g, '$1• ')
      .replace(/(^|<br\s*\/?>|\n)\s*#+\s+/g, '$1');
    return `"${limpio}"`;
  });

  // Limpiar etiquetas sin comillas tipo A[1. Paso]
  codigo = codigo
    .replace(/(\[\s*|\(\s*|\{\s*)(\d+)\.\s+/g, '$1$2) ')
    .replace(/(\[\s*|\(\s*|\{\s*)[-*+]\s+/g, '$1• ');

  if (forzarDireccion) {
    codigo = codigo.replace(/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i, `$1 ${forzarDireccion}`);
    return codigo;
  }

  // Detectar si es un árbol ancho en TD/TB que conviene mostrar en LR
  if (/^(flowchart|graph)\s+(TD|TB)\b/i.test(codigo)) {
    const origenes = new Set<string>();
    const destinos = new Set<string>();
    const regexArista = /\b([A-Za-z0-9_]+)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*--+>?[|.[^|\n]*\|?\s*([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regexArista.exec(codigo)) !== null) {
      origenes.add(m[1]);
      destinos.add(m[2]);
    }
    let hojas = 0;
    destinos.forEach((d) => {
      if (!origenes.has(d)) hojas++;
    });
    if (hojas >= 6) {
      codigo = codigo.replace(/^(flowchart|graph)\s+(TD|TB)\b/i, '$1 LR');
    }
  }

  return codigo;
}

@Component({
  selector: 'app-diagrama-ia',
  standalone: true,
  template: `
    <figure class="diagram">
      <figcaption class="diagram-head">
        <div>
          @if (diagrama().titulo) { <h4>{{ diagrama().titulo }}</h4> }
          @if (diagrama().descripcion) { <p>{{ diagrama().descripcion }}</p> }
        </div>
        @if (svg()) {
          <div class="diagram-tools">
            <button type="button" class="tool-pill" (click)="alternarDireccion()" title="Cambiar orientación del diagrama">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3v18"></path><path d="m10 18 7 3 7-3"></path><path d="M7 21V3"></path><path d="M2 6 7 3l5 3"></path></svg>
              Girar
            </button>
            <button type="button" class="tool-pill" (click)="abrirVisor()" title="Ver diagrama en tamaño completo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              Ampliar
            </button>
          </div>
        }
      </figcaption>
      @if (svg(); as contenido) {
        <div class="diagram-canvas" (click)="abrirVisor()" role="button" tabindex="0"
          (keydown.enter)="abrirVisor()" (keydown.space)="$event.preventDefault(); abrirVisor()"
          aria-label="Hacer clic para ampliar el diagrama">
          <div class="diagram-svg-wrap" [innerHTML]="contenido"></div>
          <span class="zoom-hint" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            Clic para ampliar
          </span>
        </div>
      } @else if (error()) {
        <div class="diagram-error">
          <p>No se pudo dibujar este diagrama. Este es el esquema que propuso la IA:</p>
          <pre>{{ codigo() }}</pre>
        </div>
      } @else {
        <div class="diagram-loading" aria-live="polite">Dibujando diagrama…</div>
      }
    </figure>

    @if (ampliado() && svg(); as contenidoModal) {
      <div class="lightbox" (click)="cerrarVisor()" role="dialog" aria-modal="true" aria-label="Vista ampliada del diagrama">
        <div class="lightbox-bar" (click)="$event.stopPropagation()">
          <span class="lightbox-title">{{ diagrama().titulo || 'Diagrama' }}</span>
          <div class="lightbox-actions">
            <button type="button" class="lb-btn" (click)="alternarDireccion()" title="Cambiar orientación (Vertical / Horizontal)">
              Girar orientación
            </button>
            <button type="button" class="lb-btn" (click)="cambiarZoom(-25)" [disabled]="zoom() <= 50" aria-label="Alejar">−</button>
            <button type="button" class="lb-btn lb-zoom-val" (click)="zoom.set(100)" title="Restablecer zoom">{{ zoom() }}%</button>
            <button type="button" class="lb-btn" (click)="cambiarZoom(25)" [disabled]="zoom() >= 300" aria-label="Acercar">+</button>
            <button type="button" class="lb-btn lb-close" (click)="cerrarVisor()" aria-label="Cerrar vista ampliada">✕ Cerrar</button>
          </div>
        </div>
        <div class="lightbox-body" (click)="$event.stopPropagation()">
          <div class="lightbox-stage" [style.width.%]="zoom()" [innerHTML]="contenidoModal"></div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .diagram { margin: 0; }
    .diagram-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .diagram-head:empty { display: none; }
    h4 { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .diagram-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
    .diagram-tools { display: inline-flex; gap: 6px; margin-left: auto; flex-shrink: 0; }
    .tool-pill {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 8px;
      background: #fff; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer;
      transition: all 140ms ease;
      svg { width: 13.5px; height: 13.5px; }
      &:hover { border-color: var(--accent-primary); color: var(--text-primary); background: #f4f7f6; }
    }
    .diagram-canvas {
      position: relative; display: flex; justify-content: center;
      padding: 22px 20px 34px; overflow-x: auto;
      border: 1px solid var(--border-color); border-radius: 12px; background: #fafbfa;
      cursor: zoom-in; transition: border-color 150ms ease, box-shadow 150ms ease;
      &:hover { border-color: #95a5af; box-shadow: 0 4px 16px rgba(24, 34, 42, 0.06); }
      &:hover .zoom-hint { opacity: 1; }
    }
    .diagram-svg-wrap { display: flex; justify-content: center; width: 100%; min-width: min-content; }
    .diagram-svg-wrap ::ng-deep svg { max-width: 100%; height: auto; min-height: 120px; }
    .zoom-hint {
      position: absolute; right: 12px; bottom: 8px;
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px; border-radius: 6px;
      background: rgba(24, 34, 42, 0.72); color: #fff;
      font-size: 11px; font-weight: 500; opacity: 0.75; pointer-events: none;
      transition: opacity 150ms ease;
      svg { width: 12px; height: 12px; }
    }
    .diagram-loading { height: 160px; border-radius: 12px; background: linear-gradient(90deg, #eef1f0 0%, #f6f8f7 50%, #eef1f0 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; color: transparent; }
    .diagram-error { padding: 14px 16px; border: 1px solid var(--border-color); border-radius: 12px; background: #fafbfa; }
    .diagram-error p { margin-bottom: 8px; font-size: 12.5px; color: var(--text-secondary); }
    .diagram-error pre { margin: 0; overflow-x: auto; font: 12px/1.6 var(--font-mono); color: var(--text-primary); white-space: pre-wrap; }

    /* ---------- Lightbox Modal ---------- */
    .lightbox {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; flex-direction: column;
      background: rgba(15, 23, 30, 0.82); backdrop-filter: blur(4px);
      animation: fadeIn 150ms ease-out;
    }
    .lightbox-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 12px 20px; background: #18222a; color: #fff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    .lightbox-title { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lightbox-actions { display: flex; align-items: center; gap: 6px; }
    .lb-btn {
      height: 34px; padding: 0 12px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px;
      background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .lb-zoom-val { min-width: 60px; font-variant-numeric: tabular-nums; }
    .lb-close { background: #dc2626; border-color: #dc2626; margin-left: 6px; &:hover:not(:disabled) { background: #b91c1c; } }
    .lightbox-body {
      flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center;
      padding: 28px;
    }
    .lightbox-stage {
      margin: auto; padding: 28px; border-radius: 14px; background: #ffffff;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      transition: width 120ms ease;
    }
    .lightbox-stage ::ng-deep svg { width: 100% !important; max-width: none !important; height: auto !important; display: block; margin: 0 auto; }

    @keyframes shimmer { to { background-position: -200% 0; } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @media (max-width: 640px) { .diagram-canvas { justify-content: flex-start; padding: 14px 14px 32px; } }
    @media (prefers-reduced-motion: reduce) { .diagram-loading { animation: none; } }
  `],
})
export class DiagramaIaComponent {
  readonly diagrama = input.required<DiagramaIA>();
  private readonly sanitizer = inject(DomSanitizer);
  readonly svg = signal<SafeHtml | null>(null);
  readonly error = signal(false);
  readonly codigo = signal('');
  readonly direccionForzada = signal<'TD' | 'LR' | undefined>(undefined);
  readonly ampliado = signal(false);
  readonly zoom = signal(100);

  constructor() {
    effect(() => {
      const dir = this.direccionForzada();
      const codigo = normalizarMermaid(this.diagrama().mermaid, dir);
      this.codigo.set(codigo);
      this.dibujar(codigo);
    });
  }

  abrirVisor(): void {
    this.zoom.set(100);
    this.ampliado.set(true);
  }

  cerrarVisor(): void {
    this.ampliado.set(false);
  }

  cambiarZoom(delta: number): void {
    this.zoom.update((z) => Math.max(50, Math.min(300, z + delta)));
  }

  alternarDireccion(): void {
    const actual = this.codigo();
    const esLR = /^(flowchart|graph)\s+LR\b/i.test(actual);
    this.direccionForzada.set(esLR ? 'TD' : 'LR');
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.ampliado()) this.cerrarVisor();
  }

  private async dibujar(codigo: string): Promise<void> {
    this.svg.set(null);
    this.error.set(false);
    const id = `diagrama-ia-${++contador}`;
    try {
      const { default: mermaid } = await import('mermaid');
      if (!inicializado) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'Plus Jakarta Sans, IBM Plex Sans, sans-serif',
          flowchart: { curve: 'basis', padding: 14, htmlLabels: true, wrappingWidth: 220 },
          themeVariables: {
            fontSize: '13px',
            primaryColor: '#ffffff',
            primaryBorderColor: '#26353f',
            primaryTextColor: '#18222a',
            lineColor: '#7c8a95',
            secondaryColor: '#f1f6df',
            tertiaryColor: '#eef1f0',
            clusterBkg: '#f6f8f7',
            clusterBorder: '#c8d0cd',
            edgeLabelBackground: '#ffffff',
          },
        });
        inicializado = true;
      }
      const { svg } = await mermaid.render(id, codigo);
      this.svg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
    } catch {
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
      this.error.set(true);
    }
  }
}
