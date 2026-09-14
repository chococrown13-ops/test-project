"""주간 스크리닝 결과 브리핑 생성 (CLI).

run_screening.py가 만든 이번 주 CSV를 history/에 쌓인 지난주 CSV와 비교해 "지난주 대비
무엇이 바뀌었는지"를 한글 브리핑으로 만든다. CSV 원본만 메일로 받으면 매주 직접 열어
비교해야 하므로, 편입/탈락/유지와 점수 변화를 정리하고 그 위에 해설을 붙이는 단계다.

사용 예:
    python -m pipeline.weekly_brief \
        --current out/screening_2026-09-14.csv \
        --history history \
        --out out/brief_2026-09-14.md

설계 원칙 — 파이프라인 전체를 죽이지 않는다:
run_screening.py가 DART 공백을 "그 종목만 0점"으로 처리하듯, 이 모듈도 ANTHROPIC_API_KEY가
없거나 API 호출이 실패하면 해설 없이 계산된 비교표만 담은 브리핑(fallback_brief)을 쓰고
정상 종료한다. 주간 자동화에서 해설 생성 실패가 CSV 메일 발송까지 막으면 안 되기 때문이다.
호출이 성공했는지 여부는 브리핑 말미의 생성 방식 표기로 구분한다.

비교 대상(지난주 CSV)은 --history 디렉터리에 쌓인 screening_YYYY-MM-DD.csv 중 이번 주보다
앞선 가장 최근 파일이다. 브리핑을 쓴 뒤 이번 주 CSV도 같은 디렉터리에 복사해 다음 주 실행이
비교 대상으로 쓸 수 있게 한다 (archive_current).
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd

CODE_COLUMN = "종목코드"
NAME_COLUMN = "종목명"
SCORE_COLUMN = "종합점수"
RS_COLUMN = "RS점수"
DELTA_COLUMN = "점수변화"

FILENAME_PATTERN = re.compile(r"^screening_(\d{4}-\d{2}-\d{2})\.csv$")

MODEL = "claude-opus-5"
MAX_TOKENS = 16000

SYSTEM_PROMPT = """당신은 국내 주식 스윙 트레이딩 퀀트 스크리닝 파이프라인의 주간 결과를
정리하는 애널리스트입니다. 한국어로 간결한 브리핑을 씁니다.

## 스크리닝 방식
종목은 4단계를 거쳐 선정됩니다: 유니버스 필터(시총·거래대금·주가) -> RS 상위 백분위 필터 ->
트렌드 템플릿 4조건 하드 필터 -> 100점 만점 점수표 채점 후 커트라인 통과.
점수는 5개 팩터 배점의 합입니다: 모멘텀(RS), 추세(트렌드 템플릿 충족도), 퀄리티(ROIC·
OCF>순이익·이자보상배율), 변동성(ATR 비율이 목표 밴드 중앙에 가까울수록 고득점),
밸류(PER 밴드·PEG). 각 배점의 만점은 점수표 설정값이며 브리핑 데이터에 함께 주어집니다.

## 반드시 지킬 것
1. 주어진 숫자만 근거로 쓰십시오. 뉴스, 실적 전망, 업황, 테마 등 데이터에 없는 정보를
   지어내지 마십시오. 종목의 사업 내용을 아는 척하지 마십시오.
2. 퀄리티배점이나 밸류배점이 0인 종목은 "재무가 나쁘다"가 아니라 **DART 재무데이터 공백일
   가능성**을 함께 언급하십시오. 이 파이프라인은 DART 조회에 실패한 종목을 0점으로 처리합니다.
3. 커트라인 바로 위(커트라인 ~ +4점) 종목은 과거 백테스트에서 가장 약한 성과를 보인 구간입니다.
   해당 구간 종목이 있으면 "턱걸이 통과라 신뢰도가 낮다"고 명시하십시오.
4. 매수/매도 지시나 목표가를 쓰지 마십시오. 이것은 스크리닝 결과 요약이지 투자 조언이 아닙니다.
5. 데이터가 빈약하면 빈약하다고 쓰십시오. 분량을 채우려고 일반론을 늘리지 마십시오.

## 출력 형식
마크다운. 최상단 제목은 쓰지 말고 아래 섹션만 쓰십시오(내용이 없는 섹션은 통째로 생략):

## 한 줄 요약
(이번 주 결과를 1~2문장으로)

## 신규 편입
(종목별로 점수 구성에서 무엇이 점수를 만들었는지 한 줄씩)

## 탈락
(지난주 통과했으나 이번 주 빠진 종목. 탈락 사유는 데이터에 없으므로 단정하지 말고,
지난주 점수가 커트라인에 얼마나 가까웠는지로만 설명)

## 유지 종목의 점수 변화
(점수가 의미 있게 움직인 종목 위주로. 변화가 미미하면 그렇게 한 줄로)

## 눈여겨볼 점
(팩터 배점 분포에서 드러나는 것: 특정 배점이 전부 0이면 데이터 공백 신호, 특정 팩터에만
점수가 쏠려 있으면 그 편중 등. 없으면 이 섹션을 생략)
"""


@dataclass(frozen=True)
class ScreeningDiff:
    """이번 주 스크리닝 결과와 지난주 결과의 비교."""

    as_of: date
    previous_as_of: date | None
    current: pd.DataFrame
    entered: pd.DataFrame
    exited: pd.DataFrame
    stayed: pd.DataFrame

    @property
    def has_previous(self) -> bool:
        return self.previous_as_of is not None


def load_screening_csv(path: Path) -> pd.DataFrame:
    """스크리닝 CSV를 읽는다.

    종목코드는 "005930"처럼 앞자리 0이 의미를 가지므로 반드시 문자열로 읽는다 (기본 추론에
    맡기면 5930이 되어 다음 주 비교에서 다른 종목으로 취급된다).
    통과 종목이 0개인 주에는 내용이 없는 CSV가 나오는데, 그때는 빈 DataFrame으로 돌려준다.
    """
    try:
        frame = pd.read_csv(path, dtype={CODE_COLUMN: str}, encoding="utf-8-sig")
    except pd.errors.EmptyDataError:
        return _empty_screening_frame()

    if CODE_COLUMN not in frame.columns:
        return _empty_screening_frame()
    return frame.set_index(CODE_COLUMN)


def _empty_screening_frame() -> pd.DataFrame:
    frame = pd.DataFrame(columns=[NAME_COLUMN, SCORE_COLUMN])
    frame.index.name = CODE_COLUMN
    return frame


def parse_as_of(path: Path) -> date | None:
    """screening_YYYY-MM-DD.csv 파일명에서 기준일을 뽑는다. 형식이 다르면 None."""
    match = FILENAME_PATTERN.match(path.name)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y-%m-%d").date()


def find_previous_csv(history_dir: Path, as_of: date) -> Path | None:
    """history 디렉터리에서 as_of보다 앞선 가장 최근 스크리닝 CSV를 찾는다.

    매주 실행이 원칙이지만 한 주 걸렀을 수도 있으므로 "지난주"를 날짜로 계산하지 않고
    실제로 존재하는 파일 중 가장 최근 것을 쓴다.
    """
    if not history_dir.is_dir():
        return None

    dated = [
        (file_as_of, path)
        for path in history_dir.glob("screening_*.csv")
        if (file_as_of := parse_as_of(path)) is not None and file_as_of < as_of
    ]
    if not dated:
        return None
    return max(dated)[1]


def diff_screenings(
    current: pd.DataFrame,
    previous: pd.DataFrame | None,
    as_of: date,
    previous_as_of: date | None,
) -> ScreeningDiff:
    """편입 / 탈락 / 유지(+점수변화)로 나눈다."""
    if previous is None or previous.empty:
        return ScreeningDiff(
            as_of=as_of,
            previous_as_of=previous_as_of,
            current=current,
            entered=current,
            exited=_empty_screening_frame(),
            stayed=_empty_screening_frame(),
        )

    entered_codes = current.index.difference(previous.index)
    exited_codes = previous.index.difference(current.index)
    stayed_codes = current.index.intersection(previous.index)

    stayed = current.loc[stayed_codes].copy()
    if not stayed.empty:
        stayed[DELTA_COLUMN] = (
            stayed[SCORE_COLUMN] - previous.loc[stayed_codes, SCORE_COLUMN]
        ).round(1)
        stayed = stayed.sort_values(DELTA_COLUMN, ascending=False)

    return ScreeningDiff(
        as_of=as_of,
        previous_as_of=previous_as_of,
        current=current,
        entered=current.loc[entered_codes].sort_values(SCORE_COLUMN, ascending=False),
        exited=previous.loc[exited_codes].sort_values(SCORE_COLUMN, ascending=False),
        stayed=stayed,
    )


def to_markdown_table(frame: pd.DataFrame) -> str:
    """DataFrame을 마크다운 표로 (tabulate 의존성을 추가하지 않기 위한 최소 구현)."""
    if frame.empty:
        return "(없음)"

    headers = [frame.index.name or ""] + [str(column) for column in frame.columns]
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    for code, row in frame.iterrows():
        cells = [str(code)] + [_format_cell(value) for value in row]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def _format_cell(value: object) -> str:
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def build_prompt(diff: ScreeningDiff, cutoff: float, weights: dict[str, float]) -> str:
    """모델에 넘길 사용자 메시지. 계산은 전부 끝난 상태로 표만 넘긴다."""
    weight_text = ", ".join(f"{name} {weight}점" for name, weight in weights.items())
    previous_text = (
        diff.previous_as_of.isoformat() if diff.previous_as_of else "없음 (첫 실행이거나 이전 기록 없음)"
    )

    sections = [
        f"기준일: {diff.as_of.isoformat()}",
        f"직전 비교 기준일: {previous_text}",
        f"커트라인: {cutoff}점 / 팩터 배점 만점: {weight_text}",
        "",
        f"## 이번 주 통과 종목 ({len(diff.current)}개)",
        to_markdown_table(diff.current),
        "",
        f"## 신규 편입 ({len(diff.entered)}개)",
        to_markdown_table(diff.entered),
        "",
        f"## 탈락 — 지난주 통과했으나 이번 주 빠짐 ({len(diff.exited)}개, 표의 점수는 지난주 값)",
        to_markdown_table(diff.exited),
        "",
        f"## 유지 ({len(diff.stayed)}개, {DELTA_COLUMN} = 지난주 대비 증감)",
        to_markdown_table(diff.stayed),
    ]
    if not diff.has_previous:
        sections += [
            "",
            "주의: 비교할 지난주 기록이 없습니다. 변화 서술 대신 이번 주 결과 자체만 정리하고,"
            " 다음 주부터 비교가 가능해진다는 점을 한 줄로 덧붙이십시오.",
        ]
    return "\n".join(sections)


def fallback_brief(diff: ScreeningDiff, reason: str) -> str:
    """해설 생성에 실패했을 때 쓰는, 계산 결과만 담은 브리핑."""
    previous_text = diff.previous_as_of.isoformat() if diff.previous_as_of else "없음"
    return "\n".join(
        [
            "## 한 줄 요약",
            f"이번 주 커트라인 통과 {len(diff.current)}개 "
            f"(신규 {len(diff.entered)} / 탈락 {len(diff.exited)} / 유지 {len(diff.stayed)}). "
            f"직전 비교 기준일: {previous_text}.",
            "",
            "## 이번 주 통과 종목",
            to_markdown_table(diff.current),
            "",
            "## 신규 편입",
            to_markdown_table(diff.entered),
            "",
            "## 탈락 (표의 점수는 지난주 값)",
            to_markdown_table(diff.exited),
            "",
            f"## 유지 ({DELTA_COLUMN} = 지난주 대비 증감)",
            to_markdown_table(diff.stayed),
            "",
            f"> 해설 생성을 건너뛰고 계산 결과만 실었습니다: {reason}",
        ]
    )


def generate_brief(
    diff: ScreeningDiff,
    cutoff: float,
    weights: dict[str, float],
    client: object | None = None,
    model: str = MODEL,
) -> tuple[str, bool]:
    """브리핑 본문과 "해설 생성 성공 여부"를 돌려준다.

    client를 주지 않으면 ANTHROPIC_API_KEY로 Anthropic 클라이언트를 만든다. 키가 없거나
    호출이 실패하면 예외를 올리지 않고 fallback_brief를 돌려준다 (모듈 docstring 참고).
    """
    prompt = build_prompt(diff, cutoff, weights)

    if client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return fallback_brief(diff, "ANTHROPIC_API_KEY가 설정되지 않음"), False
        try:
            import anthropic
        except ImportError:
            return fallback_brief(diff, "anthropic 패키지가 설치되지 않음"), False
        client = anthropic.Anthropic()

    try:
        response = client.messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as error:  # 해설 실패가 주간 자동화 전체를 막으면 안 된다
        return fallback_brief(diff, f"API 호출 실패 ({type(error).__name__}: {error})"), False

    if getattr(response, "stop_reason", None) == "refusal":
        return fallback_brief(diff, "모델이 응답을 거절함 (stop_reason=refusal)"), False

    text = "\n".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        return fallback_brief(diff, "모델 응답이 비어 있음"), False
    return text, True


def archive_current(current_path: Path, history_dir: Path, as_of: date) -> Path:
    """이번 주 CSV를 history 디렉터리에 표준 파일명으로 복사한다 (다음 주 비교 대상)."""
    history_dir.mkdir(parents=True, exist_ok=True)
    destination = history_dir / f"screening_{as_of.isoformat()}.csv"
    shutil.copyfile(current_path, destination)
    return destination


def _load_score_config() -> tuple[float, dict[str, float]]:
    from pipeline.run_screening import load_config

    score_cfg = load_config("score_table")
    return score_cfg["cutoff"], score_cfg["weights"]


def main() -> None:
    parser = argparse.ArgumentParser(description="주간 스크리닝 결과 브리핑 생성")
    parser.add_argument("--current", required=True, help="이번 주 스크리닝 CSV 경로")
    parser.add_argument("--history", default="history", help="과거 스크리닝 CSV 보관 디렉터리")
    parser.add_argument("--out", required=True, help="생성한 브리핑(.md) 경로")
    parser.add_argument("--model", default=MODEL, help=f"해설 생성에 쓸 모델 (기본 {MODEL})")
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="이번 주 CSV를 history로 복사하지 않는다 (로컬에서 시험 실행할 때)",
    )
    args = parser.parse_args()

    current_path = Path(args.current)
    history_dir = Path(args.history)
    out_path = Path(args.out)

    as_of = parse_as_of(current_path) or date.today()
    current = load_screening_csv(current_path)

    previous_path = find_previous_csv(history_dir, as_of)
    previous = load_screening_csv(previous_path) if previous_path else None
    previous_as_of = parse_as_of(previous_path) if previous_path else None
    if previous_path:
        print(f"비교 대상: {previous_path} (기준일 {previous_as_of})")
    else:
        print(f"비교 대상 없음 — {history_dir}에 이전 스크리닝 CSV가 없습니다")

    diff = diff_screenings(current, previous, as_of, previous_as_of)
    print(
        f"통과 {len(diff.current)}개 / 신규 {len(diff.entered)} / "
        f"탈락 {len(diff.exited)} / 유지 {len(diff.stayed)}"
    )

    cutoff, weights = _load_score_config()
    body, narrated = generate_brief(diff, cutoff, weights, model=args.model)
    if not narrated:
        print("해설 생성을 건너뛰었습니다 — 계산 결과만 담은 브리핑을 씁니다")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        f"# 주간 퀀트 스크리닝 브리핑 ({as_of.isoformat()})\n\n{body}\n",
        encoding="utf-8",
    )
    print(f"브리핑 작성 완료 -> {out_path}")

    if not args.no_archive:
        archived = archive_current(current_path, history_dir, as_of)
        print(f"이번 주 CSV 보관 -> {archived}")


if __name__ == "__main__":
    main()
