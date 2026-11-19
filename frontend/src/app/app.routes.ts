import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

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
        redirectTo: 'productos',
      },
      // Módulo Inventario (Vista principal por defecto)
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
            loadComponent: () =>
              import('./features/inventario/movimientos-historial/movimientos-historial.component').then(
                (m) => m.MovimientosHistorialComponent
              ),
          },
        ],
      },
      // Módulo Productos
      {
        path: 'productos',
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
      // Módulo Compras (órdenes de compra)
      {
        path: 'compras',
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
      // Módulo Proveedores (separado de compras)
      {
        path: 'proveedores',
        data: { vista: 'proveedores' },
        loadComponent: () =>
          import('./features/operaciones/compras.component').then((m) => m.ComprasComponent),
      },
      // Módulo Ventas
      {
        path: 'ventas',
        loadComponent: () =>
          import('./features/operaciones/ventas.component').then((m) => m.VentasComponent),
      },
      // Módulo Servicios de taller
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
            data: { vista: 'catalogo' },
            loadComponent: () =>
              import('./features/operaciones/taller.component').then((m) => m.TallerComponent),
          },
        ],
      },
      // Módulo Asistente IA: chat con historial (Gemini vía ms-asistente-ia)
      {
        path: 'asistente-ia',
        loadComponent: () =>
          import('./features/asistente-ia/asistente-ia.component').then((m) => m.AsistenteIaComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      {
        path: 'alertas',
        loadComponent: () =>
          import('./features/alertas/alertas.component').then((m) => m.AlertasComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'productos',
  },
];
