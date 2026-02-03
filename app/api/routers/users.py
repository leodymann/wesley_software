from __future__ import annotations
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import DBSession
from app.infra.models import UserORM, UserRole
from app.schemas.users import UserCreate, UserOut

router = APIRouter()

def fake_hash_password(p: str) -> str:
    # trocar por bcrypt depois
    return "hash:" + p

@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = DBSession):
    role = UserRole(payload.role) if payload.role else UserRole.STAFF

    exists = db.scalar(select(UserORM.id).where(UserORM.email == payload.email))
    if exists:
        raise HTTPException(status_code=409, detail="Email já cadastrado.")

    user = UserORM(
        name=payload.name.strip(),
        email=payload.email.strip().lower(),
        password_hash=fake_hash_password(payload.password),
        role=role,
    )
    db.add(user)
    db.flush()
    return user