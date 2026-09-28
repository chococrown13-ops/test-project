# 자동 영상 편집기 (`make_video.py`)

CapCut 없이 **이미지 + 에피소드 JSON**만으로 쇼츠/릴스용 세로 영상(1080x1920, 30fps)을 만듭니다.

## 가장 쉬운 사용법: Claude에게 맡기기
1. 장면 이미지를 Claude Code 대화에 올립니다. ("이게 S1~S7이야")
2. Claude가 이미지를 `sns/episodes/epNN/images/`에 넣고, 대본으로 `episode.json`을 만들어 렌더링합니다.
3. 완성된 mp4를 받아서 올리기만 하면 됩니다.

## 이 스크립트가 해주는 것

| CapCut에서 하던 일 | 자동 처리 |
|---|---|
| 이미지 배치, 장면 길이 | 음성 길이에 맞춰 자동 (음성이 없으면 JSON의 `duration`) |
| 확대·이동 효과 | `camera`의 `from` → `to` |
| 제목 자막 | `title` (`**노란 강조**`, `~~빨간 취소선~~`) |
| 내레이션 자막 | 음성과 타이밍을 맞춰 한 문장씩 표시 (`captions: false`면 끔) |
| AI 음성(TTS) | Google Cloud TTS (API 키가 있을 때) |
| 배경음악 | `--bgm 음악.mp3` (내레이션보다 작게, 끝에 페이드아웃) |
| 흐린 배경으로 이미지 줄이기 | `fit: 0.8` (+ `fit_top`) |
| AI 영상 클립 끼워 넣기 | `video: "clips/s4.mp4"` (파일이 있을 때만 사용, 없으면 이미지) |

효과음은 아직 넣지 않습니다.
배경음악은 업로드할 때 각 앱의 음악 라이브러리에서 고르는 쪽이 저작권 걱정도 없고 도달에도 유리합니다.

## 해달과 배경을 움직이게 하기 (AI 영상 클립)
확대·이동 효과는 사진 전체를 움직일 뿐, 해달이 숨 쉬거나 해초가 흔들리지는 않습니다.
이렇게 움직이려면 **이미지 → 영상** AI로 장면 클립을 만들어 끼워 넣습니다.

1. Veo(Gemini 앱·Flow), Higgsfield(Seedance·Kling) 등에서 장면 이미지를 첫 프레임으로 넣고 5~8초 영상 생성
   (에피소드 문서의 "움직이는 영상 프롬프트" 사용)
2. 클립을 `episodes/epNN/clips/sN.mp4` 로 저장하거나 Claude에게 올리기
3. 다시 렌더링하면 클립이 있는 장면은 자동으로 영상을 씁니다

클립은 30fps, 1080x1920 에 맞춰지고, 클립의 소리는 쓰지 않습니다.

## 음성 켜기 (Google Cloud TTS)
1. Google Cloud 콘솔에서 **Cloud Text-to-Speech API**를 켜고 API 키를 만듭니다.
   - 무료 사용량이 있어서 쇼츠 몇십 편 정도는 보통 무료 범위입니다. (최신 요금은 Google Cloud 요금 페이지 확인)
   - API 키는 Text-to-Speech API만 쓰도록 제한해 두세요.
2. 키를 환경 변수 `GOOGLE_TTS_API_KEY`에 넣습니다.
   - Claude Code 웹: 세션 제목 줄의 클라우드 환경 메뉴 → 편집 → 환경 변수 (새 세션부터 적용)
   - 내 PC: `export GOOGLE_TTS_API_KEY=...`
   - **키를 채팅이나 저장소에 붙여넣지 마세요.**
3. 목소리는 `episode.json`의 `voice`로 바꿉니다. (예: `ko-KR-Neural2-A`, `ko-KR-Neural2-B`, `ko-KR-Neural2-C`)
   한 번 정한 목소리는 모든 편에서 같게 유지하세요.

키가 없으면 무음 영상이 만들어집니다.
이 경우 각 앱에서 올릴 때 텍스트 읽기 기능으로 목소리를 넣을 수 있습니다. (예: 틱톡·인스타 릴스의 텍스트 읽어주기)

## 내 PC에서 직접 돌리기
```bash
pip install pillow imageio-ffmpeg        # ffmpeg 가 함께 설치됨
python sns/tools/make_video.py sns/episodes/ep01/episode.json -o ep01.mp4
python sns/tools/make_video.py sns/episodes/ep01/episode.json -o ep01.mp4 --preview   # 장면별 PNG 만 빠르게
python sns/tools/make_video.py sns/episodes/ep01/episode.json -o ep01.mp4 --bgm music.mp3
```

## episode.json 형식
```json
{
  "voice": "ko-KR-Neural2-A",
  "speaking_rate": 1.08,
  "scenes": [
    {
      "image": "images/s1.jpg",
      "duration": 2.2,
      "narration": ["해달이 손잡고 잔다고요? 반은 틀렸어요!"],
      "captions": false,
      "title": "해달이 손잡고 잔다?\n**반은 틀렸어요**",
      "title_y": 0.05,
      "camera": {"from": {"zoom": 1.0, "y": 0.45}, "to": {"zoom": 1.18, "y": 0.45}, "ease": "out"}
    }
  ]
}
```

| 항목 | 뜻 |
|---|---|
| `duration` | 음성이 없을 때 장면 길이(초) |
| `narration` | 읽을 문장 목록. 문장 하나가 자막 한 줄 |
| `title`, `title_y` | 장면 제목과 세로 위치(0=맨 위, 1=맨 아래) |
| `caption_y` | 내레이션 자막 세로 위치 |
| `camera.from/to` | `zoom`(1=원본), `x`, `y`(0~1, 화면 중심 위치) |
| `camera.ease` | `smooth`(기본), `out`(빠르게 시작), `linear` |
| `fit`, `fit_top` | 이미지를 줄이고 빈 곳을 흐린 배경으로 채움 |
| `video` | AI 영상 클립 경로. 파일이 있으면 이미지 대신 사용하고 `camera` 는 무시 |
| `video_mode` | 클립이 장면보다 짧을 때: `pingpong`(기본, 앞→뒤 재생), `loop`(반복), `freeze`(마지막 장면 정지) |

화면 아래 약 20%는 앱의 캡션·채널 이름이 가리므로 `title_y`, `caption_y`는 0.78보다 위에 둡니다.

## 폰트
[Pretendard](https://github.com/orioncactus/pretendard) ExtraBold (SIL Open Font License 1.1, `fonts/Pretendard-LICENSE.txt`)
