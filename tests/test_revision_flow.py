from sqlite3 import connect

from langgraph.checkpoint.sqlite import SqliteSaver

from app.graph import workflow
from app.main import build_initial_state
from app.models.schemas import DayPlan


def test_missing_destination_stops_after_one_extraction(monkeypatch):
    calls = []

    def extract(state):
        calls.append(state["user_query"])
        return {"destination": "", "days": 2}

    monkeypatch.setattr(workflow, "requirement_agent", extract)
    with connect(":memory:", check_same_thread=False) as connection:
        graph = workflow.build_workflow(saver=SqliteSaver(connection))
        result = graph.invoke(build_initial_state("想玩两天"), {"configurable": {"thread_id": "missing"}})
    assert calls == ["想玩两天"]
    assert result["error"] == "请补充目的地后重新生成。"


def test_budget_rejection_replans_with_a_limit(monkeypatch):
    attempts = []

    def generate(state):
        attempts.append(state["revision_feedback"])
        return {
            "current_plan": [DayPlan(day=1, activities=["西湖"], estimated_cost=1600)],
            "total_cost": 1600,
        }

    monkeypatch.setattr(workflow, "planner_agent", generate)
    state = build_initial_state("去杭州玩一天，预算1500元")
    state.update(destination="杭州", days=1, budget=1500, info_collected=True, max_iterations=3)
    with connect(":memory:", check_same_thread=False) as connection:
        graph = workflow.build_workflow(saver=SqliteSaver(connection))
        result = graph.invoke(state, {"configurable": {"thread_id": "over-budget"}, "recursion_limit": 40})
    assert len(attempts) == 3
    assert not attempts[0]
    assert all("超出预算" in feedback for feedback in attempts[1:])
    assert "重规划上限" in result["error"]
    assert not result["human_approved"]
