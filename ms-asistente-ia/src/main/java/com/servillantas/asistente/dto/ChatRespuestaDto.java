package com.servillantas.asistente.dto;

public record ChatRespuestaDto(
    ConversacionDto conversacion,
    MensajeDto mensajeUsuario,
    MensajeDto respuesta
) {}
