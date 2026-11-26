package com.servillantas.rv.autenticacion.service;

import java.util.List;
import java.util.UUID;

import com.servillantas.rv.autenticacion.dto.perfil.ActualizarPerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.CambiarPasswordRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilRequest;
import com.servillantas.rv.autenticacion.dto.perfil.PerfilResponse;
import com.servillantas.rv.autenticacion.entity.Rol;

public interface PerfilService {

	List<PerfilResponse> listar();

	List<Rol> listarRoles();

	PerfilResponse crear(PerfilRequest request);

	PerfilResponse obtenerPorId(UUID id);

	PerfilResponse actualizar(UUID id, ActualizarPerfilRequest request);

	PerfilResponse cambiarEstado(UUID id);

	void cambiarPassword(UUID id, CambiarPasswordRequest request);
}
