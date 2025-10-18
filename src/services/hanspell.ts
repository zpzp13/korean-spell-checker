import { Correction, SpellCheckResult } from '../types/interfaces';

// hanspell 라이브러리의 타입 정의
interface HanspellError {
  token: string;
  suggestions: string[];
  context: string;
  type?: string;
  info?: string;
}

/**
 * Hanspell 맞춤법 검사 서비스
 * 다음(DAUM)과 부산대학교의 무료 맞춤법 검사 API 활용
 */
export class HanspellService {
  /**
   * 도움말 텍스트 포맷팅
   * - 연속된 줄바꿈을 1개로 축소
   * - 예문에 번호 매기기
   */
  private formatHelp(help: string): string {
    // 연속된 줄바꿈(\n\n\n...) → 두 개 줄바꿈(\n\n)으로 축소
    help = help.replace(/\n{2,}/g, '\n\n');

    // 설명과 예문 분리
    const lines = help.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) return help;

    // 설명 부분 포맷팅: 1., 2., 1), 2) 등 번호 앞에 개행 추가
    let description = lines[0];
    // 모든 숫자 패턴 (1., 2., 1), 2) 등) 앞에 개행 추가
    // 문자 뒤 + 공백 0개 이상 + 숫자 + . 또는 ) 패턴
    description = description.replace(/([^\s])\s*(\d+[\.\)])/g, '$1\n$2');

    // 예문 부분 포맷팅
    if (lines.length > 1) {
      const exampleText = lines.slice(1).join(' ');

      // 마침표로 문장 분리
      const sentences = exampleText.split('.').filter(s => s.trim().length > 0);

      if (sentences.length > 0) {
        const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
        const numberedExamples = sentences.map((sentence, index) => {
          const number = index < 10 ? circledNumbers[index] : `${index + 1})`;
          return `${number} ${sentence.trim()}.`;
        });

        return description + '\n\n' + numberedExamples.join('\n');
      }
    }

    return description;
  }

  /**
   * 맞춤법 검사 수행 (DAUM 사용)
   */
  async checkSpelling(text: string): Promise<SpellCheckResult> {
    console.log('=== Hanspell (DAUM) 맞춤법 검사 시작 ===');
    console.log('입력 텍스트:', text);

    return new Promise((resolve) => {
      const corrections: Correction[] = [];
      const correctionMap = new Map<string, Correction>();

      // hanspell 라이브러리 동적 임포트
      const hanspell = require('hanspell');

      hanspell.spellCheckByDAUM(
        text,
        6000, // timeout 6초
        (errors: HanspellError | HanspellError[]) => {
          // hanspell이 배열로 전달하므로 배열 처리
          const errorArray = Array.isArray(errors) ? errors : [errors];

          console.log(`=== 오류 발견: ${errorArray.length}개 ===`);

          errorArray.forEach((error, index) => {
            console.log(`\n[오류 ${index + 1}/${errorArray.length}]`);
            console.log('token:', error.token);
            console.log('suggestions:', error.suggestions);
            console.log('type:', error.type);
            console.log('context:', error.context);

            if (error.token && error.suggestions && error.suggestions.length > 0) {
              console.log('✅ 조건 통과 - 교정 추가');
              const key = error.token;

              if (correctionMap.has(key)) {
                console.log('이미 존재하는 교정 - 병합');
                const existing = correctionMap.get(key)!;
                const newSuggestions = error.suggestions.filter(
                  (s) => !existing.corrected.includes(s)
                );
                if (newSuggestions.length > 0) {
                  correctionMap.set(key, {
                    ...existing,
                    corrected: [...existing.corrected, ...newSuggestions]
                  });
                }
              } else {
                console.log('새로운 교정 추가');

                // info만 표시 (타입 라벨 제거)
                let help = error.info || '맞춤법 교정';

                // 설명-예문 사이 공백 조정 및 예문 번호 매기기
                help = this.formatHelp(help);

                correctionMap.set(key, {
                  original: error.token,
                  corrected: error.suggestions,
                  help: help,
                  type: error.type
                });
                console.log('추가 완료:', key, '→', error.suggestions);
              }
            } else {
              console.log('❌ 조건 실패 - 교정 제외');
            }
          });
        },
        () => {
          // 완료 콜백
          console.log('=== 완료 콜백 ===');
          console.log('correctionMap 크기:', correctionMap.size);
          console.log('correctionMap 내용:', JSON.stringify(Array.from(correctionMap.entries()), null, 2));

          corrections.push(...Array.from(correctionMap.values()));
          console.log(`Hanspell 검사 완료: ${corrections.length}개 교정`);
          console.log('최종 corrections:', JSON.stringify(corrections, null, 2));

          resolve({
            resultOutput: text,
            corrections: corrections
          });
        },
        (error: Error) => {
          // 에러 콜백
          console.error('=== Hanspell 검사 에러 ===');
          console.error('에러 메시지:', error.message);
          console.error('에러 스택:', error.stack);
          console.error('전체 에러:', error);
          resolve({
            resultOutput: text,
            corrections: []
          });
        }
      );
    });
  }

  /**
   * 맞춤법 검사 수행 (부산대 사용)
   */
  async checkSpellingByPNU(text: string): Promise<SpellCheckResult> {
    console.log('=== Hanspell (부산대) 맞춤법 검사 시작 ===');
    console.log('입력 텍스트:', text);

    return new Promise((resolve) => {
      const corrections: Correction[] = [];
      const correctionMap = new Map<string, Correction>();

      const hanspell = require('hanspell');

      hanspell.spellCheckByPNU(
        text,
        6000, // timeout 6초
        (error: HanspellError) => {
          console.log('오류 발견:', error);

          if (error.token && error.suggestions && error.suggestions.length > 0) {
            const key = error.token;

            if (correctionMap.has(key)) {
              const existing = correctionMap.get(key)!;
              const newSuggestions = error.suggestions.filter(
                (s) => !existing.corrected.includes(s)
              );
              if (newSuggestions.length > 0) {
                correctionMap.set(key, {
                  ...existing,
                  corrected: [...existing.corrected, ...newSuggestions]
                });
              }
            } else {
              // info만 표시 (타입 라벨 제거)
              let help = error.info || '맞춤법 교정';

              // 설명-예문 사이 공백 조정 및 예문 번호 매기기
              help = this.formatHelp(help);

              correctionMap.set(key, {
                original: error.token,
                corrected: error.suggestions,
                help: help,
                type: error.type
              });
            }
          }
        },
        () => {
          corrections.push(...Array.from(correctionMap.values()));
          console.log(`Hanspell (부산대) 검사 완료: ${corrections.length}개 교정`);

          resolve({
            resultOutput: text,
            corrections: corrections
          });
        },
        (error: Error) => {
          console.error('Hanspell (부산대) 검사 오류:', error);
          resolve({
            resultOutput: text,
            corrections: []
          });
        }
      );
    });
  }

  /**
   * 통합 검사 (DAUM + 부산대 결과 병합)
   */
  async checkSpellingAll(text: string): Promise<SpellCheckResult> {
    console.log('=== Hanspell 통합 검사 시작 ===');

    try {
      const [daumResult, pnuResult] = await Promise.all([
        this.checkSpelling(text),
        this.checkSpellingByPNU(text)
      ]);

      // 두 결과 병합
      const correctionMap = new Map<string, Correction>();

      // DAUM 결과 추가
      daumResult.corrections.forEach((correction) => {
        correctionMap.set(correction.original, correction);
      });

      // 부산대 결과 병합
      pnuResult.corrections.forEach((correction) => {
        if (correctionMap.has(correction.original)) {
          const existing = correctionMap.get(correction.original)!;
          const newSuggestions = correction.corrected.filter(
            (s) => !existing.corrected.includes(s)
          );
          if (newSuggestions.length > 0) {
            correctionMap.set(correction.original, {
              ...existing,
              corrected: [...existing.corrected, ...newSuggestions],
              help: `${existing.help}\n\n[부산대] ${correction.help}`
            });
          }
        } else {
          correctionMap.set(correction.original, correction);
        }
      });

      const finalCorrections = Array.from(correctionMap.values());
      console.log(`Hanspell 통합 검사 완료: ${finalCorrections.length}개 교정`);

      return {
        resultOutput: text,
        corrections: finalCorrections
      };
    } catch (error) {
      console.error('Hanspell 통합 검사 오류:', error);
      return {
        resultOutput: text,
        corrections: []
      };
    }
  }
}
