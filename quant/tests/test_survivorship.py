"""생존편향 체크 테스트."""
from __future__ import annotations

from data.validate import check_survivorship


def test_detects_static_universe() -> None:
    universe_by_date = {
        "2025-01-01": ["A", "B", "C"],
        "2025-06-01": ["A", "B", "C"],
        "2025-12-01": ["A", "B", "C"],
    }
    issues = check_survivorship(universe_by_date)
    assert len(issues) == 1
    assert "생존편향" in issues[0]


def test_passes_when_universe_changes() -> None:
    universe_by_date = {
        "2025-01-01": ["A", "B", "C"],
        "2025-06-01": ["A", "B"],       # C 상장폐지
        "2025-12-01": ["A", "B", "D"],  # D 신규 상장
    }
    issues = check_survivorship(universe_by_date)
    assert issues == []
