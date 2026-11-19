package com.servillantas.asistente.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Archivo adjunto a un mensaje del chat. Las imágenes y los PDF llegan en base64 ({@code datos});
 * Excel, Word, CSV y texto llegan ya convertidos a texto ({@code texto}).
 */
public record AdjuntoDto(
    @NotBlank(message = "El adjunto debe tener nombre")
    @Size(max = 255)
    String nombre,

    @Size(max = 100)
    String mimeType,

    String datos,

    String texto
) {}
