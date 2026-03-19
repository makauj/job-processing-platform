from SQLAlchemy import create_engine
from SQLAlchemy.orm import sessionmaker declarative_base

from app.config import settings
from models import Base, User

DATABASE_URL = settings.DATABASE_URL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)