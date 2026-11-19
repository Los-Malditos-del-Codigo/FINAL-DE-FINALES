import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Chat con el asistente. Las llamadas a Gemini las hace el microservicio ms-asistente-ia:
 * la API key vive solo en el servidor y nunca llega al navegador.
 */

export interface ConversacionIA {
  id: string;
  titulo: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MensajeIA {
  id: string;
  rol: 'usuario' | 'asistente';
  contenido: string;
  creadoEn: string;
}

export interface AdjuntoEnvio {
  nombre: string;
  mimeType?: string;
  datos?: string;
  texto?: string;
}

export interface EnvioChat {
  conversacionId?: string | null;
  contenido: string;
  adjuntos: AdjuntoEnvio[];
  contexto?: string;
}

export interface RespuestaChat {
  conversacion: ConversacionIA;
  mensajeUsuario: MensajeIA;
  respuesta: MensajeIA;
}

interface ConversacionApi { id: string; titulo: string | null; created_at: string; updated_at: string; }
interface MensajeApi { id: string; rol_mensaje: string; contenido: string; created_at: string; }

const aConversacion = (c: ConversacionApi): ConversacionIA => ({
  id: c.id,
  titulo: c.titulo?.trim() || 'Conversación sin título',
  creadoEn: c.created_at,
  actualizadoEn: c.updated_at,
});

const aMensaje = (m: MensajeApi): MensajeIA => ({
  id: m.id,
  rol: m.rol_mensaje?.toUpperCase() === 'ASSISTANT' ? 'asistente' : 'usuario',
  contenido: m.contenido,
  creadoEn: m.created_at,
});

@Injectable({ providedIn: 'root' })
export class AsistenteIaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/conversaciones-ia`;

  listar(): Observable<ConversacionIA[]> {
    const params = new HttpParams().set('size', 100).set('sortBy', 'updatedAt').set('sortDir', 'desc');
    return this.http
      .get<{ content: ConversacionApi[] }>(this.url, { params })
      .pipe(map((page) => (page?.content ?? []).map(aConversacion)));
  }

  detalle(id: string): Observable<{ conversacion: ConversacionIA; mensajes: MensajeIA[] }> {
    return this.http
      .get<{ conversacion: ConversacionApi; mensajes: MensajeApi[] }>(`${this.url}/${id}`)
      .pipe(map((r) => ({ conversacion: aConversacion(r.conversacion), mensajes: (r.mensajes ?? []).map(aMensaje) })));
  }

  enviar(envio: EnvioChat): Observable<RespuestaChat> {
    const body = {
      conversacion_id: envio.conversacionId ?? null,
      contenido: envio.contenido,
      adjuntos: envio.adjuntos.map((a) => ({ nombre: a.nombre, mime_type: a.mimeType ?? null, datos: a.datos ?? null, texto: a.texto ?? null })),
      contexto: envio.contexto || null,
    };
    return this.http
      .post<{ conversacion: ConversacionApi; mensaje_usuario: MensajeApi; respuesta: MensajeApi }>(`${this.url}/chat`, body)
      .pipe(map((r) => ({ conversacion: aConversacion(r.conversacion), mensajeUsuario: aMensaje(r.mensaje_usuario), respuesta: aMensaje(r.respuesta) })));
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Mensaje legible a partir de un error HTTP del backend (ProblemDetail). */
  static mensajeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detalle = err.error?.detail || err.error?.mensaje || err.error?.message;
      if (detalle && typeof detalle === 'string') return detalle;
      if (err.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.';
      if (err.status === 504) return 'La respuesta tardó demasiado. Intenta de nuevo con menos archivos.';
      if (err.status === 413) return 'Los archivos adjuntos son demasiado grandes.';
      return `El asistente respondió con un error (${err.status}).`;
    }
    return 'Ocurrió un error inesperado.';
  }
}
