from __future__ import annotations
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import DBSession
from app.infra.models import UserORM, UserRole
from app.schemas.users import UserCreate, UserOut
from app.services.security import hash_password  # ✅ bcrypt

from fastapi import Depends
from app.api.auth_deps import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = DBSession):
    role = UserRole(payload.role) if payload.role else UserRole.STAFF

    email = payload.email.strip().lower()
    exists = db.scalar(select(UserORM.id).where(UserORM.email == email))
    if exists:
        raise HTTPException(status_code=409, detail="Email já cadastrado.")

    user = UserORM(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),  # ✅ salva bcrypt
        role=role,
    )
    db.add(user)
    db.flush()
    return user
