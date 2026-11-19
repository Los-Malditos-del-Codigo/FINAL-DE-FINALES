import {
  Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AsistenteIaService, ConversacionIA, MensajeIA } from '../../core/services/asistente-ia.service';
import { ProductoService } from '../../core/services/producto.service';
import { InventarioService } from '../../core/services/inventario.service';
import { VentaService } from '../../core/services/venta.service';
import { CompraService } from '../../core/services/compra.service';
import { ServicioService } from '../../core/services/servicio.service';
import { ACEPTADOS, ArchivoIA, MAX_TOTAL, formatearTamano, prepararArchivo } from './archivos-ia';
import { GraficoIaComponent } from './grafico-ia.component';
import { DiagramaIaComponent } from './diagrama-ia.component';
import { bloquesDeRespuesta, separarAdjuntos, textoPlano } from './markdown';
import { BloqueRespuesta } from './tipos';

type FuenteSistema = 'inventario' | 'ventas' | 'compras' | 'taller';

interface MensajeVista {
  id: string;
  rol: 'usuario' | 'asistente';
  contenido: string;
  texto: string;
  adjuntos: { nombre: string; vistaPrevia?: string }[];
  bloques: BloqueRespuesta[];
}

interface GrupoHistorial {
  titulo: string;
  items: ConversacionIA[];
}

const FUENTES: { id: FuenteSistema; etiqueta: string }[] = [
  { id: 'inventario', etiqueta: 'Inventario' },
  { id: 'ventas', etiqueta: 'Ventas' },
  { id: 'compras', etiqueta: 'Compras' },
  { id: 'taller', etiqueta: 'Taller' },
];

const SUGERENCIAS: { texto: string; fuentes: FuenteSistema[] }[] = [
  { texto: '¿Qué productos tienen stock bajo y cuántas unidades debería reponer de cada uno?', fuentes: ['inventario'] },
  { texto: 'Resume las ventas recientes y muéstrame un gráfico de ingresos por día.', fuentes: ['ventas'] },
  { texto: 'Dibuja un diagrama del proceso de atención de un vehículo en el taller y sugiere mejoras.', fuentes: [] },
  { texto: 'Redacta un correo para un proveedor pidiendo cotización de 20 llantas 205/55 R16.', fuentes: [] },
];

@Component({
  selector: 'app-asistente-ia',
  standalone: true,
  imports: [CommonModule, FormsModule, GraficoIaComponent, DiagramaIaComponent],
  template: `
    <div class="chat-shell" [class.drawer-open]="historialAbierto()">
      <!-- ============ Historial ============ -->
      <aside class="history" aria-label="Historial de chats">
        <div class="history-head">
          <button type="button" class="btn-new" (click)="nuevoChat()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86Z"></path></svg>
            Nuevo chat
          </button>
          <label class="history-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input type="search" [(ngModel)]="busqueda" placeholder="Buscar en el historial" aria-label="Buscar en el historial" />
          </label>
        </div>

        <nav class="history-list">
          @if (cargandoLista()) {
            @for (i of [1, 2, 3, 4, 5]; track i) { <div class="sk-item"></div> }
          } @else if (errorLista()) {
            <p class="history-note">{{ errorLista() }} <button type="button" class="link-btn" (click)="cargarLista()">Reintentar</button></p>
          } @else if (!grupos().length) {
            <p class="history-note">{{ busqueda ? 'No hay chats que coincidan.' : 'Tus conversaciones aparecerán aquí.' }}</p>
          } @else {
            @for (g of grupos(); track g.titulo) {
              <span class="history-group">{{ g.titulo }}</span>
              @for (c of g.items; track c.id) {
                <div class="history-item" [class.active]="c.id === actualId()">
                  <button type="button" class="history-open" (click)="abrir(c.id)" [attr.aria-current]="c.id === actualId() ? 'page' : null">
                    <span class="history-title">{{ c.titulo }}</span>
                  </button>
                  <button type="button" class="history-delete" (click)="eliminar(c)" [attr.aria-label]="'Eliminar ' + c.titulo" title="Eliminar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              }
            }
          }
        </nav>
      </aside>
      <div class="history-backdrop" (click)="historialAbierto.set(false)" aria-hidden="true"></div>

      <!-- ============ Chat ============ -->
      <section class="chat" aria-label="Chat con el asistente"
        (dragover)="$event.preventDefault(); arrastrando.set(true)"
        (dragleave)="salirArrastre($event)"
        (drop)="soltar($event)">

        <header class="chat-head">
          <button type="button" class="icon-btn only-mobile" (click)="historialAbierto.set(true)" aria-label="Ver historial de chats">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path></svg>
          </button>
          <h1 class="chat-title">{{ tituloActual() }}</h1>
          @if (actualId()) {
            <button type="button" class="icon-btn only-mobile" (click)="nuevoChat()" aria-label="Nuevo chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            </button>
          }
        </header>

        <div class="messages" #scroller>
          <div class="messages-inner">
            @if (cargandoConversacion()) {
              <div class="loading-conv"><span class="spinner spinner-dark"></span> Cargando conversación…</div>
            } @else if (!mensajes().length && !enviando()) {
              <div class="welcome">
                <span class="welcome-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06A2 2 0 0 0 8.5 12.62l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z"></path></svg>
                </span>
                <h2>¿En qué te ayudo hoy?</h2>
                <p>Pregunta lo que necesites, adjunta fotos, facturas, PDF o Excel, o activa los datos del sistema para que analice tu inventario y tus ventas. Puedo responder con tablas, gráficos y diagramas.</p>
                <div class="suggestions">
                  @for (s of sugerencias; track s.texto) {
                    <button type="button" class="suggestion" (click)="usarSugerencia(s)">{{ s.texto }}</button>
                  }
                </div>
              </div>
            } @else {
              @for (m of mensajes(); track m.id) {
                @if (m.rol === 'usuario') {
                  <div class="msg msg-user">
                    @if (m.adjuntos.length) {
                      <div class="msg-files">
                        @for (a of m.adjuntos; track $index) {
                          @if (a.vistaPrevia) {
                            <img class="msg-thumb" [src]="a.vistaPrevia" [alt]="a.nombre"
                              (click)="abrirImagen(a.vistaPrevia, a.nombre)"
                              role="button" tabindex="0"
                              (keydown.enter)="abrirImagen(a.vistaPrevia, a.nombre)"
                              title="Hacer clic para ver imagen completa" />
                          } @else {
                            <span class="file-chip">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path></svg>
                              {{ a.nombre }}
                            </span>
                          }
                        }
                      </div>
                    }
                    @if (m.texto) { <div class="bubble">{{ m.texto }}</div> }
                  </div>
                } @else {
                  <article class="msg msg-ai">
                    <span class="ai-mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06A2 2 0 0 0 8.5 12.62l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z"></path></svg>
                    </span>
                    <div class="ai-body">
                      @for (b of m.bloques; track $index) {
                        @switch (b.tipo) {
                          @case ('texto') { <div class="prose" [innerHTML]="b.html"></div> }
                          @case ('grafico') { <div class="ai-figure"><app-grafico-ia [grafico]="b.grafico"></app-grafico-ia></div> }
                          @case ('diagrama') { <div class="ai-figure ai-figure-plain"><app-diagrama-ia [diagrama]="b.diagrama"></app-diagrama-ia></div> }
                          @case ('codigo') { <pre class="code"><code>{{ b.codigo }}</code></pre> }
                        }
                      }
                      <div class="ai-actions">
                        <button type="button" class="action-btn" (click)="copiar(m)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="14" height="14" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
                          {{ copiado() === m.id ? 'Copiado' : 'Copiar' }}
                        </button>
                      </div>
                    </div>
                  </article>
                }
              }
              @if (enviando()) {
                <div class="msg msg-ai thinking" aria-live="polite">
                  <span class="ai-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06A2 2 0 0 0 8.5 12.62l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z"></path></svg>
                  </span>
                  <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
                  <span class="thinking-text">{{ estadoEnvio() }}</span>
                </div>
              }
            }
          </div>
        </div>

        <!-- Compositor -->
        <div class="composer-wrap">
          @if (errorEnvio()) {
            <div class="send-error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
              <span>{{ errorEnvio() }}</span>
              <button type="button" class="link-btn" (click)="errorEnvio.set('')">Cerrar</button>
            </div>
          }
          @if (errorArchivos()) { <p class="file-error" role="alert">{{ errorArchivos() }}</p> }

          <form class="composer" [class.dragging]="arrastrando()" (ngSubmit)="enviar()">
            @if (archivos().length || procesando()) {
              <div class="attachments">
                @for (a of archivos(); track a.id) {
                  <div class="attachment">
                    @if (a.vistaPrevia) {
                      <img [src]="a.vistaPrevia" [alt]="a.nombre" (click)="abrirImagen(a.vistaPrevia, a.nombre)" title="Hacer clic para ampliar" style="cursor: zoom-in" />
                    } @else {
                      <span class="att-ext" [attr.data-tipo]="a.tipo">{{ extension(a.nombre) }}</span>
                    }
                    <span class="att-info"><span class="att-name" [title]="a.nombre">{{ a.nombre }}</span><span class="att-meta">{{ tamano(a.tamano) }}</span></span>
                    <button type="button" class="att-remove" (click)="quitar(a.id)" [attr.aria-label]="'Quitar ' + a.nombre">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                    </button>
                  </div>
                }
                @if (procesando()) { <span class="att-processing">Leyendo archivo…</span> }
              </div>
            }

            <textarea #entrada name="mensaje" rows="1" [(ngModel)]="borrador" (input)="ajustarAltura()" (keydown)="teclado($event)"
              placeholder="Escribe tu mensaje…" title="Enter para enviar · Shift + Enter para nueva línea" aria-label="Mensaje para el asistente"></textarea>

            <div class="composer-bar">
              <label class="tool-btn" title="Adjuntar archivos o imágenes">
                <input type="file" multiple [accept]="aceptados" (change)="seleccionar($event)" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                <span class="sr-only">Adjuntar archivos</span>
              </label>
              <div class="data-toggles" role="group" aria-label="Incluir datos del sistema">
                <span class="data-label">Datos:</span>
                @for (f of fuentes; track f.id) {
                  <button type="button" class="data-chip" [class.on]="fuentesActivas().has(f.id)" [attr.aria-pressed]="fuentesActivas().has(f.id)" (click)="alternarFuente(f.id)">{{ f.etiqueta }}</button>
                }
              </div>
              <button type="submit" class="send-btn" [disabled]="!puedeEnviar()" aria-label="Enviar mensaje">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>
              </button>
            </div>
          </form>
          <p class="disclaimer">El asistente puede equivocarse. Verifica las cifras importantes antes de decidir.</p>
        </div>

        @if (arrastrando()) {
          <div class="drop-overlay" aria-hidden="true"><span>Suelta los archivos para adjuntarlos</span></div>
        }
      </section>
    </div>

    @if (imagenAmpliada(); as img) {
      <div class="img-lightbox" (click)="cerrarImagen()" role="dialog" aria-modal="true" [attr.aria-label]="'Vista previa de ' + img.nombre">
        <div class="img-lightbox-bar" (click)="$event.stopPropagation()">
          <span class="img-lightbox-title">{{ img.nombre }}</span>
          <div class="img-lightbox-actions">
            <button type="button" class="img-lb-btn" (click)="cambiarZoomImagen(-25)" [disabled]="zoomImagen() <= 50">−</button>
            <button type="button" class="img-lb-btn" (click)="zoomImagen.set(100)">{{ zoomImagen() }}%</button>
            <button type="button" class="img-lb-btn" (click)="cambiarZoomImagen(25)" [disabled]="zoomImagen() >= 300">+</button>
            <button type="button" class="img-lb-btn img-lb-close" (click)="cerrarImagen()">✕ Cerrar</button>
          </div>
        </div>
        <div class="img-lightbox-body" (click)="$event.stopPropagation()">
          <img [src]="img.src" [alt]="img.nombre" [style.transform]="'scale(' + (zoomImagen() / 100) + ')'" />
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .chat-shell {
      position: relative;
      display: grid;
      grid-template-columns: 272px minmax(0, 1fr);
      height: calc(100dvh - var(--topbar-height) - 56px);
      min-height: 520px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      background: var(--surface-card);
      box-shadow: var(--surface-shadow);
    }

    /* ---------- Historial ---------- */
    .history {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--border-color);
      background: #f7f9f8;
    }

    .history-head { display: grid; gap: 10px; padding: 14px 12px 10px; }

    .btn-new {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      height: 40px; border: 0; border-radius: 10px;
      background: var(--accent-primary); color: #fff;
      font-size: 13.5px; font-weight: 650; cursor: pointer;
      transition: background-color var(--transition-fast);
      svg { width: 16px; height: 16px; }
      &:hover { background: var(--accent-hover); }
    }

    .history-search {
      display: flex; align-items: center; gap: 8px;
      height: 36px; padding: 0 10px;
      border: 1px solid var(--border-color); border-radius: 9px; background: #fff;
      svg { width: 15px; height: 15px; flex: 0 0 15px; color: var(--text-muted); }
      input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 13px; }
      &:focus-within { border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--focus-ring); }
    }

    .history-list { flex: 1; overflow-y: auto; padding: 4px 8px 16px; }

    .history-group {
      display: block; padding: 14px 8px 6px;
      color: var(--text-muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    }

    .history-item {
      position: relative; display: flex; align-items: center;
      border-radius: 8px;
      transition: background-color var(--transition-fast);
      &:hover { background: #ecefee; }
      &.active { background: #e4e9e7; }
      &.active .history-title { color: var(--text-primary); font-weight: 650; }
      &:hover .history-delete, &:focus-within .history-delete { opacity: 1; }
    }

    .history-open {
      flex: 1; min-width: 0; padding: 8px 6px 8px 10px;
      border: 0; background: transparent; text-align: left; cursor: pointer;
    }

    .history-title {
      display: block; overflow: hidden;
      color: var(--text-secondary); font-size: 13px; font-weight: 500;
      text-overflow: ellipsis; white-space: nowrap;
    }

    .history-delete {
      display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; margin-right: 4px;
      border: 0; border-radius: 7px; background: transparent; color: var(--text-muted);
      opacity: 0; cursor: pointer;
      svg { width: 14px; height: 14px; }
      &:hover { background: var(--state-danger-bg); color: var(--state-danger); }
    }

    .history-note { padding: 18px 10px; color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
    .sk-item { height: 30px; margin: 6px 4px; border-radius: 8px; background: linear-gradient(90deg, #eceff0 0%, #f4f6f5 50%, #eceff0 100%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
    .link-btn { padding: 0; border: 0; background: none; color: var(--accent-primary); font-weight: 650; text-decoration: underline; text-decoration-color: var(--brand-lime); text-underline-offset: 3px; cursor: pointer; }
    .history-backdrop { display: none; }

    /* ---------- Chat ---------- */
    .chat { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

    .chat-head {
      display: flex; align-items: center; gap: 10px;
      height: 52px; padding: 0 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .chat-title {
      flex: 1; min-width: 0; overflow: hidden;
      font-size: 14.5px; font-weight: 700; color: var(--text-primary);
      text-overflow: ellipsis; white-space: nowrap;
    }

    .icon-btn {
      display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px;
      border: 1px solid var(--border-color); border-radius: 9px; background: #fff; color: var(--text-secondary); cursor: pointer;
      svg { width: 17px; height: 17px; }
    }
    .only-mobile { display: none; }

    .messages { flex: 1; min-height: 0; overflow-y: auto; scroll-behavior: smooth; }
    .messages-inner { max-width: 820px; margin: 0 auto; padding: 28px 24px 12px; }

    .loading-conv { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px 0; color: var(--text-secondary); font-size: 13px; }

    .welcome { max-width: 640px; margin: 6vh auto 0; text-align: center; }
    .welcome-mark { display: inline-grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--brand-ink); color: var(--brand-lime); }
    .welcome-mark svg { width: 24px; height: 24px; }
    .welcome h2 { margin-top: 16px; font-size: 24px; font-weight: 750; letter-spacing: -.025em; }
    .welcome p { margin: 8px auto 0; max-width: 56ch; color: var(--text-secondary); font-size: 14px; line-height: 1.6; }
    .suggestions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 26px; text-align: left; }
    .suggestion {
      padding: 13px 14px; border: 1px solid var(--border-color); border-radius: 12px; background: #fff;
      color: var(--text-primary); font-size: 13px; line-height: 1.45; text-align: left; cursor: pointer;
      transition: border-color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
      &:hover { border-color: var(--brand-lime-strong); background: var(--brand-lime-soft); }
    }

    .msg { margin-bottom: 22px; }
    .msg-user { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .bubble {
      max-width: min(620px, 88%); padding: 11px 15px;
      border-radius: 16px 16px 4px 16px; background: var(--accent-subtle); color: var(--text-primary);
      font-size: 14px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .msg-files { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 88%; }
    .msg-thumb {
      width: 120px; height: 90px; border-radius: 10px; object-fit: cover;
      border: 1px solid var(--border-color); cursor: zoom-in;
      transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
      &:hover { transform: scale(1.03); border-color: var(--accent-primary); box-shadow: 0 4px 12px rgba(24, 34, 42, .12); }
    }
    .file-chip {
      display: inline-flex; align-items: center; gap: 6px; max-width: 260px; padding: 6px 10px;
      border: 1px solid var(--border-color); border-radius: 9px; background: #fff;
      color: var(--text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      svg { width: 14px; height: 14px; flex: 0 0 14px; }
    }

    .msg-ai { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 14px; }
    .ai-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--brand-ink); color: var(--brand-lime); }
    .ai-mark svg { width: 16px; height: 16px; }
    .ai-body { min-width: 0; padding-top: 3px; }
    .ai-figure { margin: 14px 0; padding: 16px 18px; border: 1px solid var(--border-color); border-radius: 12px; }
    .ai-figure-plain { padding: 0; border: 0; }
    .code { margin: 12px 0; padding: 14px 16px; overflow-x: auto; border-radius: 10px; background: #f3f5f4; font: 12.5px/1.6 var(--font-mono); color: var(--text-primary); }
    .ai-actions { display: flex; gap: 6px; margin-top: 6px; }
    .action-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px;
      border: 0; border-radius: 7px; background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; cursor: pointer;
      svg { width: 14px; height: 14px; }
      &:hover { background: var(--surface-subtle); color: var(--text-primary); }
    }

    .prose { color: var(--text-primary); font-size: 14.5px; line-height: 1.7; overflow-wrap: anywhere; }
    .prose ::ng-deep {
      p { margin: 0 0 12px; }
      h3, h4, h5, h6 { margin: 20px 0 8px; font-size: 15px; font-weight: 750; letter-spacing: -.01em; }
      h3 { font-size: 16.5px; }
      ul, ol { margin: 0 0 12px; padding-left: 22px; }
      li { margin-bottom: 4px; }
      li::marker { color: var(--text-muted); }
      strong { font-weight: 700; }
      code { padding: 1px 5px; border-radius: 5px; background: var(--surface-subtle); font: 13px var(--font-mono); }
      hr { margin: 18px 0; border: 0; border-top: 1px solid var(--border-color); }
      blockquote { margin: 0 0 12px; padding: 4px 0 4px 14px; border-left: 2px solid var(--border-strong); color: var(--text-secondary); }
      a { color: var(--accent-primary); text-decoration: underline; text-decoration-color: var(--brand-lime); text-underline-offset: 3px; }
      .md-table { margin: 4px 0 14px; overflow-x: auto; border: 1px solid var(--border-color); border-radius: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { padding: 9px 12px; background: #f5f7f6; color: var(--text-secondary); font-size: 11.5px; font-weight: 700; white-space: nowrap; }
      td { padding: 9px 12px; border-top: 1px solid var(--border-color); font-variant-numeric: tabular-nums; }
      .al-right { text-align: right; } .al-center { text-align: center; } .al-left { text-align: left; }
    }
    .prose ::ng-deep > :last-child { margin-bottom: 0; }

    .thinking { align-items: center; }
    .thinking .dots { display: inline-flex; gap: 4px; margin-right: 10px; }
    .thinking { grid-template-columns: 30px auto 1fr; }
    .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: pulse 1.2s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
    .thinking-text { color: var(--text-secondary); font-size: 13px; }

    /* ---------- Compositor ---------- */
    .composer-wrap { padding: 8px 24px 14px; }
    .composer-wrap > * { max-width: 820px; margin-left: auto; margin-right: auto; }

    .send-error {
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding: 10px 12px;
      border: 1px solid var(--state-danger-border); border-radius: 10px; background: var(--state-danger-bg);
      color: var(--state-danger); font-size: 13px; font-weight: 500;
      svg { width: 17px; height: 17px; flex: 0 0 17px; }
      span { flex: 1; }
      .link-btn { color: var(--state-danger); text-decoration-color: currentColor; }
    }
    .file-error { margin-bottom: 8px; color: var(--state-danger); font-size: 12.5px; }

    .composer {
      display: flex; flex-direction: column; gap: 4px; padding: 10px 10px 8px 14px;
      border: 1px solid var(--border-strong); border-radius: 16px; background: #fff;
      box-shadow: 0 1px 2px rgba(24, 34, 42, .05), 0 8px 24px rgba(24, 34, 42, .06);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      &:focus-within { border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--focus-ring), 0 8px 24px rgba(24, 34, 42, .06); }
      &.dragging { border-color: var(--brand-lime-strong); background: var(--brand-lime-soft); }
    }

    textarea {
      width: 100%; min-height: 26px; max-height: 220px; padding: 4px 0; resize: none;
      border: 0; outline: none; background: transparent;
      color: var(--text-primary); font-size: 14.5px; line-height: 1.6;
      &::placeholder { color: var(--text-muted); }
    }

    .attachments { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0 6px; }
    .attachment {
      display: flex; align-items: center; gap: 8px; max-width: 240px; padding: 5px 6px 5px 5px;
      border: 1px solid var(--border-color); border-radius: 10px; background: #fafbfa;
      img, .att-ext { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 7px; object-fit: cover; }
    }
    .att-ext { display: grid; place-items: center; background: var(--surface-subtle); color: var(--text-secondary); font: 700 9px var(--font-mono); text-transform: uppercase; }
    .att-ext[data-tipo='pdf'] { background: #fdecea; color: #b42318; }
    .att-ext[data-tipo='hoja'] { background: #e9f5ee; color: #2f7a4f; }
    .att-ext[data-tipo='documento'] { background: #e8f0fb; color: #1f5fb4; }
    .att-info { display: flex; flex-direction: column; min-width: 0; }
    .att-name { overflow: hidden; color: var(--text-primary); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .att-meta { color: var(--text-muted); font-size: 11px; }
    .att-remove {
      display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px;
      border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer;
      svg { width: 13px; height: 13px; }
      &:hover { background: var(--state-danger-bg); color: var(--state-danger); }
    }
    .att-processing { align-self: center; color: var(--text-muted); font-size: 12px; }

    .composer-bar { display: flex; align-items: center; gap: 8px; }
    .tool-btn {
      position: relative; display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px;
      border-radius: 9px; color: var(--text-secondary); cursor: pointer;
      input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
      svg { width: 18px; height: 18px; }
      &:hover { background: var(--surface-subtle); color: var(--text-primary); }
      &:focus-within { box-shadow: 0 0 0 3px var(--focus-ring); }
    }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    .data-toggles { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; }
    .data-label { margin-right: 2px; color: var(--text-muted); font-size: 12px; font-weight: 600; white-space: nowrap; }
    .data-chip {
      flex: 0 0 auto; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 999px; background: #fff;
      color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer;
      transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
      &:hover { border-color: var(--border-strong); color: var(--text-primary); }
      &.on { border-color: var(--brand-lime-strong); background: var(--brand-lime-soft); color: var(--text-primary); }
    }

    .send-btn {
      display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px;
      border: 0; border-radius: 10px; background: var(--accent-primary); color: #fff; cursor: pointer;
      transition: background-color var(--transition-fast), opacity var(--transition-fast);
      svg { width: 18px; height: 18px; }
      &:hover:not(:disabled) { background: var(--accent-hover); }
      &:disabled { opacity: .35; cursor: not-allowed; }
    }

    .disclaimer { margin-top: 8px; color: var(--text-muted); font-size: 11.5px; text-align: center; }

    .drop-overlay {
      position: absolute; inset: 8px; z-index: 5; display: grid; place-items: center;
      border: 2px dashed var(--brand-lime-strong); border-radius: 14px; background: rgba(241, 246, 223, .88);
      pointer-events: none;
      span { color: var(--text-primary); font-size: 15px; font-weight: 700; }
    }

    .img-lightbox {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; flex-direction: column;
      background: rgba(15, 22, 28, .85);
      backdrop-filter: blur(4px);
    }

    .img-lightbox-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--border-color);
    }

    .img-lightbox-title {
      font-size: 13.5px; font-weight: 700; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .img-lightbox-actions {
      display: flex; align-items: center; gap: 6px;
    }

    .img-lb-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 8px;
      background: #fff; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: var(--surface-subtle); color: var(--text-primary); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }

    .img-lb-close {
      background: var(--accent-primary); border-color: var(--accent-primary); color: #fff;
      &:hover:not(:disabled) { background: var(--accent-hover); color: #fff; }
    }

    .img-lightbox-body {
      flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center;
      padding: 24px;
      img {
        max-width: 90vw; max-height: 82vh; border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, .38);
        transform-origin: center center; transition: transform 150ms ease;
      }
    }

    @keyframes shimmer { to { background-position: -200% 0; } }
    @keyframes pulse { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }

    /* ---------- Responsive ---------- */
    @media (max-width: 900px) {
      .chat-shell { grid-template-columns: 1fr; height: calc(100dvh - var(--topbar-height) - 40px); }
      .history {
        position: absolute; inset: 0 auto 0 0; z-index: 10; width: min(300px, 86%);
        transform: translateX(-102%); transition: transform 240ms cubic-bezier(.2, 0, 0, 1);
        box-shadow: 0 0 32px rgba(0, 0, 0, .18);
      }
      .drawer-open .history { transform: none; }
      .history-backdrop { position: absolute; inset: 0; z-index: 9; display: block; background: rgba(15, 22, 28, .3); opacity: 0; pointer-events: none; transition: opacity 200ms ease; }
      .drawer-open .history-backdrop { opacity: 1; pointer-events: auto; }
      .only-mobile { display: grid; }
      .history-delete { opacity: 1; }
    }

    @media (max-width: 640px) {
      .chat-shell { height: calc(100dvh - var(--topbar-height) - 36px); border-radius: 12px; }
      .messages-inner { padding: 20px 14px 8px; }
      .composer-wrap { padding: 6px 10px 10px; }
      .chat-head { padding: 0 12px; }
      .suggestions { grid-template-columns: 1fr; }
      .welcome { margin-top: 3vh; }
      .welcome h2 { font-size: 20px; }
      .msg-ai { grid-template-columns: 1fr; gap: 8px; }
      .thinking { grid-template-columns: 30px auto 1fr; }
      .ai-figure { padding: 12px; }
      .data-label { display: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .sk-item, .dots i { animation: none; }
      .history { transition: none; }
      .messages { scroll-behavior: auto; }
    }
  `],
})
export class AsistenteIaComponent implements OnInit {
  private readonly api = inject(AsistenteIaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productosApi = inject(ProductoService);
  private readonly inventarioApi = inject(InventarioService);
  private readonly ventasApi = inject(VentaService);
  private readonly comprasApi = inject(CompraService);
  private readonly serviciosApi = inject(ServicioService);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly entrada = viewChild<ElementRef<HTMLTextAreaElement>>('entrada');

  readonly aceptados = ACEPTADOS;
  readonly fuentes = FUENTES;
  readonly sugerencias = SUGERENCIAS;

  readonly conversaciones = signal<ConversacionIA[]>([]);
  readonly cargandoLista = signal(true);
  readonly errorLista = signal('');
  readonly actualId = signal<string | null>(null);
  readonly mensajes = signal<MensajeVista[]>([]);
  readonly cargandoConversacion = signal(false);
  readonly historialAbierto = signal(false);

  readonly archivos = signal<ArchivoIA[]>([]);
  readonly procesando = signal(false);
  readonly errorArchivos = signal('');
  readonly arrastrando = signal(false);
  readonly fuentesActivas = signal<Set<FuenteSistema>>(new Set());
  readonly enviando = signal(false);
  readonly estadoEnvio = signal('Pensando…');
  readonly errorEnvio = signal('');
  readonly copiado = signal<string | null>(null);
  readonly imagenAmpliada = signal<{ src: string; nombre: string } | null>(null);
  readonly zoomImagen = signal(100);
  borrador = '';
  busqueda = '';

  abrirImagen(src: string, nombre: string): void {
    this.zoomImagen.set(100);
    this.imagenAmpliada.set({ src, nombre });
  }

  cerrarImagen(): void {
    this.imagenAmpliada.set(null);
  }

  cambiarZoomImagen(delta: number): void {
    this.zoomImagen.update((z) => Math.max(50, Math.min(300, z + delta)));
  }

  @HostListener('window:keydown.escape')
  cerrarImagenEscape(): void {
    if (this.imagenAmpliada()) this.cerrarImagen();
  }

  readonly tituloActual = computed(() => {
    const id = this.actualId();
    return id ? this.conversaciones().find((c) => c.id === id)?.titulo ?? 'Conversación' : 'Nuevo chat';
  });

  grupos(): GrupoHistorial[] {
    const q = this.busqueda.trim().toLowerCase();
    const lista = this.conversaciones().filter((c) => !q || c.titulo.toLowerCase().includes(q));
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const dia = 86_400_000;
    const tramos: { titulo: string; desde: number }[] = [
      { titulo: 'Hoy', desde: inicioHoy.getTime() },
      { titulo: 'Ayer', desde: inicioHoy.getTime() - dia },
      { titulo: 'Últimos 7 días', desde: inicioHoy.getTime() - 7 * dia },
      { titulo: 'Últimos 30 días', desde: inicioHoy.getTime() - 30 * dia },
      { titulo: 'Anteriores', desde: -Infinity },
    ];
    const grupos: GrupoHistorial[] = tramos.map((t) => ({ titulo: t.titulo, items: [] }));
    for (const c of lista) {
      const t = new Date(c.actualizadoEn).getTime();
      const i = tramos.findIndex((tr) => t >= tr.desde);
      grupos[i === -1 ? tramos.length - 1 : i].items.push(c);
    }
    return grupos.filter((g) => g.items.length);
  }

  ngOnInit(): void {
    this.cargarLista();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('c');
      if (id === this.actualId()) return;
      if (id) this.cargarConversacion(id);
      else this.limpiarChat();
    });
    // Precarga el motor de diagramas para que esté listo cuando llegue una respuesta.
    window.setTimeout(() => import('mermaid').catch(() => undefined), 2000);
  }

  cargarLista(): void {
    this.cargandoLista.set(true);
    this.errorLista.set('');
    this.api.listar().subscribe({
      next: (lista) => {
        this.conversaciones.set(lista);
        this.cargandoLista.set(false);
      },
      error: (e) => {
        this.errorLista.set(AsistenteIaService.mensajeError(e));
        this.cargandoLista.set(false);
      },
    });
  }

  abrir(id: string): void {
    this.historialAbierto.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: { c: id } });
  }

  nuevoChat(): void {
    this.historialAbierto.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.limpiarChat();
    window.setTimeout(() => this.entrada()?.nativeElement.focus(), 0);
  }

  eliminar(c: ConversacionIA): void {
    if (!confirm(`¿Eliminar la conversación "${c.titulo}"? Esta acción no se puede deshacer.`)) return;
    this.api.eliminar(c.id).subscribe({
      next: () => {
        this.conversaciones.update((lista) => lista.filter((x) => x.id !== c.id));
        if (this.actualId() === c.id) this.nuevoChat();
      },
      error: (e) => this.errorEnvio.set(AsistenteIaService.mensajeError(e)),
    });
  }

  usarSugerencia(s: { texto: string; fuentes: FuenteSistema[] }): void {
    this.borrador = s.texto;
    this.fuentesActivas.set(new Set(s.fuentes));
    window.setTimeout(() => {
      this.ajustarAltura();
      this.entrada()?.nativeElement.focus();
    }, 0);
  }

  alternarFuente(id: FuenteSistema): void {
    this.fuentesActivas.update((set) => {
      const copia = new Set(set);
      copia.has(id) ? copia.delete(id) : copia.add(id);
      return copia;
    });
  }

  puedeEnviar(): boolean {
    return !this.enviando() && !this.procesando() && (this.borrador.trim().length > 0 || this.archivos().length > 0);
  }

  teclado(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.enviar();
    }
  }

  ajustarAltura(): void {
    const ta = this.entrada()?.nativeElement;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  async enviar(): Promise<void> {
    if (!this.puedeEnviar()) return;
    const texto = this.borrador.trim();
    const archivos = this.archivos();
    const fuentes = this.detectarFuentes(texto, this.fuentesActivas());
    const idTemporal = `local-${crypto.randomUUID()}`;

    this.errorEnvio.set('');
    this.enviando.set(true);
    this.estadoEnvio.set(fuentes.size ? 'Consultando los datos del sistema…' : archivos.length ? 'Leyendo los archivos…' : 'Pensando…');
    this.mensajes.update((lista) => [...lista, {
      id: idTemporal, rol: 'usuario', contenido: texto, texto,
      adjuntos: archivos.map((a) => ({ nombre: a.nombre, vistaPrevia: a.vistaPrevia })), bloques: [],
    }]);
    this.borrador = '';
    this.archivos.set([]);
    window.setTimeout(() => this.ajustarAltura(), 0);
    this.bajar();

    try {
      const contexto = await this.contextoSistema(fuentes);
      this.estadoEnvio.set('Pensando…');
      const r = await firstValueFrom(this.api.enviar({
        conversacionId: this.actualId(),
        contenido: texto,
        adjuntos: archivos.map((a) => a.adjunto),
        contexto,
      }));

      const previas = archivos.map((a) => ({ nombre: a.nombre, vistaPrevia: a.vistaPrevia }));
      this.mensajes.update((lista) => [
        ...lista.filter((m) => m.id !== idTemporal),
        { ...this.aVista(r.mensajeUsuario), adjuntos: previas.length ? previas : this.aVista(r.mensajeUsuario).adjuntos },
        this.aVista(r.respuesta),
      ]);
      this.conversaciones.update((lista) => [r.conversacion, ...lista.filter((c) => c.id !== r.conversacion.id)]);
      if (this.actualId() !== r.conversacion.id) {
        this.actualId.set(r.conversacion.id);
        this.router.navigate([], { relativeTo: this.route, queryParams: { c: r.conversacion.id }, replaceUrl: true });
      }
    } catch (e) {
      // No se guardó nada: se devuelve el mensaje al compositor para reintentar.
      this.mensajes.update((lista) => lista.filter((m) => m.id !== idTemporal));
      this.borrador = texto;
      this.archivos.set(archivos);
      this.errorEnvio.set(AsistenteIaService.mensajeError(e));
      window.setTimeout(() => this.ajustarAltura(), 0);
    } finally {
      this.enviando.set(false);
      this.bajar();
    }
  }

  async copiar(m: MensajeVista): Promise<void> {
    try {
      await navigator.clipboard.writeText(textoPlano(m.contenido));
      this.copiado.set(m.id);
      window.setTimeout(() => this.copiado.set(null), 1800);
    } catch {
      this.copiado.set(null);
    }
  }

  // ---------- Archivos ----------
  @HostListener('window:paste', ['$event'])
  pegar(event: ClipboardEvent): void {
    const archivos = Array.from(event.clipboardData?.files ?? []);
    if (archivos.length) {
      event.preventDefault();
      this.agregar(archivos);
    }
  }

  seleccionar(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.agregar(Array.from(input.files ?? []));
    input.value = '';
  }

  salirArrastre(event: DragEvent): void {
    const destino = event.relatedTarget as Node | null;
    if (!destino || !(event.currentTarget as HTMLElement).contains(destino)) this.arrastrando.set(false);
  }

  soltar(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando.set(false);
    this.agregar(Array.from(event.dataTransfer?.files ?? []));
  }

  async agregar(files: File[]): Promise<void> {
    if (!files.length) return;
    this.errorArchivos.set('');
    this.procesando.set(true);
    const errores: string[] = [];
    for (const file of files) {
      if (this.archivos().length >= 10) {
        errores.push('Máximo 10 archivos por mensaje.');
        break;
      }
      try {
        const archivo = await prepararArchivo(file);
        const peso = this.archivos().reduce((a, b) => a + b.peso, 0);
        if (peso + archivo.peso > MAX_TOTAL * 1.37) {
          errores.push(`${file.name}: se superaría el máximo de 15 MB por mensaje.`);
          continue;
        }
        if (archivo.vistaPrevia) {
          try { sessionStorage.setItem(`ia-img:${archivo.nombre}`, archivo.vistaPrevia); } catch { /* cuota excedida */ }
        }
        this.archivos.update((lista) => [...lista, archivo]);
      } catch (e: any) {
        errores.push(e?.message ?? `No se pudo leer ${file.name}.`);
      }
    }
    this.procesando.set(false);
    this.errorArchivos.set(errores.join(' '));
  }

  quitar(id: string): void {
    this.archivos.update((lista) => lista.filter((a) => a.id !== id));
  }

  extension(nombre: string): string {
    return (nombre.split('.').pop() ?? '').slice(0, 4);
  }

  tamano(bytes: number): string {
    return formatearTamano(bytes);
  }

  // ---------- Internos ----------
  private cargarConversacion(id: string): void {
    this.actualId.set(id);
    this.mensajes.set([]);
    this.errorEnvio.set('');
    this.cargandoConversacion.set(true);
    this.api.detalle(id).subscribe({
      next: ({ conversacion, mensajes }) => {
        this.mensajes.set(mensajes.map((m) => this.aVista(m)));
        if (!this.conversaciones().some((c) => c.id === conversacion.id)) {
          this.conversaciones.update((lista) => [conversacion, ...lista]);
        }
        this.cargandoConversacion.set(false);
        this.bajar(false);
      },
      error: (e) => {
        this.cargandoConversacion.set(false);
        this.actualId.set(null);
        this.errorEnvio.set(AsistenteIaService.mensajeError(e));
      },
    });
  }

  private limpiarChat(): void {
    this.actualId.set(null);
    this.mensajes.set([]);
    this.errorEnvio.set('');
    this.cargandoConversacion.set(false);
  }

  private aVista(m: MensajeIA): MensajeVista {
    if (m.rol === 'usuario') {
      const { texto, adjuntos } = separarAdjuntos(m.contenido);
      return {
        id: m.id,
        rol: 'usuario',
        contenido: m.contenido,
        texto,
        adjuntos: adjuntos.map((nombre) => {
          let vistaPrevia: string | undefined;
          try { vistaPrevia = sessionStorage.getItem(`ia-img:${nombre}`) ?? undefined; } catch { /* noop */ }
          return { nombre, vistaPrevia };
        }),
        bloques: [],
      };
    }
    return { id: m.id, rol: 'asistente', contenido: m.contenido, texto: m.contenido, adjuntos: [], bloques: bloquesDeRespuesta(m.contenido) };
  }

  private detectarFuentes(texto: string, seleccionadas: Set<FuenteSistema>): Set<FuenteSistema> {
    const res = new Set<FuenteSistema>(seleccionadas);
    const t = texto.toLowerCase();
    if (/(producto|inventario|stock|llanta|aceite|lubricante|bater[ií]a|cat[aá]logo|repuesto|agotado|portafolio)/i.test(t)) {
      res.add('inventario');
    }
    if (/(venta|ingreso|cliente|factur|comprobante|ticket|cobro)/i.test(t)) {
      res.add('ventas');
    }
    if (/(compra|proveedor|abastecimiento|reposici[oó]n|pedido)/i.test(t)) {
      res.add('compras');
    }
    if (/(taller|servicio|atenci[oó]n|veh[ií]culo|mantenimiento|alineamiento|balanceo|freno)/i.test(t)) {
      res.add('taller');
    }
    return res;
  }

  private bajar(suave = true): void {
    window.setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
    }, 30);
  }

  private async contextoSistema(sel: Set<FuenteSistema>): Promise<string> {
    if (!sel.size) return '';
    const bloques: string[] = [];
    const fallos: string[] = [];
    const intentar = async (etiqueta: string, fn: () => Promise<string>) => {
      try { bloques.push(await fn()); } catch { fallos.push(etiqueta); }
    };

    if (sel.has('inventario')) {
      await intentar('inventario', async () => {
        const [productos, stock] = await Promise.all([firstValueFrom(this.productosApi.listar()), firstValueFrom(this.inventarioApi.obtenerStock())]);
        const mapa = new Map(stock.map((s) => [s.productoId, s.stockActual]));
        const filas = productos.slice(0, 500).map((p) => {
          const actual = mapa.get(p.id) ?? 0;
          const estado = !p.activo ? 'inactivo' : actual === 0 ? 'agotado' : actual <= p.stockMinimo ? 'stock bajo' : 'saludable';
          return [p.codigo, p.nombre, actual, p.stockMinimo, p.precioVenta, estado].join(';');
        });
        return `Inventario (${productos.length} productos)\ncodigo;nombre;stock_actual;stock_minimo;precio_venta_soles;estado\n${filas.join('\n')}`;
      });
    }
    if (sel.has('ventas')) {
      await intentar('ventas', async () => {
        const page = await firstValueFrom(this.ventasApi.listar({ size: 200 } as any));
        const filas = page.content.map((v) => [v.id, v.fecha, v.estado, v.total, v.cantidadItems].join(';'));
        return `Ventas (${page.content.length} más recientes)\nid;fecha;estado;total_soles;items\n${filas.join('\n')}`;
      });
    }
    if (sel.has('compras')) {
      await intentar('compras', async () => {
        const page = await firstValueFrom(this.comprasApi.listar({ size: 200 } as any));
        const filas = page.content.map((c) => [c.id, c.fecha, c.proveedorNombre, c.estado, c.total, c.cantidadItems].join(';'));
        return `Compras (${page.content.length} más recientes)\nid;fecha;proveedor;estado;total_soles;items\n${filas.join('\n')}`;
      });
    }
    if (sel.has('taller')) {
      await intentar('taller', async () => {
        const page = await firstValueFrom(this.serviciosApi.listar({ size: 200 } as any));
        const filas = page.content.map((s) => [s.id, s.fecha, s.tipoServicioNombre, s.estado, s.precio, s.cantidadMateriales].join(';'));
        return `Servicios de taller (${page.content.length} más recientes)\nid;fecha;servicio;estado;precio_soles;materiales\n${filas.join('\n')}`;
      });
    }
    if (fallos.length) bloques.push(`Nota: no se pudieron obtener los datos de ${fallos.join(', ')}.`);
    return bloques.join('\n\n');
  }
}
