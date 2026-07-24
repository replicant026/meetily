"""LLM Usage Analytics API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db

router = APIRouter(prefix="/llm-analytics", tags=["llm-analytics"])


class LLMUsageEvent(BaseModel):
    model: str
    provider: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latency_ms: Optional[int] = None
    was_fallback: bool = False
    error_message: Optional[str] = None
    meeting_id: Optional[int] = None


class LLMUsageStats(BaseModel):
    model: str
    provider: str
    total_calls: int
    total_input_tokens: int
    total_output_tokens: int
    avg_latency_ms: float
    total_errors: int
    total_fallback: int


class LLMSession(BaseModel):
    id: int
    meeting_id: Optional[int]
    model: str
    provider: str
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    latency_ms: Optional[int]
    was_fallback: bool
    error_message: Optional[str]
    created_at: str


@router.post("/usage", status_code=201)
async def record_usage(event: LLMUsageEvent, db: AsyncSession = Depends(get_db)):
    """Record an LLM usage event."""
    await db.execute(
        text("""
            INSERT INTO llm_usage
            (meeting_id, model, provider, input_tokens, output_tokens,
             latency_ms, was_fallback, error_message)
            VALUES (:meeting_id, :model, :provider, :input_tokens, :output_tokens,
                    :latency_ms, :was_fallback, :error_message)
        """),
        {
            "meeting_id": event.meeting_id,
            "model": event.model,
            "provider": event.provider,
            "input_tokens": event.input_tokens,
            "output_tokens": event.output_tokens,
            "latency_ms": event.latency_ms,
            "was_fallback": event.was_fallback,
            "error_message": event.error_message,
        },
    )
    await db.commit()
    return {"status": "recorded"}


@router.get("/stats", response_model=List[LLMUsageStats])
async def get_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated LLM usage stats for the last N days."""
    result = await db.execute(
        text("""
            SELECT
                model,
                provider,
                COUNT(*) as total_calls,
                COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                COALESCE(AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END), 0) as avg_latency_ms,
                SUM(CASE WHEN error_message IS NOT NULL AND error_message != '' THEN 1 ELSE 0 END) as total_errors,
                SUM(CASE WHEN was_fallback THEN 1 ELSE 0 END) as total_fallback
            FROM llm_usage
            WHERE created_at >= DATE('now', :days || ' days')
            GROUP BY model, provider
            ORDER BY total_calls DESC
        """),
        {"days": f"-{days}"},
    )
    rows = result.mappings().all()
    return [
        LLMUsageStats(
            model=row["model"],
            provider=row["provider"],
            total_calls=row["total_calls"],
            total_input_tokens=row["total_input_tokens"],
            total_output_tokens=row["total_output_tokens"],
            avg_latency_ms=float(row["avg_latency_ms"]),
            total_errors=row["total_errors"],
            total_fallback=row["total_fallback"],
        )
        for row in rows
    ]


@router.get("/usage/{meeting_id}", response_model=List[LLMSession])
async def get_usage_for_meeting(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Get LLM usage history for a specific meeting."""
    result = await db.execute(
        text("""
            SELECT id, meeting_id, model, provider, input_tokens, output_tokens,
                   latency_ms, was_fallback, error_message, created_at
            FROM llm_usage
            WHERE meeting_id = :meeting_id
            ORDER BY created_at ASC
        """),
        {"meeting_id": meeting_id},
    )
    rows = result.mappings().all()
    return [
        LLMSession(
            id=row["id"],
            meeting_id=row["meeting_id"],
            model=row["model"],
            provider=row["provider"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
            latency_ms=row["latency_ms"],
            was_fallback=bool(row["was_fallback"]),
            error_message=row["error_message"],
            created_at=str(row["created_at"]),
        )
        for row in rows
    ]


@router.get("/usage/{meeting_id}/by-model", response_model=List[LLMUsageStats])
async def get_model_usage_for_meeting(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Get per-model LLM usage stats for a specific meeting."""
    result = await db.execute(
        text("""
            SELECT
                model,
                provider,
                COUNT(*) as total_calls,
                COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                COALESCE(AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END), 0) as avg_latency_ms,
                SUM(CASE WHEN error_message IS NOT NULL AND error_message != '' THEN 1 ELSE 0 END) as total_errors,
                SUM(CASE WHEN was_fallback THEN 1 ELSE 0 END) as total_fallback
            FROM llm_usage
            WHERE meeting_id = :meeting_id
            GROUP BY model, provider
            ORDER BY total_calls DESC
        """),
        {"meeting_id": meeting_id},
    )
    rows = result.mappings().all()
    return [
        LLMUsageStats(
            model=row["model"],
            provider=row["provider"],
            total_calls=row["total_calls"],
            total_input_tokens=row["total_input_tokens"],
            total_output_tokens=row["total_output_tokens"],
            avg_latency_ms=float(row["avg_latency_ms"]),
            total_errors=row["total_errors"],
            total_fallback=row["total_fallback"],
        )
        for row in rows
    ]
