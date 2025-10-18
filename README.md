# Korean Spell Checker for Obsidian

> 한국어 맞춤법 검사와 AI 기반 검증 기능을 제공하는 Obsidian 플러그인

[![GitHub release](https://img.shields.io/github/v/release/zpzp13/korean-spell-checker)](https://github.com/zpzp13/korean-spell-checker/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 중요 !
- 본 플러그인은 다음(DAUM)의 비공식 API를 사용합니다. 
- 저작권자의 요청이 있을 경우 본 저장소는 예고 없이 삭제될 수 있습니다.
- 본 플러그인을 상업적으로 이용하여 발생하는 모든 문제에 대해 개발자는 책임지지 않습니다.
- 사용자는 본인의 책임 하에 플러그인을 사용해야 합니다.

## 주요 기능

### 기본 맞춤법 검사
- **전체 텍스트 한 번에 검사**: 긴 문서도 빠르게 처리
- **좌우 분할 UI**: 미리보기와 오류 목록을 동시에 확인
- **고유명사 관리**: 자주 사용하는 고유명사를 예외 목록에 등록

### AI 검증 (선택사항)
- **Gemini 2.5 Flash Lite**: 맞춤법 검사 결과를 AI가 재검증
- **한글맞춤법 규정 기반**: 실제 어문 규정을 참조하여 정확한 조언 제공

### 5가지 상태 시스템
오류별로 5가지 처리 방법을 선택할 수 있습니다:

- 🔴 **오류**: 감지된 오류 
- 🟢 **수정**: 제안 적용 
- 🟠 **예외**: 원본 유지 
- 🟣 **직접입력**: 사용자가 직접 수정 
- 🔵 **고유명사**: 향후 검사에서 제외 

## 설치 방법

### 수동 설치
1. [Releases](https://github.com/zpzp13/korean-spell-checker/releases)에서 최신 버전 다운로드
2. 다운로드한 파일을 `{vault}/.obsidian/plugins/korean-spell-checker/` 폴더에 압축 해제
3. Obsidian 설정 → 커뮤니티 플러그인 → Korean Spell Checker 활성화

## API 키 설정

### 필수 API

### AI 검증 사용 시 (선택사항)

AI 검증 기능을 사용하려면 다음 API 키가 필요합니다:

#### 1. Gemini API (언어모델)
- **발급**: [Google AI Studio](https://aistudio.google.com/api-keys)
- **비용**: 무료 (일일 한도 있음)
- **용도**: AI 기반 맞춤법 검증 및 조언

#### 2. ETRI API (형태소 분석) 
- **발급**: [ETRI AI Open API](https://aiopen.etri.re.kr/)
- **비용**: 무료 (5,000건/일)
- **용도**: 정확한 품사 분석

#### 3. 표준국어대사전 API (어휘 분석) 
- **발급**: [국립국어원 Open API](https://stdict.korean.go.kr/openapi/openApiInfo.do)
- **비용**: 무료
- **용도**: 단어 품사 및 의미 정보 조회

## 사용 방법

### 기본 사용법
1. 검사할 텍스트 선택 (선택하지 않으면 전체 문서 검사)
2. 명령 팔레트(`Ctrl/Cmd + P`) → **"한국어 맞춤법 검사"** 실행
3. 모달에서 오류 확인 및 수정
4. `Alt + Enter`로 적용 또는 `Alt + F4`로 취소

### AI 검증 사용법
1. 맞춤법 검사 모달에서 확인하고 싶은 오류 선택
2. 봇 아이콘(🤖) 클릭 또는 `Alt + I` 단축키
3. AI 분석 결과 및 조언 확인
4. 제안된 대치어 확인 (띄어쓰기 변경사항 시각화)

## 단축키

### 모달 내 단축키
| 단축키 | 기능 |
|--------|------|
| `Tab` / `Shift + Tab` | 다음/이전 오류로 이동 |
| `↑` / `↓` | 다음/이전 오류로 이동 |
| `←` / `→` | 상태 변경 (오류 ↔ 수정 ↔ 예외 ↔ 직접입력 ↔ 고유명사) |
| `Alt + I` | AI 검증 실행 |
| `Alt + Enter` | 수정사항 적용 |
| `Alt + F4` | 모달 닫기 |

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

## 버그 제보 & 기능 제안

[GitHub Issues](https://github.com/zpzp13/korean-spell-checker/issues)에서 버그를 제보하거나 새로운 기능을 제안해주세요.

---

**Made with ❤️ for Korean Obsidian users**
