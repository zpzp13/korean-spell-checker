import { requestUrl } from 'obsidian';
import { generateSimilarWords, isSimilarWord } from '../utils/koreanUtils';

/**
 * 표준국어대사전 API 응답 타입
 */
interface DictionaryAPIResponse {
  channel: {
    total: number;
    num: number;
    title: string;
    start: number;
    item?: Array<{
      word: string;
      pos: string;
      target_code: string;
      sup_no: string;
      sense: Array<{
        sense_no: string;
        definition: string;
        example?: Array<{ example: string }>;
      }>;
    }>;
  };
  error?: number;
  error_description?: string;
}

/**
 * 단어 검색 결과
 */
export interface WordInfo {
  word: string;
  pos: string; // 품사
  definition: string; // 뜻
  isRedirect: boolean; // '→' 기호 포함 여부 (잘못된 표현→올바른 표현)
  originalWord: string; // 검색어 원본
}

/**
 * XML 파싱 함수
 */
function parseXMLResponse(xmlText: string): DictionaryAPIResponse {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // 에러 체크
  const errorNode = xmlDoc.querySelector('error');
  if (errorNode) {
    const errorCode = parseInt(errorNode.textContent || '0');
    if (errorCode !== 0) {
      const errorDesc = xmlDoc.querySelector('error_description')?.textContent || 'Unknown error';
      return {
        channel: { total: 0, num: 0, title: '', start: 0 },
        error: errorCode,
        error_description: errorDesc
      };
    }
  }

  const channel = xmlDoc.querySelector('channel');
  if (!channel) {
    return { channel: { total: 0, num: 0, title: '', start: 0 } };
  }

  const items: any[] = [];
  const itemNodes = channel.querySelectorAll('item');

  itemNodes.forEach(itemNode => {
    const word = itemNode.querySelector('word')?.textContent || '';
    const pos = itemNode.querySelector('pos')?.textContent || '';
    const target_code = itemNode.querySelector('target_code')?.textContent || '';
    const sup_no = itemNode.querySelector('sup_no')?.textContent || '0';

    const senses: any[] = [];
    const senseNodes = itemNode.querySelectorAll('sense');

    senseNodes.forEach(senseNode => {
      const sense_no = senseNode.querySelector('sense_no')?.textContent || '1';
      const definition = senseNode.querySelector('definition')?.textContent || '';

      const examples: any[] = [];
      const exampleNodes = senseNode.querySelectorAll('example');
      exampleNodes.forEach(exNode => {
        const exampleText = exNode.textContent || '';
        if (exampleText.trim()) {
          examples.push({ example: exampleText });
        }
      });

      senses.push({
        sense_no: sense_no,
        definition: definition,
        example: examples
      });
    });

    items.push({
      word: word,
      pos: pos,
      target_code: target_code,
      sup_no: sup_no,
      sense: senses
    });
  });

  return {
    channel: {
      total: parseInt(channel.querySelector('total')?.textContent || '0'),
      num: parseInt(channel.querySelector('num')?.textContent || '0'),
      title: channel.querySelector('title')?.textContent || '',
      start: parseInt(channel.querySelector('start')?.textContent || '0'),
      item: items
    }
  };
}

/**
 * 표준국어대사전 API 서비스
 */
export class DictionaryService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 단어 검색
   */
  async searchWord(word: string): Promise<WordInfo[]> {
    try {
      const encodedWord = encodeURIComponent(word);
      const url = `https://stdict.korean.go.kr/api/search.do?key=${this.apiKey}&q=${encodedWord}&num=10`;

      const response = await requestUrl({
        url: url,
        method: 'GET'
      });

      const data = parseXMLResponse(response.text);

      if (data.error) {
        console.warn(`표준국어대사전 API 오류: ${data.error_description}`);
        return [];
      }

      if (!data.channel.item || data.channel.item.length === 0) {
        return [];
      }

      // 데이터 가공
      const results: WordInfo[] = [];

      data.channel.item.forEach(entry => {
        const senses = Array.isArray(entry.sense) ? entry.sense : (entry.sense ? [entry.sense] : []);
        const pos = entry.pos || '품사 미상';

        // 검색어와 결과 단어 비교 (붙임표 무시)
        const isMatchingWord = isSimilarWord(word, entry.word);

        if (senses.length > 0) {
          senses.forEach(sense => {
            const definition = sense.definition || '';
            // '→' 기호 포함 여부 확인
            const isRedirect = definition.includes('→');

            results.push({
              word: entry.word,
              pos: pos,
              definition: definition,
              isRedirect: isRedirect,
              originalWord: word
            });
          });
        }
      });

      return results;
    } catch (error) {
      console.error('표준국어대사전 검색 오류:', error);
      return [];
    }
  }

  /**
   * 유사 단어 검색 (오탈자 검사용)
   */
  async searchSimilarWords(word: string): Promise<WordInfo[]> {
    try {
      // 유사 단어 생성
      const similarWords = generateSimilarWords(word);
      console.log(`유사 단어 생성 (${word}):`, similarWords);

      // 각 유사 단어 검색
      const allResults: WordInfo[] = [];

      for (const similarWord of similarWords) {
        const wordInfos = await this.searchWord(similarWord);

        // 검색 결과가 있고, '→' 기호가 없는 표준어만 추가
        const validResults = wordInfos.filter(info =>
          !info.isRedirect && isSimilarWord(similarWord, info.word)
        );

        allResults.push(...validResults);
      }

      // 중복 제거 (word + definition 기준)
      const uniqueResults: WordInfo[] = [];
      const seen = new Set<string>();

      for (const result of allResults) {
        const key = `${result.word}:${result.definition}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(result);
        }
      }

      return uniqueResults;
    } catch (error) {
      console.error('유사 단어 검색 오류:', error);
      return [];
    }
  }

  /**
   * API 키 검증
   */
  static async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const url = `https://stdict.korean.go.kr/api/search.do?key=${apiKey}&q=사랑&num=10`;
      const response = await requestUrl({ url, method: 'GET' });

      if (response.status !== 200 || !response.text?.trim()) {
        return false;
      }

      const data = parseXMLResponse(response.text);

      if (data.error && data.error !== 0) {
        return false;
      }

      return !!data.channel;
    } catch (error) {
      return false;
    }
  }
}
