from app.infra.db import engine
from app.infra.models import Base

def main():
    Base.metadata.create_all(bind=engine)
    print("Tabelas criadas!")

if __name__ == "__main__":
    main()
