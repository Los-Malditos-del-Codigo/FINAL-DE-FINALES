package com.servillantas.asistente.service;

import com.servillantas.asistente.exception.GeminiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeminiClientTest {

    @Test
    void traduceLosErroresDeGoogleAMensajesClaros() {
        GeminiException filtrada = GeminiClient.traducir(403,
                "{\"error\":{\"code\":403,\"message\":\"Your API key was reported as leaked. Please use another API key.\",\"status\":\"PERMISSION_DENIED\"}}");
        assertThat(filtrada.getCode()).isEqualTo(GeminiException.KEY_BLOQUEADA);
        assertThat(filtrada.getMessage()).contains("GEMINI_API_KEY");

        GeminiException invalida = GeminiClient.traducir(400,
                "{\"error\":{\"message\":\"API key not valid.\",\"details\":[{\"reason\":\"API_KEY_INVALID\"}]}}");
        assertThat(invalida.getCode()).isEqualTo(GeminiException.KEY_INVALIDA);
        assertThat(GeminiClient.traducir(429, "{}").getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(GeminiClient.traducir(404, "{}").esModeloNoDisponible()).isTrue();
        assertThat(GeminiClient.traducir(500, "{\"error\":{\"message\":\"Internal error\"}}").getMessage())
                .isEqualTo("Gemini: Internal error");
    }

    @Test
    void prefiereElModeloFlashEstableMasReciente() {
        List<String> modelos = List.of("gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro",
                "gemini-2.5-flash-lite", "gemini-3.0-flash-preview");
        String elegido = modelos.stream().max(Comparator.comparingDouble(GeminiClient::puntaje)).orElseThrow();
        assertThat(elegido).isEqualTo("gemini-2.5-flash");
        assertThat(GeminiClient.puntaje("gemini-3.0-flash")).isGreaterThan(GeminiClient.puntaje("gemini-2.5-flash"));
        assertThat(GeminiClient.puntaje("gemini-2.5-pro")).isGreaterThan(GeminiClient.puntaje("gemini-2.5-flash-lite"));
    }

    @Test
    void sinApiKeyAvisaQueFaltaConfigurarla() {
        GeminiClient cliente = new GeminiClient("", "", 5);
        assertThat(cliente.configurado()).isFalse();
        assertThatThrownBy(() -> cliente.generar("x", List.of()))
                .isInstanceOf(GeminiException.class)
                .extracting("code").isEqualTo(GeminiException.NO_CONFIGURADA);
    }
}
