# Gemini 목소리 시험 (2026-11-12)
- gem.py: Gemini API(generativelanguage) TTS 한 줄 → wav. 키는 환경의 Network secret 으로 붙음(파일에 저장 안 함)
- asr.py: 만든 소리를 다시 받아써서 대본과 비교(지시문을 읽어 버리거나 숫자를 잘못 읽는 것 잡기)
- gem_sample2.py: 1화 15줄 비교 샘플. 영어 지시(AUDIO PROFILE/SCENE/DIRECTOR'S NOTES/TRANSCRIPT) + 받아쓰기 점검 + 최대 5번 다시 만들기
- 알아낸 것: 한국어 지시문은 가끔 소리로 읽힘 → 영어 지시가 덜함. 그래도 가끔 새므로 받아쓰기 점검 필수
