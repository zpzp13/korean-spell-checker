import { Correction } from '../types/interfaces';
import { DictionaryService, WordInfo } from './dictionaryService';
import { ETRIMorphService, MorphemeToken } from './etriMorphService';
import { getRelevantRuleNumbers, extractRulesFromText } from '../utils/spellingRuleMapping';
import { DictionaryLemmatizer } from '../utils/dictionaryLemmatizer';

/**
 * AI 검증 결과
 */
export interface AIVerificationResult {
  needsCorrection: boolean; // 교정 필요 여부
  suggestion: string; // 올바른 표현
  advice: string; // 근거 설명
  source: string; // 한글맞춤법 제N항
}

/**
 * Gemini API 서비스
 */
export class GeminiService {
  private apiKey: string;
  private model: string = 'gemini-2.5-flash-lite';
  private spellingRulesText: string = '';
  private dictionaryService: DictionaryService | null = null;
  private etriService: ETRIMorphService | null = null;
  private lemmatizer: DictionaryLemmatizer;

  constructor(apiKey: string, spellingRulesText?: string, dictionaryApiKey?: string, etriApiKey?: string) {
    this.apiKey = apiKey;
    this.lemmatizer = new DictionaryLemmatizer();
    if (spellingRulesText) {
      this.spellingRulesText = spellingRulesText;
    }
    if (dictionaryApiKey && dictionaryApiKey.trim().length > 0) {
      this.dictionaryService = new DictionaryService(dictionaryApiKey);
    }
    if (etriApiKey && etriApiKey.trim().length > 0) {
      this.etriService = new ETRIMorphService(etriApiKey);
    }
  }

  /**
   * 규정 텍스트에서 규정 번호 추출
   */
  private extractRuleNumbers(rulesText: string): string[] {
    const matches = rulesText.match(/제\d+항/g);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * 오류 단어 주변 텍스트 추출 (500자)
   */
  private extractContext(originalText: string, errorWord: string): string {
    const index = originalText.indexOf(errorWord);
    if (index === -1) return originalText.substring(0, 500);

    const start = Math.max(0, index - 250);
    const end = Math.min(originalText.length, index + errorWord.length + 250);

    let context = originalText.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < originalText.length) context = context + '...';

    return context;
  }


  /**
   * Gemini API 호출
   */
  private async queryGemini(prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      const errorMsg = data.error.message || JSON.stringify(data.error);
      throw new Error(errorMsg);
    }

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini API 응답 오류');
    }

    if (!data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
      throw new Error('Gemini API 응답 형식 오류');
    }

    return data.candidates[0].content.parts[0].text;
  }

  /**
   * 맞춤법 오류 검증
   */
  async verifyCorrection(
    originalText: string,
    errorWord: string,
    suggestions: string[],
    checkerHelp: string
  ): Promise<AIVerificationResult> {
    try {
      // 문맥 추출
      const context = this.extractContext(originalText, errorWord);

      // 1. ETRI 형태소 분석
      let morphemes: MorphemeToken[] = [];
      let morphAnalysisText = '';

      if (this.etriService) {
        try {
          morphemes = await this.etriService.analyzeMorpheme(errorWord);

          morphAnalysisText = '===형태소 분석 결과 (ETRI)===\n\n';
          morphAnalysisText += `'${errorWord}'\n→ `;
          morphAnalysisText += morphemes.map(m =>
            `${m.lemma}(${m.type}, ${ETRIMorphService.getTagName(m.type)})`
          ).join(' + ');
          morphAnalysisText += '\n';

        } catch (error) {
          console.warn('[Gemini] ETRI 형태소 분석 오류:', error);
          morphAnalysisText = '===형태소 분석 결과===\n\nETRI API 오류로 형태소 분석을 수행할 수 없습니다.\n';
        }
      } else {
        morphAnalysisText = '===형태소 분석 결과===\n\nETRI API 키가 설정되지 않았습니다.\n';
      }

      // 2. 표준국어대사전 검색
      let dictResults = '';

      if (this.dictionaryService) {
        try {
          dictResults = '===표준국어대사전 검증===\n\n';

          // 2-1. 어절 전체 검색 (스마트 검색)
          let wholeWordResult = await this.dictionaryService.searchWord(errorWord);

          dictResults += '[어절 전체]\n';
          dictResults += `'${errorWord}' → ${wholeWordResult.length > 0 ? '✅ 사전에 있음' : '❌ 사전에 없음'}\n`;

          // 원형 검색 실패하고 형태소 분석이 있으면 lemmatizer 시도
          if (wholeWordResult.length === 0 && morphemes.length > 0) {
            const firstMorpheme = morphemes[0];
            const candidates = this.lemmatizer.getLemmaCandidates(errorWord, firstMorpheme.type);

            for (const candidate of candidates.slice(0, 2)) { // 최대 2개만 시도
              if (candidate === errorWord) continue; // 이미 시도한 원형은 스킵

              const result = await this.dictionaryService.searchWord(candidate);
              if (result.length > 0) {
                wholeWordResult = result;
                dictResults += `  → '${candidate}' 형태로 재검색: ✅ 사전에 있음\n`;
                break;
              }
            }
          }

          if (wholeWordResult.length > 0) {
            wholeWordResult.forEach((info, idx) => {
              const prefix = wholeWordResult.length > 1 ? `  [뜻${idx + 1}] ` : `  - `;
              dictResults += `${prefix}'${info.word}' [${info.pos}] ${info.definition}`;
              if (info.isRedirect) {
                dictResults += ` 🚫 비표준어`;
              }
              dictResults += `\n`;
            });
            dictResults += `\n⚠️ 표준국어대사전에 표제어로 등재된 경우, 해당 표기를 우선 적용\n\n`;
          } else {
            dictResults += '\n';
          }

          // 2-2. 형태소별 검색 (ETRI 결과가 있는 경우만)
          if (morphemes.length > 0) {
            dictResults += '[형태소별 검색]\n';

            for (const m of morphemes) {
              // 실질 형태소만 검색 (조사, 어미 제외)
              if (['NNG', 'NNP', 'NNB', 'NR', 'NP', 'VV', 'VA', 'VX', 'XSV', 'XSA', 'XR', 'MM', 'MAG', 'MAJ'].includes(m.type)) {
                // 다양한 형태 후보 생성
                const lemmaCandidates = this.lemmatizer.getLemmaCandidates(m.lemma, m.type);

                let found = false;
                let foundResults: WordInfo[] = [];

                // 순서대로 검색 시도
                for (const candidate of lemmaCandidates) {
                  const results = await this.dictionaryService.searchWord(candidate);
                  if (results.length > 0) {
                    found = true;
                    foundResults = results;
                    if (candidate !== m.lemma) {
                      dictResults += `✅ '${m.lemma}' [${m.type}, ${ETRIMorphService.getTagName(m.type)}] → '${candidate}' 형태로 검색 성공\n`;
                    } else {
                      dictResults += `✅ '${m.lemma}' [${m.type}, ${ETRIMorphService.getTagName(m.type)}]\n`;
                    }
                    foundResults.forEach((info, idx) => {
                      if (idx < 2) { // 최대 2개 뜻만 표시
                        dictResults += `  - [${info.pos}] ${info.definition}`;
                        if (info.isRedirect) {
                          dictResults += ` 🚫 비표준어`;
                        }
                        dictResults += `\n`;
                      }
                    });
                    break; // 첫 번째 매칭만 사용
                  }
                }

                if (!found) {
                  dictResults += `❌ '${m.lemma}' [${m.type}, ${ETRIMorphService.getTagName(m.type)}] - 사전에 없음\n`;
                  dictResults += `  → 시도한 형태: ${lemmaCandidates.join(', ')}\n`;
                }
              }
            }

            // 2-3. 부분 어절 검색 (복합어 확인)
            if (morphemes.length >= 2) {
              dictResults += `\n[부분 어절 검색]\n`;

              // 앞 2개 형태소 조합
              const partialWord = morphemes.slice(0, 2).map(m => m.lemma).join('');
              if (partialWord !== errorWord) {
                const partialResult = await this.dictionaryService.searchWord(partialWord);
                if (partialResult.length > 0) {
                  dictResults += `✅ '${partialWord}' → 사전에 있음 (복합어 가능성)\n`;
                  partialResult.forEach((info, idx) => {
                    if (idx < 1) {
                      dictResults += `  - [${info.pos}] ${info.definition}\n`;
                    }
                  });
                }
              }
            }
          }

        } catch (error) {
          console.warn('[Gemini] 표준국어대사전 검색 오류:', error);
          dictResults = '===표준국어대사전 검증===\n\n사전 API 오류로 검색을 수행할 수 없습니다.\n';
        }
      }

      // 3. 압축된 전체 규정 사용 (필터링 없음)
      // 압축되어 있으므로 전체 규정을 전달해도 토큰 사용량이 적음
      const filteredRules = this.spellingRulesText;

      // 4. AI 프롬프트 구성
      const prompt = `<ROLE>당신은 한국어 맞춤법 전문가입니다.</ROLE>

<CRITICAL_CONSTRAINT>
**대치어 범위 제약** (가장 중요!):
- 오류어: '${errorWord}' (${errorWord.length}글자)
- suggestion은 반드시 오류어와 비슷한 길이여야 함
- 앞뒤 문맥을 절대 포함하지 마세요
- 오류어의 일부를 생략하지 마세요

예시:
✅ 오류어: "그 전에" (4글자) → suggestion: "그전에" (3글자, 띄어쓰기 교정)
❌ 오류어: "그 전에" → suggestion: "그전" (조사 '에' 누락!)
❌ 오류어: "안녕" → suggestion: "저는 안녕" (문맥 포함!)
</CRITICAL_CONSTRAINT>

<CRITICAL_RULES>
===한글맞춤법 규정 (전체, 반드시 이 규정만 사용)===
${filteredRules}

❌ 절대 금지:
- 위에 없는 규정 번호를 절대 인용하지 마세요
- 규정을 추측하거나 만들지 마세요

✅ 규정 인용 원칙:
- source는 위 규정 중 하나만 사용
- 해당 규정이 없으면 "표준국어대사전"
</CRITICAL_RULES>

${morphAnalysisText}

${dictResults}

⚠️ 형태소 분석 실패 가능성:
사전에 없는 형태소는 분석기가 비표준어를 잘못 분석했을 수 있습니다.

<ANALYSIS_TARGET>
오류어: '${errorWord}'
문맥: ${context}
</ANALYSIS_TARGET>

<DECISION_PRIORITY>
1. 🚫 비표준어 우선 처리 (가장 중요!)
   - 사전에 '→' 있으면 화살표 뒤만 제시
   - 예: "걸그렁걸그렁 → 글그렁글그렁" → suggestion은 "글그렁글그렁"

2. 📖 사전 표제어 우선
   - 어절 전체가 사전에 있으면 해당 표기 적용

3. 🔍 형태소 기반 판단
   - 사전에 없으면 형태소와 규정으로 판단
</DECISION_PRIORITY>

<EXAMPLES>
올바른 분석 예시:
{
  "needsCorrection": true,
  "suggestion": "글그렁글그렁하였다",
  "advice": "사전에서 '걸그렁걸그렁'은 비표준어이며 '→ 글그렁글그렁'으로 표기되어 있음. 표준어로 교체.",
  "source": "표준국어대사전"
}

잘못된 예시:
❌ "source": "한글맞춤법 제30항" (위 규정에 제30항이 없음)
❌ "source": "띄어쓰기 규정" (모호함, 조항 번호 필요)
</EXAMPLES>

<OUTPUT_FORMAT>
JSON으로만 응답 (코드블록 없이):
{
  "needsCorrection": true/false,
  "suggestion": "올바른 표현",
  "advice": "판단 근거 (2-3문장)",
  "source": "한글맞춤법 제N항 또는 표준국어대사전"
}
</OUTPUT_FORMAT>`;

      try {
        const responseText = await this.queryGemini(prompt);

        // JSON 추출
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
        }

        const result = JSON.parse(jsonText);

        // 유효성 검증
        if (typeof result.needsCorrection !== 'boolean') {
          result.needsCorrection = false;
        }
        if (typeof result.suggestion !== 'string') {
          result.suggestion = errorWord;
        }
        if (typeof result.advice !== 'string') {
          result.advice = '분석 결과를 가져올 수 없습니다.';
        }
        if (typeof result.source !== 'string') {
          result.source = 'AI 판단';
        }

        // 1. 대치어 범위 검증 (콘솔 로그만)
        const lengthDiff = Math.abs(result.suggestion.length - errorWord.length);
        const maxAllowedDiff = Math.max(2, Math.floor(errorWord.length * 0.3));

        if (lengthDiff > maxAllowedDiff) {
          console.warn('[Gemini] 대치어 범위 오류:', {
            오류어: errorWord,
            오류어길이: errorWord.length,
            대치어: result.suggestion,
            대치어길이: result.suggestion.length,
            차이: lengthDiff
          });
        }

        // 2. 규정 인용 검증
        const citedSource = result.source;
        if (citedSource.includes('제') && citedSource.includes('항')) {
          const availableRules = this.extractRuleNumbers(filteredRules);
          const isValidRule = availableRules.some(rule => citedSource.includes(rule));

          if (!isValidRule) {
            console.warn('[Gemini] 잘못된 규정 인용 감지:', citedSource);
            console.warn('[Gemini] 제공된 규정:', availableRules.join(', '));
            result.source = '표준국어대사전 (AI 분석)';
            result.advice += ' (※ AI가 인용한 규정은 검증되지 않아 수정되었습니다)';
          } else {
            console.log('[Gemini] 규정 인용 검증 통과:', citedSource);
          }
        }

        return result;
      } catch (error) {
        console.error('[Gemini] API 오류:', error);
        throw new Error(`Gemini API 호출 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      // 최상위 try-catch: Kiwi 초기화 실패 등
      console.error('[GeminiService] verifyCorrection 오류:', error);
      return {
        needsCorrection: false,
        suggestion: errorWord,
        advice: `AI 분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
        source: 'AI 판단'
      };
    }
  }

  /**
   * API 키 검증
   */
  static async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testPrompt = '안녕하세요. 이 메시지에 "성공"이라고만 답변해주세요.';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: testPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 10
            }
          })
        }
      );

      const data = await response.json();

      if (data.error) {
        return false;
      }

      return !!(data.candidates && data.candidates.length > 0);
    } catch (error) {
      return false;
    }
  }
}
