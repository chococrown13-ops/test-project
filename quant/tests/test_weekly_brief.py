"""pipeline/weekly_brief.py 테스트.

해설 생성(Anthropic API 호출)은 실제 HTTP 대신 같은 메서드 이름을 가진 스텁 클라이언트를
주입해 검증한다 — 여기서 확인할 것은 비교 로직(편입/탈락/유지·점수변화)과 실패 시
계산 결과만 담은 브리핑으로 물러나는 경로이지 SDK 자체가 아니다.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from pipeline.weekly_brief import (
    DELTA_COLUMN,
    archive_current,
    build_prompt,
    diff_screenings,
    fallback_brief,
    find_previous_csv,
    generate_brief,
    load_screening_csv,
    parse_as_of,
    to_markdown_table,
)

WEIGHTS = {
    "rs_score": 30,
    "trend_score": 25,
    "quality_score": 20,
    "volatility_score": 15,
    "value_score": 10,
}
CUTOFF = 70


def _write_screening_csv(path: Path, rows: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(rows).set_index("종목코드")
    frame.to_csv(path, encoding="utf-8-sig")
    return path


def _row(code: str, name: str, score: float, rs: float = 90.0) -> dict:
    return {
        "종목코드": code,
        "종목명": name,
        "현재가": 10000,
        "등락률(%)": 1.0,
        "시가총액(억)": 5000,
        "20일평균거래대금(억)": 300,
        "RS점수": rs,
        "종합점수": score,
        "모멘텀배점": 30.0,
        "추세배점": 25.0,
        "퀄리티배점": 0.0,
        "변동성배점": 15.0,
        "밸류배점": 0.0,
    }


class StubMessages:
    def __init__(self, response: object | None, error: Exception | None) -> None:
        self._response = response
        self._error = error
        self.calls: list[dict] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class StubClient:
    """Anthropic 클라이언트와 같은 호출 경로(client.messages.create)만 흉내낸 스텁."""

    def __init__(self, text: str = "해설 본문", error: Exception | None = None, stop_reason: str = "end_turn") -> None:
        response = SimpleNamespace(
            content=[SimpleNamespace(type="text", text=text)],
            stop_reason=stop_reason,
        )
        self.messages = StubMessages(response, error)


def test_parse_as_of_reads_date_from_filename() -> None:
    assert parse_as_of(Path("out/screening_2026-09-14.csv")) == date(2026, 9, 14)
    assert parse_as_of(Path("out/screening.csv")) is None
    assert parse_as_of(Path("out/brief_2026-09-14.md")) is None


def test_load_screening_csv_keeps_leading_zero_in_code(tmp_path: Path) -> None:
    # 005930이 5930으로 읽히면 다음 주 비교에서 다른 종목이 되어버린다
    path = _write_screening_csv(tmp_path / "screening_2026-09-14.csv", [_row("005930", "삼성전자", 82.0)])

    frame = load_screening_csv(path)

    assert frame.index.tolist() == ["005930"]
    assert frame.loc["005930", "종목명"] == "삼성전자"


def test_load_screening_csv_handles_empty_file(tmp_path: Path) -> None:
    # 통과 종목이 0개인 주에는 내용 없는 CSV가 나온다
    path = tmp_path / "screening_2026-09-14.csv"
    path.write_text("", encoding="utf-8")

    assert load_screening_csv(path).empty


def test_find_previous_csv_picks_most_recent_before_as_of(tmp_path: Path) -> None:
    history = tmp_path / "history"
    for day in ("2026-08-29", "2026-09-05", "2026-09-14"):
        _write_screening_csv(history / f"screening_{day}.csv", [_row("005930", "삼성전자", 80.0)])
    (history / "screening_notadate.csv").write_text("", encoding="utf-8")

    found = find_previous_csv(history, date(2026, 9, 14))

    # 같은 날짜(이번 주 자신)는 제외하고 그 앞의 가장 최근 것
    assert found is not None and found.name == "screening_2026-09-05.csv"


def test_find_previous_csv_returns_none_when_history_absent(tmp_path: Path) -> None:
    assert find_previous_csv(tmp_path / "없는디렉터리", date(2026, 9, 14)) is None


def test_find_previous_csv_returns_none_when_all_records_are_newer(tmp_path: Path) -> None:
    history = tmp_path / "history"
    _write_screening_csv(history / "screening_2026-09-20.csv", [_row("005930", "삼성전자", 80.0)])

    assert find_previous_csv(history, date(2026, 9, 14)) is None


def test_diff_screenings_splits_entered_exited_and_stayed() -> None:
    current = pd.DataFrame(
        [_row("005930", "삼성전자", 82.0), _row("000660", "SK하이닉스", 75.0)]
    ).set_index("종목코드")
    previous = pd.DataFrame(
        [_row("000660", "SK하이닉스", 71.0), _row("035720", "카카오", 73.0)]
    ).set_index("종목코드")

    diff = diff_screenings(current, previous, date(2026, 9, 14), date(2026, 9, 5))

    assert diff.entered.index.tolist() == ["005930"]
    assert diff.exited.index.tolist() == ["035720"]
    assert diff.stayed.index.tolist() == ["000660"]
    assert diff.stayed.loc["000660", DELTA_COLUMN] == pytest.approx(4.0)
    assert diff.has_previous


def test_diff_screenings_treats_everything_as_new_without_previous() -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")

    diff = diff_screenings(current, None, date(2026, 9, 14), None)

    assert diff.entered.index.tolist() == ["005930"]
    assert diff.exited.empty
    assert diff.stayed.empty
    assert not diff.has_previous


def test_to_markdown_table_marks_empty_frame() -> None:
    assert to_markdown_table(pd.DataFrame()) == "(없음)"


def test_build_prompt_carries_cutoff_weights_and_tables() -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    diff = diff_screenings(current, None, date(2026, 9, 14), None)

    prompt = build_prompt(diff, CUTOFF, WEIGHTS)

    assert "2026-09-14" in prompt
    assert "커트라인: 70점" in prompt
    assert "rs_score 30점" in prompt
    assert "삼성전자" in prompt
    # 비교 대상이 없다는 사실을 모델에 명시해야 한다
    assert "지난주 기록이 없습니다" in prompt


def test_generate_brief_returns_model_text(tmp_path: Path) -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    diff = diff_screenings(current, None, date(2026, 9, 14), None)
    client = StubClient(text="## 한 줄 요약\n이번 주 1개 통과.")

    body, narrated = generate_brief(diff, CUTOFF, WEIGHTS, client=client)

    assert narrated
    assert "이번 주 1개 통과" in body
    assert client.messages.calls[0]["model"] == "claude-opus-5"


def test_generate_brief_falls_back_when_api_fails() -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    diff = diff_screenings(current, None, date(2026, 9, 14), None)
    client = StubClient(error=RuntimeError("연결 실패"))

    body, narrated = generate_brief(diff, CUTOFF, WEIGHTS, client=client)

    # 해설이 실패해도 계산 결과는 남아야 한다 (주간 메일 발송을 막지 않기 위해)
    assert not narrated
    assert "삼성전자" in body
    assert "연결 실패" in body


def test_generate_brief_falls_back_on_refusal() -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    diff = diff_screenings(current, None, date(2026, 9, 14), None)
    client = StubClient(text="", stop_reason="refusal")

    body, narrated = generate_brief(diff, CUTOFF, WEIGHTS, client=client)

    assert not narrated
    assert "refusal" in body


def test_generate_brief_falls_back_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    diff = diff_screenings(current, None, date(2026, 9, 14), None)

    body, narrated = generate_brief(diff, CUTOFF, WEIGHTS)

    assert not narrated
    assert "ANTHROPIC_API_KEY" in body


def test_fallback_brief_contains_every_section() -> None:
    current = pd.DataFrame([_row("005930", "삼성전자", 82.0)]).set_index("종목코드")
    previous = pd.DataFrame([_row("035720", "카카오", 73.0)]).set_index("종목코드")
    diff = diff_screenings(current, previous, date(2026, 9, 14), date(2026, 9, 5))

    body = fallback_brief(diff, "테스트 사유")

    assert "## 한 줄 요약" in body
    assert "## 신규 편입" in body
    assert "## 탈락" in body
    assert "카카오" in body  # 탈락 종목은 지난주 표에서 가져와야 한다
    assert "테스트 사유" in body


def test_archive_current_copies_with_standard_name(tmp_path: Path) -> None:
    source = _write_screening_csv(tmp_path / "out" / "screening_2026-09-14.csv", [_row("005930", "삼성전자", 82.0)])
    history = tmp_path / "history"

    archived = archive_current(source, history, date(2026, 9, 14))

    assert archived == history / "screening_2026-09-14.csv"
    assert load_screening_csv(archived).index.tolist() == ["005930"]
