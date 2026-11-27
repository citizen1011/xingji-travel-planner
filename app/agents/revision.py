"""State updates shared by automated and human review."""

from app.config import settings
from app.graph.state import AgentState


def revise(state: AgentState, feedback: str) -> dict:
    next_iteration = state.get("iteration", 0) + 1
    if next_iteration >= state.get("max_iterations", settings.MAX_ITERATIONS):
        return {
            "iteration": next_iteration,
            "error": f"已达到重规划上限。{feedback} 请调整旅行条件后重新生成。",
        }
    return {
        "iteration": next_iteration,
        "previous_plan": state.get("current_plan") or [],
        "revision_feedback": feedback,
        "current_plan": [],
        "total_cost": 0.0,
        "budget_approved": False,
        "preference_approved": False,
        "human_approved": False,
        "final_plan": None,
    }
