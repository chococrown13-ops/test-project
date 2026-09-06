"""점수표 채점 로직 테스트."""
from __future__ import annotations

import pandas as pd
import pytest

from screening.score import apply_cutoff, score_candidates, validate_weights


def test_validate_weights_rejects_missing() -> None:
    with pytest.raises(ValueError, match="비어 있습니다"):
        validate_weights({"rs_score": 30, "trend_score": None})


def test_validate_weights_rejects_wrong_total() -> None:
    with pytest.raises(ValueError, match="100"):
        validate_weights({"rs_score": 30, "trend_score": 25})


def test_validate_weights_accepts_full_100() -> None:
    validate_weights({"rs_score": 60, "trend_score": 40})


def test_score_candidates_and_cutoff() -> None:
    candidates = pd.DataFrame(index=["A", "B", "C"])
    sub_scores = pd.DataFrame(
        {
            "rs_score": [1.0, 0.7, 0.2],
            "trend_score": [1.0, 0.75, 0.1],
        },
        index=["A", "B", "C"],
    )
    weights = {"rs_score": 60, "trend_score": 40}

    scored = score_candidates(candidates, sub_scores, weights)
    assert scored.loc["A", "total_score"] == pytest.approx(100.0)
    assert scored.index.tolist() == ["A", "B", "C"]

    passed = apply_cutoff(scored, cutoff=70)
    assert passed.index.tolist() == ["A", "B"]
