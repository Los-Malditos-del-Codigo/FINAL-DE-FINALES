import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { InventarioService } from '../../core/services/inventario.service';
import { ProductoService } from '../../core/services/producto.service';
import { ReniecService } from '../../core/services/reniec.service';
import { ServicioService } from '../../core/services/servicio.service';
import { TipoServicioService } from '../../core/services/tipo-servicio.service';
import { Inventario } from '../../core/models/inventario.model';
import { Producto } from '../../core/models/producto.model';
import { ServicioResumen, TipoServicio } from '../../core/models/servicio.model';

interface TipoServicioVista {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  activo: boolean;
}

interface MaterialVista {
  productoId: string;
  codigo: string;
  producto: string;
  cantidad: number;
  devuelta: number;
}

interface ServicioVista {
  id: string;
  fecha: string;
  estado: 'realizado' | 'anulada';
  tipoServicioId: string;
  tipoServicio: string;
  precioServicio: number;
  cliente: string;
  documentoCliente: string;
  placa: string;
  vehiculo: string;
  observaciones: string;
  motivoAnulacion: string;
  materiales: MaterialVista[];
}

@Component({
  selector: 'app-taller',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container workshop-page">
      <header class="page-header">
        @if (vista() === 'historial') {
          <div><h1 class="page-title">Servicios realizados</h1><p class="page-subtitle">Atenciones del taller con su cliente, vehículo y materiales utilizados.</p></div>
        } @else {
          <div><h1 class="page-title">Tipos de servicio</h1><p class="page-subtitle">Catálogo de servicios que ofrece el taller y su precio base.</p></div>
        }
      </header>

      @if (mensaje()) { <div class="notice" [class.notice-error]="esError()">{{ mensaje() }}</div> }


      @if (vista() === 'historial') {
        <section class="metric-row" aria-label="Resumen de taller">
          <div class="metric"><span>Servicios registrados</span><strong>{{ servicios().length }}</strong></div>
          <div class="metric"><span>Realizados</span><strong>{{ serviciosRealizados }}</strong></div>
          <div class="metric"><span>Ingresos por servicios</span><strong>{{ ingresosServicios | currency:'PEN':'symbol':'1.2-2' }}</strong></div>
        </section>
        <div class="filters-card operation-filters">
          <form class="operation-search" role="search" (submit)="aplicarBusqueda($event)">
            <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input class="search-input" type="search" aria-label="Buscar servicios" placeholder="N.º de atención, cliente, placa o servicio" [value]="textoBusqueda()" (input)="textoBusqueda.set($any($event.target).value)" />
            @if (textoBusqueda() || busqueda()) { <button class="clear-search" type="button" aria-label="Limpiar búsqueda" (click)="limpiarBusqueda()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button> }
            <button class="search-submit" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><span>Buscar</span></button>
          </form>
          <select class="form-control filter-select" aria-label="Filtrar por estado" [value]="filtroEstado()" (change)="filtroEstado.set($any($event.target).value)"><option value="">Todos los estados</option><option value="realizado">Realizado</option><option value="anulado">Anulado</option></select>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>ATENCIÓN</th><th>FECHA</th><th>CLIENTE / VEHÍCULO</th><th>SERVICIO</th><th>MATERIALES</th><th class="text-right">PRECIO</th><th>ESTADO</th><th class="text-right">ACCIONES</th></tr></thead>
            <tbody>
              @for (service of serviciosFiltrados; track service.id) {
                <tr>
                  <td class="font-mono text-strong">{{ service.id }}</td>
                  <td>{{ service.fecha | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td>
                    <strong>{{ service.cliente || 'Cliente general' }}</strong>
                    @if (service.documentoCliente) { <small class="doc-sub">DNI/RUC: {{ service.documentoCliente }}</small> }
                    <small>{{ service.placa || 'Sin placa' }}{{ service.vehiculo ? ' · ' + service.vehiculo : '' }}</small>
                  </td>
                  <td>{{ service.tipoServicio }}</td><td>{{ service.materiales.length }} productos · {{ cantidadMateriales(service) }} uds.</td>
                  <td class="text-right font-mono text-strong">{{ service.precioServicio | currency:'PEN':'symbol':'1.2-2' }}</td>
                  <td><span class="badge" [class.badge-success]="service.estado === 'realizado'" [class.badge-neutral]="service.estado === 'anulado'">{{ service.estado === 'realizado' ? 'Realizado' : 'Anulado' }}</span></td>
                  <td class="text-right"><div class="row-actions">
                    <button class="btn-action action-document" type="button" (click)="imprimirComprobante(service)" title="Abrir comprobante para imprimir">Comprobante</button>
                    <button class="btn-action action-detail" type="button" (click)="verDetalle(service)">Detalle</button>
                    @if (service.estado === 'realizado' && esPropietario()) { <button class="btn-action action-danger" type="button" (click)="abrirAnulacion(service)">Anular</button> }
                  </div></td>
                </tr>
                @if (detalleAbierto() === service.id) {
                  <tr class="detail-row"><td colspan="8"><div class="service-detail"><div><strong>Materiales utilizados</strong>@if (service.materiales.length) { <ul>@for (material of service.materiales; track material.productoId) {<li>{{ material.codigo }} · {{ material.producto }}: {{ material.cantidad }} uds.{{ material.devuelta ? ' · Reintegradas: ' + material.devuelta : '' }}</li>}</ul>} @else {<p>Sin materiales asociados.</p>}</div><div><strong>Observaciones</strong><p>{{ service.observaciones || 'Sin observaciones' }}</p>@if (service.motivoAnulacion) {<strong>Motivo de anulación</strong><p>{{ service.motivoAnulacion }}</p>}</div></div></td></tr>
                }
              } @empty { <tr><td colspan="8" class="empty-cell">No hay servicios para mostrar. Registra la primera atención del taller.</td></tr> }
            </tbody>
          </table>
        </div>
      } @else {
        <section class="metric-row" aria-label="Resumen de tipos de servicio">
          <div class="metric"><span>Tipos de servicio</span><strong>{{ tiposServicio().length }}</strong></div>
          <div class="metric"><span>Disponibles para registro</span><strong>{{ tiposActivos }}</strong></div>
          <div class="metric"><span>Atenciones registradas</span><strong>{{ servicios().length }}</strong></div>
        </section>
        <div class="filters-card operation-filters">
          <form class="operation-search" role="search" (submit)="aplicarBusqueda($event)">
            <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input class="search-input" type="search" aria-label="Buscar tipos de servicio" placeholder="Nombre o descripción del servicio" [value]="textoBusqueda()" (input)="textoBusqueda.set($any($event.target).value)" />
            @if (textoBusqueda() || busqueda()) { <button class="clear-search" type="button" aria-label="Limpiar búsqueda" (click)="limpiarBusqueda()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button> }
            <button class="search-submit" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><span>Buscar</span></button>
          </form>
          <label class="checkbox-label"><input type="checkbox" [checked]="incluirInactivos()" (change)="incluirInactivos.set($any($event.target).checked)" /><span>Incluir inactivos</span></label>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>SERVICIO</th><th>DESCRIPCIÓN</th><th class="text-right">PRECIO BASE</th><th>ESTADO</th><th class="text-right">ACCIONES</th></tr></thead>
            <tbody>
              @for (type of tiposFiltrados; track type.id) {
                <tr [class.row-inactive]="!type.activo"><td><strong>{{ type.nombre }}</strong></td><td>{{ type.descripcion || '—' }}</td><td class="text-right font-mono">{{ type.precio | currency:'PEN':'symbol':'1.2-2' }}</td><td><span class="badge" [class.badge-success]="type.activo" [class.badge-neutral]="!type.activo">{{ type.activo ? 'Activo' : 'Inactivo' }}</span></td><td class="text-right"><div class="row-actions"><button class="btn-action action-edit" type="button" (click)="abrirTipo(type)">Editar</button><button class="btn-action" [class.action-danger]="type.activo" [class.action-enable]="!type.activo" type="button" (click)="cambiarEstadoTipo(type)">{{ type.activo ? 'Desactivar' : 'Activar' }}</button></div></td></tr>
              } @empty { <tr><td colspan="5" class="empty-cell">No hay tipos de servicio que coincidan.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (modalServicio()) {
      <div class="modal-backdrop" (click)="cerrarModales()"><section class="operation-modal service-modal" role="dialog" aria-modal="true" aria-labelledby="service-title" (click)="$event.stopPropagation()">
        <header class="modal-heading"><div><h2 id="service-title">Registrar servicio</h2><p>Ingresa el DNI (8 dígitos) o RUC (11 dígitos) para autocompletar los datos del cliente con RENIEC y descontar los materiales.</p></div><button class="icon-close" type="button" aria-label="Cerrar" (click)="cerrarModales()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></header>
        <div class="service-form-grid">
          <div class="form-group span-two"><label for="service-type">Tipo de servicio <i>*</i></label><select id="service-type" class="form-control" [value]="tipoSeleccionado()" (change)="seleccionarTipo($any($event.target).value)"><option value="">Seleccionar servicio</option>@for (type of tiposActivosLista; track type.id) {<option [value]="type.id">{{ type.nombre }} · {{ type.precio | currency:'PEN':'symbol':'1.2-2' }}</option>}</select></div>
          <div class="form-group">
            <label for="service-document">DNI / RUC <span class="optional-label">(autocompleta RENIEC)</span></label>
            <div class="doc-lookup-row">
              <input id="service-document" class="form-control" inputmode="numeric" maxlength="11" placeholder="Ingresa 8 dígitos (DNI) u 11 (RUC)" [value]="documentoCliente()" (input)="alCambiarDocumento($event)" />
              <button type="button" class="btn btn-secondary btn-lookup" [disabled]="consultandoDoc() || (documentoCliente().length !== 8 && documentoCliente().length !== 11)" (click)="buscarDocumentoManual()">
                {{ consultandoDoc() ? 'Buscando…' : 'RENIEC' }}
              </button>
            </div>
            @if (estadoReniec()) {
              <small class="reniec-status" [class.reniec-ok]="reniecExito()" [class.reniec-warn]="!reniecExito()">{{ estadoReniec() }}</small>
            }
          </div>
          <div class="form-group"><label for="service-customer">Nombres y apellidos / Razón social</label><input id="service-customer" class="form-control" placeholder="Se autocompleta con el DNI o escríbelo" [value]="cliente()" (input)="cliente.set($any($event.target).value)" /></div>
          <div class="form-group"><label for="service-plate">Placa</label><input id="service-plate" class="form-control plate-input" placeholder="ABC-123" maxlength="10" [value]="placa()" (input)="placa.set($any($event.target).value.toUpperCase())" /></div>
          <div class="form-group"><label for="service-vehicle">Vehículo</label><input id="service-vehicle" class="form-control" placeholder="Marca, modelo y año" [value]="vehiculo()" (input)="vehiculo.set($any($event.target).value)" /></div>
          <div class="form-group"><label for="service-price">Precio del servicio (S/) <i>*</i></label><input id="service-price" class="form-control" type="number" min="0" step="0.01" [value]="precioServicio()" (input)="precioServicio.set(+$any($event.target).value)" /></div>
          <div class="form-group"><label for="service-notes">Observaciones</label><input id="service-notes" class="form-control" placeholder="Detalle de la atención o recomendación" [value]="observaciones()" (input)="observaciones.set($any($event.target).value)" /></div>
        </div>
        <div class="materials-heading"><div><h3>Materiales utilizados</h3><p>Se descontarán del stock al guardar.</p></div><span>{{ lineasMateriales().length }} productos</span></div>
        <div class="material-entry-grid">
          <div class="form-group"><label for="material-product">Producto</label><select id="material-product" class="form-control" [value]="productoMaterial()" (change)="productoMaterial.set($any($event.target).value)"><option value="">Seleccionar material</option>@for (product of productosActivos; track product.id) {<option [value]="product.id" [disabled]="stockDisponible(product.id) <= 0">{{ product.codigo }} · {{ product.nombre }} ({{ stockDisponible(product.id) }} disp.)</option>}</select></div>
          <div class="form-group"><label for="material-quantity">Cantidad</label><input id="material-quantity" class="form-control" type="number" min="1" step="1" [value]="cantidadMaterial()" (input)="cantidadMaterial.set(+$any($event.target).value)" /></div>
          <button class="btn btn-secondary add-material" type="button" (click)="agregarMaterial()"><svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>Agregar</button>
        </div>
        <div class="lines-table-wrap"><table class="data-table compact-table"><thead><tr><th>CÓDIGO</th><th>MATERIAL</th><th>STOCK</th><th>CANT.</th><th></th></tr></thead><tbody>@for (line of lineasMateriales(); track line.productoId) {<tr><td class="font-mono">{{ line.codigo }}</td><td>{{ line.producto }}</td><td>{{ stockDisponible(line.productoId) }}</td><td>{{ line.cantidad }}</td><td><button class="btn-action action-danger" type="button" (click)="quitarMaterial(line.productoId)">Quitar</button></td></tr>} @empty {<tr><td colspan="5" class="empty-cell">Atención sin materiales asociados.</td></tr>}</tbody></table></div>
        <footer class="modal-actions"><button class="btn btn-secondary" type="button" (click)="cerrarModales()">Cancelar</button><button class="btn btn-primary" type="button" [disabled]="guardando() || !tipoSeleccionado() || precioServicio() < 0" (click)="guardarServicio()">{{ guardando() ? 'Registrando…' : 'Registrar atención' }}</button></footer>
      </section></div>
    }

    @if (modalTipo()) {
      <div class="modal-backdrop" (click)="cerrarModales()"><section class="operation-modal type-modal" role="dialog" aria-modal="true" aria-labelledby="type-title" (click)="$event.stopPropagation()">
        <header class="modal-heading"><div><h2 id="type-title">{{ tipoEditando ? 'Editar tipo de servicio' : 'Nuevo tipo de servicio' }}</h2><p>Define el nombre, descripción y precio base de la atención.</p></div><button class="icon-close" type="button" aria-label="Cerrar" (click)="cerrarModales()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></header>
        <div class="form-group"><label for="type-name">Nombre <i>*</i></label><input id="type-name" class="form-control" maxlength="100" placeholder="Ej. Alineación computarizada" [value]="nombreTipo()" (input)="nombreTipo.set($any($event.target).value)" /></div>
        <div class="form-group"><label for="type-description">Descripción</label><textarea id="type-description" class="form-control text-area" rows="3" maxlength="240" placeholder="Describe brevemente el servicio" [value]="descripcionTipo()" (input)="descripcionTipo.set($any($event.target).value)"></textarea></div>
        <div class="form-group"><label for="type-price">Precio base (S/) <i>*</i></label><input id="type-price" class="form-control" type="number" min="0" step="0.01" [value]="precioTipo()" (input)="precioTipo.set(+$any($event.target).value)" /></div>
        <footer class="modal-actions"><button class="btn btn-secondary" type="button" (click)="cerrarModales()">Cancelar</button><button class="btn btn-primary" type="button" [disabled]="!nombreTipo().trim() || precioTipo() < 0" (click)="guardarTipo()">{{ tipoEditando ? 'Guardar cambios' : 'Crear tipo' }}</button></footer>
      </section></div>
    }

    @if (modalAnulacion()) {
      <div class="modal-backdrop" (click)="cerrarModales()"><section class="operation-modal type-modal" role="dialog" aria-modal="true" aria-labelledby="void-title" (click)="$event.stopPropagation()">
        <header class="modal-heading"><div><h2 id="void-title">Anular atención {{ servicioSeleccionado()?.id }}</h2><p>Los materiales se devolverán al inventario una sola vez.</p></div><button class="icon-close" type="button" aria-label="Cerrar" (click)="cerrarModales()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></header>
        <div class="form-group"><label for="void-reason">Motivo obligatorio <i>*</i></label><textarea id="void-reason" class="form-control text-area" rows="3" placeholder="Describe el error que se corrige" [value]="motivoAnulacion()" (input)="motivoAnulacion.set($any($event.target).value)"></textarea></div>
        <footer class="modal-actions"><button class="btn btn-secondary" type="button" (click)="cerrarModales()">Volver</button><button class="btn btn-danger" type="button" [disabled]="!motivoAnulacion().trim() || guardando()" (click)="confirmarAnulacion()">Anular y reintegrar materiales</button></footer>
      </section></div>
    }
  `,
  styles: [`
    .workshop-page { max-width:1360px; margin:0 auto; }
    .section-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border-color); margin:0 0 20px; }.section-tabs button { display:flex; align-items:center; gap:9px; padding:12px 15px; border:0; border-bottom:2px solid transparent; background:none; color:var(--text-secondary); cursor:pointer; }.section-tabs button.active { color:var(--accent-primary); border-bottom-color:var(--accent-primary); font-weight:600; }.section-tabs span { min-width:20px; padding:1px 6px; border-radius:10px; background:var(--surface-subtle); font:11px var(--font-mono); text-align:center; }
    .metric-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; }.metric { padding:14px 16px; border:1px solid var(--border-color); border-radius:var(--radius-md); background:var(--surface-card); display:flex; flex-direction:column; gap:6px; }.metric span { color:var(--text-secondary); font-size:12px; }.metric strong { font:600 22px var(--font-mono); }
    .operation-filters { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:14px; }.operation-search { display:flex; align-items:center; gap:9px; flex:1; min-width:0; max-width:620px; height:44px; padding:4px 5px 4px 12px; background:#fff; border:1px solid var(--border-strong); border-radius:var(--radius-md); transition:border-color var(--transition-fast),box-shadow var(--transition-fast); }.operation-search:focus-within { border-color:var(--accent-primary); box-shadow:0 0 0 3px var(--focus-ring); }.search-icon { flex:0 0 18px; width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; color:var(--text-muted); }.search-input { flex:1; min-width:0; width:100%; height:100%; padding:0; border:0; outline:none; background:transparent; color:var(--text-primary); font-size:13px; }.search-input::placeholder { color:var(--text-muted); opacity:1; }.clear-search { display:grid; place-items:center; flex:0 0 28px; width:28px; height:28px; padding:0; border:0; border-radius:4px; background:transparent; color:var(--text-secondary); font-size:20px; line-height:1; cursor:pointer; }.clear-search:hover { background:var(--surface-subtle); }.search-submit { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 13px; border:1px solid var(--accent-primary); border-radius:4px; background:var(--accent-primary); color:#fff; font-size:12px; font-weight:600; cursor:pointer; }.search-submit:hover { background:var(--accent-hover); }.search-submit svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2; }.operation-filters .filter-select { width:min(220px,45%); }
    .data-table small { display:block; color:var(--text-muted); font-size:12px; }.doc-sub { font-family:var(--font-mono); font-size:11.5px; }.row-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:6px; }.row-actions .btn-action,.compact-table .btn-action { display:inline-flex; min-height:30px; align-items:center; justify-content:center; padding:5px 9px; border:1px solid var(--border-color); border-radius:4px; background:#fff; color:var(--text-secondary); font-size:11px; font-weight:600; line-height:1.2; white-space:nowrap; cursor:pointer; }.row-actions .btn-action:hover,.compact-table .btn-action:hover { border-color:var(--accent-border); background:var(--accent-subtle); color:var(--accent-primary); }.row-actions .action-danger,.compact-table .action-danger { color:var(--state-danger); border-color:var(--state-danger-border); }.row-actions .action-danger:hover,.compact-table .action-danger:hover { color:var(--state-danger); border-color:var(--state-danger); background:var(--state-danger-bg); }.row-actions .action-enable,.row-actions .action-document { color:var(--state-success); border-color:var(--state-success-border); }.row-actions .action-enable:hover,.row-actions .action-document:hover { color:var(--state-success); border-color:var(--state-success); background:var(--state-success-bg); }.row-actions .action-detail { color:var(--accent-primary); border-color:var(--accent-border); }.row-actions .btn-action:focus-visible,.compact-table .btn-action:focus-visible { outline:2px solid var(--accent-primary); outline-offset:2px; }
    .empty-cell { padding:32px!important; text-align:center; color:var(--text-secondary); }.notice { padding:11px 14px; margin-bottom:14px; border:1px solid var(--state-success-border); background:var(--state-success-bg); color:var(--state-success); border-radius:var(--radius-sm); }.notice-error { color:var(--state-danger); border-color:var(--state-danger-border); background:var(--state-danger-bg); }.detail-row td { background:#f8fafb; }.service-detail { display:grid; grid-template-columns:1fr 1fr; gap:24px; padding:4px 12px; font-size:12px; }.service-detail ul { margin:6px 0 0; padding-left:18px; }.service-detail p { margin-top:5px; color:var(--text-secondary); }
    .modal-backdrop { position:fixed; inset:0; z-index:1200; display:grid; place-items:center; padding:20px; background:rgba(18,28,34,.46); }.operation-modal { width:min(720px,100%); max-height:min(92vh,900px); overflow:auto; padding:22px; background:var(--surface-card); border:1px solid var(--border-color); border-radius:var(--radius-md); box-shadow:0 18px 48px rgba(16,24,40,.2); }.service-modal { width:min(900px,100%); }.type-modal { width:min(560px,100%); }.modal-heading { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }.modal-heading h2 { margin:0; font-size:20px; }.modal-heading p { margin-top:5px; color:var(--text-secondary); font-size:13px; }.icon-close { width:32px; height:32px; border:1px solid var(--border-color); border-radius:4px; background:#fff; font-size:22px; cursor:pointer; }.optional-label { color:var(--text-muted); font-weight:400; }.doc-lookup-row { display:flex; gap:6px; align-items:center; }.doc-lookup-row input { flex:1; min-width:0; }.btn-lookup { height:38px; padding:0 12px; white-space:nowrap; font-size:12px; font-weight:600; }.reniec-status { display:block; margin-top:4px; font-size:11.5px; font-weight:600; }.reniec-ok { color:var(--state-success); }.reniec-warn { color:var(--text-secondary); }.form-group i { color:var(--state-danger); font-style:normal; }.form-group .text-area { height:auto; min-height:66px; padding:9px 12px; resize:vertical; }.service-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; }.span-two { grid-column:span 2; }.plate-input { text-transform:uppercase; }.materials-heading { display:flex; justify-content:space-between; align-items:center; margin:4px 0 10px; }.materials-heading h3 { margin:0; font-size:14px; }.materials-heading p { margin-top:3px; color:var(--text-secondary); font-size:12px; }.materials-heading>span { color:var(--text-secondary); font-size:12px; }.material-entry-grid { display:grid; grid-template-columns:minmax(180px,1fr) 110px auto; align-items:end; gap:10px; }.add-material { height:38px; margin-bottom:16px; white-space:nowrap; }.lines-table-wrap { max-height:190px; overflow:auto; border:1px solid var(--border-color); border-radius:var(--radius-sm); }.compact-table { min-width:560px; }.compact-table th,.compact-table td { padding:9px 10px; }.modal-actions { display:flex; justify-content:flex-end; gap:9px; padding-top:16px; border-top:1px solid var(--border-color); margin-top:16px; }
    @media(max-width:760px) { .metric-row { grid-template-columns:1fr; }.operation-filters { align-items:stretch; flex-direction:column; }.operation-search { width:100%; max-width:none; }.operation-filters .filter-select { width:100%; }.table-container { overflow-x:auto; }.data-table { min-width:960px; }.operation-modal { padding:16px; }.material-entry-grid { grid-template-columns:1fr 100px; }.material-entry-grid .form-group:first-child { grid-column:span 2; }.add-material { margin:0 0 16px; }.row-actions { justify-content:flex-start; }.row-actions .btn-action { min-height:34px; }.service-detail { grid-template-columns:1fr; gap:12px; } }
    @media(max-width:460px) { .page-header { align-items:flex-start; flex-direction:column; }.page-header .btn { width:100%; }.service-form-grid { grid-template-columns:1fr; }.span-two { grid-column:auto; }.section-tabs button { padding:11px 9px; font-size:12px; } }
  `],
})
export class TallerComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly servicioApi = inject(ServicioService);
  private readonly tipoServicioApi = inject(TipoServicioService);
  private readonly productosApi = inject(ProductoService);
  private readonly inventarioApi = inject(InventarioService);
  private readonly reniecApi = inject(ReniecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private tiposCargados = false;
  private abrirServicioAlCargar = false;

  readonly esPropietario = computed(() => this.authService.rol()?.nombre === 'propietario');

  readonly vista = signal<'historial' | 'catalogo'>(this.route.snapshot.data['vista'] === 'catalogo' ? 'catalogo' : 'historial');
  readonly servicios = signal<ServicioVista[]>([]);
  readonly tiposServicio = signal<TipoServicioVista[]>([]);
  readonly productos = signal<Producto[]>([]);
  readonly inventarios = signal<Inventario[]>([]);
  readonly modalServicio = signal(false);
  readonly modalTipo = signal(false);
  readonly modalAnulacion = signal(false);
  readonly tipoEditando = signal<TipoServicioVista | null>(null);
  readonly servicioSeleccionado = signal<ServicioVista | null>(null);
  readonly detalleAbierto = signal('');
  readonly tipoSeleccionado = signal('');
  readonly cliente = signal('');
  readonly documentoCliente = signal('');
  readonly consultandoDoc = signal(false);
  readonly estadoReniec = signal('');
  readonly reniecExito = signal(false);
  readonly placa = signal('');
  readonly vehiculo = signal('');
  readonly precioServicio = signal(0);
  readonly observaciones = signal('');
  readonly productoMaterial = signal('');
  readonly cantidadMaterial = signal(1);
  readonly lineasMateriales = signal<MaterialVista[]>([]);
  readonly nombreTipo = signal('');
  readonly descripcionTipo = signal('');
  readonly precioTipo = signal(0);
  readonly motivoAnulacion = signal('');
  readonly textoBusqueda = signal('');
  readonly busqueda = signal('');
  readonly filtroEstado = signal('');
  readonly incluirInactivos = signal(false);
  readonly mensaje = signal('');
  readonly esError = signal(false);
  readonly guardando = signal(false);

  ngOnInit(): void {
    this.refrescarServicios();
    this.refrescarTipos();
    this.productosApi.listar().subscribe({ next: (items) => this.productos.set(items), error: () => this.notificar('No fue posible cargar el catálogo de productos.', true) });
    this.recargarInventario();
    // Accesos directos desde el menú lateral (?nuevo=1)
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.get('nuevo') !== '1') return;
      this.router.navigate([], { relativeTo: this.route, queryParams: { nuevo: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (this.vista() === 'catalogo') this.abrirTipo();
      else if (this.tiposCargados) this.abrirServicio();
      else this.abrirServicioAlCargar = true;
    });
  }

  get serviciosRealizados(): number { return this.servicios().filter((item) => item.estado === 'realizado').length; }
  get ingresosServicios(): number { return this.servicios().filter((item) => item.estado === 'realizado').reduce((sum, item) => sum + item.precioServicio, 0); }
  get tiposActivos(): number { return this.tiposServicio().filter((item) => item.activo).length; }
  get tiposActivosLista(): TipoServicioVista[] { return this.tiposServicio().filter((item) => item.activo); }
  get productosActivos(): Producto[] { return this.productos().filter((item) => item.activo); }
  get serviciosFiltrados(): ServicioVista[] {
    const query = this.busqueda().trim().toLowerCase();
    return this.servicios().filter((item) => (!this.filtroEstado() || item.estado === this.filtroEstado()) && `${item.id} ${item.cliente} ${item.documentoCliente} ${item.placa} ${item.vehiculo} ${item.tipoServicio}`.toLowerCase().includes(query));
  }
  get tiposFiltrados(): TipoServicioVista[] {
    const query = this.busqueda().trim().toLowerCase();
    return this.tiposServicio().filter((item) => (this.incluirInactivos() || item.activo) && `${item.nombre} ${item.descripcion}`.toLowerCase().includes(query));
  }

  aplicarBusqueda(event: Event): void { event.preventDefault(); this.busqueda.set(this.textoBusqueda().trim()); }
  limpiarBusqueda(): void { this.textoBusqueda.set(''); this.busqueda.set(''); }
  seleccionarTipo(id: string): void {
    this.tipoSeleccionado.set(id);
    const type = this.tiposServicio().find((item) => item.id === id);
    if (type) this.precioServicio.set(type.precio);
  }
  stockDisponible(productId: string): number { return this.inventarios().find((item) => item.productoId === productId)?.stockActual ?? 0; }
  cantidadMateriales(service: ServicioVista): number { return service.materiales.reduce((sum, item) => sum + item.cantidad, 0); }

  abrirServicio(): void {
    if (!this.tiposActivosLista.length) { this.notificar('Crea o activa al menos un tipo de servicio (Servicios de taller › Tipos de servicio) antes de registrar una atención.', true); return; }
    this.tipoSeleccionado.set(''); this.cliente.set(''); this.documentoCliente.set(''); this.estadoReniec.set(''); this.reniecExito.set(false); this.consultandoDoc.set(false); this.placa.set(''); this.vehiculo.set(''); this.precioServicio.set(0); this.observaciones.set(''); this.lineasMateriales.set([]); this.productoMaterial.set(''); this.cantidadMaterial.set(1); this.modalServicio.set(true);
  }

  async alCambiarDocumento(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const limpio = input.value.replace(/\D+/g, '').slice(0, 11);
    input.value = limpio;
    this.documentoCliente.set(limpio);
    this.estadoReniec.set('');
    if (limpio.length === 8 || limpio.length === 11) {
      await this.consultarReniec(limpio);
    }
  }

  async buscarDocumentoManual(): Promise<void> {
    const doc = this.documentoCliente().replace(/\D+/g, '');
    if (doc.length === 8 || doc.length === 11) {
      await this.consultarReniec(doc);
    }
  }

  private async consultarReniec(doc: string): Promise<void> {
    this.consultandoDoc.set(true);
    this.estadoReniec.set(doc.length === 8 ? 'Consultando DNI en RENIEC…' : 'Consultando RUC en SUNAT…');
    this.reniecExito.set(false);
    const res = await this.reniecApi.consultarDocumento(doc);
    this.consultandoDoc.set(false);
    if (this.documentoCliente() !== doc) return;
    if (res) {
      this.cliente.set(res.nombreCompleto);
      this.reniecExito.set(true);
      this.estadoReniec.set(`✓ ${res.tipo} verificado: ${res.nombreCompleto}`);
    } else {
      this.reniecExito.set(false);
      this.estadoReniec.set(`No se encontró el ${doc.length === 8 ? 'DNI' : 'RUC'}; puedes ingresar el nombre manualmente.`);
    }
  }

  agregarMaterial(): void {
    const product = this.productosActivos.find((item) => item.id === this.productoMaterial());
    const quantity = this.cantidadMaterial();
    if (!product || !Number.isInteger(quantity) || quantity < 1) { this.notificar('Selecciona un material y una cantidad válida.', true); return; }
    const alreadyAdded = this.lineasMateriales().find((item) => item.productoId === product.id)?.cantidad ?? 0;
    const total = alreadyAdded + quantity;
    if (total > this.stockDisponible(product.id)) { this.notificar(`Stock insuficiente de ${product.nombre}. Disponible: ${this.stockDisponible(product.id)}.`, true); return; }
    const item: MaterialVista = { productoId: product.id, codigo: product.codigo, producto: product.nombre, cantidad: total, devuelta: 0 };
    this.lineasMateriales.update((lines) => [...lines.filter((line) => line.productoId !== product.id), item]);
    this.productoMaterial.set(''); this.cantidadMaterial.set(1);
  }

  quitarMaterial(productId: string): void { this.lineasMateriales.update((items) => items.filter((item) => item.productoId !== productId)); }

  async guardarServicio(): Promise<void> {
    const type = this.tiposActivosLista.find((item) => item.id === this.tipoSeleccionado());
    const price = this.precioServicio();
    if (!type || !Number.isFinite(price) || price < 0 || this.lineasMateriales().some((line) => line.cantidad > this.stockDisponible(line.productoId))) {
      this.notificar('Revisa el tipo, el precio y el stock disponible de los materiales.', true); this.recargarInventario(); return;
    }
    this.guardando.set(true);
    try {
      const service = await firstValueFrom(this.servicioApi.crear(
        { tipoServicioId: type.id, precio: price, observacion: this.componerObservacion() },
        crypto.randomUUID()
      ));
      for (const material of this.lineasMateriales()) {
        await firstValueFrom(this.servicioApi.agregarMaterial(service.id, { productoId: material.productoId, cantidad: material.cantidad }, crypto.randomUUID()));
      }
      this.refrescarServicios(); this.recargarInventario(); this.modalServicio.set(false); this.notificar(`Atención ${service.id} registrada.`);
    } catch (error: any) {
      this.notificar(error?.error?.mensaje ?? 'No se pudo registrar el servicio. Revisa el stock y vuelve a intentarlo.', true); this.recargarInventario();
    } finally { this.guardando.set(false); }
  }

  abrirTipo(type?: TipoServicioVista): void {
    this.tipoEditando.set(type ?? null); this.nombreTipo.set(type?.nombre ?? ''); this.descripcionTipo.set(type?.descripcion ?? ''); this.precioTipo.set(type?.precio ?? 0); this.modalTipo.set(true);
  }

  async guardarTipo(): Promise<void> {
    const name = this.nombreTipo().trim();
    const price = this.precioTipo();
    if (!name || !Number.isFinite(price) || price < 0) { this.notificar('Completa un nombre y un precio válido.', true); return; }
    const existing = this.tipoEditando();
    const descripcion = this.descripcionTipo().trim();
    this.guardando.set(true);
    try {
      if (existing) {
        await firstValueFrom(this.tipoServicioApi.actualizar(existing.id, { nombre: name, descripcion, precioReferencial: price, activo: existing.activo }));
        this.notificar('Tipo de servicio actualizado.');
      } else {
        await firstValueFrom(this.tipoServicioApi.crear({ nombre: name, descripcion, precioReferencial: price, activo: true }));
        this.notificar('Tipo de servicio creado.');
      }
      this.refrescarTipos(); this.modalTipo.set(false);
    } catch (error: any) { this.notificar(error?.error?.mensaje ?? 'No se pudo guardar el tipo de servicio.', true); }
    finally { this.guardando.set(false); }
  }

  async cambiarEstadoTipo(type: TipoServicioVista): Promise<void> {
    if (type.activo && this.servicios().some((service) => service.tipoServicioId === type.id && service.estado === 'realizado')) {
      const accepted = confirm('Este tipo tiene atenciones registradas. ¿Desactivarlo para nuevas atenciones? El historial se conservará.');
      if (!accepted) return;
    }
    try {
      await firstValueFrom(this.tipoServicioApi.cambiarEstado(type.id));
      this.refrescarTipos();
    } catch (error: any) { this.notificar(error?.error?.mensaje ?? 'No se pudo cambiar el estado del tipo de servicio.', true); }
  }

  async verDetalle(service: ServicioVista): Promise<void> {
    if (this.detalleAbierto() === service.id) { this.detalleAbierto.set(''); return; }
    this.detalleAbierto.set(service.id);
    if (!service.materiales.length) {
      const full = await this.cargarMateriales(service);
      this.servicios.update((items) => items.map((item) => (item.id === service.id ? full : item)));
    }
  }

  abrirAnulacion(service: ServicioVista): void { this.servicioSeleccionado.set(service); this.motivoAnulacion.set(''); this.modalAnulacion.set(true); }

  async confirmarAnulacion(): Promise<void> {
    const service = this.servicioSeleccionado();
    const reason = this.motivoAnulacion().trim();
    if (!service || !reason) return;
    this.guardando.set(true);
    try {
      await firstValueFrom(this.servicioApi.anular(service.id, reason, crypto.randomUUID()));
      this.refrescarServicios(); this.recargarInventario(); this.modalAnulacion.set(false); this.notificar(`Atención ${service.id} anulada y materiales reintegrados.`);
    } catch (error: any) { this.notificar(error?.error?.mensaje ?? 'No se pudo anular la atención.', true); }
    finally { this.guardando.set(false); }
  }

  cerrarModales(): void { this.modalServicio.set(false); this.modalTipo.set(false); this.modalAnulacion.set(false); }

  async imprimirComprobante(service: ServicioVista): Promise<void> {
    const popup = window.open('', '_blank', 'width=420,height=800');
    if (!popup) { this.notificar('Permite ventanas emergentes para imprimir el comprobante.', true); return; }
    if (!service.materiales.length) {
      service = await this.cargarMateriales(service);
      this.servicios.update((items) => items.map((item) => (item.id === service.id ? service : item)));
    }
    const date = new Date(service.fecha);
    const businessLogo = `${window.location.origin}/servillantaslogo.png`;
    const reference = this.escapeHtml(service.id);
    const total = service.precioServicio;
    const tax = total - total / 1.18;
    const taxable = total - tax;
    const customer = this.escapeHtml(service.cliente?.trim() || 'CLIENTE GENERAL');
    const document = service.documentoCliente?.trim() ? this.escapeHtml(service.documentoCliente) : '---';
    const plate = service.placa?.trim() ? this.escapeHtml(service.placa) : '---';
    const vehicle = service.vehiculo?.trim() ? this.escapeHtml(service.vehiculo) : '---';
    const notes = service.observaciones?.trim() ? this.escapeHtml(service.observaciones) : '---';
    const serviceRow = `<tr><td class="description"><strong>SERVICIO</strong><br>${this.escapeHtml(service.tipoServicio)}</td><td class="number">1</td><td class="number">${total.toFixed(2)}</td><td class="number">${total.toFixed(2)}</td></tr>`;
    const materialRows = service.materiales.map((mat) => `<tr><td class="description"><strong>${this.escapeHtml(mat.codigo)}</strong><br>${this.escapeHtml(mat.producto)} (material)</td><td class="number">${mat.cantidad}</td><td class="number">Incl.</td><td class="number">Incl.</td></tr>`).join('');
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprobante de servicio ${reference}</title><style>
      *{box-sizing:border-box}html{background:#e9ecef}body{width:80mm;max-width:100%;margin:18px auto;padding:6mm 5mm;background:#fff;color:#111;font:12px/1.35 Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.receipt{text-align:center}.logo{display:block;width:42mm;max-height:18mm;object-fit:contain;margin:0 auto 8px}.business{font-size:15px;font-weight:800;text-transform:uppercase}.business-meta{margin-top:2px;font-size:11px}.internal{display:inline-block;margin:8px 0 5px;padding:3px 7px;border:1px solid #111;font-size:9px;font-weight:700;letter-spacing:.4px}.legal-note{font-size:9px;font-weight:700}.document-title{margin:12px 0 1px;font-size:15px;font-weight:800}.document-number{font-size:16px;font-weight:800}.customer{margin:14px 0 10px}.customer-name{font-size:13px;font-weight:700;text-transform:uppercase}.customer-doc{margin-top:3px;font-weight:700}.date-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid #222;border-bottom:1px solid #222;font-size:10px}.items{width:100%;margin-top:8px;border-collapse:collapse;text-align:left}.items th{padding:4px 2px;border-bottom:1px solid #111;font-size:9px;text-transform:uppercase}.items td{padding:5px 2px;vertical-align:top;border-bottom:1px dotted #888;font-size:10px}.items .description{width:48%;overflow-wrap:anywhere}.items .number{text-align:right;white-space:nowrap}.summary{margin-top:8px;border-bottom:1px solid #222}.summary-row{display:flex;justify-content:space-between;gap:6px;padding:2px 0;font-weight:700}.summary-row.total{border-top:1px solid #222;margin-top:3px;padding:4px 0;font-size:19px}.payment{text-align:left;padding:6px 0;border-top:1px solid #222;border-bottom:1px solid #222;font-size:10px}.notes{margin-top:8px;text-align:left;font-size:10px;overflow-wrap:anywhere}.footer{margin-top:13px;font-size:9px}.thanks{margin:10px 0 3px;font-weight:700}.internal-disclaimer{margin-top:10px;padding-top:6px;border-top:1px dashed #555;font-size:8px;font-weight:700;text-transform:uppercase}.ref{margin-top:5px;font:8px monospace;color:#444}
      @page{size:80mm auto;margin:0}@media print{html,body{width:80mm;margin:0;background:#fff}body{padding:5mm 4mm}.logo{max-height:17mm}}
      </style></head><body><main class="receipt"><img class="logo" src="${businessLogo}" alt="Servillantas RV"><div class="business">Servillantas RV</div><div class="business-meta">Taller automotriz, llantas y lubricantes</div><div class="internal">COMPROBANTE INTERNO</div><div class="legal-note">NO VÁLIDO COMO COMPROBANTE TRIBUTARIO</div><div class="document-title">BOLETA INTERNA DE SERVICIO</div><div class="document-number">${reference}</div><section class="customer"><div class="customer-name">${customer}</div><div class="customer-doc">DNI / RUC: ${document}</div><div class="customer-doc">PLACA: ${plate} · VEHÍCULO: ${vehicle}</div></section><div class="date-row"><span>FECHA: ${date.toLocaleDateString('es-PE')}</span><span>HORA: ${date.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</span></div><table class="items"><thead><tr><th>Descripción</th><th class="number">Cant.</th><th class="number">P. Unit.</th><th class="number">Total</th></tr></thead><tbody>${serviceRow}${materialRows}</tbody></table><section class="summary"><div class="summary-row"><span>OP. GRAVADA</span><span>${taxable.toFixed(2)}</span></div><div class="summary-row"><span>I.G.V. (18%)</span><span>${tax.toFixed(2)}</span></div><div class="summary-row total"><span>TOTAL (S/)</span><span>${total.toFixed(2)}</span></div></section><div class="notes"><strong>Observaciones:</strong><br>${notes}</div><footer class="footer"><div class="thanks">¡Gracias por su preferencia!</div><div>Conserve este documento como constancia de su atención en taller.</div><div class="internal-disclaimer">Representación impresa de un comprobante interno.<br>No reemplaza una boleta electrónica autorizada por SUNAT.</div><div class="ref">Referencia: ${reference}</div></footer></main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  private componerObservacion(): string | null {
    const parts: string[] = [];
    if (this.cliente().trim()) parts.push(`Cliente: ${this.cliente().trim()}`);
    if (this.documentoCliente().trim()) parts.push(`Doc: ${this.documentoCliente().trim()}`);
    if (this.placa().trim()) parts.push(`Placa: ${this.placa().trim().toUpperCase()}`);
    if (this.vehiculo().trim()) parts.push(`Vehículo: ${this.vehiculo().trim()}`);
    if (this.observaciones().trim()) parts.push(this.observaciones().trim());
    return parts.join(' | ') || null;
  }

  private parseObservacion(texto: string | null | undefined): { cliente: string; documentoCliente: string; placa: string; vehiculo: string; observaciones: string } {
    const result = { cliente: '', documentoCliente: '', placa: '', vehiculo: '', observaciones: '' };
    if (!texto) return result;
    const notas: string[] = [];
    for (const token of texto.split(' | ')) {
      if (token.startsWith('Cliente: ')) result.cliente = token.slice(9);
      else if (token.startsWith('Doc: ')) result.documentoCliente = token.slice(5);
      else if (token.startsWith('Placa: ')) result.placa = token.slice(7);
      else if (token.startsWith('Vehículo: ')) result.vehiculo = token.slice(10);
      else notas.push(token);
    }
    result.observaciones = notas.join(' | ');
    return result;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  }

  private aServicioVista(item: ServicioResumen): ServicioVista {
    const parsed = this.parseObservacion(item.observacion);
    return {
      id: item.id,
      fecha: item.fecha,
      estado: item.estado === 'ANULADO' || item.estado === 'ANULADA' ? 'anulada' : 'realizado',
      tipoServicioId: item.tipoServicioId,
      tipoServicio: item.tipoServicioNombre,
      precioServicio: item.precio,
      motivoAnulacion: '',
      materiales: [],
      ...parsed,
    };
  }

  private aTipoVista(item: TipoServicio): TipoServicioVista {
    return { id: item.id, nombre: item.nombre, descripcion: item.descripcion ?? '', precio: item.precioReferencial ?? 0, activo: item.activo };
  }

  private async cargarMateriales(service: ServicioVista): Promise<ServicioVista> {
    try {
      const detalle = await firstValueFrom(this.servicioApi.obtenerPorId(service.id));
      const materiales: MaterialVista[] = detalle.materiales.map((linea) => {
        const product = this.productos().find((item) => item.id === linea.productoId);
        return { productoId: linea.productoId, codigo: product?.codigo ?? '—', producto: product?.nombre ?? 'Material', cantidad: linea.cantidad, devuelta: 0 };
      });
      return { ...service, materiales, motivoAnulacion: detalle.motivoAnulacion ?? '' };
    } catch { return service; }
  }

  private refrescarServicios(): void {
    this.servicioApi.listar({ sortBy: 'fecha', sortDir: 'desc', size: 100 }).subscribe({
      next: (page) => this.servicios.set(page.content.map((item) => this.aServicioVista(item))),
      error: () => this.notificar('No fue posible cargar el historial de servicios.', true),
    });
  }

  private refrescarTipos(): void {
    this.tipoServicioApi.listarTodos().subscribe({
      next: (items) => {
        this.tiposServicio.set(items.map((item) => this.aTipoVista(item)));
        this.tiposCargados = true;
        if (this.abrirServicioAlCargar) { this.abrirServicioAlCargar = false; this.abrirServicio(); }
      },
      error: () => this.notificar('No fue posible cargar el catálogo de tipos de servicio.', true),
    });
  }
  private recargarInventario(): void { this.inventarioApi.obtenerStock().subscribe({ next: (items) => this.inventarios.set(items), error: () => this.notificar('No fue posible consultar el stock actual.', true) }); }
  private notificar(text: string, error = false): void { this.mensaje.set(text); this.esError.set(error); window.setTimeout(() => { if (this.mensaje() === text) this.mensaje.set(''); }, 5000); }
}