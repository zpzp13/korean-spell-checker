/**
 * 한글맞춤법 규정 압축 유틸리티
 * 예문과 붙임을 제거하여 핵심 원칙만 유지
 */

/**
 * 어문 규정 압축
 */
export function compressSpellingRules(fullText: string): string {
  const lines = fullText.split('\n');
  const compressed: string[] = [];

  let skipUntilNextRule = false;
  let inExample = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // [붙임] 섹션 스킵
    if (trimmed.startsWith('[붙임')) {
      skipUntilNextRule = true;
      continue;
    }

    // 다음 규정이나 장이 나올 때까지 스킵
    if (skipUntilNextRule) {
      if (trimmed.match(/^제\d+[항장]/)) {
        skipUntilNextRule = false;
      } else {
        continue;
      }
    }

    // 빈 줄 (최대 1줄만 유지)
    if (trimmed === '') {
      if (compressed.length > 0 && compressed[compressed.length - 1] !== '') {
        compressed.push('');
      }
      continue;
    }

    // 제N장, 제N절, 제N항 - 항상 유지
    if (trimmed.match(/^제\d+[장절항]/)) {
      inExample = false;
      compressed.push(line);
      continue;
    }

    // 장/절 제목 - 유지
    if (i > 0 && lines[i - 1].match(/^제\d+[장절]/)) {
      compressed.push(line);
      continue;
    }

    // 예문 탐지: 탭이 있거나 여러 단어가 나열된 경우
    if (line.includes('\t') || trimmed.match(/^[ㄱ-힣]+\s+[ㄱ-힣]+\s+[ㄱ-힣]+/)) {
      inExample = true;
      continue;
    }

    // 비교 표 (ㄱ, ㄴ)
    if (trimmed.match(/^[ㄱㄴ]\s*$/)) {
      inExample = true;
      continue;
    }

    // 예문 영역 내의 단일 단어들
    if (inExample && !trimmed.match(/^[\d]+\./) && !trimmed.startsWith('다만')) {
      // 숫자 리스트나 '다만'이 아니면 계속 스킵
      if (!trimmed.match(/^제\d+[항장]/)) {
        continue;
      }
    }

    // 핵심 내용 유지
    // - 숫자 리스트 (1., 2., ...)
    // - '다만' 예외 규정
    // - 일반 설명 문장
    if (trimmed.match(/^[\d]+\./) || trimmed.startsWith('다만')) {
      inExample = false;
      compressed.push(line);
      continue;
    }

    // 일반 문장 (예문 영역이 아닌 경우)
    if (!inExample) {
      compressed.push(line);
    }
  }

  // 연속된 빈 줄 제거
  const result: string[] = [];
  let prevEmpty = false;

  for (const line of compressed) {
    if (line.trim() === '') {
      if (!prevEmpty) {
        result.push(line);
      }
      prevEmpty = true;
    } else {
      result.push(line);
      prevEmpty = false;
    }
  }

  return result.join('\n').trim();
}

/**
 * 압축률 계산
 */
export function getCompressionStats(original: string, compressed: string): {
  originalSize: number;
  compressedSize: number;
  ratio: number;
} {
  const originalSize = original.length;
  const compressedSize = compressed.length;
  const ratio = ((originalSize - compressedSize) / originalSize) * 100;

  return {
    originalSize,
    compressedSize,
    ratio: Math.round(ratio * 10) / 10
  };
}
