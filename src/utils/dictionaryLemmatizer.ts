/**
 * ETRI 형태소 분석 결과를 표준국어대사전 검색 가능한 형태로 변환
 */
export class DictionaryLemmatizer {

    /**
     * ETRI 형태소 분석 결과를 사전 검색 가능한 형태로 변환
     */
    getLemmaCandidates(lemma: string, posTag: string): string[] {
        const candidates: string[] = [];

        // 동사 (VV)
        if (posTag === 'VV') {
            candidates.push(...this.getVerbCandidates(lemma));
        }

        // 형용사 (VA)
        else if (posTag === 'VA') {
            candidates.push(...this.getAdjectiveCandidates(lemma));
        }

        // 보조용언 (VX)
        else if (posTag === 'VX') {
            candidates.push(...this.getAuxiliaryCandidates(lemma));
        }

        // 동사 파생 접미사 (XSV)
        else if (posTag === 'XSV') {
            candidates.push(...this.getDerivativeCandidates(lemma, 'verb'));
        }

        // 형용사 파생 접미사 (XSA)
        else if (posTag === 'XSA') {
            candidates.push(...this.getDerivativeCandidates(lemma, 'adjective'));
        }

        // 어근 (XR)
        else if (posTag === 'XR') {
            candidates.push(...this.getRootCandidates(lemma));
        }

        // 기타 (명사 등)
        else {
            candidates.push(lemma);
        }

        // 불규칙 처리 추가
        if (['VV', 'VA', 'VX'].includes(posTag)) {
            candidates.push(...this.handleIrregular(lemma));
        }

        // 중복 제거 및 빈 문자열 제거
        return [...new Set(candidates)].filter(c => c.length > 0);
    }

    /**
     * 동사 후보 생성
     */
    private getVerbCandidates(lemma: string): string[] {
        const candidates: string[] = [];

        // 이미 '다'로 끝나면 그대로 사용
        if (lemma.endsWith('다')) {
            candidates.push(lemma);
        } else {
            // '-하' 접미사 제거 시도 (예: '걸그렁걸그렁하' → '걸그렁걸그렁')
            if (lemma.endsWith('하')) {
                const withoutHa = lemma.slice(0, -1);
                candidates.push(withoutHa); // 접미사 제거 형태 우선
                candidates.push(lemma + '다'); // 기본형
                candidates.push(lemma); // 원형
            } else {
                // '다'를 붙인 형태 추가
                candidates.push(lemma + '다');
                // 원형도 시도 (혹시 모를 경우 대비)
                candidates.push(lemma);
            }
        }

        return candidates;
    }

    /**
     * 형용사 후보 생성
     */
    private getAdjectiveCandidates(lemma: string): string[] {
        // 동사와 동일한 로직
        return this.getVerbCandidates(lemma);
    }

    /**
     * 보조용언 후보 생성
     */
    private getAuxiliaryCandidates(lemma: string): string[] {
        // 동사와 동일한 로직
        return this.getVerbCandidates(lemma);
    }

    /**
     * 파생 접미사 후보 생성
     */
    private getDerivativeCandidates(lemma: string, type: 'verb' | 'adjective'): string[] {
        const candidates: string[] = [];

        // 원형 추가
        candidates.push(lemma);

        // 이미 '하다', '되다' 등으로 끝나는지 확인
        const hasEnding = lemma.endsWith('하다') ||
                         lemma.endsWith('되다') ||
                         lemma.endsWith('스럽다') ||
                         lemma.endsWith('롭다');

        if (!hasEnding) {
            if (type === 'verb') {
                candidates.push(lemma + '하다');
                candidates.push(lemma + '되다');
            } else {
                candidates.push(lemma + '하다');
                candidates.push(lemma + '스럽다');
                candidates.push(lemma + '롭다');
            }
        } else {
            // 이미 어미가 붙어있으면 그대로 사용
            candidates.push(lemma);
        }

        return candidates;
    }

    /**
     * 어근 후보 생성
     */
    private getRootCandidates(lemma: string): string[] {
        const candidates: string[] = [];

        // 원형 추가 (명사로 등재될 가능성)
        candidates.push(lemma);

        // 이미 어미가 붙어있는지 확인
        const hasEnding = lemma.endsWith('하다') ||
                         lemma.endsWith('되다') ||
                         lemma.endsWith('적');

        if (!hasEnding) {
            candidates.push(lemma + '하다');
            candidates.push(lemma + '되다');
            candidates.push(lemma + '적');
        }

        return candidates;
    }

    /**
     * 불규칙 활용 처리
     */
    private handleIrregular(lemma: string): string[] {
        const results: string[] = [];

        // 이미 '다'로 끝나면 불규칙 처리 불필요
        if (lemma.endsWith('다')) {
            return results;
        }

        // ㄷ 불규칙: 듣 → 들다
        if (lemma.endsWith('ㄷ')) {
            const stem = lemma.slice(0, -1);
            if (!stem.endsWith('다')) {
                results.push(stem + '들다');
            }
        }

        // ㅂ 불규칙: 돕 → 돕다
        if (lemma.endsWith('ㅂ')) {
            results.push(lemma + '다');
        }

        // ㅅ 불규칙: 낫 → 나다
        if (lemma.endsWith('ㅅ')) {
            const stem = lemma.slice(0, -1);
            if (!stem.endsWith('다')) {
                results.push(stem + '다');
            }
        }

        // ㅎ 불규칙: 빨갛 → 빨갛다
        if (lemma.endsWith('ㅎ')) {
            if (!lemma.endsWith('다')) {
                results.push(lemma + '다');
            }
        }

        // 르 불규칙: 모르 → 모르다
        if (lemma.endsWith('르')) {
            if (!lemma.endsWith('다')) {
                results.push(lemma + '다');
            }
        }

        return results;
    }
}
