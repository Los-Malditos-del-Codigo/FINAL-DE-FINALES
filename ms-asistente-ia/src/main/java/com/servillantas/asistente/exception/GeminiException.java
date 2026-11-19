package com.servillantas.asistente.exception;

import org.springframework.http.HttpStatus;

/** Error al comunicarse con Google Gemini, con un mensaje listo para mostrar al usuario. */
public class GeminiException extends BaseApiException {

    public static final String NO_CONFIGURADA = "IA_NO_CONFIGURADA";
    public static final String KEY_BLOQUEADA = "IA_KEY_BLOQUEADA";
    public static final String KEY_INVALIDA = "IA_KEY_INVALIDA";
    public static final String CUOTA = "IA_CUOTA";
    public static final String MODELO = "IA_MODELO";
    public static final String TIEMPO = "IA_TIEMPO_AGOTADO";
    public static final String RESPUESTA = "IA_RESPUESTA";

    public GeminiException(String message, String code, HttpStatus status) {
        super(message, code, status);
    }

    public boolean esModeloNoDisponible() {
        return MODELO.equals(getCode());
    }
}
