from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
	pass


class Job(Base):
	__tablename__ = "jobs"

	task_id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
	task_type: Mapped[str] = mapped_column(String(100), nullable=False)
	payload: Mapped[str] = mapped_column(Text, nullable=False)
	status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
	result: Mapped[str | None] = mapped_column(Text, nullable=True)
	error: Mapped[str | None] = mapped_column(Text, nullable=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		server_default=func.now(),
		onupdate=func.now(),
		nullable=False,
	)
