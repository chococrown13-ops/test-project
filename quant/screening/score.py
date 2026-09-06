"""4단계: 스윙 점수표 채점 + 커트라인 필터."""
from __future__ import annotations

import pandas as pd


def validate_weights(weights: dict[str, float | None]) -> None:
    missing = [k for k, v in weights.items() if v is None]
    if missing:
        raise ValueError(
            f"score_table.yaml에 배점이 비어 있습니다: {missing}. "
            "종목선정 가이드 3-3 기준으로 채워넣으세요."
        )
    total = sum(weights.values())
    if abs(total - 100) > 1e-6:
        raise ValueError(f"배점 합계가 100이어야 합니다 (현재 {total})")


def score_candidates(
    candidates: pd.DataFrame, sub_scores: pd.DataFrame, weights: dict[str, float]
) -> pd.DataFrame:
    """sub_scores: 항목별로 0~1 정규화된 점수 (columns == weights.keys()).
    최종 점수 = sum(sub_score * weight).
    """
    validate_weights(weights)
    result = candidates.copy()
    result["total_score"] = sum(
        sub_scores[factor] * weight for factor, weight in weights.items()
    )
    return result.sort_values("total_score", ascending=False)


def apply_cutoff(scored: pd.DataFrame, cutoff: float, top_n: int | None = None) -> pd.DataFrame:
    passed = scored[scored["total_score"] >= cutoff]
    if top_n is not None:
        passed = passed.head(top_n)
    return passed
