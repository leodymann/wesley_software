from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from infra.db import engine
from infra.models import Base

from api.routers.clients import router as clients_router
from api.routers.products import router as products_router
from api.routers.sales import router as sales_router
from api.routers.promissories import router as promissories_router
from api.routers.installments import router as installments_router
from api.routers.users import router as users_router
from api.routers.finance import router as finance_router
from api.routers.auth import router as auth_router
from infra.models import Base

UPLOAD_ROOT = Path("uploads")

app = FastAPI(title="Moto Store API")

@app.on_event("startup")
def _startup() -> None:
    print("[startup] creating tables...")
    Base.metadata.create_all(bind=engine)
    print("[startup] tables created/checked")
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(UPLOAD_ROOT)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(clients_router, prefix="/clients", tags=["clients"])
app.include_router(products_router, prefix="/products", tags=["products"])
app.include_router(sales_router, prefix="/sales", tags=["sales"])
app.include_router(promissories_router, prefix="/promissories", tags=["promissories"])
app.include_router(installments_router, prefix="/installments", tags=["installments"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(finance_router, prefix="/finance", tags=["finance"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
