package com.servillantas.asistente.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Mensaje enviado al asistente. Sin {@code conversacionId} se inicia una conversación nueva. */
public record ChatRequestDto(
    UUID conversacionId,

    @Size(max = 20000, message = "El mensaje no debe exceder 20000 caracteres")
    String contenido,

    @Size(max = 10, message = "Se permiten como máximo 10 archivos por mensaje")
    List<@Valid AdjuntoDto> adjuntos,

    @Size(max = 300000, message = "Los datos del sistema enviados son demasiado extensos")
    String contexto
) {}
