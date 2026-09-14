import { api } from './client'
import type { UsuarioBrief } from '../types/inmobiliaria'

export const usuariosApi = {
  listar: () => api.get<UsuarioBrief[]>('/auth/users'),
}
