from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


# ── Users ────────────────────────────────────────────────────────────────────

class UserBrief(BaseModel):
    id: UUID
    name: str
    email: str
    company_id: UUID
    company_name: str


class UserProfile(UserBrief):
    phone: Optional[str]
    designation_id: Optional[UUID]
    capability_tier: Optional[str]
    is_active: bool


# ── Recording jobs ────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    job_type: str   # task_delegation | meeting | idea
    audio_url: str


class JobResponse(BaseModel):
    id: UUID
    status: str
    transcript: Optional[str]
    result: Optional[dict]
    error_msg: Optional[str]
    created_at: datetime


# ── Tasks ────────────────────────────────────────────────────────────────────

class ExtractedTask(BaseModel):
    doer_name: Optional[str]
    description: str
    deadline: Optional[str]
    report_to_name: Optional[str]


class TaskCreate(BaseModel):
    source: str                  # task_delegation | meeting
    meeting_id: Optional[UUID]
    assignee_id: UUID
    description: str
    deadline: datetime
    original_deadline: datetime
    report_to_id: UUID


class TaskResponse(BaseModel):
    id: UUID
    source: str
    meeting_id: Optional[UUID]
    assignor_id: UUID
    assignee_id: UUID
    description: str
    deadline: datetime
    original_deadline: datetime
    report_to_id: UUID
    status: str
    completed_at: Optional[datetime]
    completion_note: Optional[str]
    created_at: datetime
    updated_at: datetime
    # Joined fields
    assignee_name: Optional[str]
    assignor_name: Optional[str]
    report_to_name: Optional[str]
    company_name: Optional[str]


class TaskComplete(BaseModel):
    completion_note: Optional[str] = None


class DashboardCounts(BaseModel):
    given_open: int
    received_open: int
    completed: int
    overdue: int


# ── Meetings ─────────────────────────────────────────────────────────────────

class MeetingBatchCreate(BaseModel):
    mom_summary: str
    audio_url: Optional[str]
    transcript: Optional[str]
    tasks: list[TaskCreate]


class MeetingResponse(BaseModel):
    id: UUID
    recorded_by: UUID
    company_id: UUID
    mom_summary: Optional[str]
    audio_url: Optional[str]
    created_at: datetime
    task_count: int


# ── Ideas ────────────────────────────────────────────────────────────────────

class IdeaCreate(BaseModel):
    summary: str
    tags: list[str]


class IdeaResponse(BaseModel):
    id: UUID
    recorded_by: UUID
    summary: str
    tags: list[str]
    created_at: datetime
    recorder_name: Optional[str]
    company_name: Optional[str]


# ── Extensions ───────────────────────────────────────────────────────────────

class ExtensionCreate(BaseModel):
    task_id: UUID
    reason: str
    proposed_deadline: datetime


class ExtensionDecide(BaseModel):
    decision: str   # approved | denied


class ExtensionResponse(BaseModel):
    id: UUID
    task_id: UUID
    requested_by: UUID
    reason: str
    proposed_deadline: datetime
    status: str
    decided_by: Optional[UUID]
    decided_at: Optional[datetime]
    created_at: datetime


# ── Performance ───────────────────────────────────────────────────────────────

class PerformanceRow(BaseModel):
    user_id: UUID
    name: str
    email: str
    company_name: Optional[str]
    total_tasks: int
    completed_tasks: int
    on_time_tasks: int
    on_time_pct: Optional[float]
    overdue_count: int
    avg_days_to_complete: Optional[float]
