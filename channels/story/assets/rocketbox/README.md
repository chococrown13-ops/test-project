# Microsoft Rocketbox 인물 (MIT License)
- 출처: https://github.com/microsoft/Microsoft-Rocketbox (Microsoft, MIT License — 상업 이용 가능, 저작권 표시 유지)
- 받은 것: Adults/Male_Adult_10, Male_Adult_09, Female_Adult_03 의 `_facial.fbx` + 색 텍스처
- 바꾼 방법: Blender 4.0(우분투 공식 패키지)으로 FBX → GLB. 텍스처 1024px 로 줄임, 표정 중 말하기용(AA_VI 15개)·눈 깜빡임·웃음·눈썹·입벌림만 남김
- 변환 스크립트: tools/rocketbox_to_glb.py (`blender -b --python rocketbox_to_glb.py -- 입력_facial.fbx 텍스처폴더 출력.glb`)
