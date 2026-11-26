package com.servillantas.rv.autenticacion.controller;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.servillantas.rv.autenticacion.dto.perfil.ActualizarPerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.CambiarPasswordRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilResponse;
import com.servillantas.rv.autenticacion.entity.Rol;
import com.servillantas.rv.autenticacion.service.PerfilService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/perfiles")
@RequiredArgsConstructor
public class PerfilController {

	private final PerfilService perfilService;

	@GetMapping
	public ResponseEntity<List<PerfilResponse>> listar() {
		return ResponseEntity.ok(perfilService.listar());
	}

	@GetMapping("/roles")
	public ResponseEntity<List<Rol>> listarRoles() {
		return ResponseEntity.ok(perfilService.listarRoles());
	}

	@PostMapping
	public ResponseEntity<PerfilResponse> crear(@Valid @RequestBody PerfilRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(perfilService.crear(request));
	}

	@GetMapping("/{id}")
	public ResponseEntity<PerfilResponse> obtenerPorId(@PathVariable UUID id) {
		return ResponseEntity.ok(perfilService.obtenerPorId(id));
	}

	@PutMapping("/{id}")
	public ResponseEntity<PerfilResponse> actualizar(
			@PathVariable UUID id,
			@Valid @RequestBody ActualizarPerfilRequest request) {
		return ResponseEntity.ok(perfilService.actualizar(id, request));
	}

	@PatchMapping("/{id}/estado")
	public ResponseEntity<PerfilResponse> cambiarEstado(@PathVariable UUID id) {
		return ResponseEntity.ok(perfilService.cambiarEstado(id));
	}

	@PostMapping("/{id}/password")
	public ResponseEntity<Map<String, String>> cambiarPassword(
			@PathVariable UUID id,
			@Valid @RequestBody CambiarPasswordRequest request) {
		perfilService.cambiarPassword(id, request);
		return ResponseEntity.ok(Map.of("mensaje", "Contraseña actualizada correctamente"));
	}
}
