/**
 * 한글 자모 유틸리티
 */

// 한글 유니코드 상수
const HANGUL_BASE = 0xAC00; // '가'
const HANGUL_END = 0xD7A3;  // '힣'
const CHOSUNG_COUNT = 19;
const JUNGSUNG_COUNT = 21;
const JONGSUNG_COUNT = 28;

// 초성 (19개)
const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

// 중성 (21개)
const JUNGSUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
];

// 종성 (28개 - 없음 포함)
const JONGSUNG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 한글 음절을 자모로 분해
 * @param char 한글 한 글자
 * @returns [초성, 중성, 종성] 또는 null (한글이 아닌 경우)
 */
export function decomposeHangul(char: string): [string, string, string] | null {
  if (char.length !== 1) return null;

  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return null;

  const offset = code - HANGUL_BASE;
  const chosungIndex = Math.floor(offset / (JUNGSUNG_COUNT * JONGSUNG_COUNT));
  const jungsungIndex = Math.floor((offset % (JUNGSUNG_COUNT * JONGSUNG_COUNT)) / JONGSUNG_COUNT);
  const jongsungIndex = offset % JONGSUNG_COUNT;

  return [
    CHOSUNG[chosungIndex],
    JUNGSUNG[jungsungIndex],
    JONGSUNG[jongsungIndex]
  ];
}

/**
 * 자모를 한글 음절로 조합
 * @param chosung 초성
 * @param jungsung 중성
 * @param jongsung 종성
 * @returns 조합된 한글 한 글자 또는 null (조합 불가능한 경우)
 */
export function composeHangul(chosung: string, jungsung: string, jongsung: string): string | null {
  const chosungIndex = CHOSUNG.indexOf(chosung);
  const jungsungIndex = JUNGSUNG.indexOf(jungsung);
  const jongsungIndex = JONGSUNG.indexOf(jongsung);

  if (chosungIndex === -1 || jungsungIndex === -1 || jongsungIndex === -1) {
    return null;
  }

  const code = HANGUL_BASE + (chosungIndex * JUNGSUNG_COUNT * JONGSUNG_COUNT) + (jungsungIndex * JONGSUNG_COUNT) + jongsungIndex;
  return String.fromCharCode(code);
}

/**
 * 유사 자모 매핑 (오탈자 검사용)
 */
const SIMILAR_CHOSUNG_MAP: { [key: string]: string[] } = {
  'ㄱ': ['ㄲ', 'ㅋ'],
  'ㄲ': ['ㄱ', 'ㅋ'],
  'ㄷ': ['ㄸ', 'ㅌ'],
  'ㄸ': ['ㄷ', 'ㅌ'],
  'ㅂ': ['ㅃ', 'ㅍ'],
  'ㅃ': ['ㅂ', 'ㅍ'],
  'ㅅ': ['ㅆ'],
  'ㅆ': ['ㅅ'],
  'ㅈ': ['ㅉ', 'ㅊ'],
  'ㅉ': ['ㅈ', 'ㅊ'],
  'ㅋ': ['ㄱ', 'ㄲ'],
  'ㅌ': ['ㄷ', 'ㄸ'],
  'ㅍ': ['ㅂ', 'ㅃ'],
  'ㅊ': ['ㅈ', 'ㅉ']
};

const SIMILAR_JUNGSUNG_MAP: { [key: string]: string[] } = {
  'ㅏ': ['ㅓ'],
  'ㅓ': ['ㅏ'],
  'ㅗ': ['ㅜ'],
  'ㅜ': ['ㅗ'],
  'ㅐ': ['ㅔ'],
  'ㅔ': ['ㅐ'],
  'ㅒ': ['ㅖ'],
  'ㅖ': ['ㅒ']
};

const SIMILAR_JONGSUNG_MAP: { [key: string]: string[] } = {
  'ㄱ': ['ㄲ', 'ㅋ'],
  'ㄲ': ['ㄱ'],
  'ㄷ': ['ㅌ'],
  'ㅂ': ['ㅍ'],
  'ㅅ': ['ㅆ'],
  'ㅆ': ['ㅅ'],
  'ㅈ': ['ㅊ'],
  'ㅋ': ['ㄱ'],
  'ㅌ': ['ㄷ'],
  'ㅍ': ['ㅂ'],
  'ㅊ': ['ㅈ']
};

/**
 * 유사 단어 생성 (오탈자 검사용)
 * @param word 원본 단어
 * @returns 유사 단어 배열
 */
export function generateSimilarWords(word: string): string[] {
  const similarWords: Set<string> = new Set();

  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    const decomposed = decomposeHangul(char);

    if (!decomposed) {
      // 한글이 아닌 경우 건너뛰기
      continue;
    }

    const [cho, jung, jong] = decomposed;

    // 초성 변형
    const similarCho = SIMILAR_CHOSUNG_MAP[cho] || [];
    for (const newCho of similarCho) {
      const newChar = composeHangul(newCho, jung, jong);
      if (newChar) {
        const newWord = word.substring(0, i) + newChar + word.substring(i + 1);
        similarWords.add(newWord);
      }
    }

    // 중성 변형
    const similarJung = SIMILAR_JUNGSUNG_MAP[jung] || [];
    for (const newJung of similarJung) {
      const newChar = composeHangul(cho, newJung, jong);
      if (newChar) {
        const newWord = word.substring(0, i) + newChar + word.substring(i + 1);
        similarWords.add(newWord);
      }
    }

    // 종성 변형 (종성이 있는 경우에만)
    if (jong) {
      const similarJong = SIMILAR_JONGSUNG_MAP[jong] || [];
      for (const newJong of similarJong) {
        const newChar = composeHangul(cho, jung, newJong);
        if (newChar) {
          const newWord = word.substring(0, i) + newChar + word.substring(i + 1);
          similarWords.add(newWord);
        }
      }
    }
  }

  // 원본 단어 제외
  similarWords.delete(word);

  return Array.from(similarWords);
}

/**
 * 두 단어가 유사한지 판단 (붙임표 무시)
 * @param word1 단어1
 * @param word2 단어2
 * @returns 유사 여부
 */
export function isSimilarWord(word1: string, word2: string): boolean {
  // 붙임표 제거하여 비교
  const normalized1 = word1.replace(/-/g, '');
  const normalized2 = word2.replace(/-/g, '');
  return normalized1 === normalized2;
}
