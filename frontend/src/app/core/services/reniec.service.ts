import { Injectable } from '@angular/core';

// ─── API RENIEC / SUNAT ───────────────────────────────────────────────────────
export const RENIEC_API_URL = 'https://apiperu.dev/api/dni';
export const SUNAT_API_URL = 'https://apiperu.dev/api/ruc';
export const RENIEC_API_TOKEN = 'aba198a7722c4f1ca27f881c137ccff1ae59d81144803c29b022f5ea61c0fc34';

export interface ResultadoDocumento {
  tipo: 'DNI' | 'RUC';
  documento: string;
  nombreCompleto: string;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  direccion?: string;
  estado?: string;
}

@Injectable({ providedIn: 'root' })
export class ReniecService {
  private readonly cache = new Map<string, ResultadoDocumento>();

  /**
   * Consulta un DNI (8 dígitos) en RENIEC o RUC (11 dígitos) en SUNAT vía apiperu.dev.
   */
  async consultarDocumento(raw: string): Promise<ResultadoDocumento | null> {
    const doc = (raw ?? '').replace(/\D+/g, '');
    if (doc.length !== 8 && doc.length !== 11) {
      return null;
    }
    const cached = this.cache.get(doc);
    if (cached) {
      return cached;
    }

    if (doc.length === 8) {
      return this.consultarDni(doc);
    }
    return this.consultarRuc(doc);
  }

  async consultarDni(dni: string): Promise<ResultadoDocumento | null> {
    const limpio = (dni ?? '').replace(/\D+/g, '');
    if (limpio.length !== 8) return null;
    const cached = this.cache.get(limpio);
    if (cached) return cached;

    try {
      const response = await fetch(RENIEC_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RENIEC_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ dni: limpio }),
      });
      if (!response.ok) return null;
      const json = await response.json();
      if (!json?.success || !json?.data) return null;

      const d = json.data;
      const nombres = (d.nombres ?? '').trim();
      const apellidoPaterno = (d.apellido_paterno ?? '').trim();
      const apellidoMaterno = (d.apellido_materno ?? '').trim();
      const armado = [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' ').trim();
      const nombreCompleto = armado || (d.nombre_completo ?? '').trim();
      if (!nombreCompleto) return null;

      const resultado: ResultadoDocumento = {
        tipo: 'DNI',
        documento: limpio,
        nombreCompleto,
        nombres,
        apellidoPaterno,
        apellidoMaterno,
        direccion: (d.direccion_completa || d.direccion || '').trim(),
      };
      this.cache.set(limpio, resultado);
      return resultado;
    } catch {
      return null;
    }
  }

  async consultarRuc(ruc: string): Promise<ResultadoDocumento | null> {
    const limpio = (ruc ?? '').replace(/\D+/g, '');
    if (limpio.length !== 11) return null;
    const cached = this.cache.get(limpio);
    if (cached) return cached;

    try {
      const response = await fetch(SUNAT_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RENIEC_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ruc: limpio }),
      });
      if (!response.ok) return null;
      const json = await response.json();
      if (!json?.success || !json?.data) return null;

      const d = json.data;
      const nombreCompleto = (d.nombre_o_razon_social ?? d.nombre_completo ?? '').trim();
      if (!nombreCompleto) return null;

      const resultado: ResultadoDocumento = {
        tipo: 'RUC',
        documento: limpio,
        nombreCompleto,
        direccion: (d.direccion_completa || d.direccion || '').trim(),
        estado: (d.estado ?? '').trim(),
      };
      this.cache.set(limpio, resultado);
      return resultado;
    } catch {
      return null;
    }
  }
}
