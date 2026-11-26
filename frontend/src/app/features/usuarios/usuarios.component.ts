import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ReniecService } from '../../core/services/reniec.service';
import { RolUsuario, UsuarioSistema, UsuariosService } from '../../core/services/usuarios.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container users-page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Gestión de personal y usuarios</h1>
          <p class="page-subtitle">Administra las cuentas del personal, sus roles de acceso y estado activo en el sistema (HU-32, HU-33, HU-34, HU-35).</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="abrirModalPassword()">Cambiar mi contraseña</button>
          <button type="button" class="btn btn-primary" (click)="abrirModalUsuario()">+ Registrar personal</button>
        </div>
      </header>

      @if (mensaje()) {
        <div class="notice" [class.notice-error]="esError()">{{ mensaje() }}</div>
      }

      <section class="metric-row" aria-label="Resumen de usuarios">
        <div class="metric"><span>Personal registrado</span><strong>{{ usuarios().length }}</strong></div>
        <div class="metric"><span>Cuentas activas</span><strong>{{ usuariosActivos }}</strong></div>
        <div class="metric"><span>Propietarios / Personal</span><strong>{{ totalPropietarios }} / {{ totalPersonal }}</strong></div>
      </section>

      <div class="filters-card operation-filters">
        <form class="operation-search" role="search" (submit)="aplicarBusqueda($event)">
          <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
          <input class="search-input" type="search" aria-label="Buscar personal" placeholder="Buscar por nombre, apellido, correo o teléfono…" [value]="textoBusqueda()" (input)="textoBusqueda.set($any($event.target).value)" />
          @if (textoBusqueda() || busqueda()) {
            <button class="clear-search" type="button" aria-label="Limpiar búsqueda" (click)="limpiarBusqueda()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
          }
          <button class="search-submit" type="submit"><span>Buscar</span></button>
        </form>
        <div class="filter-controls">
          <select class="form-control filter-select" aria-label="Filtrar por rol" [value]="filtroRol()" (change)="filtroRol.set($any($event.target).value)">
            <option value="">Todos los roles</option>
            <option value="PROPIETARIO">Propietario</option>
            <option value="PERSONAL">Personal de atención</option>
          </select>
          <label class="checkbox-label">
            <input type="checkbox" [checked]="mostrarInactivos()" (change)="mostrarInactivos.set($any($event.target).checked)" />
            <span>Incluir inactivos</span>
          </label>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>TRABAJADOR</th>
              <th>CORREO ELECTRÓNICO</th>
              <th>TELÉFONO</th>
              <th>ROL ASIGNADO</th>
              <th>ESTADO</th>
              <th>REGISTRO</th>
              <th class="text-right">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            @for (u of usuariosFiltrados; track u.id) {
              <tr [class.row-inactive]="!u.activo">
                <td>
                  <strong>{{ u.nombres }} {{ u.apellidos || '' }}</strong>
                  @if (u.id === authService.perfil()?.id) {
                    <small class="current-tag">Tu cuenta actual</small>
                  }
                </td>
                <td class="font-mono">{{ u.email }}</td>
                <td>{{ u.telefono || '—' }}</td>
                <td>
                  <span class="badge" [class.badge-role-owner]="esRolPropietario(u.rol)" [class.badge-neutral]="!esRolPropietario(u.rol)">
                    {{ esRolPropietario(u.rol) ? 'Propietario' : 'Personal de atención' }}
                  </span>
                </td>
                <td>
                  <span class="badge" [class.badge-success]="u.activo" [class.badge-neutral]="!u.activo">
                    {{ u.activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td>{{ u.createdAt | date:'dd/MM/yyyy' }}</td>
                <td class="text-right">
                  <div class="row-actions">
                    <button type="button" class="btn-action" (click)="abrirModalUsuario(u)">Editar</button>
                    @if (u.id !== authService.perfil()?.id) {
                      <button
                        type="button"
                        class="btn-action"
                        [class.action-danger]="u.activo"
                        [class.action-enable]="!u.activo"
                        (click)="cambiarEstado(u)"
                      >
                        {{ u.activo ? 'Desactivar' : 'Activar' }}
                      </button>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty-cell">No se encontraron trabajadores con los filtros aplicados.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Registrar / Editar Personal (HU-32, HU-34) -->
    @if (modalUsuario()) {
      <div class="modal-backdrop" (click)="cerrarModales()">
        <section class="operation-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" (click)="$event.stopPropagation()">
          <header class="modal-heading">
            <div>
              <h2 id="user-modal-title">{{ usuarioEditando ? 'Modificar trabajador' : 'Registrar nuevo personal' }}</h2>
              <p>Ingresa el DNI para autocompletar nombres y apellidos con RENIEC y asigna su rol.</p>
            </div>
            <button class="icon-close" type="button" aria-label="Cerrar" (click)="cerrarModales()">✕</button>
          </header>

          <form [formGroup]="usuarioForm" (ngSubmit)="guardarUsuario()">
            <div class="form-grid-2">
              <div class="form-group">
                <label for="user-dni">DNI <span class="optional-label">(autocompleta RENIEC)</span></label>
                <div class="doc-lookup-row">
                  <input id="user-dni" class="form-control" inputmode="numeric" maxlength="8" placeholder="8 dígitos del DNI" [value]="dniBusqueda()" (input)="alCambiarDni($event)" />
                  <button type="button" class="btn btn-secondary btn-lookup" [disabled]="consultandoDni() || dniBusqueda().length !== 8" (click)="buscarDniManual()">
                    {{ consultandoDni() ? 'Buscando…' : 'RENIEC' }}
                  </button>
                </div>
                @if (estadoReniec()) {
                  <small class="reniec-status" [class.reniec-ok]="reniecExito()" [class.reniec-warn]="!reniecExito()">{{ estadoReniec() }}</small>
                }
              </div>

              <div class="form-group">
                <label for="user-phone">Teléfono</label>
                <input id="user-phone" class="form-control" formControlName="telefono" placeholder="Ej. 987654321" />
              </div>

              <div class="form-group">
                <label for="user-names">Nombres <i>*</i></label>
                <input id="user-names" class="form-control" formControlName="nombres" placeholder="Nombres del trabajador" />
              </div>

              <div class="form-group">
                <label for="user-lastnames">Apellidos</label>
                <input id="user-lastnames" class="form-control" formControlName="apellidos" placeholder="Apellidos del trabajador" />
              </div>

              <div class="form-group span-two">
                <label for="user-email">Correo electrónico (usuario de acceso) <i>*</i></label>
                <input id="user-email" type="email" class="form-control" formControlName="email" placeholder="trabajador@servillantas.pe" />
              </div>

              <div class="form-group">
                <label for="user-role">Rol en el sistema <i>*</i></label>
                <select id="user-role" class="form-control" formControlName="rolId">
                  @for (r of roles(); track r.id) {
                    <option [value]="r.id">{{ esRolPropietario(r.nombre) ? 'Propietario (Acceso total)' : 'Personal de atención (Operaciones)' }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label for="user-status">Estado de la cuenta</label>
                <select id="user-status" class="form-control" formControlName="activo">
                  <option [ngValue]="true">Activo (Puede iniciar sesión)</option>
                  <option [ngValue]="false">Inactivo (Acceso bloqueado)</option>
                </select>
              </div>

              <div class="form-group span-two">
                <label for="user-password">
                  {{ usuarioEditando ? 'Nueva contraseña (dejar vacío para mantener la actual)' : 'Contraseña inicial *' }}
                </label>
                <input id="user-password" type="password" class="form-control" formControlName="password" placeholder="Mínimo 6 caracteres" />
              </div>
            </div>

            <footer class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="cerrarModales()">Cancelar</button>
              <button type="submit" class="btn btn-primary" [disabled]="guardando() || usuarioForm.invalid || (!usuarioEditando && !usuarioForm.controls.password.value.trim())">
                {{ guardando() ? 'Guardando…' : (usuarioEditando ? 'Guardar cambios' : 'Registrar trabajador') }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    }

    <!-- Modal: Cambiar mi contraseña (HU-35) -->
    @if (modalPassword()) {
      <div class="modal-backdrop" (click)="cerrarModales()">
        <section class="operation-modal narrow-modal" role="dialog" aria-modal="true" aria-labelledby="pwd-modal-title" (click)="$event.stopPropagation()">
          <header class="modal-heading">
            <div>
              <h2 id="pwd-modal-title">Cambiar mi contraseña</h2>
              <p>Actualiza la clave de acceso de tu cuenta ({{ authService.perfil()?.email }}).</p>
            </div>
            <button class="icon-close" type="button" aria-label="Cerrar" (click)="cerrarModales()">✕</button>
          </header>

          <form [formGroup]="passwordForm" (ngSubmit)="guardarPassword()">
            <div class="form-group">
              <label for="pwd-current">Contraseña actual <i>*</i></label>
              <input id="pwd-current" type="password" class="form-control" formControlName="passwordActual" placeholder="Ingresa tu contraseña actual" />
            </div>
            <div class="form-group">
              <label for="pwd-new">Nueva contraseña <i>*</i></label>
              <input id="pwd-new" type="password" class="form-control" formControlName="passwordNueva" placeholder="Mínimo 6 caracteres" />
            </div>
            <div class="form-group">
              <label for="pwd-confirm">Confirmar nueva contraseña <i>*</i></label>
              <input id="pwd-confirm" type="password" class="form-control" formControlName="confirmarPassword" placeholder="Repite la nueva contraseña" />
            </div>

            <footer class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="cerrarModales()">Cancelar</button>
              <button type="submit" class="btn btn-primary" [disabled]="guardando() || passwordForm.invalid">
                {{ guardando() ? 'Actualizando…' : 'Actualizar contraseña' }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    }
  `,
  styles: [`
    .users-page { max-width: 1360px; margin: 0 auto; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .metric-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric { padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--surface-card); display: flex; flex-direction: column; gap: 6px; }
    .metric span { color: var(--text-secondary); font-size: 12px; }
    .metric strong { font: 600 22px var(--font-mono); }
    .operation-filters { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
    .operation-search { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 260px; max-width: 600px; height: 44px; padding: 4px 5px 4px 12px; background: #fff; border: 1px solid var(--border-strong); border-radius: var(--radius-md); }
    .search-icon { flex: 0 0 18px; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; color: var(--text-muted); }
    .search-input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 13px; }
    .clear-search { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; }
    .search-submit { height: 34px; padding: 0 13px; border: 1px solid var(--accent-primary); border-radius: 4px; background: var(--accent-primary); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
    .filter-controls { display: flex; align-items: center; gap: 14px; }
    .filter-select { width: 200px; }
    .checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
    .current-tag { display: block; color: var(--accent-primary); font-size: 11px; font-weight: 600; }
    .badge-role-owner { background: var(--brand-lime-soft); color: var(--brand-ink); border: 1px solid var(--brand-lime-strong); }
    .row-actions { display: flex; justify-content: flex-end; gap: 6px; }
    .row-actions .btn-action { display: inline-flex; min-height: 30px; align-items: center; justify-content: center; padding: 5px 9px; border: 1px solid var(--border-color); border-radius: 4px; background: #fff; color: var(--text-secondary); font-size: 11px; font-weight: 600; cursor: pointer; }
    .row-actions .btn-action:hover { border-color: var(--accent-border); background: var(--accent-subtle); color: var(--accent-primary); }
    .row-actions .action-danger { color: var(--state-danger); border-color: var(--state-danger-border); }
    .row-actions .action-danger:hover { background: var(--state-danger-bg); color: var(--state-danger); }
    .row-actions .action-enable { color: var(--state-success); border-color: var(--state-success-border); }
    .row-actions .action-enable:hover { background: var(--state-success-bg); color: var(--state-success); }
    .empty-cell { padding: 32px !important; text-align: center; color: var(--text-secondary); }
    .notice { padding: 11px 14px; margin-bottom: 14px; border: 1px solid var(--state-success-border); background: var(--state-success-bg); color: var(--state-success); border-radius: var(--radius-sm); }
    .notice-error { color: var(--state-danger); border-color: var(--state-danger-border); background: var(--state-danger-bg); }
    .modal-backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; background: rgba(18, 28, 34, .46); }
    .operation-modal { width: min(640px, 100%); max-height: 92vh; overflow: auto; padding: 22px; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: 0 18px 48px rgba(16, 24, 40, .2); }
    .narrow-modal { width: min(460px, 100%); }
    .modal-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .modal-heading h2 { margin: 0; font-size: 20px; }
    .modal-heading p { margin-top: 5px; color: var(--text-secondary); font-size: 13px; }
    .icon-close { width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: 4px; background: #fff; font-size: 16px; cursor: pointer; }
    .form-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
    .span-two { grid-column: span 2; }
    .form-group i { color: var(--state-danger); font-style: normal; }
    .optional-label { color: var(--text-muted); font-weight: 400; }
    .doc-lookup-row { display: flex; gap: 6px; align-items: center; }
    .doc-lookup-row input { flex: 1; min-width: 0; }
    .btn-lookup { height: 38px; padding: 0 12px; white-space: nowrap; font-size: 12px; font-weight: 600; }
    .reniec-status { display: block; margin-top: 4px; font-size: 11.5px; font-weight: 600; }
    .reniec-ok { color: var(--state-success); }
    .reniec-warn { color: var(--text-secondary); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 9px; padding-top: 16px; border-top: 1px solid var(--border-color); margin-top: 16px; }
    @media (max-width: 640px) { .metric-row, .form-grid-2 { grid-template-columns: 1fr; } .span-two { grid-column: auto; } }
  `],
})
export class UsuariosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly usuariosApi = inject(UsuariosService);
  private readonly reniecApi = inject(ReniecService);
  readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly usuarios = signal<UsuarioSistema[]>([]);
  readonly roles = signal<RolUsuario[]>([]);
  readonly modalUsuario = signal(false);
  readonly modalPassword = signal(false);
  readonly textoBusqueda = signal('');
  readonly busqueda = signal('');
  readonly filtroRol = signal('');
  readonly mostrarInactivos = signal(true);
  readonly mensaje = signal('');
  readonly esError = signal(false);
  readonly guardando = signal(false);

  readonly dniBusqueda = signal('');
  readonly consultandoDni = signal(false);
  readonly estadoReniec = signal('');
  readonly reniecExito = signal(false);

  usuarioEditando: UsuarioSistema | null = null;

  readonly usuarioForm = this.fb.nonNullable.group({
    nombres: ['', [Validators.required, Validators.maxLength(100)]],
    apellidos: ['', [Validators.maxLength(100)]],
    telefono: ['', [Validators.maxLength(30)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    rolId: ['', [Validators.required]],
    activo: [true],
    password: [''],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    passwordActual: ['', [Validators.required]],
    passwordNueva: ['', [Validators.required, Validators.minLength(6)]],
    confirmarPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.cargarDatos();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.get('nuevo') === '1') {
        this.router.navigate([], { relativeTo: this.route, queryParams: { nuevo: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.abrirModalUsuario();
      } else if (params.get('password') === '1') {
        this.router.navigate([], { relativeTo: this.route, queryParams: { password: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.abrirModalPassword();
      }
    });
  }

  get usuariosActivos(): number {
    return this.usuarios().filter((u) => u.activo).length;
  }

  get totalPropietarios(): number {
    return this.usuarios().filter((u) => this.esRolPropietario(u.rol)).length;
  }

  get totalPersonal(): number {
    return this.usuarios().filter((u) => !this.esRolPropietario(u.rol)).length;
  }

  get usuariosFiltrados(): UsuarioSistema[] {
    const q = this.busqueda().trim().toLowerCase();
    const rol = this.filtroRol().toUpperCase();
    return this.usuarios().filter((u) => {
      if (!this.mostrarInactivos() && !u.activo) return false;
      if (rol && (u.rol ?? '').toUpperCase() !== rol) return false;
      if (!q) return true;
      return `${u.nombres} ${u.apellidos ?? ''} ${u.email} ${u.telefono ?? ''} ${u.rol}`.toLowerCase().includes(q);
    });
  }

  esRolPropietario(nombreRol: string | undefined): boolean {
    return (nombreRol ?? '').toUpperCase() === 'PROPIETARIO';
  }

  cargarDatos(): void {
    this.usuariosApi.listar().subscribe({
      next: (lista) => this.usuarios.set(lista),
      error: () => this.notificar('No fue posible cargar la lista de personal.', true),
    });
    this.usuariosApi.listarRoles().subscribe({
      next: (lista) => this.roles.set(lista),
      error: () => this.notificar('No fue posible cargar los roles del sistema.', true),
    });
  }

  aplicarBusqueda(event: Event): void {
    event.preventDefault();
    this.busqueda.set(this.textoBusqueda().trim());
  }

  limpiarBusqueda(): void {
    this.textoBusqueda.set('');
    this.busqueda.set('');
  }

  abrirModalUsuario(u?: UsuarioSistema): void {
    this.usuarioEditando = u ?? null;
    this.dniBusqueda.set('');
    this.estadoReniec.set('');
    this.reniecExito.set(false);
    const rolPersonal = this.roles().find((r) => !this.esRolPropietario(r.nombre)) ?? this.roles()[0];
    this.usuarioForm.reset(
      u
        ? {
            nombres: u.nombres,
            apellidos: u.apellidos ?? '',
            telefono: u.telefono ?? '',
            email: u.email,
            rolId: u.rolId,
            activo: u.activo,
            password: '',
          }
        : {
            nombres: '',
            apellidos: '',
            telefono: '',
            email: '',
            rolId: rolPersonal?.id ?? '',
            activo: true,
            password: '',
          }
    );
    this.modalUsuario.set(true);
  }

  abrirModalPassword(): void {
    this.passwordForm.reset({ passwordActual: '', passwordNueva: '', confirmarPassword: '' });
    this.modalPassword.set(true);
  }

  cerrarModales(): void {
    this.modalUsuario.set(false);
    this.modalPassword.set(false);
  }

  async alCambiarDni(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const limpio = input.value.replace(/\D+/g, '').slice(0, 8);
    input.value = limpio;
    this.dniBusqueda.set(limpio);
    this.estadoReniec.set('');
    if (limpio.length === 8) {
      await this.consultarReniec(limpio);
    }
  }

  async buscarDniManual(): Promise<void> {
    if (this.dniBusqueda().length === 8) {
      await this.consultarReniec(this.dniBusqueda());
    }
  }

  private async consultarReniec(dni: string): Promise<void> {
    this.consultandoDni.set(true);
    this.estadoReniec.set('Consultando DNI en RENIEC…');
    this.reniecExito.set(false);
    const res = await this.reniecApi.consultarDni(dni);
    this.consultandoDni.set(false);
    if (this.dniBusqueda() !== dni) return;
    if (res) {
      const apellidos = [res.apellidoPaterno, res.apellidoMaterno].filter(Boolean).join(' ').trim();
      this.usuarioForm.patchValue({
        nombres: res.nombres || res.nombreCompleto,
        apellidos: apellidos || this.usuarioForm.controls.apellidos.value,
      });
      this.reniecExito.set(true);
      this.estadoReniec.set(`✓ DNI verificado: ${res.nombreCompleto}`);
    } else {
      this.reniecExito.set(false);
      this.estadoReniec.set('No se encontró el DNI; puedes escribir los nombres manualmente.');
    }
  }

  guardarUsuario(): void {
    if (this.usuarioForm.invalid) return;
    const val = this.usuarioForm.getRawValue();
    if (!this.usuarioEditando && val.password.trim().length < 6) {
      this.notificar('La contraseña inicial debe tener al menos 6 caracteres.', true);
      return;
    }
    this.guardando.set(true);
    const payload = {
      nombres: val.nombres.trim(),
      apellidos: val.apellidos.trim() || null,
      telefono: val.telefono.trim() || null,
      email: val.email.trim().toLowerCase(),
      rolId: val.rolId,
      activo: val.activo,
      password: val.password.trim(),
    };

    const req$ = this.usuarioEditando
      ? this.usuariosApi.actualizar(this.usuarioEditando.id, payload)
      : this.usuariosApi.crear(payload);

    req$.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modalUsuario.set(false);
        this.cargarDatos();
        this.notificar(this.usuarioEditando ? 'Datos del trabajador actualizados.' : 'Trabajador registrado correctamente.');
      },
      error: (err) => {
        this.guardando.set(false);
        this.notificar(err?.error?.mensaje || err?.error?.message || 'No se pudo guardar el trabajador.', true);
      },
    });
  }

  cambiarEstado(u: UsuarioSistema): void {
    this.usuariosApi.cambiarEstado(u.id).subscribe({
      next: (actualizado) => {
        this.usuarios.update((lista) => lista.map((item) => (item.id === actualizado.id ? actualizado : item)));
        this.notificar(`Cuenta de ${u.nombres} ${actualizado.activo ? 'activada' : 'desactivada'}.`);
      },
      error: (err) => this.notificar(err?.error?.mensaje || 'No se pudo cambiar el estado del trabajador.', true),
    });
  }

  guardarPassword(): void {
    if (this.passwordForm.invalid) return;
    const { passwordActual, passwordNueva, confirmarPassword } = this.passwordForm.getRawValue();
    if (passwordNueva !== confirmarPassword) {
      this.notificar('La nueva contraseña y su confirmación no coinciden.', true);
      return;
    }
    const id = this.authService.perfil()?.id;
    if (!id) return;
    this.guardando.set(true);
    this.usuariosApi.cambiarPassword(id, passwordActual, passwordNueva).subscribe({
      next: () => {
        this.guardando.set(false);
        this.modalPassword.set(false);
        this.notificar('Tu contraseña ha sido actualizada correctamente.');
      },
      error: (err) => {
        this.guardando.set(false);
        this.notificar(err?.error?.mensaje || err?.error?.message || 'No se pudo cambiar la contraseña.', true);
      },
    });
  }

  private notificar(text: string, error = false): void {
    this.mensaje.set(text);
    this.esError.set(error);
    window.setTimeout(() => {
      if (this.mensaje() === text) this.mensaje.set('');
    }, 5000);
  }
}
