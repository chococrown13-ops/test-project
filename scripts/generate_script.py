#!/usr/bin/env python3
"""축구 쇼츠/릴스 대본 초안 생성기.

기본적으로는 API 키 없이 템플릿 기반으로 빈칸을 채울 수 있는 초안을 생성합니다.
--use-ai 플래그와 ANTHROPIC_API_KEY 환경변수가 있으면 Claude를 호출해
실제 문장이 채워진 완성 대본을 생성합니다.
"""

import argparse
import os
import sys
import textwrap

STYLES = ("정보형", "스토리텔링", "밈")

TEMPLATE = """\
# 쇼츠 대본 초안

주제: {topic}
스타일: {style}
목표 길이: {duration}초

## Scene 1 — 훅 (0~2초)
나레이션: [ "{topic}"에 대한 궁금증을 자극하는 한 문장을 여기에 작성하세요 ]
화면 설명: [ 강렬한 오프닝 비주얼 - docs/video-prompt-library.md 참고 ]

## Scene 2 — 문제 제기 (2~8초)
나레이션: [ 왜 이 주제가 특별한지 질문 형태로 제시 ]
화면 설명: [ ]

## Scene 3 — 본문 (8~45초)
포인트 1 — 나레이션: [ 핵심 사실/숫자 1 ]
포인트 1 — 화면 설명: [ ]

포인트 2 — 나레이션: [ 핵심 사실/숫자 2 ]
포인트 2 — 화면 설명: [ ]

포인트 3 — 나레이션: [ 핵심 사실/숫자 3 ]
포인트 3 — 화면 설명: [ ]

## Scene 4 — 반전/결론 (45~55초)
나레이션: [ 예상 밖의 인사이트 또는 정리 ]
화면 설명: [ ]

## Scene 5 — CTA (55~60초)
나레이션: [ 팔로우/댓글 유도 문장 ]
화면 텍스트: [ ]

---
TODO: 대괄호 [ ] 부분을 채우거나, --use-ai 옵션으로 Claude에게 초안 작성을 맡기세요.
"""


def build_template_draft(topic: str, style: str, duration: int) -> str:
    return TEMPLATE.format(topic=topic, style=style, duration=duration)


def build_ai_draft(topic: str, style: str, duration: int) -> str:
    try:
        import anthropic
    except ImportError:
        print(
            "anthropic 패키지가 설치되어 있지 않습니다. "
            "`pip install anthropic` 후 다시 시도하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않습니다.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    prompt = textwrap.dedent(f"""
        당신은 축구 관련 유튜브 쇼츠/릴스 전문 작가입니다.
        아래 조건에 맞는 {duration}초 분량의 세로형(9:16) 쇼츠 대본을 작성하세요.

        주제: {topic}
        스타일: {style}

        구조 (templates/script_template.md 형식을 따르세요):
        1. 훅 (0~2초) - 스크롤을 멈추게 하는 강렬한 한 문장
        2. 문제 제기 (2~8초)
        3. 본문 (8~45초) - 핵심 포인트 3개, 숫자/사실 위주
        4. 반전/결론 (45~55초)
        5. CTA (55~60초)

        각 씬마다 "나레이션"과 "화면 설명(AI 영상 생성 프롬프트로 활용 가능하도록
        구체적으로)"을 함께 작성하세요. 실제 선수 얼굴을 노출하지 않는 연출
        (실루엣, 클로즈업, 데이터 시각화 등)을 우선 제안하세요.
    """).strip()

    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", required=True, help="쇼츠 주제 (예: '메시 vs 호날두 통산 기록 비교')")
    parser.add_argument("--style", default="정보형", choices=STYLES, help="대본 스타일")
    parser.add_argument("--duration", type=int, default=45, help="목표 영상 길이(초), 기본 45초")
    parser.add_argument("--use-ai", action="store_true", help="Claude API로 실제 문장을 채운 대본 생성")
    parser.add_argument("--output", help="결과를 저장할 파일 경로 (미지정 시 표준출력)")
    args = parser.parse_args()

    if args.use_ai:
        draft = build_ai_draft(args.topic, args.style, args.duration)
    else:
        draft = build_template_draft(args.topic, args.style, args.duration)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(draft)
        print(f"대본 초안을 {args.output} 에 저장했습니다.")
    else:
        print(draft)


if __name__ == "__main__":
    main()
