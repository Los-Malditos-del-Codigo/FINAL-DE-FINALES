package com.servillantas.rv.autenticacion.service.impl;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.servillantas.rv.autenticacion.dto.perfil.ActualizarPerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.CambiarPasswordRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilResponse;
import com.servillantas.rv.autenticacion.entity.Perfil;
import com.servillantas.rv.autenticacion.entity.Rol;
import com.servillantas.rv.autenticacion.exception.BadRequestException;
import com.servillantas.rv.autenticacion.exception.ResourceNotFoundException;
import com.servillantas.rv.autenticacion.repository.PerfilRepository;
import com.servillantas.rv.autenticacion.repository.RolRepository;
import com.servillantas.rv.autenticacion.service.PerfilService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PerfilServiceImpl implements PerfilService {

	private final PerfilRepository perfilRepository;

	private final RolRepository rolRepository;

	private final PasswordEncoder passwordEncoder;

	@Override
	@Transactional(readOnly = true)
	public List<PerfilResponse> listar() {
		return perfilRepository.findAll().stream()
				.sorted(Comparator.comparing(Perfil::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
				.map(this::mapearResponse)
				.toList();
	}

	@Override
	@Transactional(readOnly = true)
	public List<Rol> listarRoles() {
		return rolRepository.findAll();
	}

	@Override
	@Transactional
	public PerfilResponse crear(PerfilRequest request) {
		String email = request.email().trim().toLowerCase();
		if (perfilRepository.existsByEmail(email)) {
			throw new BadRequestException("Ya existe un perfil registrado con ese correo");
		}

		Rol rol = rolRepository.findById(request.rolId())
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el rol solicitado"));

		OffsetDateTime ahora = OffsetDateTime.now();

		Perfil perfil = new Perfil();
		perfil.setNombres(request.nombres().trim());
		perfil.setApellidos(request.apellidos() != null ? request.apellidos().trim() : null);
		perfil.setTelefono(request.telefono() != null ? request.telefono().trim() : null);
		perfil.setRol(rol);
		perfil.setActivo(request.activo() != null ? request.activo() : Boolean.TRUE);
		perfil.setEmail(email);
		perfil.setPasswordHash(passwordEncoder.encode(request.password()));
		perfil.setCreatedAt(ahora);
		perfil.setUpdatedAt(ahora);

		Perfil perfilGuardado = perfilRepository.save(perfil);
		return mapearResponse(perfilGuardado);
	}

	@Override
	@Transactional(readOnly = true)
	public PerfilResponse obtenerPorId(UUID id) {
		Perfil perfil = perfilRepository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el perfil solicitado"));
		return mapearResponse(perfil);
	}

	@Override
	@Transactional
	public PerfilResponse actualizar(UUID id, ActualizarPerfilRequest request) {
		Perfil perfil = perfilRepository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el perfil solicitado"));

		String nuevoEmail = request.email().trim().toLowerCase();
		if (!nuevoEmail.equalsIgnoreCase(perfil.getEmail()) && perfilRepository.existsByEmail(nuevoEmail)) {
			throw new BadRequestException("Ya existe otro usuario registrado con ese correo");
		}

		Rol rol = rolRepository.findById(request.rolId())
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el rol solicitado"));

		perfil.setNombres(request.nombres().trim());
		perfil.setApellidos(request.apellidos() != null ? request.apellidos().trim() : null);
		perfil.setTelefono(request.telefono() != null ? request.telefono().trim() : null);
		perfil.setEmail(nuevoEmail);
		perfil.setRol(rol);
		perfil.setActivo(request.activo());
		if (request.password() != null && !request.password().isBlank()) {
			perfil.setPasswordHash(passwordEncoder.encode(request.password().trim()));
		}
		perfil.setUpdatedAt(OffsetDateTime.now());

		return mapearResponse(perfilRepository.save(perfil));
	}

	@Override
	@Transactional
	public PerfilResponse cambiarEstado(UUID id) {
		Perfil perfil = perfilRepository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el perfil solicitado"));
		perfil.setActivo(!Boolean.TRUE.equals(perfil.getActivo()));
		perfil.setUpdatedAt(OffsetDateTime.now());
		return mapearResponse(perfilRepository.save(perfil));
	}

	@Override
	@Transactional
	public void cambiarPassword(UUID id, CambiarPasswordRequest request) {
		Perfil perfil = perfilRepository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("No se encontró el perfil solicitado"));

		if (!passwordEncoder.matches(request.passwordActual(), perfil.getPasswordHash())) {
			throw new BadRequestException("La contraseña actual ingresada es incorrecta");
		}

		perfil.setPasswordHash(passwordEncoder.encode(request.passwordNueva().trim()));
		perfil.setUpdatedAt(OffsetDateTime.now());
		perfilRepository.save(perfil);
	}

	private PerfilResponse mapearResponse(Perfil perfil) {
		return new PerfilResponse(perfil.getId(), perfil.getNombres(), perfil.getApellidos(), perfil.getTelefono(),
				perfil.getRol().getId(), perfil.getRol().getNombre(), perfil.getActivo(), perfil.getEmail(),
				perfil.getCreatedAt(), perfil.getUpdatedAt());
	}
}
