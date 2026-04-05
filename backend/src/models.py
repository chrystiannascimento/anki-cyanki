from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from src.database import Base
import datetime
import uuid

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    flashcards = relationship("Flashcard", back_populates="owner")
    reviews = relationship("ReviewLog", back_populates="user")
    notebooks = relationship("Notebook", back_populates="owner")

class Notebook(Base):
    __tablename__ = "notebooks"
    
    id = Column(String, primary_key=True, index=True) # NanoID
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    is_public = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    owner = relationship("User", back_populates="notebooks")

class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(String, primary_key=True, index=True) # NanoID
    user_id = Column(Integer, ForeignKey("users.id"))
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    tags = Column(String) 
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    owner = relationship("User", back_populates="flashcards")
    reviews = relationship("ReviewLog", back_populates="flashcard")
    
class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    flashcard_id = Column(String, ForeignKey("flashcards.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    grade = Column(Integer) # FSRS grade
    state = Column(Integer)
    reviewed_at = Column(DateTime, default=datetime.datetime.utcnow)

    flashcard = relationship("Flashcard", back_populates="reviews")
    user = relationship("User", back_populates="reviews")

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)

    user = relationship("User")
