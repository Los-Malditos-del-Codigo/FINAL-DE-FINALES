import { Routes } from '@angular/router';
import { authGuard, propietarioGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      // Módulo Dashboard (HU-29 - Exclusivo Propietario; si entra Personal redirige a /inventario)
      {
        path: 'dashboard',
        canActivate: [propietarioGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      // Módulo Usuarios / Personal (HU-32, HU-33, HU-34, HU-35 - Exclusivo Propietario)
      {
        path: 'usuarios',
        canActivate: [propietarioGuard],
        loadComponent: () =>
          import('./features/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
      },
      // Módulo Inventario (HU-07, HU-08, HU-09 para Personal y Propietario; HU-10, HU-41, HU-43 para Propietario)
      {
        path: 'inventario',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/inventario/stock-panel/stock-panel.component').then(
                (m) => m.StockPanelComponent
              ),
          },
          {
            path: 'entrada',
            loadComponent: () =>
              import('./features/inventario/registrar-entrada/registrar-entrada.component').then(
                (m) => m.RegistrarEntradaComponent
              ),
          },
          {
            path: 'salida',
            loadComponent: () =>
              import('./features/inventario/registrar-salida/registrar-salida.component').then(
                (m) => m.RegistrarSalidaComponent
              ),
          },
          {
            path: 'movimientos',
            canActivate: [propietarioGuard],
            loadComponent: () =>
              import('./features/inventario/movimientos-historial/movimientos-historial.component').then(
                (m) => m.MovimientosHistorialComponent
              ),
          },
        ],
      },
      // Módulo Productos (HU-02 a HU-06, HU-11, HU-38 a HU-40 - Exclusivo Propietario)
      {
        path: 'productos',
        canActivate: [propietarioGuard],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/productos/productos-list/productos-list.component').then(
                (m) => m.ProductosListComponent
              ),
          },
          {
            path: 'nuevo',
            loadComponent: () =>
              import('./features/productos/producto-wizard/producto-wizard.component').then(
                (m) => m.ProductoWizardComponent
              ),
          },
          {
            path: 'catalogos',
            loadComponent: () =>
              import('./features/productos/catalogos-admin/catalogos-admin.component').then(
                (m) => m.CatalogosAdminComponent
              ),
          },
        ],
      },
      // Módulo Compras (HU-16, HU-17, HU-46, HU-47, HU-48 - Exclusivo Propietario)
      {
        path: 'compras',
        canActivate: [propietarioGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'ordenes' },
          {
            path: 'ordenes',
            data: { vista: 'compras' },
            loadComponent: () =>
              import('./features/operaciones/compras.component').then((m) => m.ComprasComponent),
          },
        ],
      },
      // Módulo Proveedores (HU-14, HU-15, HU-44, HU-45 - Exclusivo Propietario)
      {
        path: 'proveedores',
        canActivate: [propietarioGuard],
        data: { vista: 'proveedores' },
        loadComponent: () =>
          import('./features/operaciones/compras.component').then((m) => m.ComprasComponent),
      },
      // Módulo Ventas (HU-18 y HU-50 Personal/Propietario; HU-19, HU-49 y HU-51 Propietario)
      {
        path: 'ventas',
        loadComponent: () =>
          import('./features/operaciones/ventas.component').then((m) => m.VentasComponent),
      },
      // Módulo Servicios de taller (HU-20, HU-21, HU-54 Personal/Propietario; HU-22, HU-52, HU-53 Propietario)
      {
        path: 'taller',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'servicios' },
          {
            path: 'servicios',
            data: { vista: 'historial' },
            loadComponent: () =>
              import('./features/operaciones/taller.component').then((m) => m.TallerComponent),
          },
          {
            path: 'tipos',
            canActivate: [propietarioGuard],
            data: { vista: 'catalogo' },
            loadComponent: () =>
              import('./features/operaciones/taller.component').then((m) => m.TallerComponent),
          },
        ],
      },
      // Módulo Asistente IA (HU-30 - Personal y Propietario)
      {
        path: 'asistente-ia',
        loadComponent: () =>
          import('./features/asistente-ia/asistente-ia.component').then((m) => m.AsistenteIaComponent),
      },
      // Módulo Reportes (HU-23, HU-25, HU-27, HU-55, HU-56 - Exclusivo Propietario)
      {
        path: 'reportes',
        canActivate: [propietarioGuard],
        loadComponent: () =>
          import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      // Módulo Alertas (HU-13, HU-42 - Exclusivo Propietario)
      {
        path: 'alertas',
        canActivate: [propietarioGuard],
        loadComponent: () =>
          import('./features/alertas/alertas.component').then((m) => m.AlertasComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
