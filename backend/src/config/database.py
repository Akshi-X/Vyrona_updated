from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DB_USER = "postgres"
DB_PASSWORD = "suriya2002"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "mygrape"

DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 🔹 Add this function
def init_db():
    from ..models import user_model  # import your models so Base knows them
    Base.metadata.create_all(bind=engine)
