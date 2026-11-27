"""Same-origin planner interface and read-only views of stored trips."""

from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import repository
from app.main import _looks_like_placeholder, api, workflow_app
from app.models.schemas import DayPlan
from app.utils.auth import verify_api_key

static_dir = Path(__file__).resolve().parent / "static"
api.mount("/ui", StaticFiles(directory=static_dir), name="planner-assets")


@api.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(static_dir / "index.html", headers={"Cache-Control": "no-cache"})


@api.get("/planner/status")
def planner_status():
    base_url = (
        settings.DASHSCOPE_BASE_URL if settings.DEFAULT_PROVIDER == "dashscope" else settings.DEEPSEEK_BASE_URL
    )
    return {
        "local_model": urlparse(base_url).hostname in {"localhost", "127.0.0.1", "::1"},
        "live_data": not _looks_like_placeholder(settings.AMAP_API_KEY),
    }


@api.get("/planner/sessions/{thread_id}", dependencies=[Depends(verify_api_key)])
def planner_session(thread_id: str):
    snapshot = workflow_app.get_state({"configurable": {"thread_id": thread_id}})
    values = snapshot.values
    if not values:
        return {"exists": False, "thread_id": thread_id}

    failure = values.get("error")
    session = repository.get_session(thread_id)
    if failure or (session and session["status"] == "failed"):
        status = "error"
    elif "human_review" in snapshot.next:
        status = "waiting_for_review"
    elif values.get("human_approved"):
        status = "completed"
    else:
        status = "draft"

    final = values.get("final_plan")
    plan = final if status == "completed" and isinstance(final, list) else values.get("current_plan") or []
    return {
        "exists": True,
        "thread_id": thread_id,
        "status": status,
        "destination": values.get("destination", ""),
        "days": values.get("days", 0),
        "budget": values.get("budget", 0),
        "start_date": values.get("start_date", ""),
        "total_cost": values.get("total_cost", 0),
        "preferences": values.get("preferences") or [],
        "itinerary": [DayPlan.model_validate(day).model_dump() for day in plan],
        "feedback": failure or "",
    }
