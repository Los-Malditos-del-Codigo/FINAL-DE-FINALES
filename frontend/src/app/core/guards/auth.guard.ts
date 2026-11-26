import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Restringe rutas exclusivas del Propietario.
 * Si el usuario autenticado es Personal de atención, lo redirige a /inventario.
 */
export const propietarioGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.rol()?.nombre === 'propietario') {
    return true;
  }

  return router.createUrlTree(['/inventario']);
};
