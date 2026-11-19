/**
 * Node 22+ expone un `localStorage` global experimental que vale `undefined`
 * si no se ejecuta con --localstorage-file, y eso oculta el de jsdom.
 * Aquí se instala un almacenamiento en memoria para que las pruebas sean estables.
 */
class AlmacenamientoEnMemoria implements Storage {
  private datos = new Map<string, string>();

  get length(): number {
    return this.datos.size;
  }

  clear(): void {
    this.datos.clear();
  }

  getItem(clave: string): string | null {
    return this.datos.has(clave) ? this.datos.get(clave)! : null;
  }

  key(indice: number): string | null {
    return Array.from(this.datos.keys())[indice] ?? null;
  }

  removeItem(clave: string): void {
    this.datos.delete(clave);
  }

  setItem(clave: string, valor: string): void {
    this.datos.set(clave, String(valor));
  }
}

for (const nombre of ['localStorage', 'sessionStorage'] as const) {
  let actual: Storage | undefined;
  try {
    actual = (globalThis as Record<string, unknown>)[nombre] as Storage | undefined;
  } catch {
    actual = undefined;
  }
  if (!actual || typeof actual.clear !== 'function') {
    Object.defineProperty(globalThis, nombre, {
      value: new AlmacenamientoEnMemoria(),
      configurable: true,
      writable: true,
    });
  }
}
