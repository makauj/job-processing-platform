from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TaskSubmissionRequest(BaseModel):
	task_type: str = Field(..., examples=["email", "image", "report"])
	payload: dict[str, Any] = Field(default_factory=dict)


class TaskSubmissionResponse(BaseModel):
	task_id: str
	status: str


class TaskStatusResponse(BaseModel):
	task_id: str
	status: str
	result: Any | None = None
	error: str | None = None
	created_at: datetime | None = None
	updated_at: datetime | None = None
