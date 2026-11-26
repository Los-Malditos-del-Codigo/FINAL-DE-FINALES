import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RolUsuario {
  id: string;
  nombre: string;
  descripcion?: string;
}

export interface UsuarioSistema {
  id: string;
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  rolId: string;
  rol: string;
  activo: boolean;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrearUsuarioPayload {
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  rolId: string;
  activo: boolean;
  email: string;
  password: string;
}

export interface ActualizarUsuarioPayload {
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  rolId: string;
  activo: boolean;
  email: string;
  password?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/perfiles`;

  listar(): Observable<UsuarioSistema[]> {
    return this.http.get<UsuarioSistema[]>(this.baseUrl);
  }

  listarRoles(): Observable<RolUsuario[]> {
    return this.http.get<RolUsuario[]>(`${this.baseUrl}/roles`);
  }

  crear(payload: CrearUsuarioPayload): Observable<UsuarioSistema> {
    return this.http.post<UsuarioSistema>(this.baseUrl, payload);
  }

  actualizar(id: string, payload: ActualizarUsuarioPayload): Observable<UsuarioSistema> {
    return this.http.put<UsuarioSistema>(`${this.baseUrl}/${id}`, payload);
  }

  cambiarEstado(id: string): Observable<UsuarioSistema> {
    return this.http.patch<UsuarioSistema>(`${this.baseUrl}/${id}/estado`, {});
  }

  cambiarPassword(id: string, passwordActual: string, passwordNueva: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.baseUrl}/${id}/password`, {
      passwordActual,
      passwordNueva,
    });
  }
}
