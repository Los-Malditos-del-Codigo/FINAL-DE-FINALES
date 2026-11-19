import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AlertasService } from '../../core/services/alertas.service';
import { ToastAlertasComponent } from '../../shared/components/toast/toast.component';

type IconoNav =
  | 'box' | 'warehouse' | 'cart' | 'truck' | 'receipt' | 'wrench' | 'chart' | 'bell'
  | 'list' | 'plus' | 'tag' | 'in' | 'out' | 'history' | 'users' | 'layers' | 'ruler' | 'sparkles';

interface OperacionNav {
  etiqueta: string;
  ruta: string;
  query?: Record<string, string>;
  icono: IconoNav;
  /** Abre un formulario (modal) en vez de una vista: nunca queda marcada como activa. */
  accion?: boolean;
  /** Se considera activa también cuando la URL no trae el parámetro de consulta. */
  porDefecto?: boolean;
}

interface ModuloNav {
  id: string;
  etiqueta: string;
  icono: IconoNav;
  bases: string[];
  /** Módulo sin submenú: el botón lleva directo a esta ruta. */
  ruta?: string;
  operaciones: OperacionNav[];
}

interface GrupoNav {
  titulo: string;
  modulos: ModuloNav[];
}

const ICONOS: Record<IconoNav, string[]> = {
  box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  warehouse: ['M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z', 'M6 18h12', 'M6 14h12', 'M6 10h12v12H6z'],
  cart: ['M8 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M19 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'],
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14', 'M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  receipt: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 17.5v-11'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z'],
  chart: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  list: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'],
  plus: ['M12 5v14', 'M5 12h14'],
  tag: ['M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42Z', 'M7.5 7.5h.01'],
  in: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  out: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 21h14'],
  history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  layers: ['m12.83 2.18 8.58 3.9a1 1 0 0 1 0 1.83l-8.58 3.9a2 2 0 0 1-1.66 0L2.6 7.91a1 1 0 0 1 0-1.83l8.58-3.9a2 2 0 0 1 1.66 0Z', 'm22 12-9.17 4.17a2 2 0 0 1-1.66 0L2 12', 'm22 17-9.17 4.17a2 2 0 0 1-1.66 0L2 17'],
  sparkles: ['M9.94 14.06A2 2 0 0 0 8.5 12.62l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z', 'M20 3v4', 'M22 5h-4'],
  ruler: ['M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z', 'm14.5 12.5 2-2', 'm11.5 9.5 2-2', 'm8.5 6.5 2-2', 'm17.5 15.5 2-2'],
};

const NAVEGACION: GrupoNav[] = [
  {
    titulo: 'Catálogo e inventario',
    modulos: [
      {
        id: 'productos',
        etiqueta: 'Productos',
        icono: 'box',
        bases: ['/productos'],
        operaciones: [
          { etiqueta: 'Catálogo de productos', ruta: '/productos', icono: 'list' },
          { etiqueta: 'Agregar producto', ruta: '/productos/nuevo', icono: 'plus' },
          { etiqueta: 'Categorías', ruta: '/productos/catalogos', query: { tab: 'categorias' }, icono: 'layers', porDefecto: true },
          { etiqueta: 'Marcas', ruta: '/productos/catalogos', query: { tab: 'marcas' }, icono: 'tag' },
          { etiqueta: 'Unidades de medida', ruta: '/productos/catalogos', query: { tab: 'unidades' }, icono: 'ruler' },
        ],
      },
      {
        id: 'inventario',
        etiqueta: 'Inventario',
        icono: 'warehouse',
        bases: ['/inventario'],
        operaciones: [
          { etiqueta: 'Monitor de stock', ruta: '/inventario', icono: 'list' },
          { etiqueta: 'Registrar entrada', ruta: '/inventario/entrada', icono: 'in' },
          { etiqueta: 'Registrar salida', ruta: '/inventario/salida', icono: 'out' },
          { etiqueta: 'Historial de movimientos', ruta: '/inventario/movimientos', icono: 'history' },
        ],
      },
    ],
  },
  {
    titulo: 'Abastecimiento',
    modulos: [
      {
        id: 'compras',
        etiqueta: 'Compras',
        icono: 'cart',
        bases: ['/compras'],
        operaciones: [
          { etiqueta: 'Órdenes de compra', ruta: '/compras/ordenes', icono: 'list' },
          { etiqueta: 'Registrar compra', ruta: '/compras/ordenes', query: { nuevo: '1' }, icono: 'plus', accion: true },
        ],
      },
      {
        id: 'proveedores',
        etiqueta: 'Proveedores',
        icono: 'truck',
        bases: ['/proveedores'],
        operaciones: [
          { etiqueta: 'Directorio de proveedores', ruta: '/proveedores', icono: 'users' },
          { etiqueta: 'Nuevo proveedor', ruta: '/proveedores', query: { nuevo: '1' }, icono: 'plus', accion: true },
        ],
      },
    ],
  },
  {
    titulo: 'Operaciones',
    modulos: [
      {
        id: 'ventas',
        etiqueta: 'Ventas',
        icono: 'receipt',
        bases: ['/ventas'],
        operaciones: [
          { etiqueta: 'Historial de ventas', ruta: '/ventas', icono: 'list' },
          { etiqueta: 'Nueva venta', ruta: '/ventas', query: { nuevo: '1' }, icono: 'plus', accion: true },
        ],
      },
      {
        id: 'taller',
        etiqueta: 'Servicios de taller',
        icono: 'wrench',
        bases: ['/taller'],
        operaciones: [
          { etiqueta: 'Servicios realizados', ruta: '/taller/servicios', icono: 'list' },
          { etiqueta: 'Registrar servicio', ruta: '/taller/servicios', query: { nuevo: '1' }, icono: 'plus', accion: true },
          { etiqueta: 'Tipos de servicio', ruta: '/taller/tipos', icono: 'layers' },
          { etiqueta: 'Nuevo tipo de servicio', ruta: '/taller/tipos', query: { nuevo: '1' }, icono: 'plus', accion: true },
        ],
      },
    ],
  },
  {
    titulo: 'Inteligencia',
    modulos: [
      {
        id: 'asistente-ia',
        etiqueta: 'Asistente IA',
        icono: 'sparkles',
        bases: ['/asistente-ia'],
        ruta: '/asistente-ia',
        operaciones: [],
      },
    ],
  },
  {
    titulo: 'Control',
    modulos: [
      {
        id: 'reportes',
        etiqueta: 'Reportes',
        icono: 'chart',
        bases: ['/reportes'],
        operaciones: [
          { etiqueta: 'Inventario', ruta: '/reportes', query: { tipo: 'inventario' }, icono: 'warehouse', porDefecto: true },
          { etiqueta: 'Ventas', ruta: '/reportes', query: { tipo: 'ventas' }, icono: 'receipt' },
          { etiqueta: 'Compras', ruta: '/reportes', query: { tipo: 'compras' }, icono: 'cart' },
          { etiqueta: 'Taller', ruta: '/reportes', query: { tipo: 'taller' }, icono: 'wrench' },
        ],
      },
      {
        id: 'alertas',
        etiqueta: 'Alertas',
        icono: 'bell',
        bases: ['/alertas'],
        operaciones: [
          { etiqueta: 'Todas las alertas', ruta: '/alertas', query: { estado: 'todas' }, icono: 'list', porDefecto: true },
          { etiqueta: 'Pendientes', ruta: '/alertas', query: { estado: 'pendiente' }, icono: 'bell' },
        ],
      },
    ],
  },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, ToastAlertasComponent],
  template: `
    <ng-template #icono let-nombre>
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        @for (d of iconos[$any(nombre)]; track $index) { <path [attr.d]="d"></path> }
      </svg>
    </ng-template>

    <div class="shell-layout" [class.nav-open]="menuMovil()">
      <!-- Barra lateral por módulos -->
      <aside class="sidebar" aria-label="Navegación principal">
        <a routerLink="/productos" class="sidebar-brand" (click)="menuMovil.set(false)">
          <span class="brand-mark"><img src="servillantaslogo.png" alt="" /></span>
          <span class="brand-text">
            <strong>Servillantas RV</strong>
            <small>Gestión de taller e inventario</small>
          </span>
        </a>

        <nav class="sidebar-nav">
          @for (grupo of navegacion; track grupo.titulo) {
            <div class="nav-group">
              <span class="nav-group-label">{{ grupo.titulo }}</span>
              @for (modulo of grupo.modulos; track modulo.id) {
                <div class="nav-module" [class.is-open]="estaAbierto(modulo.id)" [class.is-current]="moduloActual()?.id === modulo.id">
                  @if (modulo.ruta && !modulo.operaciones.length) {
                    <a class="nav-module-btn" [routerLink]="modulo.ruta" (click)="menuMovil.set(false)"
                      [attr.aria-current]="moduloActual()?.id === modulo.id ? 'page' : null">
                      <span class="nav-module-icon"><ng-container *ngTemplateOutlet="icono; context: { $implicit: modulo.icono }"></ng-container></span>
                      <span class="nav-module-label">{{ modulo.etiqueta }}</span>
                    </a>
                  } @else {
                  <button
                    type="button"
                    class="nav-module-btn"
                    [attr.aria-expanded]="estaAbierto(modulo.id)"
                    [attr.aria-controls]="'sub-' + modulo.id"
                    (click)="alternarModulo(modulo.id)"
                  >
                    <span class="nav-module-icon"><ng-container *ngTemplateOutlet="icono; context: { $implicit: modulo.icono }"></ng-container></span>
                    <span class="nav-module-label">{{ modulo.etiqueta }}</span>
                    @if (modulo.id === 'alertas' && alertasService.pendientesCount() > 0) {
                      <span class="nav-count">{{ alertasService.pendientesCount() }}</span>
                    }
                    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                  </button>

                  <div class="nav-sub" [id]="'sub-' + modulo.id">
                    <div class="nav-sub-inner">
                      @for (op of modulo.operaciones; track op.etiqueta) {
                        <a
                          class="nav-op"
                          [class.is-action]="op.accion"
                          [class.active]="operacionActiva(op)"
                          [attr.aria-current]="operacionActiva(op) ? 'page' : null"
                          [attr.tabindex]="estaAbierto(modulo.id) ? null : -1"
                          [routerLink]="op.ruta"
                          [queryParams]="op.query ?? null"
                          (click)="menuMovil.set(false)"
                        >
                          <ng-container *ngTemplateOutlet="icono; context: { $implicit: op.icono }"></ng-container>
                          <span>{{ op.etiqueta }}</span>
                        </a>
                      }
                    </div>
                  </div>
                  }
                </div>
              }
            </div>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="user-avatar">{{ obtenerIniciales() }}</div>
            <div class="user-info">
              <span class="user-name">{{ authService.perfil()?.nombres }} {{ authService.perfil()?.apellidos }}</span>
              <span class="user-role">{{ authService.rol()?.nombre === 'propietario' ? 'Propietario' : 'Personal' }}</span>
            </div>
            <button type="button" class="btn-logout" (click)="cerrarSesion()" title="Cerrar sesión" aria-label="Cerrar sesión">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path></svg>
            </button>
          </div>
        </div>
      </aside>

      <div class="sidebar-backdrop" (click)="menuMovil.set(false)" aria-hidden="true"></div>

      <div class="app-main">
        <!-- Barra superior -->
        <header class="topbar">
          <button type="button" class="btn-menu" (click)="menuMovil.set(true)" aria-label="Abrir menú">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path></svg>
          </button>

          <nav class="breadcrumb" aria-label="Ubicación">
            @if (moduloActual(); as modulo) {
              <span class="crumb-module">
                <ng-container *ngTemplateOutlet="icono; context: { $implicit: modulo.icono }"></ng-container>
                {{ modulo.etiqueta }}
              </span>
              @if (operacionActual(); as op) {
                <svg class="crumb-sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
                <span class="crumb-op">{{ op.etiqueta }}</span>
              }
            }
          </nav>

          <div class="topbar-right">
            <span class="today">{{ hoy }}</span>

            <div class="notification-wrapper">
              <button
                type="button"
                class="btn-bell"
                (click)="toggleMenuAlertas()"
                [attr.aria-expanded]="menuAlertasAbierto()"
                aria-label="Alertas de inventario"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                </svg>
                @if (alertasService.pendientesCount() > 0) {
                  <span class="bell-badge">{{ alertasService.pendientesCount() }}</span>
                }
              </button>

              @if (menuAlertasAbierto()) {
                <div class="alerts-dropdown" role="menu">
                  <div class="alerts-dropdown-header">
                    <h4 class="dropdown-title">Alertas de inventario</h4>
                    <span class="dropdown-subtitle">{{ alertasService.pendientesCount() }} pendientes de atención</span>
                  </div>

                  <div class="alerts-list">
                    @if (alertasService.alertas().length === 0) {
                      <div class="empty-alerts">No hay alertas registradas en el sistema.</div>
                    } @else {
                      @for (item of alertasService.alertas().slice(0, 6); track item.id) {
                        <div class="alert-item" [class.is-read]="item.estado !== 'pendiente'">
                          <div class="alert-item-header">
                            <span
                              class="badge"
                              [class.badge-danger]="item.tipo === 'stock_agotado'"
                              [class.badge-warning]="item.tipo === 'stock_bajo'"
                            >
                              {{ item.tipo === 'stock_agotado' ? 'Agotado' : 'Stock bajo' }}
                            </span>
                            <span class="alert-time">{{ formatearHora(item.fechaGeneracion) }}</span>
                          </div>
                          <p class="alert-item-text">{{ item.mensaje }}</p>
                          <div class="alert-item-footer">
                            <span class="alert-qty font-mono">Stock: {{ item.stockActual }} / Mín: {{ item.stockMinimo }}</span>
                            @if (item.estado === 'pendiente') {
                              <button type="button" class="btn-link" (click)="marcarLeida(item.id)">Marcar atendida</button>
                            } @else {
                              <span class="text-muted">Atendida</span>
                            }
                          </div>
                        </div>
                      }
                    }
                  </div>
                  <a routerLink="/alertas" class="alerts-view-all" (click)="menuAlertasAbierto.set(false)">
                    Ver todas las alertas <span aria-hidden="true">→</span>
                  </a>
                </div>
              }
            </div>
          </div>
        </header>

        <main class="main-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <app-toast-alertas></app-toast-alertas>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .shell-layout {
      min-height: 100vh;
      background-color: var(--bg-app);
    }

    /* ---------- Sidebar ---------- */
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 950;
      width: var(--sidebar-width);
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(120% 50% at 0% 0%, rgba(166, 189, 62, 0.10), transparent 60%),
        linear-gradient(180deg, var(--brand-ink-2), var(--brand-ink));
      color: #C9D3D9;
      border-right: 1px solid rgba(255, 255, 255, 0.04);
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 20px 18px;
      color: #fff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);

      &:hover { color: #fff; }
    }

    .brand-mark {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #F4F6F2;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.6), 0 4px 14px rgba(0,0,0,.25);

      img { width: 34px; height: 34px; object-fit: contain; }
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;

      strong { font-size: 15px; font-weight: 750; letter-spacing: -0.01em; line-height: 1.2; }
      small { font-size: 11.5px; color: #8E9BA5; }
    }

    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px 18px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.12) transparent;
    }

    .nav-group { margin-top: 14px; }

    .nav-group-label {
      display: block;
      padding: 0 10px 6px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      color: #6F7D88;
    }

    .nav-module { margin-bottom: 2px; }

    .nav-module-btn {
      position: relative;
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      padding: 9px 10px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #C9D3D9;
      font-size: 13.5px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background-color var(--transition-fast), color var(--transition-fast);

      &:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
    }

    .nav-module-icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #AEBAC2;
      transition: background-color var(--transition-fast), color var(--transition-fast);

      .ico { width: 17px; height: 17px; }
    }

    .nav-module-label { flex: 1; min-width: 0; }

    .nav-count {
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--state-danger);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      line-height: 20px;
      text-align: center;
    }

    .chevron {
      width: 16px;
      height: 16px;
      color: #7C8A95;
      transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
    }

    .nav-module.is-open .chevron { transform: rotate(180deg); }

    .nav-module.is-current > .nav-module-btn {
      color: #fff;
      background: rgba(255, 255, 255, 0.07);

      .nav-module-icon { background: var(--brand-lime); color: var(--brand-ink); }
    }

    .nav-sub {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 240ms cubic-bezier(0.2, 0, 0, 1);
    }

    .nav-module.is-open .nav-sub { grid-template-rows: 1fr; }

    .nav-sub-inner {
      overflow: hidden;
      min-height: 0;
      margin-left: 25px;
      padding-left: 12px;
      border-left: 1px solid rgba(255, 255, 255, 0.09);
    }

    .nav-module.is-open .nav-sub-inner { padding-top: 4px; padding-bottom: 8px; }

    .nav-op {
      position: relative;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 10px;
      margin: 1px 0;
      border-radius: 8px;
      color: #A3AFB8;
      font-size: 13px;
      font-weight: 500;
      transition: background-color var(--transition-fast), color var(--transition-fast);

      .ico { width: 15px; height: 15px; flex: 0 0 15px; opacity: .8; }

      &:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }

      &.active {
        color: #fff;
        background: rgba(166, 189, 62, 0.14);
        font-weight: 650;

        .ico { color: var(--brand-lime); opacity: 1; }

        &::before {
          content: '';
          position: absolute;
          left: -13px;
          top: 7px;
          bottom: 7px;
          width: 2px;
          border-radius: 2px;
          background: var(--brand-lime);
        }
      }

      &.is-action { color: #C7D58B; .ico { color: var(--brand-lime); opacity: 1; } }
      &.is-action:hover { color: #E3EDB6; }
    }

    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .sidebar-user {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
    }

    .user-avatar {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--brand-lime);
      color: var(--brand-ink);
      font-size: 12.5px;
      font-weight: 800;
    }

    .user-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .user-name {
      overflow: hidden;
      color: #fff;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.25;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .user-role { font-size: 11.5px; color: #8E9BA5; }

    .btn-logout {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #9AA6AF;
      cursor: pointer;
      transition: background-color var(--transition-fast), color var(--transition-fast);

      svg { width: 17px; height: 17px; }
      &:hover { background: rgba(240, 68, 56, 0.16); color: #FDA29B; }
    }

    .sidebar-backdrop { display: none; }

    /* ---------- Área principal ---------- */
    .app-main {
      min-height: 100vh;
      margin-left: var(--sidebar-width);
      display: flex;
      flex-direction: column;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 900;
      display: flex;
      align-items: center;
      gap: 14px;
      height: var(--topbar-height);
      padding: 0 32px;
      background: rgba(242, 244, 243, 0.82);
      backdrop-filter: saturate(1.4) blur(12px);
      border-bottom: 1px solid var(--border-color);
    }

    .btn-menu {
      display: none;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: var(--surface-card);
      color: var(--text-primary);
      cursor: pointer;

      svg { width: 19px; height: 19px; }
    }

    .breadcrumb {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
    }

    .crumb-module {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--text-secondary);
      font-weight: 600;

      .ico { width: 16px; height: 16px; color: var(--brand-lime-strong); }
    }

    .crumb-sep { width: 14px; height: 14px; color: var(--text-muted); flex: 0 0 14px; }

    .crumb-op {
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-primary);
      font-weight: 700;
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .today {
      color: var(--text-muted);
      font-size: 12.5px;
      font-weight: 500;
    }

    .notification-wrapper { position: relative; }

    .btn-bell {
      position: relative;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: var(--surface-card);
      color: var(--text-primary);
      cursor: pointer;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

      svg { width: 18px; height: 18px; }
      &:hover { border-color: var(--border-strong); box-shadow: var(--surface-shadow); }
    }

    .bell-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 18px;
      padding: 1px 5px;
      border: 2px solid var(--bg-app);
      border-radius: 10px;
      background: var(--state-danger);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.3;
      text-align: center;
    }

    .alerts-dropdown {
      position: absolute;
      top: 48px;
      right: 0;
      z-index: 1050;
      width: 380px;
      max-width: calc(100vw - 32px);
      overflow: hidden;
      background: var(--surface-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: 0 18px 48px rgba(24, 34, 42, 0.16);
      animation: dropIn 160ms cubic-bezier(0.2, 0, 0, 1);
    }

    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: none; }
    }

    .alerts-dropdown-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .dropdown-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .dropdown-subtitle { font-size: 12px; color: var(--text-secondary); }

    .alerts-list { max-height: 360px; overflow-y: auto; }

    .alerts-view-all {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-top: 1px solid var(--border-color);
      color: var(--accent-primary);
      font-size: 12.5px;
      font-weight: 700;

      &:hover { background: var(--surface-hover); }
    }

    .empty-alerts {
      padding: 26px 16px;
      text-align: center;
      font-size: 12.5px;
      color: var(--text-secondary);
    }

    .alert-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);

      &:last-child { border-bottom: none; }
      &:hover { background-color: var(--surface-hover); }
      &.is-read { opacity: 0.6; }
    }

    .alert-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .alert-time { font-size: 11px; color: var(--text-muted); }

    .alert-item-text {
      margin-bottom: 8px;
      color: var(--text-primary);
      font-size: 12.5px;
      line-height: 1.4;
    }

    .alert-item-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11.5px;
    }

    .alert-qty { color: var(--text-secondary); }

    .btn-link {
      padding: 0;
      border: none;
      background: none;
      color: var(--brand-lime-strong);
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;

      &:hover { text-decoration: underline; }
    }

    .main-content {
      flex: 1;
      width: 100%;
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 32px 48px;
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 1080px) {
      .sidebar {
        transform: translateX(-100%);
        transition: transform 260ms cubic-bezier(0.2, 0, 0, 1);
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.3);
      }

      .nav-open .sidebar { transform: none; }

      .sidebar-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 940;
        background: rgba(15, 22, 28, 0.45);
        opacity: 0;
        pointer-events: none;
        transition: opacity 220ms ease;
      }

      .nav-open .sidebar-backdrop { opacity: 1; pointer-events: auto; }

      .app-main { margin-left: 0; }
      .btn-menu { display: grid; }
      .topbar { padding: 0 20px; }
      .main-content { padding: 24px 20px 40px; }
    }

    @media (max-width: 640px) {
      .today { display: none; }
      .topbar { padding: 0 16px; gap: 10px; }
      .crumb-module { display: none; }
      .crumb-sep { display: none; }
      .main-content { padding: 20px 16px 36px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .sidebar, .nav-sub, .chevron, .alerts-dropdown { transition: none !important; animation: none !important; }
    }
  `],
})
export class ShellComponent {
  readonly authService = inject(AuthService);
  readonly alertasService = inject(AlertasService);
  private readonly router = inject(Router);

  readonly navegacion = NAVEGACION;
  readonly iconos = ICONOS;
  readonly hoy = ((f) => f.charAt(0).toUpperCase() + f.slice(1))(
    new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
  );

  readonly menuAlertasAbierto = signal(false);
  readonly menuMovil = signal(false);
  private readonly url = signal(this.router.url);
  private readonly abiertos = signal<Set<string>>(new Set());

  private readonly urlParseada = computed(() => {
    const arbol = this.router.parseUrl(this.url());
    const segmentos = arbol.root.children['primary']?.segments.map((s) => s.path) ?? [];
    return { ruta: '/' + segmentos.join('/'), query: arbol.queryParams as Record<string, string> };
  });

  readonly moduloActual = computed<ModuloNav | null>(() => {
    const { ruta } = this.urlParseada();
    for (const grupo of this.navegacion) {
      for (const modulo of grupo.modulos) {
        if (modulo.bases.some((base) => ruta === base || ruta.startsWith(base + '/'))) return modulo;
      }
    }
    return null;
  });

  readonly operacionActual = computed<OperacionNav | null>(() => {
    const modulo = this.moduloActual();
    return modulo?.operaciones.find((op) => this.operacionActiva(op)) ?? null;
  });

  constructor() {
    this.abrirModuloActual();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        this.abrirModuloActual();
        this.menuAlertasAbierto.set(false);
      });
  }

  @HostListener('document:keydown.escape')
  cerrarFlotantes(): void {
    this.menuMovil.set(false);
    this.menuAlertasAbierto.set(false);
  }

  estaAbierto(id: string): boolean {
    return this.abiertos().has(id);
  }

  alternarModulo(id: string): void {
    this.abiertos.update((set) => {
      const copia = new Set(set);
      copia.has(id) ? copia.delete(id) : copia.add(id);
      return copia;
    });
  }

  operacionActiva(op: OperacionNav): boolean {
    if (op.accion) return false;
    const { ruta, query } = this.urlParseada();
    if (ruta !== op.ruta) return false;
    if (!op.query) return true;
    return Object.entries(op.query).every(([clave, valor]) => query[clave] === valor || (!!op.porDefecto && !query[clave]));
  }

  toggleMenuAlertas(): void {
    this.menuAlertasAbierto.update((v) => !v);
  }

  marcarLeida(id: string): void {
    this.alertasService.marcarComoLeida(id).subscribe();
  }

  formatearHora(fechaIso: string): string {
    if (!fechaIso) return '';
    return new Date(fechaIso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  obtenerIniciales(): string {
    const p = this.authService.perfil();
    if (!p) return 'RV';
    return `${p.nombres.charAt(0) || ''}${p.apellidos.charAt(0) || ''}`.toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.logout();
  }

  private abrirModuloActual(): void {
    const modulo = this.moduloActual();
    if (modulo && !this.abiertos().has(modulo.id)) {
      this.abiertos.update((set) => new Set(set).add(modulo.id));
    }
  }
}
