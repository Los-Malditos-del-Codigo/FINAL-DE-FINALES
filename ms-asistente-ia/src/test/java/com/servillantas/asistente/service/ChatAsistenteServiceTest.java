package com.servillantas.asistente.service;

import com.servillantas.asistente.domain.Mensaje;
import com.servillantas.asistente.dto.AdjuntoDto;
import com.servillantas.asistente.dto.ChatRequestDto;
import com.servillantas.asistente.dto.ChatRespuestaDto;
import com.servillantas.asistente.exception.AccesoDenegadoException;
import com.servillantas.asistente.exception.GeminiException;
import com.servillantas.asistente.exception.ValidacionException;
import com.servillantas.asistente.repository.ConversacionRepository;
import com.servillantas.asistente.repository.MensajeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Prueba el chat completo contra H2, con Gemini simulado (no usa la key real). */
@SpringBootTest
class ChatAsistenteServiceTest {

    private static final UUID USUARIO = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

    @Autowired ChatAsistenteService chat;
    @Autowired ConversacionRepository conversaciones;
    @Autowired MensajeRepository mensajes;
    @MockitoBean GeminiClient gemini;

    @BeforeEach
    void limpiar() {
        mensajes.deleteAll();
        conversaciones.deleteAll();
    }

    @Test
    void creaLaConversacionYGuardaPreguntaYRespuesta() {
        when(gemini.generar(anyString(), anyList())).thenReturn("Tienes **4** productos con stock bajo.");

        ChatRespuestaDto r = chat.enviar(USUARIO,
                new ChatRequestDto(null, "¿Qué productos tienen stock bajo?", null, "codigo;stock\nLL-1;2"));

        assertThat(r.conversacion().titulo()).isEqualTo("¿Qué productos tienen stock bajo?");
        assertThat(r.mensajeUsuario().rolMensaje()).isEqualTo("USER");
        assertThat(r.respuesta().rolMensaje()).isEqualTo("ASSISTANT");
        assertThat(r.respuesta().contenido()).contains("stock bajo");
        List<Mensaje> guardados = mensajes.findByConversacionIdOrderByCreatedAtAsc(r.conversacion().id());
        assertThat(guardados).extracting(Mensaje::getRolMensaje).containsExactly("USER", "ASSISTANT");
    }

    @Test
    @SuppressWarnings("unchecked")
    void enviaElHistorialConRolesAlternadosYLosAdjuntos() {
        when(gemini.generar(anyString(), anyList())).thenReturn("Primera respuesta", "Segunda respuesta");
        ChatRespuestaDto primera = chat.enviar(USUARIO, new ChatRequestDto(null, "Hola", null, null));

        AdjuntoDto imagen = new AdjuntoDto("factura.png", "image/png", "iVBORw0KGgo=", null);
        AdjuntoDto hoja = new AdjuntoDto("ventas.xlsx", null, null, "producto;total\nA;10");
        ChatRespuestaDto segunda = chat.enviar(USUARIO,
                new ChatRequestDto(primera.conversacion().id(), "Resume esto", List.of(imagen, hoja), null));

        ArgumentCaptor<List<Map<String, Object>>> turnos = ArgumentCaptor.forClass(List.class);
        verify(gemini, times(2)).generar(anyString(), turnos.capture());
        List<Map<String, Object>> ultimo = turnos.getAllValues().get(1);
        assertThat(ultimo).extracting(t -> t.get("role")).containsExactly("user", "model", "user");
        assertThat(ultimo.get(2).get("parts").toString()).contains("inlineData", "image/png", "ventas.xlsx", "Resume esto");

        assertThat(segunda.conversacion().id()).isEqualTo(primera.conversacion().id());
        assertThat(segunda.mensajeUsuario().contenido())
                .endsWith(ChatAsistenteService.MARCA_ADJUNTOS + "factura.png | ventas.xlsx]]");
    }

    @Test
    void siGeminiFallaNoSeGuardaNada() {
        when(gemini.generar(anyString(), anyList()))
                .thenThrow(new GeminiException("bloqueada", GeminiException.KEY_BLOQUEADA, HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> chat.enviar(USUARIO, new ChatRequestDto(null, "Hola", null, null)))
                .isInstanceOf(GeminiException.class);
        assertThat(conversaciones.count()).isZero();
        assertThat(mensajes.count()).isZero();
    }

    @Test
    void rechazaMensajesVaciosYFormatosNoCompatibles() {
        assertThatThrownBy(() -> chat.enviar(USUARIO, new ChatRequestDto(null, "   ", List.of(), null)))
                .isInstanceOf(ValidacionException.class);
        AdjuntoDto zip = new AdjuntoDto("datos.zip", "application/zip", "UEsDBA==", null);
        assertThatThrownBy(() -> chat.enviar(USUARIO, new ChatRequestDto(null, "Mira", List.of(zip), null)))
                .isInstanceOf(ValidacionException.class);
        verifyNoInteractions(gemini);
    }

    @Test
    void noPermiteEscribirEnConversacionesDeOtroUsuario() {
        when(gemini.generar(anyString(), anyList())).thenReturn("ok");
        ChatRespuestaDto propia = chat.enviar(USUARIO, new ChatRequestDto(null, "Hola", null, null));

        assertThatThrownBy(() -> chat.enviar(UUID.randomUUID(),
                new ChatRequestDto(propia.conversacion().id(), "Hola", null, null)))
                .isInstanceOf(AccesoDenegadoException.class);
    }
}
