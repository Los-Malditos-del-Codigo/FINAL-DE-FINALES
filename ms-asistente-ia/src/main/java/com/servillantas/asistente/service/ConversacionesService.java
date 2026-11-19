package com.servillantas.asistente.service;

import com.servillantas.asistente.domain.Conversacion;
import com.servillantas.asistente.domain.Mensaje;
import com.servillantas.asistente.dto.*;
import com.servillantas.asistente.exception.AccesoDenegadoException;
import com.servillantas.asistente.exception.RecursoNoEncontradoException;
import com.servillantas.asistente.exception.ValidacionException;
import com.servillantas.asistente.repository.ConversacionRepository;
import com.servillantas.asistente.repository.MensajeRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class ConversacionesService {

    private final ConversacionRepository conversacionRepository;
    private final MensajeRepository mensajeRepository;

    public ConversacionesService(ConversacionRepository conversacionRepository, MensajeRepository mensajeRepository) {
        this.conversacionRepository = conversacionRepository;
        this.mensajeRepository = mensajeRepository;
    }

    @Transactional
    public ConversacionDto crearConversacion(UUID usuarioId, CrearConversacionRequestDto request) {
        String tituloLimpio = limpiarTitulo(request.titulo());
        Conversacion conversacion = new Conversacion(usuarioId, tituloLimpio);
        Conversacion guardada = conversacionRepository.save(conversacion);
        return mapToDto(guardada);
    }

    @Transactional(readOnly = true)
    public PageResponseDto<ConversacionDto> listarConversaciones(UUID usuarioId, int page, int size, String sortBy, String sortDir) {
        Sort sort = sortDir.equalsIgnoreCase("asc") ? Sort.by(sortBy).ascending() : Sort.by(sortBy).descending();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100), sort);

        Page<Conversacion> pageResult = conversacionRepository.findByUsuarioId(usuarioId, pageable);
        List<ConversacionDto> content = pageResult.getContent().stream().map(this::mapToDto).toList();

        return new PageResponseDto<>(
                content,
                pageResult.getNumber(),
                pageResult.getSize(),
                pageResult.getTotalElements(),
                pageResult.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public ConversacionDetalleDto obtenerDetalle(UUID id, UUID usuarioId) {
        Conversacion conversacion = buscarPropia(id, usuarioId);
        List<Mensaje> mensajes = mensajeRepository.findByConversacionIdOrderByCreatedAtAsc(id);
        List<MensajeDto> mensajeDtos = mensajes.stream().map(this::mapMensajeToDto).toList();

        return new ConversacionDetalleDto(mapToDto(conversacion), mensajeDtos);
    }

    @Transactional
    public MensajeDto agregarMensaje(UUID id, UUID usuarioId, CrearMensajeRequestDto request) {
        Conversacion conversacion = buscarPropia(id, usuarioId);

        if (!"USER".equalsIgnoreCase(request.rolMensaje())) {
            throw new ValidacionException("El cliente solo puede enviar mensajes con rol USER");
        }

        Mensaje mensaje = new Mensaje(id, "USER", request.contenido().trim());
        Mensaje guardado = mensajeRepository.save(mensaje);

        conversacion.setUpdatedAt(OffsetDateTime.now());
        conversacionRepository.save(conversacion);

        return mapMensajeToDto(guardado);
    }

    /** Mensajes de una conversación del usuario, en orden cronológico. */
    @Transactional(readOnly = true)
    public List<Mensaje> historialPropio(UUID id, UUID usuarioId) {
        buscarPropia(id, usuarioId);
        return mensajeRepository.findByConversacionIdOrderByCreatedAtAsc(id);
    }

    /**
     * Guarda el mensaje del usuario y la respuesta del asistente en una sola transacción.
     * Si {@code conversacionId} es nulo se crea la conversación con {@code tituloNuevo}.
     */
    @Transactional
    public ChatRespuestaDto registrarIntercambio(UUID conversacionId, UUID usuarioId, String tituloNuevo,
                                                  String contenidoUsuario, String respuestaAsistente) {
        Conversacion conversacion = conversacionId == null
                ? conversacionRepository.save(new Conversacion(usuarioId, limpiarTitulo(tituloNuevo)))
                : buscarPropia(conversacionId, usuarioId);

        OffsetDateTime ahora = OffsetDateTime.now();
        Mensaje usuario = new Mensaje(conversacion.getId(), "USER", contenidoUsuario);
        usuario.setCreatedAt(ahora);
        Mensaje asistente = new Mensaje(conversacion.getId(), "ASSISTANT", respuestaAsistente);
        asistente.setCreatedAt(ahora.plusNanos(1_000_000));
        Mensaje usuarioGuardado = mensajeRepository.save(usuario);
        Mensaje asistenteGuardado = mensajeRepository.save(asistente);

        if (conversacion.getTitulo() == null && tituloNuevo != null) {
            conversacion.setTitulo(limpiarTitulo(tituloNuevo));
        }
        conversacion.setUpdatedAt(ahora);
        Conversacion guardada = conversacionRepository.save(conversacion);

        return new ChatRespuestaDto(mapToDto(guardada), mapMensajeToDto(usuarioGuardado), mapMensajeToDto(asistenteGuardado));
    }

    @Transactional
    public void eliminarConversacion(UUID id, UUID usuarioId) {
        Conversacion conversacion = buscarPropia(id, usuarioId);
        List<Mensaje> mensajes = mensajeRepository.findByConversacionIdOrderByCreatedAtAsc(id);
        mensajeRepository.deleteAll(mensajes);
        conversacionRepository.delete(conversacion);
    }

    private Conversacion buscarPropia(UUID id, UUID usuarioId) {
        Conversacion conversacion = conversacionRepository.findById(id)
                .orElseThrow(() -> new RecursoNoEncontradoException("Conversación no encontrada con id: " + id));

        if (!conversacion.getUsuarioId().equals(usuarioId)) {
            throw new AccesoDenegadoException("La conversación pertenece a otro usuario");
        }
        return conversacion;
    }

    private String limpiarTitulo(String titulo) {
        if (titulo == null || titulo.isBlank()) {
            return null;
        }
        return titulo.trim();
    }

    private ConversacionDto mapToDto(Conversacion c) {
        return new ConversacionDto(
                c.getId(),
                c.getUsuarioId(),
                c.getTitulo(),
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }

    private MensajeDto mapMensajeToDto(Mensaje m) {
        return new MensajeDto(
                m.getId(),
                m.getConversacionId(),
                m.getRolMensaje(),
                m.getContenido(),
                m.getCreatedAt()
        );
    }
}

