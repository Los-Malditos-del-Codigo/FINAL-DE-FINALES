package com.servillantas.asistente.service;

import com.servillantas.asistente.exception.GeminiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cliente de la API REST de Google Gemini. La API key vive solo en el servidor
 * (variable de entorno GEMINI_API_KEY) y nunca se envía al navegador ni se registra en logs.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);
    private static final String API = "https://generativelanguage.googleapis.com/v1beta";
    private static final Pattern VERSION = Pattern.compile("gemini-(\\d+(?:\\.\\d+)?)");
    private static final Pattern EXCLUIDOS = Pattern.compile("image|tts|audio|live|embedding|robotics|computer-use|native");

    private final String apiKey;
    private final String modeloConfigurado;
    private final RestClient http;
    private volatile String modeloResuelto;

    public GeminiClient(
            @Value("${app.gemini.api-key:}") String apiKey,
            @Value("${app.gemini.model:}") String modelo,
            @Value("${app.gemini.timeout-seconds:110}") long timeoutSegundos
    ) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.modeloConfigurado = modelo == null ? "" : modelo.trim();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSegundos));
        this.http = RestClient.builder()
                .baseUrl(API)
                .requestFactory(factory)
                .defaultHeader("x-goog-api-key", this.apiKey)
                .build();
    }

    public boolean configurado() {
        return !apiKey.isEmpty();
    }

    /**
     * Genera una respuesta a partir del historial.
     *
     * @param instruccionSistema instrucciones fijas del asistente
     * @param contenidos         turnos en formato Gemini: {role: user|model, parts: [...]}
     */
    public String generar(String instruccionSistema, List<Map<String, Object>> contenidos) {
        if (!configurado()) {
            throw new GeminiException(
                    "El asistente de IA no está configurado: falta la variable GEMINI_API_KEY en el servidor.",
                    GeminiException.NO_CONFIGURADA, HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            return llamar(modelo(), instruccionSistema, contenidos);
        } catch (GeminiException e) {
            if (!e.esModeloNoDisponible()) throw e;
            log.warn("El modelo {} no está disponible; se buscará otro.", modeloResuelto);
            modeloResuelto = null;
            return llamar(modelo(), instruccionSistema, contenidos);
        }
    }

    /** Modelo en uso (configurado o el mejor disponible para la key). */
    public String modelo() {
        if (modeloResuelto == null) {
            modeloResuelto = modeloConfigurado.isEmpty() ? elegirModelo() : modeloConfigurado;
            log.info("Asistente IA usando el modelo {}", modeloResuelto);
        }
        return modeloResuelto;
    }

    @SuppressWarnings("unchecked")
    private String llamar(String modelo, String sistema, List<Map<String, Object>> contenidos) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("systemInstruction", Map.of("parts", List.of(Map.of("text", sistema))));
        body.put("contents", contenidos);
        body.put("generationConfig", Map.of("temperature", 0.6, "maxOutputTokens", 8192));

        Map<String, Object> respuesta = ejecutar(() -> http.post()
                .uri("/models/{modelo}:generateContent", modelo)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class));

        List<Map<String, Object>> candidatos = (List<Map<String, Object>>) respuesta.getOrDefault("candidates", List.of());
        if (candidatos.isEmpty()) {
            Object feedback = respuesta.get("promptFeedback");
            String motivo = feedback instanceof Map<?, ?> f ? String.valueOf(f.get("blockReason")) : null;
            throw new GeminiException(
                    motivo != null && !"null".equals(motivo)
                            ? "Gemini rechazó la solicitud (" + motivo + "). Reformula el mensaje o revisa los archivos."
                            : "Gemini no devolvió ninguna respuesta. Intenta de nuevo.",
                    GeminiException.RESPUESTA, HttpStatus.BAD_GATEWAY);
        }
        Map<String, Object> candidato = candidatos.get(0);
        Map<String, Object> contenido = (Map<String, Object>) candidato.getOrDefault("content", Map.of());
        List<Map<String, Object>> partes = (List<Map<String, Object>>) contenido.getOrDefault("parts", List.of());
        StringBuilder texto = new StringBuilder();
        for (Map<String, Object> parte : partes) {
            if (Boolean.TRUE.equals(parte.get("thought"))) continue;
            Object t = parte.get("text");
            if (t != null) texto.append(t);
        }
        String resultado = texto.toString().trim();
        if (resultado.isEmpty()) {
            boolean largo = "MAX_TOKENS".equals(candidato.get("finishReason"));
            throw new GeminiException(
                    largo ? "La respuesta superó el límite de longitud. Pide algo más acotado."
                          : "Gemini devolvió una respuesta vacía. Intenta de nuevo.",
                    GeminiException.RESPUESTA, HttpStatus.BAD_GATEWAY);
        }
        return resultado;
    }

    @SuppressWarnings("unchecked")
    private String elegirModelo() {
        Map<String, Object> respuesta = ejecutar(() -> http.get()
                .uri("/models?pageSize=200")
                .retrieve()
                .body(Map.class));
        List<Map<String, Object>> modelos = (List<Map<String, Object>>) respuesta.getOrDefault("models", List.of());
        List<String> candidatos = new ArrayList<>();
        for (Map<String, Object> m : modelos) {
            List<String> metodos = (List<String>) m.getOrDefault("supportedGenerationMethods", List.of());
            String id = String.valueOf(m.get("name")).replaceFirst("^models/", "");
            if (metodos.contains("generateContent") && id.contains("gemini") && !EXCLUIDOS.matcher(id).find()) {
                candidatos.add(id);
            }
        }
        return candidatos.stream()
                .max(Comparator.comparingDouble(GeminiClient::puntaje))
                .orElseThrow(() -> new GeminiException(
                        "La API key no tiene modelos Gemini disponibles para generar texto.",
                        GeminiException.MODELO, HttpStatus.BAD_GATEWAY));
    }

    /** Prefiere el "flash" estable más reciente; luego "pro" y "lite". Las versiones preview solo si no hay estables. */
    static double puntaje(String id) {
        Matcher m = VERSION.matcher(id);
        double p = m.find() ? Double.parseDouble(m.group(1)) * 100 : 0;
        if (id.contains("flash") && !id.contains("lite")) p += 30;
        else if (id.contains("pro")) p += 20;
        else if (id.contains("lite")) p += 10;
        if (id.contains("preview") || id.contains("exp")) p -= 1000;
        if (id.contains("latest")) p -= 5;
        return p;
    }

    private <T> T ejecutar(java.util.function.Supplier<T> llamada) {
        try {
            T resultado = llamada.get();
            if (resultado == null) {
                throw new GeminiException("Gemini respondió sin contenido.", GeminiException.RESPUESTA, HttpStatus.BAD_GATEWAY);
            }
            return resultado;
        } catch (RestClientResponseException e) {
            throw traducir(e.getStatusCode().value(), e.getResponseBodyAsString());
        } catch (ResourceAccessException e) {
            throw new GeminiException(
                    "Gemini tardó demasiado en responder o no se pudo conectar. Intenta de nuevo con menos archivos.",
                    GeminiException.TIEMPO, HttpStatus.GATEWAY_TIMEOUT);
        }
    }

    static GeminiException traducir(int status, String cuerpo) {
        String texto = cuerpo == null ? "" : cuerpo;
        String mensaje = extraerMensaje(texto);
        if (texto.toLowerCase().contains("leaked")) {
            return new GeminiException(
                    "Google bloqueó la API key de Gemini porque fue publicada. Genera una nueva en Google AI Studio y colócala en GEMINI_API_KEY del archivo .env del servidor.",
                    GeminiException.KEY_BLOQUEADA, HttpStatus.BAD_GATEWAY);
        }
        if (texto.contains("API_KEY_INVALID") || texto.toLowerCase().contains("api key not valid") || status == 401) {
            return new GeminiException(
                    "La API key de Gemini configurada en el servidor no es válida.",
                    GeminiException.KEY_INVALIDA, HttpStatus.BAD_GATEWAY);
        }
        if (status == 429) {
            return new GeminiException(
                    "Se alcanzó el límite de uso de Gemini. Espera un momento y vuelve a intentarlo.",
                    GeminiException.CUOTA, HttpStatus.TOO_MANY_REQUESTS);
        }
        if (status == 404) {
            return new GeminiException("El modelo de Gemini no está disponible.", GeminiException.MODELO, HttpStatus.BAD_GATEWAY);
        }
        if (status == 400 && texto.toLowerCase().matches("(?s).*(too large|payload|exceeds).*")) {
            return new GeminiException(
                    "Los archivos adjuntos son demasiado grandes para una sola consulta.",
                    GeminiException.RESPUESTA, HttpStatus.PAYLOAD_TOO_LARGE);
        }
        if (status == 403) {
            return new GeminiException(
                    "La API key de Gemini no tiene permiso para esta operación." + (mensaje.isEmpty() ? "" : " " + mensaje),
                    GeminiException.KEY_INVALIDA, HttpStatus.BAD_GATEWAY);
        }
        return new GeminiException(
                mensaje.isEmpty() ? "Gemini respondió con un error (" + status + ")." : "Gemini: " + mensaje,
                GeminiException.RESPUESTA, HttpStatus.BAD_GATEWAY);
    }

    private static String extraerMensaje(String cuerpo) {
        Matcher m = Pattern.compile("\"message\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(cuerpo);
        return m.find() ? m.group(1).replace("\\n", " ").replace("\\\"", "\"") : "";
    }
}
