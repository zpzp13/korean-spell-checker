import { Correction, CorrectionState, CorrectionStateInfo } from '../types/interfaces';

/**
 * 교정 상태 관리자
 */
export class CorrectionStateManager {
  private states: Map<number, CorrectionStateInfo> = new Map();
  private corrections: Correction[];
  private focusedIndex: number = 0;

  constructor(corrections: Correction[]) {
    this.corrections = corrections;
    this.initializeStates();
  }

  /**
   * 상태 초기화
   */
  private initializeStates(): void {
    this.corrections.forEach((correction, index) => {
      // '의심' 타입은 자동으로 '예외'로 분류
      const isDoubt = correction.type === 'doubt';
      const initialState: CorrectionState = isDoubt ? 'original-kept' : 'error';

      this.states.set(index, {
        correctionIndex: index,
        currentState: initialState,
        selectedValue: correction.original,
        isExceptionState: false,
        isUserEdited: false
      });
    });
  }

  /**
   * 특정 교정의 상태 가져오기
   */
  getState(index: number): CorrectionStateInfo | undefined {
    return this.states.get(index);
  }

  /**
   * 특정 교정의 상태 설정
   */
  setState(index: number, state: CorrectionState, value: string): void {
    const currentState = this.states.get(index);
    if (currentState) {
      this.states.set(index, {
        ...currentState,
        currentState: state,
        selectedValue: value,
        isExceptionState: state === 'exception-processed',
        isUserEdited: state === 'user-edited'
      });
    }
  }

  /**
   * 다음 상태로 순환
   */
  cycleState(index: number): CorrectionStateInfo {
    const current = this.states.get(index);
    if (!current) {
      throw new Error(`Invalid correction index: ${index}`);
    }

    const correction = this.corrections[index];
    const stateOrder: CorrectionState[] = ['error', 'corrected', 'exception-processed', 'original-kept', 'user-edited'];
    const currentStateIndex = stateOrder.indexOf(current.currentState);
    const nextStateIndex = (currentStateIndex + 1) % stateOrder.length;
    const nextState = stateOrder[nextStateIndex];

    let nextValue = current.selectedValue;

    switch (nextState) {
      case 'error':
        nextValue = correction.original;
        break;
      case 'corrected':
        nextValue = correction.corrected[0] || correction.original;
        break;
      case 'exception-processed':
      case 'original-kept':
        nextValue = correction.original;
        break;
      case 'user-edited':
        // 사용자 편집 상태는 현재 값 유지
        break;
    }

    this.setState(index, nextState, nextValue);
    return this.states.get(index)!;
  }

  /**
   * 포커스된 인덱스 가져오기
   */
  getFocusedIndex(): number {
    return this.focusedIndex;
  }

  /**
   * 포커스 설정
   */
  setFocusedIndex(index: number): void {
    if (index >= 0 && index < this.corrections.length) {
      this.focusedIndex = index;
    }
  }

  /**
   * 다음 오류로 포커스 이동
   */
  focusNextError(): number {
    this.focusedIndex = (this.focusedIndex + 1) % this.corrections.length;
    return this.focusedIndex;
  }

  /**
   * 이전 오류로 포커스 이동
   */
  focusPrevError(): number {
    this.focusedIndex = (this.focusedIndex - 1 + this.corrections.length) % this.corrections.length;
    return this.focusedIndex;
  }

  /**
   * 모든 상태 가져오기
   */
  getAllStates(): Map<number, CorrectionStateInfo> {
    return new Map(this.states);
  }

  /**
   * 예외 처리할 단어 목록 가져오기
   */
  getExceptionWords(): string[] {
    const words: string[] = [];
    this.states.forEach(state => {
      if (state.isExceptionState) {
        words.push(state.selectedValue);
      }
    });
    return words;
  }
}
