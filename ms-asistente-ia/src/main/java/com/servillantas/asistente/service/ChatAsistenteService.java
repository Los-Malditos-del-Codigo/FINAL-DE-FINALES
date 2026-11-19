package com.servillantas.asistente.service;

import com.servillantas.asistente.domain.Mensaje;
import com.servillantas.asistente.dto.AdjuntoDto;
import com.servillantas.asistente.dto.ChatRequestDto;
import com.servillantas.asistente.dto.ChatRespuestaDto;
import com.servillantas.asistente.exception.ValidacionException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Orquesta el chat: arma el historial, llama a Gemini y guarda el intercambio. */
@Service
public class ChatAsistenteService {

    /** Marca que se agrega al mensaje guardado para listar los archivos adjuntos. */
    public static final String MARCA_ADJUNTOS = "[[adjuntos: ";

    private static final int MAX_MENSAJES_HISTORIAL = 40;
    private static final long MAX_BASE64 = 20L * 1024 * 1024;
    private static final int MAX_TEXTO_ADJUNTO = 200_000;
    private static final Set<String> MIME_BINARIOS = Set.of(
            "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf");

    static final String INSTRUCCIONES = """
            Eres el Asistente IA de Servillantas RV, una serviteca y taller automotriz en Perú (llantas, lubricantes, \
            baterías, repuestos y servicios de taller). Ayudas al personal y al propietario con cualquier consulta: \
            análisis de datos, reportes, redacción, explicaciones técnicas, ideas y lectura de archivos o imágenes.

            Forma de responder:
            - Responde siempre en español, con tono profesional y cercano. Ve al punto y estructura con títulos cortos \
            (##), listas y **negritas** cuando ayude. Usa tablas Markdown para comparar datos.
            - Moneda: soles peruanos (S/).
            - Cuando el usuario adjunte archivos o "Datos del sistema", basa tus cifras en ellos y no inventes números. \
            Si falta información, dilo.
            - Si un gráfico ayuda a entender los datos, inclúyelo como un bloque de código con el lenguaje "grafico" \
            que contenga solo JSON con esta forma:
              {"tipo":"barras|lineas|torta","titulo":"...","unidad":"S/|unidades|%","etiquetas":["..."],"series":[{"nombre":"...","valores":[1,2]}]}
              Usa "barras" para comparar categorías, "lineas" para evolución en el tiempo y "torta" solo para partes de \
            un total (una serie). Máximo 12 etiquetas y 4 series; cada serie con un valor por etiqueta.
            - Si un diagrama ayuda (procesos, flujos, relaciones), inclúyelo como bloque de código "mermaid" con \
            sintaxis "flowchart TD" (para flujos secuenciales) o "flowchart LR" (para árboles, catálogos o jerarquías \
            con varias ramas), identificadores simples (A, B, C1) y textos entre comillas dobles, por ejemplo \
            A["Paso 1: Recepción"] --> B["Paso 2: Diagnóstico"]. NUNCA empieces el texto de un nodo con "1. ", "2. " \
            ni "- " porque Mermaid lo rechaza como lista Markdown; usa "Paso 1:" o "1)" en su lugar. No uses paréntesis \
            ni punto y coma fuera de las comillas.
            - Al final de un análisis, cierra con sugerencias concretas y priorizadas cuando corresponda.
            """;

    private final GeminiClient gemini;
    private final ConversacionesService conversaciones;

    public ChatAsistenteService(GeminiClient gemini, ConversacionesService conversaciones) {
        this.gemini = gemini;
        this.conversaciones = conversaciones;
    }

    public ChatRespuestaDto enviar(UUID usuarioId, ChatRequestDto request) {
        String contenido = request.contenido() == null ? "" : request.contenido().trim();
        List<AdjuntoDto> adjuntos = request.adjuntos() == null ? List.of() : request.adjuntos();
        if (contenido.isEmpty() && adjuntos.isEmpty()) {
            throw new ValidacionException("Escribe un mensaje o adjunta al menos un archivo");
        }
        validarAdjuntos(adjuntos);

        List<Map<String, Object>> turnos = new ArrayList<>();
        if (request.conversacionId() != null) {
            List<Mensaje> historial = conversaciones.historialPropio(request.conversacionId(), usuarioId);
            int desde = Math.max(0, historial.size() - MAX_MENSAJES_HISTORIAL);
            for (Mensaje m : historial.subList(desde, historial.size())) {
                agregarTurno(turnos, "ASSISTANT".equalsIgnoreCase(m.getRolMensaje()) ? "model" : "user",
                        List.of(Map.of("text", m.getContenido())));
            }
        }
        agregarTurno(turnos, "user", partesDelMensaje(contenido, adjuntos, request.contexto()));
        // Gemini exige que la conversación empiece con un turno del usuario.
        while (!turnos.isEmpty() && "model".equals(turnos.get(0).get("role"))) {
            turnos.remove(0);
        }

        String respuesta = gemini.generar(INSTRUCCIONES, turnos);

        String guardado = contenido;
        if (!adjuntos.isEmpty()) {
            String nombres = String.join(" | ", adjuntos.stream().map(a -> a.nombre().replace("]]", "")).toList());
            guardado = (contenido.isEmpty() ? "" : contenido + "\n\n") + MARCA_ADJUNTOS + nombres + "]]";
        }
        return conversaciones.registrarIntercambio(request.conversacionId(), usuarioId,
                tituloPara(contenido, adjuntos), guardado, respuesta);
    }

    private List<Map<String, Object>> partesDelMensaje(String contenido, List<AdjuntoDto> adjuntos, String contexto) {
        List<Map<String, Object>> partes = new ArrayList<>();
        if (contexto != null && !contexto.isBlank()) {
            partes.add(Map.of("text", "Datos del sistema Servillantas RV (consultados ahora):\n" + contexto));
        }
        for (AdjuntoDto a : adjuntos) {
            if (a.datos() != null && !a.datos().isBlank()) {
                partes.add(Map.of("text", "Archivo adjunto: " + a.nombre()));
                partes.add(Map.of("inlineData", Map.of("mimeType", a.mimeType(), "data", a.datos())));
            } else if (a.texto() != null) {
                String texto = a.texto().length() > MAX_TEXTO_ADJUNTO
                        ? a.texto().substring(0, MAX_TEXTO_ADJUNTO) + "\n[… contenido recortado]"
                        : a.texto();
                partes.add(Map.of("text", "Archivo adjunto \"" + a.nombre() + "\":\n" + texto));
            }
        }
        String fecha = LocalDate.now(ZoneId.of("America/Lima")).toString();
        partes.add(Map.of("text", (contenido.isEmpty() ? "Analiza los archivos adjuntos." : contenido)
                + "\n\n(Fecha de hoy: " + fecha + ")"));
        return partes;
    }

    /** Une turnos consecutivos del mismo rol (Gemini espera roles alternados). */
    private static void agregarTurno(List<Map<String, Object>> turnos, String rol, List<Map<String, Object>> partes) {
        if (!turnos.isEmpty() && rol.equals(turnos.get(turnos.size() - 1).get("role"))) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> previas = (List<Map<String, Object>>) turnos.get(turnos.size() - 1).get("parts");
            previas.addAll(partes);
            return;
        }
        Map<String, Object> turno = new LinkedHashMap<>();
        turno.put("role", rol);
        turno.put("parts", new ArrayList<>(partes));
        turnos.add(turno);
    }

    private static void validarAdjuntos(List<AdjuntoDto> adjuntos) {
        long total = 0;
        for (AdjuntoDto a : adjuntos) {
            boolean binario = a.datos() != null && !a.datos().isBlank();
            if (binario) {
                if (a.mimeType() == null || !MIME_BINARIOS.contains(a.mimeType())) {
                    throw new ValidacionException("Formato no compatible para " + a.nombre()
                            + ". Usa imágenes PNG/JPG/WEBP, PDF o archivos de texto, Excel y Word.");
                }
                total += a.datos().length();
            } else if (a.texto() == null) {
                throw new ValidacionException("El archivo " + a.nombre() + " no tiene contenido");
            }
        }
        if (total > MAX_BASE64) {
            throw new ValidacionException("Los archivos adjuntos superan el máximo de 15 MB por mensaje");
        }
    }

    private static String tituloPara(String contenido, List<AdjuntoDto> adjuntos) {
        String base = contenido.isEmpty()
                ? (adjuntos.isEmpty() ? "Nueva conversación" : "Análisis de " + adjuntos.get(0).nombre())
                : contenido.replaceAll("\\s+", " ");
        return base.length() > 70 ? base.substring(0, 67).trim() + "…" : base;
    }
}
