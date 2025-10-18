/**
 * ETRI 형태소 분석 서비스
 */

/**
 * 형태소 토큰
 */
export interface MorphemeToken {
  lemma: string;    // 형태소
  type: string;     // 품사 태그 (NNG, VV, JKB 등)
  position: number; // 위치
  weight?: number;  // 가중치
}

/**
 * ETRI API 응답 구조
 */
interface ETRIResponse {
  request_id: string;
  result: number;
  return_type: string;
  return_object: {
    sentence: Array<{
      text: string;
      morp: Array<{
        lemma: string;
        type: string;
        position: number;
        weight: number;
      }>;
    }>;
  };
}

/**
 * ETRI 언어 분석 API 서비스
 */
export class ETRIMorphService {
  private apiKey: string;
  private apiUrl: string = 'http://epretx.etri.re.kr:8000/api/WiseNLU';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 형태소 분석 수행
   */
  async analyzeMorpheme(text: string): Promise<MorphemeToken[]> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey
        },
        body: JSON.stringify({
          request_id: 'reserved',
          argument: {
            text: text,
            analysis_code: 'morp' // 형태소 분석
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ETRI API HTTP 오류: ${response.status}`);
      }

      const data: ETRIResponse = await response.json();

      // 오류 체크 (result가 0이면 성공)
      if (data.result !== 0) {
        throw new Error(`ETRI API 오류 코드: ${data.result}`);
      }

      if (!data.return_object || !data.return_object.sentence || data.return_object.sentence.length === 0) {
        throw new Error('ETRI API 응답 형식 오류');
      }

      // 첫 번째 문장의 형태소만 추출
      const morphemes = data.return_object.sentence[0].morp;

      return morphemes.map(m => ({
        lemma: m.lemma,
        type: m.type,
        position: m.position,
        weight: m.weight
      }));

    } catch (error) {
      console.error('[ETRI] 형태소 분석 오류:', error);
      throw new Error(`ETRI 형태소 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * API 키 검증
   */
  static async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testText = '안녕하세요';
      console.log('[ETRI] API 키 검증 시작');

      const response = await fetch('http://epretx.etri.re.kr:8000/api/WiseNLU', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({
          request_id: 'reserved',
          argument: {
            text: testText,
            analysis_code: 'morp'
          }
        })
      });

      console.log('[ETRI] API 응답 상태:', response.status);

      if (!response.ok) {
        console.error('[ETRI] API 응답 실패:', response.status, response.statusText);
        return false;
      }

      const data: ETRIResponse = await response.json();
      console.log('[ETRI] API 응답 데이터:', data);

      // result가 0이면 성공
      const isValid = data.result === 0;
      console.log('[ETRI] API 검증 결과:', isValid);
      return isValid;

    } catch (error) {
      console.error('[ETRI] API 키 검증 오류:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('[ETRI] 네트워크 오류 또는 CORS 문제일 수 있습니다.');
      }
      return false;
    }
  }

  /**
   * 품사 태그를 한글 이름으로 변환
   */
  static getTagName(tag: string): string {
    const tagNames: { [key: string]: string } = {
      // 체언
      'NNG': '일반명사',
      'NNP': '고유명사',
      'NNB': '의존명사',
      'NR': '수사',
      'NP': '대명사',

      // 용언
      'VV': '동사',
      'VA': '형용사',
      'VX': '보조용언',
      'VCP': '긍정지정사',
      'VCN': '부정지정사',

      // 관형사, 부사
      'MM': '관형사',
      'MAG': '일반부사',
      'MAJ': '접속부사',

      // 감탄사
      'IC': '감탄사',

      // 조사
      'JKS': '주격조사',
      'JKC': '보격조사',
      'JKG': '관형격조사',
      'JKO': '목적격조사',
      'JKB': '부사격조사',
      'JKV': '호격조사',
      'JKQ': '인용격조사',
      'JX': '보조사',
      'JC': '접속조사',

      // 어미
      'EP': '선어말어미',
      'EF': '종결어미',
      'EC': '연결어미',
      'ETN': '명사형전성어미',
      'ETM': '관형사형전성어미',

      // 접두사, 접미사
      'XPN': '체언접두사',
      'XSN': '명사파생접미사',
      'XSV': '동사파생접미사',
      'XSA': '형용사파생접미사',
      'XR': '어근',

      // 부호, 외래어, 기타
      'SF': '종결부호',
      'SP': '쉼표',
      'SS': '인용부호',
      'SE': '줄임표',
      'SO': '붙임표',
      'SW': '기타부호',
      'SL': '외래어',
      'SH': '한자',
      'SN': '숫자'
    };

    return tagNames[tag] || tag;
  }
}
