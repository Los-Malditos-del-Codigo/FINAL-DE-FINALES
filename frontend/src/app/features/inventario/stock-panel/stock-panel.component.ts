import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ProductoService } from '../../../core/services/producto.service';
import { InventarioService } from '../../../core/services/inventario.service';
import { CatalogoService } from '../../../core/services/catalogo.service';
import { Producto } from '../../../core/models/producto.model';
import { Inventario } from '../../../core/models/inventario.model';
import { Categoria, Marca, UnidadMedida } from '../../../core/models/catalogos.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

export interface ProductoStockItem {
  producto: Producto;
  stockActual: number;
  stockMinimo: number;
  unidadAbrev: string;
  categoriaNombre: string;
  marcaNombre: string;
  estadoStock: 'agotado' | 'bajo' | 'saludable';
  ultimaActualizacion?: string;
}

type FiltroStock = 'todos' | 'agotados' | 'bajos' | 'saludables';

@Component({
  selector: 'app-stock-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EmptyStateComponent],
  template: `
    <div class="page-container">
      <!-- Encabezado Operativo Principal -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Monitor de stock</h1>
          <p class="page-subtitle">
            Control de existencias físicas disponibles en almacén vs. mínimos configurados de reposición.
          </p>
        </div>

        @if (esPropietario()) {
          <div class="header-actions">
            <button type="button" class="btn btn-secondary" (click)="abrirCargaInicial()">
              Carga inicial de existencias (HU-43)
            </button>
            <button type="button" class="btn btn-primary" (click)="abrirCorreccionStock()">
              Corregir stock físico (HU-41)
            </button>
          </div>
        }
      </div>

      @if (mensaje()) {
        <div class="notice" [class.notice-error]="esError()">{{ mensaje() }}</div>
      }

      <!-- Tarjetas de Métricas Rápidas Operativas -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Referencias Activas</div>
          <div class="metric-value font-mono">{{ itemsStock().length }}</div>
          <div class="metric-desc">Productos controlados en almacén</div>
        </div>

        <div
          class="metric-card clickable"
          [class.active-metric]="filtroEstado() === 'saludables'"
          (click)="filtrarPorEstado('saludables')"
        >
          <div class="metric-label text-success">Stock Saludable</div>
          <div class="metric-value font-mono text-success">{{ conteoSaludables() }}</div>
          <div class="metric-desc">Existencias superiores al mínimo</div>
        </div>

        <div
          class="metric-card clickable"
          [class.active-metric]="filtroEstado() === 'bajos'"
          (click)="filtrarPorEstado('bajos')"
        >
          <div class="metric-label text-warning">Stock Bajo / Crítico</div>
          <div class="metric-value font-mono text-warning">{{ conteoBajos() }}</div>
          <div class="metric-desc">Igual o menor al stock mínimo</div>
        </div>

        <div
          class="metric-card clickable"
          [class.active-metric]="filtroEstado() === 'agotados'"
          (click)="filtrarPorEstado('agotados')"
        >
          <div class="metric-label text-danger">Stock Agotado</div>
          <div class="metric-value font-mono text-danger">{{ conteoAgotados() }}</div>
          <div class="metric-desc">0 unidades disponibles en taller</div>
        </div>
      </div>

      <!-- Barra de Búsqueda y Filtros de Estado -->
      <div class="filters-card">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Buscar por código, nombre o categoría..."
            [value]="filtroTexto()"
            (input)="onTextoChange($event)"
          />
          @if (filtroTexto()) {
            <button type="button" class="btn-clear" (click)="limpiarTexto()" aria-label="Limpiar búsqueda">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          }
        </div>

        <div class="state-filter-buttons">
          <button
            type="button"
            class="btn-filter"
            [class.active]="filtroEstado() === 'todos'"
            (click)="filtrarPorEstado('todos')"
          >
            Todos ({{ itemsStock().length }})
          </button>
          <button
            type="button"
            class="btn-filter"
            [class.active]="filtroEstado() === 'bajos'"
            (click)="filtrarPorEstado('bajos')"
          >
            Bajos ({{ conteoBajos() }})
          </button>
          <button
            type="button"
            class="btn-filter"
            [class.active]="filtroEstado() === 'agotados'"
            (click)="filtrarPorEstado('agotados')"
          >
            Agotados ({{ conteoAgotados() }})
          </button>
          <button
            type="button"
            class="btn-filter"
            [class.active]="filtroEstado() === 'saludables'"
            (click)="filtrarPorEstado('saludables')"
          >
            Saludables ({{ conteoSaludables() }})
          </button>
        </div>
      </div>

      <!-- Tabla de Stock Actual (HU-09) -->
      @if (cargando()) {
        <div class="loading-state">
          <span class="spinner spinner-dark"></span>
          <span>Consultando balances de inventario...</span>
        </div>
      } @else if (itemsFiltrados().length === 0) {
        <app-empty-state
          title="Sin coincidencias de inventario"
          message="No se encontraron artículos que cumplan con los criterios de búsqueda o filtro de stock."
          actionText="Mostrar todos los productos"
          (actionClick)="resetFiltros()"
        ></app-empty-state>
      } @else {
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>PRODUCTO</th>
                <th>CATEGORÍA / MARCA</th>
                <th>UNIDAD</th>
                <th class="text-right">STOCK ACTUAL</th>
                <th class="text-right">STOCK MÍN.</th>
                <th>ESTADO DE STOCK</th>
                <th class="text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              @for (item of itemsFiltrados(); track item.producto.id) {
                <tr [class.row-danger]="item.estadoStock === 'agotado'" [class.row-warning]="item.estadoStock === 'bajo'">
                  <td class="font-mono text-strong">{{ item.producto.codigo }}</td>
                  <td>
                    <div class="prod-cell">
                      <span class="prod-name">{{ item.producto.nombre }}</span>
                      @if (item.producto.descripcion) {
                        <span class="prod-desc">{{ item.producto.descripcion }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="cat-brand-cell">
                      <span>{{ item.categoriaNombre }}</span>
                      <span class="text-muted text-xs">{{ item.marcaNombre }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-neutral font-mono">{{ item.unidadAbrev }}</span>
                  </td>
                  <td class="text-right font-mono text-strong stock-col">
                    <span [class.text-danger]="item.estadoStock === 'agotado'" [class.text-warning]="item.estadoStock === 'bajo'">
                      {{ item.stockActual }}
                    </span>
                  </td>
                  <td class="text-right font-mono text-secondary">
                    {{ item.stockMinimo }}
                  </td>
                  <td>
                    @if (item.estadoStock === 'agotado') {
                      <span class="badge badge-danger">Agotado (0)</span>
                    } @else if (item.estadoStock === 'bajo') {
                      <span class="badge badge-warning">Stock Bajo</span>
                    } @else {
                      <span class="badge badge-success">Saludable</span>
                    }
                  </td>
                  <td class="text-right">
                    <div class="row-actions">
                      <a
                        [routerLink]="['/inventario/entrada']"
                        [queryParams]="{ productoId: item.producto.id }"
                        class="btn-row-action"
                        title="Registrar entrada de mercancía"
                        aria-label="Registrar entrada"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>
                      </a>
                      <a
                        [routerLink]="['/inventario/salida']"
                        [queryParams]="{ productoId: item.producto.id }"
                        class="btn-row-action"
                        [class.disabled]="item.stockActual === 0"
                        title="Registrar salida de almacén"
                        aria-label="Registrar salida"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>
                      </a>
                      @if (esPropietario()) {
                        <button
                          type="button"
                          class="btn-row-action"
                          (click)="abrirCorreccionStock(item)"
                          title="Corregir stock por conteo físico (HU-41)"
                          aria-label="Corregir stock"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Modal HU-41: Corregir stock por conteo físico -->
      @if (modalCorreccion()) {
        <div class="modal-backdrop" (click)="cerrarModales()">
          <section class="operation-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <header class="modal-heading">
              <div>
                <h2>Corregir stock por conteo físico (HU-41)</h2>
                <p>Ingresa la cantidad real contada en almacén; el sistema ajustará automáticamente la diferencia.</p>
              </div>
              <button type="button" class="icon-close" (click)="cerrarModales()">✕</button>
            </header>

            <div class="form-group">
              <label for="adj-prod">Producto <i>*</i></label>
              <select id="adj-prod" class="form-control" [ngModel]="productoAjusteId()" (ngModelChange)="alSeleccionarProductoAjuste($event)">
                <option value="">Selecciona un producto…</option>
                @for (it of itemsStock(); track it.producto.id) {
                  <option [value]="it.producto.id">[{{ it.producto.codigo }}] {{ it.producto.nombre }} (Sistema: {{ it.stockActual }})</option>
                }
              </select>
            </div>

            @if (itemAjusteSeleccionado(); as sel) {
              <div class="stock-compare">
                <div><span>Stock en sistema</span><strong>{{ sel.stockActual }} {{ sel.unidadAbrev }}</strong></div>
                <div><span>Conteo físico real</span><strong>{{ stockFisicoContado() }} {{ sel.unidadAbrev }}</strong></div>
                <div>
                  <span>Diferencia a ajustar</span>
                  <strong [class.text-success]="stockFisicoContado() - sel.stockActual > 0" [class.text-danger]="stockFisicoContado() - sel.stockActual < 0">
                    {{ stockFisicoContado() - sel.stockActual > 0 ? '+' : '' }}{{ stockFisicoContado() - sel.stockActual }} {{ sel.unidadAbrev }}
                  </strong>
                </div>
              </div>
            }

            <div class="form-group">
              <label for="adj-qty">Cantidad física real contada <i>*</i></label>
              <input id="adj-qty" type="number" min="0" step="1" class="form-control font-mono" [ngModel]="stockFisicoContado()" (ngModelChange)="stockFisicoContado.set(+$event)" />
            </div>

            <div class="form-group">
              <label for="adj-reason">Motivo de la corrección <i>*</i></label>
              <input id="adj-reason" type="text" class="form-control" placeholder="Ej. Diferencia encontrada en arqueo semanal de almacén" [ngModel]="motivoAjuste()" (ngModelChange)="motivoAjuste.set($event)" />
            </div>

            <footer class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="cerrarModales()">Cancelar</button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="procesando() || !productoAjusteId() || stockFisicoContado() < 0 || !motivoAjuste().trim() || (itemAjusteSeleccionado()?.stockActual === stockFisicoContado())"
                (click)="confirmarCorreccionStock()"
              >
                {{ procesando() ? 'Aplicando ajuste…' : 'Aplicar corrección de stock' }}
              </button>
            </footer>
          </section>
        </div>
      }

      <!-- Modal HU-43: Carga inicial de existencias -->
      @if (modalCargaInicial()) {
        <div class="modal-backdrop" (click)="cerrarModales()">
          <section class="operation-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <header class="modal-heading">
              <div>
                <h2>Carga inicial de existencias (HU-43)</h2>
                <p>Registra el inventario físico inicial de un producto para arrancar operaciones con cantidades reales.</p>
              </div>
              <button type="button" class="icon-close" (click)="cerrarModales()">✕</button>
            </header>

            <div class="form-group">
              <label for="init-prod">Producto <i>*</i></label>
              <select id="init-prod" class="form-control" [ngModel]="productoAjusteId()" (ngModelChange)="productoAjusteId.set($event)">
                <option value="">Selecciona un producto…</option>
                @for (it of itemsStock(); track it.producto.id) {
                  <option [value]="it.producto.id">[{{ it.producto.codigo }}] {{ it.producto.nombre }} (Actual: {{ it.stockActual }})</option>
                }
              </select>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="init-qty">Cantidad inicial a cargar <i>*</i></label>
                <input id="init-qty" type="number" min="1" step="1" class="form-control font-mono" [ngModel]="cantidadInicial()" (ngModelChange)="cantidadInicial.set(+$event)" />
              </div>
              <div class="form-group">
                <label for="init-cost">Costo unitario referencial (S/ opcional)</label>
                <input id="init-cost" type="number" min="0" step="0.01" class="form-control font-mono" [ngModel]="costoInicial()" (ngModelChange)="costoInicial.set(+$event)" />
              </div>
            </div>

            <div class="form-group">
              <label for="init-notes">Observación</label>
              <input id="init-notes" type="text" class="form-control" placeholder="Ej. Inventario inicial de apertura" [ngModel]="motivoAjuste()" (ngModelChange)="motivoAjuste.set($event)" />
            </div>

            <footer class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="cerrarModales()">Cancelar</button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="procesando() || !productoAjusteId() || cantidadInicial() < 1"
                (click)="confirmarCargaInicial()"
              >
                {{ procesando() ? 'Cargando existencias…' : 'Guardar existencia inicial' }}
              </button>
            </footer>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .page-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .page-subtitle {
      font-size: 13.5px;
      color: var(--text-secondary);
      margin-top: 3px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Métricas Operativas */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .metric-card {
      background-color: var(--surface-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color var(--transition-fast), background-color var(--transition-fast);

      &.clickable {
        cursor: pointer;

        &:hover {
          background-color: var(--surface-hover);
          border-color: var(--border-strong);
        }
      }

      &.active-metric {
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 2px var(--focus-ring);
      }
    }

    .metric-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .metric-value {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.1;
    }

    .metric-desc {
      font-size: 11.5px;
      color: var(--text-muted);
    }

    .text-success { color: var(--state-success) !important; }
    .text-warning { color: var(--state-warning) !important; }
    .text-danger { color: var(--state-danger) !important; }

    /* Filtros y Búsqueda */
    .filters-card {
      background-color: var(--surface-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 280px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 0 12px;
      height: 38px;
      color: var(--text-secondary);
    }

    .search-input {
      border: none;
      background: transparent;
      outline: none;
      width: 100%;
      font-size: 13px;
      color: var(--text-primary);
    }

    .btn-clear {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 13px;
      padding: 2px 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .state-filter-buttons {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .btn-filter {
      background: var(--surface-subtle);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover {
        background-color: #E6EAEF;
        color: var(--text-primary);
      }

      &.active {
        background-color: var(--accent-primary);
        color: #FFFFFF;
        border-color: var(--accent-primary);
      }
    }

    /* Tabla */
    .text-strong { font-weight: 600; }

    .stock-col {
      font-size: 14.5px;
    }

    .prod-cell {
      display: flex;
      flex-direction: column;
    }

    .prod-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .prod-desc {
      font-size: 11.5px;
      color: var(--text-secondary);
      max-width: 240px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cat-brand-cell {
      display: flex;
      flex-direction: column;
      font-size: 12.5px;
    }

    .text-xs { font-size: 11px; }

    .row-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .btn-row-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0 !important;
      svg { width: 15px; height: 15px; }
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 500;
      color: var(--accent-primary);
      text-decoration: none;
      transition: all var(--transition-fast);

      &:hover {
        background-color: var(--accent-subtle);
        border-color: var(--accent-border);
      }

      &.disabled {
        opacity: 0.4;
        pointer-events: none;
      }
    }

    .row-danger {
      background-color: #FFFDFD;
    }

    .row-warning {
      background-color: #FFFEFC;
    }

    .loading-state {
      padding: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-secondary);
      background: #FFFFFF;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
    }

    .notice {
      padding: 11px 14px;
      border: 1px solid var(--state-success-border);
      background: var(--state-success-bg);
      color: var(--state-success);
      border-radius: var(--radius-sm);
      font-size: 13px;
    }

    .notice-error {
      color: var(--state-danger);
      border-color: var(--state-danger-border);
      background: var(--state-danger-bg);
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(18, 28, 34, .46);
    }

    .operation-modal {
      width: min(560px, 100%);
      max-height: 92vh;
      overflow: auto;
      padding: 22px;
      background: var(--surface-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: 0 18px 48px rgba(16, 24, 40, .2);
    }

    .modal-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .modal-heading h2 { margin: 0; font-size: 18px; }
    .modal-heading p { margin-top: 4px; color: var(--text-secondary); font-size: 13px; }
    .icon-close { width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: 4px; background: #fff; font-size: 16px; cursor: pointer; }
    .form-group i { color: var(--state-danger); font-style: normal; }
    .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .stock-compare {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 12px 14px;
      margin-bottom: 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: var(--surface-subtle);
      div { display: flex; flex-direction: column; gap: 3px; }
      span { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; }
      strong { font: 700 15px var(--font-mono); color: var(--text-primary); }
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 9px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      margin-top: 16px;
    }
  `],
})
export class StockPanelComponent implements OnInit {
  private authService = inject(AuthService);
  private productoService = inject(ProductoService);
  private inventarioService = inject(InventarioService);
  private catalogoService = inject(CatalogoService);

  readonly esPropietario = computed(() => this.authService.rol()?.nombre === 'propietario');

  cargando = signal<boolean>(true);
  productos = signal<Producto[]>([]);
  inventarios = signal<Inventario[]>([]);
  categorias = signal<Categoria[]>([]);
  marcas = signal<Marca[]>([]);
  unidades = signal<UnidadMedida[]>([]);

  filtroTexto = signal<string>('');
  filtroEstado = signal<FiltroStock>('todos');

  // Modales HU-41 y HU-43
  readonly modalCorreccion = signal(false);
  readonly modalCargaInicial = signal(false);
  readonly productoAjusteId = signal('');
  readonly stockFisicoContado = signal(0);
  readonly cantidadInicial = signal(1);
  readonly costoInicial = signal(0);
  readonly motivoAjuste = signal('');
  readonly procesando = signal(false);
  readonly mensaje = signal('');
  readonly esError = signal(false);

  readonly itemAjusteSeleccionado = computed(() =>
    this.itemsStock().find((it) => it.producto.id === this.productoAjusteId()) ?? null
  );

  ngOnInit(): void {
    this.cargarTodo();
  }

  cargarTodo(): void {
    this.cargando.set(true);

    this.catalogoService.getCategorias().subscribe((c) => this.categorias.set(c));
    this.catalogoService.getMarcas().subscribe((m) => this.marcas.set(m));
    this.catalogoService.getUnidades().subscribe((u) => this.unidades.set(u));

    this.productoService.listar({ includeInactivos: false }).subscribe({
      next: (prods) => {
        this.productos.set(prods);
        this.inventarioService.obtenerStock().subscribe({
          next: (inv) => {
            this.inventarios.set(inv);
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }

  // Combinar productos activos con su fila de inventario
  itemsStock = computed<ProductoStockItem[]>(() => {
    const prods = this.productos();
    const invMap = new Map(this.inventarios().map((i) => [i.productoId, i]));
    const catMap = new Map(this.categorias().map((c) => [c.id, c.nombre]));
    const marMap = new Map(this.marcas().map((m) => [m.id, m.nombre]));
    const umMap = new Map(this.unidades().map((u) => [u.id, u.abreviatura]));

    return prods.map((p) => {
      const inv = invMap.get(p.id);
      const stockActual = inv ? inv.stockActual : 0;
      const stockMinimo = p.stockMinimo;

      let estadoStock: 'agotado' | 'bajo' | 'saludable' = 'saludable';
      if (stockActual === 0) {
        estadoStock = 'agotado';
      } else if (stockActual <= stockMinimo) {
        estadoStock = 'bajo';
      }

      return {
        producto: p,
        stockActual,
        stockMinimo,
        unidadAbrev: umMap.get(p.unidadMedidaId) || 'UND',
        categoriaNombre: p.categoriaId ? catMap.get(p.categoriaId) || '—' : '—',
        marcaNombre: p.marcaId ? marMap.get(p.marcaId) || '—' : '—',
        estadoStock,
        ultimaActualizacion: inv?.ultimaActualizacion,
      };
    });
  });

  // Métricas computadas
  conteoSaludables = computed(() => this.itemsStock().filter((i) => i.estadoStock === 'saludable').length);
  conteoBajos = computed(() => this.itemsStock().filter((i) => i.estadoStock === 'bajo').length);
  conteoAgotados = computed(() => this.itemsStock().filter((i) => i.estadoStock === 'agotado').length);

  // Filtrado reactivo en pantalla
  itemsFiltrados = computed(() => {
    let list = this.itemsStock();
    const estado = this.filtroEstado();
    const q = this.filtroTexto().trim().toLowerCase();

    if (estado === 'agotados') {
      list = list.filter((i) => i.estadoStock === 'agotado');
    } else if (estado === 'bajos') {
      list = list.filter((i) => i.estadoStock === 'bajo');
    } else if (estado === 'saludables') {
      list = list.filter((i) => i.estadoStock === 'saludable');
    }

    if (q) {
      list = list.filter(
        (i) =>
          i.producto.codigo.toLowerCase().includes(q) ||
          i.producto.nombre.toLowerCase().includes(q) ||
          i.categoriaNombre.toLowerCase().includes(q) ||
          i.marcaNombre.toLowerCase().includes(q)
      );
    }

    return list;
  });

  filtrarPorEstado(estado: FiltroStock): void {
    this.filtroEstado.set(estado);
  }

  onTextoChange(e: Event): void {
    this.filtroTexto.set((e.target as HTMLInputElement).value);
  }

  limpiarTexto(): void {
    this.filtroTexto.set('');
  }

  resetFiltros(): void {
    this.filtroTexto.set('');
    this.filtroEstado.set('todos');
  }

  abrirCorreccionStock(item?: ProductoStockItem): void {
    const sel = item ?? this.itemsStock()[0] ?? null;
    this.productoAjusteId.set(sel?.producto.id ?? '');
    this.stockFisicoContado.set(sel?.stockActual ?? 0);
    this.motivoAjuste.set('Conteo físico de almacén');
    this.modalCorreccion.set(true);
  }

  alSeleccionarProductoAjuste(prodId: string): void {
    this.productoAjusteId.set(prodId);
    const sel = this.itemsStock().find((it) => it.producto.id === prodId);
    if (sel) {
      this.stockFisicoContado.set(sel.stockActual);
    }
  }

  abrirCargaInicial(): void {
    const sel = this.itemsStock().find((it) => it.stockActual === 0) ?? this.itemsStock()[0] ?? null;
    this.productoAjusteId.set(sel?.producto.id ?? '');
    this.cantidadInicial.set(10);
    this.costoInicial.set(0);
    this.motivoAjuste.set('Existencias iniciales al iniciar operaciones en el sistema');
    this.modalCargaInicial.set(true);
  }

  cerrarModales(): void {
    this.modalCorreccion.set(false);
    this.modalCargaInicial.set(false);
  }

  async confirmarCorreccionStock(): Promise<void> {
    const sel = this.itemAjusteSeleccionado();
    const contado = Math.floor(this.stockFisicoContado());
    const motivo = this.motivoAjuste().trim();
    if (!sel || contado < 0 || !motivo) return;
    const diff = contado - sel.stockActual;
    if (diff === 0) return;

    this.procesando.set(true);
    try {
      if (diff > 0) {
        await firstValueFrom(
          this.inventarioService.registrarEntrada({
            productoId: sel.producto.id,
            cantidad: diff,
            costoUnitario: null,
            proveedor: null,
            motivo: 'Ajuste de inventario',
            observaciones: `Corrección por conteo físico (${sel.stockActual} → ${contado}): ${motivo}`,
          })
        );
      } else {
        await firstValueFrom(
          this.inventarioService.registrarSalida({
            productoId: sel.producto.id,
            cantidad: Math.abs(diff),
            motivo: 'Ajuste de inventario',
            observaciones: `Corrección por conteo físico (${sel.stockActual} → ${contado}): ${motivo}`,
          })
        );
      }
      this.cerrarModales();
      this.cargarTodo();
      this.notificar(`Stock de ${sel.producto.nombre} corregido a ${contado} ${sel.unidadAbrev}.`);
    } catch (err: any) {
      this.notificar(err?.error?.mensaje || 'No se pudo aplicar la corrección de stock.', true);
    } finally {
      this.procesando.set(false);
    }
  }

  async confirmarCargaInicial(): Promise<void> {
    const prodId = this.productoAjusteId();
    const cant = Math.floor(this.cantidadInicial());
    if (!prodId || cant < 1) return;

    this.procesando.set(true);
    try {
      await firstValueFrom(
        this.inventarioService.registrarEntrada({
          productoId: prodId,
          cantidad: cant,
          costoUnitario: this.costoInicial() > 0 ? this.costoInicial() : null,
          proveedor: null,
          motivo: 'Carga inicial de existencias',
          observaciones: this.motivoAjuste().trim() || 'Carga inicial de existencias (HU-43)',
        })
      );
      this.cerrarModales();
      this.cargarTodo();
      this.notificar(`Se cargaron ${cant} unidades iniciales correctamente.`);
    } catch (err: any) {
      this.notificar(err?.error?.mensaje || 'No se pudo registrar la carga inicial.', true);
    } finally {
      this.procesando.set(false);
    }
  }

  private notificar(text: string, error = false): void {
    this.mensaje.set(text);
    this.esError.set(error);
    window.setTimeout(() => {
      if (this.mensaje() === text) this.mensaje.set('');
    }, 5000);
  }
}
