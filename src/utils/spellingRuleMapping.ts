/**
 * 품사 태그별 관련 한글맞춤법 조항 매핑
 */

/**
 * 품사 태그 → 관련 조항 매핑 테이블
 */
export const MORPHEME_RULE_MAPPING: { [key: string]: string[] } = {
  // ===== 조사 =====
  'JKS': ['제41항'], // 주격조사
  'JKC': ['제41항'], // 보격조사
  'JKG': ['제41항'], // 관형격조사
  'JKO': ['제41항'], // 목적격조사
  'JKB': ['제41항'], // 부사격조사
  'JKV': ['제41항'], // 호격조사
  'JKQ': ['제41항'], // 인용격조사
  'JX': ['제41항'],  // 보조사
  'JC': ['제41항'],  // 접속조사

  // ===== 의존명사 =====
  'NNB': ['제42항', '제43항'],

  // ===== 어미 =====
  'EP': ['제44항', '제45항'], // 선어말어미
  'EF': ['제44항', '제45항'], // 종결어미
  'EC': ['제44항', '제45항'], // 연결어미
  'ETN': ['제44항', '제45항'], // 명사형전성어미
  'ETM': ['제44항', '제45항'], // 관형사형전성어미

  // ===== 용언 (어간 및 어미 결합) =====
  'VV': ['제15항', '제16항', '제17항', '제18항', '제19항', '제20항'], // 동사
  'VA': ['제15항', '제16항', '제17항', '제18항', '제19항', '제20항'], // 형용사
  'VX': ['제27항'], // 보조용언
  'VCP': ['제52항'], // 긍정지정사
  'VCN': ['제52항'], // 부정지정사

  // ===== 접사 =====
  'XPN': ['제29항', '제30항'], // 체언 접두사
  'XSN': ['제27항', '제28항'], // 명사 파생 접미사
  'XSV': ['제27항', '제28항'], // 동사 파생 접미사
  'XSA': ['제27항', '제28항'], // 형용사 파생 접미사
  'XR': ['제27항'], // 어근

  // ===== 고유명사 (두음법칙) =====
  'NNP': ['제10항', '제11항', '제12항', '제13항'],

  // ===== 외래어 =====
  'SL': ['제3항'], // 외래어

  // ===== 수사 =====
  'NR': ['제42항'], // 수사 (단위 의존명사와의 띄어쓰기)
};

/**
 * 형태소 분석 결과에서 관련 조항 추출
 */
export function getRelevantRuleNumbers(morphemeTypes: string[]): string[] {
  const ruleSet = new Set<string>();

  // 기본적으로 항상 포함할 조항
  ruleSet.add('제1항'); // 총칙
  ruleSet.add('제2항'); // 띄어쓰기 원칙

  // 형태소 품사에 따라 관련 조항 추가
  morphemeTypes.forEach(type => {
    const rules = MORPHEME_RULE_MAPPING[type];
    if (rules) {
      rules.forEach(rule => ruleSet.add(rule));
    }
  });

  return Array.from(ruleSet).sort((a, b) => {
    // 제N항 숫자 추출하여 정렬
    const numA = parseInt(a.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });
}

/**
 * koreanSpellingRules.txt에서 특정 조항들만 추출
 */
export function extractRulesFromText(fullText: string, ruleNumbers: string[]): string {
  const extracted: string[] = [];

  ruleNumbers.forEach(ruleNum => {
    try {
      // 정규표현식: 제N항부터 다음 제M항 또는 제N장 전까지
      const pattern = new RegExp(
        `(${escapeRegex(ruleNum)}[\\s\\S]*?)(?=제\\d+[항장]|$)`,
        ''
      );

      const match = fullText.match(pattern);
      if (match && match[1]) {
        let ruleText = match[1].trim();

        // 너무 길면 일부만 (500자 제한)
        if (ruleText.length > 1000) {
          // [붙임] 부분 제외하고 본문만
          const mainPart = ruleText.split(/\[붙임/)[0];
          ruleText = mainPart.trim();
        }

        extracted.push(ruleText);
      }
    } catch (error) {
      console.warn(`[SpellingRule] ${ruleNum} 추출 실패:`, error);
    }
  });

  return extracted.join('\n\n');
}

/**
 * 정규표현식 이스케이프
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
