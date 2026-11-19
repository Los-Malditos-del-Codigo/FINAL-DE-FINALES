import { describe, expect, it } from 'vitest';
import { bloquesDeRespuesta, markdownSeguro, separarAdjuntos, textoPlano } from './markdown';

describe('markdownSeguro', () => {
  it('escapa HTML antes de dar formato', () => {
    const html = markdownSeguro('Hola <script>alert(1)</script> **negrita**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>negrita</strong>');
  });

  it('convierte listas, títulos y tablas', () => {
    const html = markdownSeguro('## Resumen\n- uno\n- dos\n\n| Producto | Stock |\n|---|---:|\n| Llanta | 4 |');
    expect(html).toContain('<h3>Resumen</h3>');
    expect(html).toContain('<ul><li>uno</li><li>dos</li></ul>');
    expect(html).toContain('<th class="al-left">Producto</th>');
    expect(html).toContain('<td class="al-right">4</td>');
  });

  it('solo enlaza URLs http(s)', () => {
    expect(markdownSeguro('[web](https://servillantas.pe)')).toContain('href="https://servillantas.pe"');
    expect(markdownSeguro('[x](javascript:alert(1))')).not.toContain('href=');
  });
});

describe('bloquesDeRespuesta', () => {
  it('separa texto, gráficos y diagramas', () => {
    const contenido = [
      'Estas son las ventas:',
      '```grafico',
      '{"tipo":"barras","titulo":"Ventas","etiquetas":["Lun","Mar"],"series":[{"nombre":"S/","valores":[10,20]}]}',
      '```',
      '```mermaid',
      'flowchart TD',
      ' A["Inicio"] --> B["Fin"]',
      '```',
      'Fin del análisis.',
    ].join('\n');
    const bloques = bloquesDeRespuesta(contenido);
    expect(bloques.map((b) => b.tipo)).toEqual(['texto', 'grafico', 'diagrama', 'texto']);
    const grafico = bloques[1];
    expect(grafico.tipo === 'grafico' && grafico.grafico.series[0].valores).toEqual([10, 20]);
  });

  it('muestra como código un gráfico con JSON inválido', () => {
    const bloques = bloquesDeRespuesta('```grafico\n{roto\n```');
    expect(bloques[0].tipo).toBe('codigo');
  });
});

describe('adjuntos y texto plano', () => {
  it('separa la marca de adjuntos del mensaje del usuario', () => {
    expect(separarAdjuntos('Revisa esto\n\n[[adjuntos: factura.png | ventas.xlsx]]')).toEqual({
      texto: 'Revisa esto',
      adjuntos: ['factura.png', 'ventas.xlsx'],
    });
    expect(separarAdjuntos('Sin archivos')).toEqual({ texto: 'Sin archivos', adjuntos: [] });
  });

  it('reemplaza gráficos y diagramas al copiar', () => {
    expect(textoPlano('**Hola**\n```mermaid\nflowchart TD\n```')).toBe('Hola\n[diagrama]');
  });
});
