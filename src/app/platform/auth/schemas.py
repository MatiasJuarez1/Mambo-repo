"""Schemas Pydantic para el módulo auth."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserMe(BaseModel):
    id: int
    email: str
    is_active: bool
    roles: list[str]
    person_id: int | None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    message: str = "Login exitoso"
    user: UserMe


class UserBrief(BaseModel):
    """Versión mínima de un usuario, para selectores (p. ej. "asignado a" del CRM)."""

    id: int
    name: str
    email: str

    model_config = {"from_attributes": True}


class LogoutResponse(BaseModel):
    message: str = "Sesión cerrada"
