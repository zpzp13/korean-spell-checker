import { App, Modal, Notice, Scope, setIcon } from 'obsidian';
import { ModalConfig, Correction, CorrectionState } from '../types/interfaces';
import { CorrectionStateManager } from '../utils/stateManager';
import { GeminiService } from '../services/geminiService';
import { KOREAN_SPELLING_RULES_COMPRESSED, COMPRESSION_STATS } from '../data/koreanSpellingRules';

/**
 * 좌우 분할 교정 모달
 * 왼쪽: 미리보기 영역
 * 오른쪽: 탭 + 카드 리스트
 */
export class CorrectionModal extends Modal {
  private config: ModalConfig;
  private stateManager: CorrectionStateManager;
  private previewStatsEl: HTMLElement;
  private previewEl: HTMLElement;
  private botButtonEl: HTMLElement;
  private aiHelpContainerEl: HTMLElement; // 컨테이너 참조 추가
  private aiHelpEl: HTMLElement;
  private tabsEl: HTMLElement;
  private cardListEl: HTMLElement;
  private currentFilter: CorrectionState | 'all' = 'all';
  private keyboardScope: Scope;
  private editPopupEl: HTMLElement | null = null;
  private helpExpandedStates: Map<number, boolean> = new Map();
  private sortedIndices: number[] = []; // 텍스트 위치 순서로 정렬된 인덱스
  private aiVerificationActive: boolean = false; // AI 검증 활성화 여부

  constructor(app: App, config: ModalConfig) {
    super(app);
    this.config = config;
    this.stateManager = new CorrectionStateManager(config.corrections);
    this.keyboardScope = new Scope();

    // 모달 크기 설정
    this.modalEl.style.width = '50vw';
    this.modalEl.style.maxWidth = '1400px';
    this.modalEl.style.height = '85vh';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // 모달 엘리먼트에 클래스 추가
    this.modalEl.addClass('korean-spell-checker-modal');

    // 메인 컨테이너 (좌우 분할)
    const mainContainer = contentEl.createDiv({ cls: 'modal-main-container' });

    // 왼쪽: 미리보기 영역
    const leftPanel = mainContainer.createDiv({ cls: 'modal-left-panel' });
    this.previewStatsEl = leftPanel.createDiv({ cls: 'preview-stats' });
    this.previewEl = leftPanel.createDiv({ cls: 'preview-content' });

    // AI 도움말 영역 (미리보기 아래)
    this.aiHelpContainerEl = leftPanel.createDiv({ cls: 'ai-help-container' });
    this.botButtonEl = this.aiHelpContainerEl.createDiv({ cls: 'bot-button' });
    setIcon(this.botButtonEl, 'bot');
    this.botButtonEl.onclick = () => this.runAIVerification();

    this.aiHelpEl = this.aiHelpContainerEl.createDiv({ cls: 'ai-help-text' });
    // 초기 상태에서는 아무 텍스트도 표시하지 않음

    // 오른쪽: 탭 + 카드 리스트
    const rightPanel = mainContainer.createDiv({ cls: 'modal-right-panel' });

    // 탭 영역
    this.tabsEl = rightPanel.createDiv({ cls: 'tabs-container' });

    // 카드 리스트 영역
    const cardContainer = rightPanel.createDiv({ cls: 'card-container' });
    this.cardListEl = cardContainer.createDiv({ cls: 'card-list' });

    // 버튼 영역 제거 (단축키로 대체)

    // 초기 렌더링
    this.renderPreviewStats();
    this.renderPreview();
    this.renderTabs();
    this.renderCards();

    // 키보드 단축키
    this.setupKeyboardShortcuts();
  }

  /**
   * 키보드 단축키 설정
   */
  private setupKeyboardShortcuts(): void {
    this.keyboardScope.register([], 'Tab', (evt) => {
      evt.preventDefault();
      this.focusNextError();
      return false;
    });

    this.keyboardScope.register(['Shift'], 'Tab', (evt) => {
      evt.preventDefault();
      this.focusPrevError();
      return false;
    });

    // Enter 키 제거 - 편집창에서만 사용

    this.keyboardScope.register([], 'ArrowUp', (evt) => {
      evt.preventDefault();
      this.focusPrevError();
      return false;
    });

    this.keyboardScope.register([], 'ArrowDown', (evt) => {
      evt.preventDefault();
      this.focusNextError();
      return false;
    });

    this.keyboardScope.register([], 'ArrowLeft', (evt) => {
      evt.preventDefault();
      this.cyclePrevState();
      return false;
    });

    this.keyboardScope.register([], 'ArrowRight', (evt) => {
      evt.preventDefault();
      this.cycleNextState();
      return false;
    });

    // Alt+Enter: 적용
    this.keyboardScope.register(['Alt'], 'Enter', (evt) => {
      evt.preventDefault();
      this.applyCorrections();
      return false;
    });

    // Alt+F4: 취소
    this.keyboardScope.register(['Alt'], 'F4', (evt) => {
      evt.preventDefault();
      this.close();
      return false;
    });

    // Alt+I: AI 검증
    this.keyboardScope.register(['Alt'], 'I', (evt) => {
      evt.preventDefault();
      this.runAIVerification();
      return false;
    });

    this.app.keymap.pushScope(this.keyboardScope);
  }

  /**
   * 미리보기 상단 통계 렌더링
   */
  private renderPreviewStats(): void {
    this.previewStatsEl.empty();

    const states = this.stateManager.getAllStates();
    const stateCounts = {
      error: 0,
      corrected: 0,
      'original-kept': 0,
      'user-edited': 0
    };

    states.forEach(state => {
      if (state.currentState === 'exception-processed') {
        // 예외처리는 통계에 포함하지 않음
        return;
      }
      stateCounts[state.currentState]++;
    });

    const stateLabels = {
      error: '오류',
      corrected: '제안 적용',
      'original-kept': '예외',
      'user-edited': '직접 입력'
    };

    const stateColors = {
      error: '#ef5350',
      corrected: '#66bb6a',
      'original-kept': '#ffa726',
      'user-edited': '#ab47bc'
    };

    Object.entries(stateCounts).forEach(([state, count]) => {
      const statItem = this.previewStatsEl.createDiv({ cls: 'stat-item' });

      // 색깔 동그라미
      const indicator = statItem.createSpan({ cls: 'stat-indicator' });
      indicator.style.backgroundColor = stateColors[state as keyof typeof stateColors];

      // 레이블
      const label = statItem.createSpan({ cls: 'stat-label' });
      label.textContent = stateLabels[state as keyof typeof stateLabels];

      // 카운트 (색상 지정)
      const countSpan = statItem.createSpan({ cls: 'stat-count' });
      countSpan.textContent = String(count);
      countSpan.style.color = stateColors[state as keyof typeof stateColors];
    });
  }

  /**
   * 미리보기 렌더링 (겹치는 오류 모두 표시)
   */
  private renderPreview(): void {
    this.previewEl.empty();

    const text = this.config.selectedText;
    const corrections = this.config.corrections;

    // 각 correction의 위치 찾기 (겹침 허용)
    const correctionPositions: Array<{correction: Correction, index: number, start: number, end: number}> = [];

    corrections.forEach((correction, index) => {
      const position = text.indexOf(correction.original);
      if (position !== -1) {
        correctionPositions.push({
          correction,
          index,
          start: position,
          end: position + correction.original.length
        });
      }
    });

    // 위치별로 정렬 (시작 위치 기준, 같으면 끝 위치 기준)
    correctionPositions.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });

    // 정렬된 인덱스 저장 (Tab 네비게이션용)
    this.sortedIndices = correctionPositions.map(item => item.index);

    // 이벤트 기반 렌더링: 각 correction의 시작/끝 지점을 이벤트로 생성
    type Event = { pos: number; type: 'start' | 'end'; correction: Correction; index: number };
    const events: Event[] = [];

    correctionPositions.forEach(({ correction, index, start, end }) => {
      events.push({ pos: start, type: 'start', correction, index });
      events.push({ pos: end, type: 'end', correction, index });
    });

    // 이벤트를 위치순으로 정렬 (같은 위치면 end가 start보다 먼저)
    events.sort((a, b) => {
      if (a.pos !== b.pos) return a.pos - b.pos;
      if (a.type === 'end' && b.type === 'start') return -1;
      if (a.type === 'start' && b.type === 'end') return 1;
      return 0;
    });

    // 이벤트를 순회하며 렌더링
    const fragment = document.createDocumentFragment();
    const activeCorrections: Array<{correction: Correction, index: number}> = [];
    let lastPos = 0;

    events.forEach(event => {
      // 이전 위치부터 현재 위치까지 텍스트 렌더링
      if (event.pos > lastPos) {
        const textContent = text.substring(lastPos, event.pos);

        if (activeCorrections.length === 0) {
          // 활성화된 correction이 없으면 일반 텍스트
          fragment.append(document.createTextNode(textContent));
        } else {
          // 활성화된 correction이 있으면 span으로 감싸기
          // 여러 개가 겹치면 가장 마지막(가장 작은 범위)를 사용
          const active = activeCorrections[activeCorrections.length - 1];
          const state = this.stateManager.getState(active.index);
          const errorSpan = document.createElement('span');
          errorSpan.addClass('error-text');
          errorSpan.addClass(`state-${state?.currentState || 'error'}`);
          errorSpan.textContent = textContent;
          errorSpan.dataset.index = String(active.index);

          // 클릭 이벤트
          errorSpan.onclick = () => {
            this.stateManager.setFocusedIndex(active.index);
            this.renderCards();
            this.scrollToFocusedError();
            this.updateAIHelp();
          };

          fragment.appendChild(errorSpan);
        }

        lastPos = event.pos;
      }

      // 이벤트 처리
      if (event.type === 'start') {
        activeCorrections.push({ correction: event.correction, index: event.index });
      } else {
        // end 이벤트: activeCorrections에서 제거
        const removeIndex = activeCorrections.findIndex(ac => ac.index === event.index);
        if (removeIndex !== -1) {
          activeCorrections.splice(removeIndex, 1);
        }
      }
    });

    // 나머지 텍스트
    if (lastPos < text.length) {
      fragment.append(document.createTextNode(text.substring(lastPos)));
    }

    this.previewEl.appendChild(fragment);
  }

  /**
   * 탭 렌더링
   */
  private renderTabs(): void {
    this.tabsEl.empty();

    const states = this.stateManager.getAllStates();
    const stateCounts = {
      all: this.config.corrections.length,
      error: 0,
      corrected: 0,
      'exception-processed': 0,
      'original-kept': 0
    };

    states.forEach(state => {
      // original-kept는 탭에 표시하지 않지만 카운팅은 필요
      if (state.currentState === 'original-kept') {
        stateCounts['original-kept']++;
        return;
      }
      // corrected와 user-edited를 모두 corrected로 합산
      if (state.currentState === 'user-edited') {
        stateCounts['corrected']++;
      } else {
        stateCounts[state.currentState]++;
      }
    });

    const stateLabels = {
      all: '전체',
      error: '오류',
      corrected: '수정',
      'exception-processed': '고유명사'
    };

    const stateColors = {
      all: '#6c757d',
      error: '#ef5350',
      corrected: '#66bb6a',
      'exception-processed': '#42a5f5'
    };

    Object.entries(stateCounts).forEach(([state, count]) => {
      // original-kept는 탭에 표시하지 않음
      if (state === 'original-kept') {
        return;
      }

      const tab = this.tabsEl.createDiv({ cls: 'tab-item' });
      // corrected 탭이면 user-edited 필터도 활성화 표시
      if (this.currentFilter === state ||
          (state === 'corrected' && this.currentFilter === 'user-edited')) {
        tab.addClass('active');
      }

      // 색깔 동그라미
      const indicator = tab.createSpan({ cls: 'tab-indicator' });
      indicator.style.backgroundColor = stateColors[state as keyof typeof stateColors];

      // 레이블
      const label = tab.createSpan({ cls: 'tab-label' });
      const labelText = stateLabels[state as keyof typeof stateLabels];
      label.textContent = labelText;
      // 두 글자 메뉴는 자간 더 띄우기
      if (labelText.length === 2) {
        label.addClass('two-char');
      }

      // 카운트
      const countSpan = tab.createSpan({ cls: 'tab-count' });
      countSpan.textContent = String(count);

      // 클릭 이벤트
      tab.onclick = () => {
        this.currentFilter = state as CorrectionState | 'all';
        this.renderTabs();
        this.renderCards();
      };
    });
  }

  /**
   * 카드 리스트 렌더링
   */
  private renderCards(): void {
    this.cardListEl.empty();

    // 고유명사 탭인 경우 고유명사 관리 뷰 표시
    if (this.currentFilter === 'exception-processed') {
      this.renderProperNounManagement();
      return;
    }

    const states = this.stateManager.getAllStates();
    const stateColors = {
      error: '#ef5350',
      corrected: '#66bb6a',
      'exception-processed': '#42a5f5',
      'original-kept': '#ffa726',
      'user-edited': '#ab47bc'
    };

    const focusedIndex = this.stateManager.getFocusedIndex();

    // 텍스트 위치 순서로 렌더링 (미리보기와 동일 순서)
    this.sortedIndices.forEach((index) => {
      const correction = this.config.corrections[index];
      const state = states.get(index);
      if (!state) return;

      // 필터 적용 (corrected 탭은 user-edited도 포함)
      if (this.currentFilter !== 'all') {
        if (this.currentFilter === 'corrected') {
          // corrected 탭은 corrected와 user-edited 모두 표시
          if (state.currentState !== 'corrected' && state.currentState !== 'user-edited') {
            return;
          }
        } else if (state.currentState !== this.currentFilter) {
          return;
        }
      }

      const card = this.cardListEl.createDiv({ cls: 'error-card' });
      card.dataset.index = String(index);

      if (index === focusedIndex) {
        card.addClass('focused');
      }

      // 1행: 동그라미+원본 텍스트
      const row1 = card.createDiv({ cls: 'card-row-1' });

      const originalSpan = row1.createSpan({ cls: 'card-original' });

      const indicator = originalSpan.createSpan({ cls: 'card-indicator' });
      indicator.style.backgroundColor = stateColors[state.currentState];

      const textSpan = originalSpan.createSpan({ cls: 'card-original-text' });
      textSpan.textContent = state.selectedValue;
      textSpan.style.color = stateColors[state.currentState];

      // 2행: 수정 제안 (링크 형식)
      const row2 = card.createDiv({ cls: 'card-row-2' });

      correction.corrected.forEach((suggestion, i) => {
        // 화살표 아이콘
        const arrowIcon = row2.createSpan({ cls: 'suggestion-arrow' });
        setIcon(arrowIcon, 'chevrons-right');

        const suggestionLink = row2.createEl('a', { cls: 'suggestion-link' });
        suggestionLink.textContent = suggestion;
        suggestionLink.onclick = (e) => {
          e.stopPropagation();
          this.stateManager.setState(index, 'corrected', suggestion);

          // 스크롤 위치 저장
          const cardScrollTop = this.cardListEl.scrollTop;
          const previewScrollTop = this.previewEl.scrollTop;

          this.renderPreviewStats();
          this.renderPreview();
          this.renderCards();
          this.renderTabs();

          // DOM 렌더링 완료 후 스크롤 복원
          requestAnimationFrame(() => {
            this.cardListEl.scrollTop = cardScrollTop;
            this.previewEl.scrollTop = previewScrollTop;
          });
        };
      });

      // 3행: 도움말 (전체 표시, 토글 없음)
      const row3 = card.createDiv({ cls: 'card-row-3' });
      const helpWrapper = row3.createDiv({ cls: 'card-help-wrapper' });
      const helpText = helpWrapper.createDiv({ cls: 'card-help' });
      helpText.textContent = correction.help;

      // 카드 클릭 시 포커스
      card.onclick = () => {
        this.stateManager.setFocusedIndex(index);

        // 스크롤 위치 저장
        const cardScrollTop = this.cardListEl.scrollTop;
        const previewScrollTop = this.previewEl.scrollTop;

        this.renderCards();

        // DOM 렌더링 완료 후 스크롤 복원
        requestAnimationFrame(() => {
          this.cardListEl.scrollTop = cardScrollTop;
          this.previewEl.scrollTop = previewScrollTop;
          this.scrollToFocusedError();
        });

        // AI 도움말 업데이트
        this.updateAIHelp();
      };
    });
  }

  /**
   * 다음 오류로 포커스 이동 (텍스트 위치 순서)
   */
  private focusNextError(): void {
    const currentFocused = this.stateManager.getFocusedIndex();
    const currentPosition = this.sortedIndices.indexOf(currentFocused);

    if (currentPosition < this.sortedIndices.length - 1) {
      const nextIndex = this.sortedIndices[currentPosition + 1];
      this.stateManager.setFocusedIndex(nextIndex);
    } else {
      // 마지막이면 첫 번째로
      this.stateManager.setFocusedIndex(this.sortedIndices[0]);
    }

    // 스크롤 위치 저장
    const cardScrollTop = this.cardListEl.scrollTop;
    const previewScrollTop = this.previewEl.scrollTop;

    this.renderCards();

    // DOM 렌더링 완료 후 스크롤 복원
    requestAnimationFrame(() => {
      this.cardListEl.scrollTop = cardScrollTop;
      this.previewEl.scrollTop = previewScrollTop;
      this.scrollToFocusedError();
    });

    // AI 도움말 업데이트
    this.updateAIHelp();
  }

  /**
   * 이전 오류로 포커스 이동 (텍스트 위치 순서)
   */
  private focusPrevError(): void {
    const currentFocused = this.stateManager.getFocusedIndex();
    const currentPosition = this.sortedIndices.indexOf(currentFocused);

    if (currentPosition > 0) {
      const prevIndex = this.sortedIndices[currentPosition - 1];
      this.stateManager.setFocusedIndex(prevIndex);
    } else {
      // 첫 번째이면 마지막으로
      this.stateManager.setFocusedIndex(this.sortedIndices[this.sortedIndices.length - 1]);
    }

    // 스크롤 위치 저장
    const cardScrollTop = this.cardListEl.scrollTop;
    const previewScrollTop = this.previewEl.scrollTop;

    this.renderCards();

    // DOM 렌더링 완료 후 스크롤 복원
    requestAnimationFrame(() => {
      this.cardListEl.scrollTop = cardScrollTop;
      this.previewEl.scrollTop = previewScrollTop;
      this.scrollToFocusedError();
    });

    // AI 도움말 업데이트
    this.updateAIHelp();
  }

  /**
   * 포커스된 오류로 스크롤 및 하이라이트 (스크롤 위치 유지 옵션)
   */
  private scrollToFocusedError(preserveScroll: boolean = false): void {
    const focusedIndex = this.stateManager.getFocusedIndex();

    // 미리보기 패널: 중앙에 포커싱
    const errorSpan = this.previewEl.querySelector(`[data-index="${focusedIndex}"]`) as HTMLElement;
    if (errorSpan) {
      // 기존 포커스 제거
      this.previewEl.querySelectorAll('.error-text').forEach(el => {
        el.removeClass('focused');
      });

      // 새 포커스 추가
      errorSpan.addClass('focused');

      // 스크롤 (preserveScroll이 true이면 스크롤하지 않음)
      if (!preserveScroll) {
        errorSpan.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }

    // 오류 상세 카드: 중앙에 포커싱
    const focusedCard = this.cardListEl.querySelector(`[data-index="${focusedIndex}"]`) as HTMLElement;
    if (focusedCard) {
      // 기존 포커스 제거
      this.cardListEl.querySelectorAll('.error-card').forEach(el => {
        el.removeClass('focused');
      });

      // 새 포커스 추가
      focusedCard.addClass('focused');

      // 스크롤 (preserveScroll이 true이면 스크롤하지 않음)
      if (!preserveScroll) {
        focusedCard.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }

  /**
   * 다음 상태로 순환 (오른쪽 화살표)
   */
  private cycleNextState(): void {
    const focusedIndex = this.stateManager.getFocusedIndex();
    const state = this.stateManager.getState(focusedIndex);
    if (!state) return;

    const correction = this.config.corrections[focusedIndex];

    // 편집 팝업이 열려있으면 닫기
    if (this.editPopupEl) {
      this.editPopupEl.remove();
      this.editPopupEl = null;
    }

    // 상태 순환: error -> corrected -> original-kept -> user-edited -> exception-processed -> error
    switch (state.currentState) {
      case 'error':
        if (correction.corrected.length > 0) {
          this.stateManager.setState(focusedIndex, 'corrected', correction.corrected[0]);
        }
        break;
      case 'corrected':
        this.stateManager.setState(focusedIndex, 'original-kept', correction.original);
        break;
      case 'original-kept':
        // 직접 입력 상태로 변경하고 편집창 열기
        this.stateManager.setState(focusedIndex, 'user-edited', state.selectedValue);

        // 스크롤 위치 저장
        const cardScrollTop1 = this.cardListEl.scrollTop;
        const previewScrollTop1 = this.previewEl.scrollTop;

        this.renderPreviewStats();
        this.renderPreview();
        this.renderCards();
        this.renderTabs();

        // DOM 렌더링 완료 후 스크롤 복원 및 팝업 표시
        requestAnimationFrame(() => {
          this.cardListEl.scrollTop = cardScrollTop1;
          this.previewEl.scrollTop = previewScrollTop1;
          this.showEditPopup();
        });
        return;
      case 'user-edited':
        this.stateManager.setState(focusedIndex, 'exception-processed', correction.original);
        break;
      case 'exception-processed':
        this.stateManager.setState(focusedIndex, 'error', correction.original);
        break;
    }

    // 스크롤 위치 저장
    const cardScrollTop = this.cardListEl.scrollTop;
    const previewScrollTop = this.previewEl.scrollTop;

    this.renderPreviewStats();
    this.renderPreview();
    this.renderCards();
    this.renderTabs();

    // DOM 렌더링 완료 후 스크롤 복원
    requestAnimationFrame(() => {
      this.cardListEl.scrollTop = cardScrollTop;
      this.previewEl.scrollTop = previewScrollTop;
    });
  }

  /**
   * 이전 상태로 순환 (왼쪽 화살표)
   */
  private cyclePrevState(): void {
    const focusedIndex = this.stateManager.getFocusedIndex();
    const state = this.stateManager.getState(focusedIndex);
    if (!state) return;

    const correction = this.config.corrections[focusedIndex];

    // 편집 팝업이 열려있으면 닫기
    if (this.editPopupEl) {
      this.editPopupEl.remove();
      this.editPopupEl = null;
    }

    // 역방향 상태 순환: error -> exception-processed -> user-edited -> original-kept -> corrected -> error
    switch (state.currentState) {
      case 'error':
        this.stateManager.setState(focusedIndex, 'exception-processed', correction.original);
        break;
      case 'exception-processed':
        // 직접 입력 상태로 변경하고 편집창 열기
        this.stateManager.setState(focusedIndex, 'user-edited', state.selectedValue);

        // 스크롤 위치 저장
        const cardScrollTop2 = this.cardListEl.scrollTop;
        const previewScrollTop2 = this.previewEl.scrollTop;

        this.renderPreviewStats();
        this.renderPreview();
        this.renderCards();
        this.renderTabs();

        // DOM 렌더링 완료 후 스크롤 복원 및 팝업 표시
        requestAnimationFrame(() => {
          this.cardListEl.scrollTop = cardScrollTop2;
          this.previewEl.scrollTop = previewScrollTop2;
          this.showEditPopup();
        });
        return;
      case 'user-edited':
        this.stateManager.setState(focusedIndex, 'original-kept', correction.original);
        break;
      case 'original-kept':
        if (correction.corrected.length > 0) {
          this.stateManager.setState(focusedIndex, 'corrected', correction.corrected[0]);
        } else {
          this.stateManager.setState(focusedIndex, 'error', correction.original);
        }
        break;
      case 'corrected':
        this.stateManager.setState(focusedIndex, 'error', correction.original);
        break;
    }

    // 스크롤 위치 저장
    const cardScrollTop = this.cardListEl.scrollTop;
    const previewScrollTop = this.previewEl.scrollTop;

    this.renderPreviewStats();
    this.renderPreview();
    this.renderCards();
    this.renderTabs();

    // DOM 렌더링 완료 후 스크롤 복원
    requestAnimationFrame(() => {
      this.cardListEl.scrollTop = cardScrollTop;
      this.previewEl.scrollTop = previewScrollTop;
    });
  }

  /**
   * 고유명사로 등록
   */
  private registerAsProperNoun(): void {
    const focusedIndex = this.stateManager.getFocusedIndex();
    const correction = this.config.corrections[focusedIndex];
    this.stateManager.setState(focusedIndex, 'exception-processed', correction.original);
    this.renderPreviewStats();
    this.renderPreview();
    this.renderCards();
    this.renderTabs();
  }

  /**
   * 고유명사 관리 뷰 렌더링
   */
  private renderProperNounManagement(): void {
    const states = this.stateManager.getAllStates();
    const properNouns: Array<{ index?: number; word: string; isFromCurrent: boolean }> = [];

    // 1. 현재 검사에서 등록된 고유명사 수집
    states.forEach((state, index) => {
      if (state.currentState === 'exception-processed') {
        properNouns.push({
          index,
          word: state.selectedValue,
          isFromCurrent: true
        });
      }
    });

    // 2. 이전에 저장된 고유명사 추가 (현재 검사에 없는 것만)
    const currentWords = new Set(properNouns.map(pn => pn.word));
    this.config.ignoredWords.forEach(word => {
      if (!currentWords.has(word)) {
        properNouns.push({
          word,
          isFromCurrent: false
        });
      }
    });

    if (properNouns.length === 0) {
      const emptyMessage = this.cardListEl.createDiv({ cls: 'proper-noun-empty' });
      emptyMessage.textContent = '등록된 고유명사가 없습니다.';
      return;
    }

    // 고유명사 목록 렌더링
    properNouns.forEach(({ index, word, isFromCurrent }) => {
      const item = this.cardListEl.createDiv({ cls: 'proper-noun-item' });

      const wordSpan = item.createSpan({ cls: 'proper-noun-word', text: word });

      const actions = item.createDiv({ cls: 'proper-noun-actions' });

      // 삭제 버튼만 표시
      const deleteBtn = actions.createSpan({ cls: 'proper-noun-btn proper-noun-delete-btn', text: '✕' });
      deleteBtn.title = '삭제';
      deleteBtn.onclick = async () => {
        if (isFromCurrent && index !== undefined) {
          // 현재 검사에서 등록된 것: 상태만 변경
          this.stateManager.setState(index, 'error', this.config.corrections[index].original);
          this.renderPreviewStats();
          this.renderPreview();
          this.renderCards();
          this.renderTabs();
        } else {
          // 이전에 저장된 것: ignoredWords에서 직접 삭제
          const newIgnoredWords = this.config.ignoredWords.filter(w => w !== word);
          this.config.ignoredWords.length = 0;
          this.config.ignoredWords.push(...newIgnoredWords);

          // 콜백을 통해 플러그인 설정 업데이트
          if (this.config.onExceptionWordsAdded) {
            // 빈 배열을 전달하여 저장 트리거
            await this.config.onExceptionWordsAdded([]);
          }

          this.renderCards();
          this.renderTabs();
        }
      };
    });
  }

  /**
   * 편집 팝업 표시
   */
  private showEditPopup(): void {
    const focusedIndex = this.stateManager.getFocusedIndex();
    const state = this.stateManager.getState(focusedIndex);
    if (!state) return;

    // 기존 팝업 제거
    if (this.editPopupEl) {
      this.editPopupEl.remove();
    }

    // 오버레이 생성
    const overlay = this.modalEl.createDiv({ cls: 'edit-popup-overlay' });
    this.editPopupEl = overlay;

    // 팝업 생성
    const popup = overlay.createDiv({ cls: 'edit-popup' });

    // 입력 필드 래퍼
    const inputWrapper = popup.createDiv({ cls: 'edit-popup-input-wrapper' });

    // 입력 필드
    const input = inputWrapper.createEl('input', {
      cls: 'edit-popup-input',
      type: 'text',
      value: state.selectedValue
    });

    // 펜 아이콘
    const icon = inputWrapper.createDiv({ cls: 'edit-popup-icon' });
    setIcon(icon, 'pen');

    // Enter 키로 저장, Escape 키로 편집창만 닫기
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const newValue = input.value;
        this.stateManager.setState(focusedIndex, 'user-edited', newValue);

        // 스크롤 위치 저장
        const cardScrollTop = this.cardListEl.scrollTop;
        const previewScrollTop = this.previewEl.scrollTop;

        this.renderPreviewStats();
        this.renderPreview();
        this.renderCards();
        this.renderTabs();

        // DOM 렌더링 완료 후 스크롤 복원
        requestAnimationFrame(() => {
          this.cardListEl.scrollTop = cardScrollTop;
          this.previewEl.scrollTop = previewScrollTop;
        });

        overlay.remove();
        this.editPopupEl = null;
        return false;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        overlay.remove();
        this.editPopupEl = null;
        return false;
      }
    });

    // 오버레이 클릭 시 닫기
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.editPopupEl = null;
      }
    };

    // 입력 필드에 포커스
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
  }

  /**
   * 교정 적용
   */
  private applyCorrections(): void {
    const states = this.stateManager.getAllStates();
    let text = this.config.selectedText;

    // 뒤에서부터 교체 (인덱스 오차 방지)
    const sortedCorrections = this.config.corrections
      .map((correction, index) => ({
        correction,
        index,
        position: text.indexOf(correction.original)
      }))
      .filter(item => item.position !== -1)
      .sort((a, b) => b.position - a.position);

    sortedCorrections.forEach(({ correction, index, position }) => {
      const state = states.get(index);
      if (state && state.selectedValue !== correction.original) {
        text = text.substring(0, position) +
               state.selectedValue +
               text.substring(position + correction.original.length);
      }
    });

    // 에디터에 적용
    this.config.editor.replaceRange(text, this.config.start, this.config.end);

    // 예외 단어 추가
    const exceptionWords = this.stateManager.getExceptionWords();
    if (exceptionWords.length > 0 && this.config.onExceptionWordsAdded) {
      this.config.onExceptionWordsAdded(exceptionWords);
    }

    new Notice(`${this.config.corrections.length}개의 오류를 처리했습니다.`);
    this.close();
  }

  /**
   * AI 검증 실행 (포커스된 오류 1개만)
   */
  private async runAIVerification(): Promise<void> {
    // API 키 확인
    if (!this.config.settings.geminiApiKey || this.config.settings.geminiApiKey.trim().length === 0) {
      new Notice('Gemini API 키를 설정에서 입력해주세요.');
      return;
    }

    if (this.aiVerificationActive) {
      new Notice('AI 검증이 이미 실행 중입니다.');
      return;
    }

    // 현재 포커스된 오류 인덱스 저장
    const targetIndex = this.stateManager.getFocusedIndex();
    const correction = this.config.corrections[targetIndex];

    this.aiVerificationActive = true;
    this.botButtonEl.addClass('active');

    // 검증 중 표시 (1행 2열에 배치)
    // 기존 요소들 제거
    const existingRow = this.aiHelpContainerEl.querySelector('.ai-suggestion-row');
    if (existingRow) existingRow.remove();
    const existingAdvice = this.aiHelpContainerEl.querySelector('.ai-advice-text');
    if (existingAdvice) existingAdvice.remove();
    const existingSource = this.aiHelpContainerEl.querySelector('.ai-source-text');
    if (existingSource) existingSource.remove();

    // 1행 2열에 "AI 검증 중..." 메시지 추가
    const loadingRow = this.aiHelpContainerEl.createDiv({ cls: 'ai-suggestion-row' });
    const loadingText = loadingRow.createSpan({ cls: 'ai-loading-text' });
    loadingText.textContent = 'AI 검증 중...';
    loadingText.style.color = 'var(--text-muted)';

    try {
      // Gemini 서비스 초기화 (압축된 한글맞춤법 규정 사용)
      console.log('[AI검증] 한글맞춤법 규정 로드 완료:', {
        크기: `${(KOREAN_SPELLING_RULES_COMPRESSED.length / 1024).toFixed(2)} KB`,
        압축률: `${COMPRESSION_STATS.ratio}%`
      });

      const geminiService = new GeminiService(
        this.config.settings.geminiApiKey,
        KOREAN_SPELLING_RULES_COMPRESSED,
        this.config.settings.dictionaryApiKey,
        this.config.settings.etriApiKey
      );

      // AI 검증 실행
      const result = await geminiService.verifyCorrection(
        this.config.selectedText,
        correction.original,
        correction.corrected,
        correction.help
      );

      // 결과 저장 (targetIndex의 correction 객체에만)
      correction.aiSuggestion = result.suggestion;
      correction.aiNeedsCorrection = result.needsCorrection;
      correction.aiAdvice = result.advice;
      correction.aiSource = result.source;

      // 현재 포커스가 targetIndex이면 결과 표시
      if (this.stateManager.getFocusedIndex() === targetIndex) {
        this.updateAIHelp();
      } else {
        // 포커스가 바뀌었으면 비우기
        this.aiHelpEl.empty();
      }

      new Notice('AI 검증 완료');

    } catch (error) {
      console.error('AI 검증 오류:', error);
      correction.aiSuggestion = correction.original;
      correction.aiNeedsCorrection = false;
      correction.aiAdvice = 'AI 분석 중 오류가 발생했습니다.';
      correction.aiSource = 'AI 판단';

      if (this.stateManager.getFocusedIndex() === targetIndex) {
        this.updateAIHelp();
      }

      new Notice('AI 검증 중 오류가 발생했습니다.');
    } finally {
      this.aiVerificationActive = false;
      this.botButtonEl.removeClass('active');
    }
  }

  /**
   * 띄어쓰기/붙여쓰기 변경사항 시각화
   */
  private visualizeSpacingChanges(original: string, suggestion: string): DocumentFragment {
    const fragment = document.createDocumentFragment();

    // 두 문자열이 같으면 그냥 반환
    if (original === suggestion) {
      fragment.append(document.createTextNode(suggestion));
      return fragment;
    }

    let i = 0, j = 0;
    while (i < original.length || j < suggestion.length) {
      // 띄어쓰기 추가된 경우
      if (j < suggestion.length && suggestion[j] === ' ' && (i >= original.length || original[i] !== ' ')) {
        const marker = document.createElement('span');
        marker.addClass('spacing-marker');
        marker.textContent = ' ␣ ';
        fragment.appendChild(marker);
        j++;
        continue;
      }

      // 띄어쓰기 제거된 경우
      if (i < original.length && original[i] === ' ' && (j >= suggestion.length || suggestion[j] !== ' ')) {
        const marker = document.createElement('span');
        marker.addClass('spacing-marker');
        marker.textContent = '⌒';
        fragment.appendChild(marker);
        i++;
        continue;
      }

      // 같은 문자면 그냥 추가
      if (i < original.length && j < suggestion.length && original[i] === suggestion[j]) {
        fragment.append(document.createTextNode(suggestion[j]));
        i++;
        j++;
      } else {
        // 다른 문자면 suggestion 것 사용
        if (j < suggestion.length) {
          fragment.append(document.createTextNode(suggestion[j]));
          j++;
        }
        if (i < original.length) {
          i++;
        }
      }
    }

    return fragment;
  }

  /**
   * AI 도움말 업데이트
   */
  private updateAIHelp(): void {
    const focusedIndex = this.stateManager.getFocusedIndex();
    const correction = this.config.corrections[focusedIndex];

    // 봇 아이콘 색상 초기화
    this.botButtonEl.style.color = '';

    // AI 검증 결과가 없으면 모든 grid 아이템 제거
    if (!correction.aiAdvice) {
      const existingRow = this.aiHelpContainerEl.querySelector('.ai-suggestion-row');
      if (existingRow) existingRow.remove();
      const existingAdvice = this.aiHelpContainerEl.querySelector('.ai-advice-text');
      if (existingAdvice) existingAdvice.remove();
      const existingSource = this.aiHelpContainerEl.querySelector('.ai-source-text');
      if (existingSource) existingSource.remove();
      return;
    }

    // 기존 grid 아이템 제거
    const existingRow = this.aiHelpContainerEl.querySelector('.ai-suggestion-row');
    if (existingRow) existingRow.remove();
    const existingAdvice = this.aiHelpContainerEl.querySelector('.ai-advice-text');
    if (existingAdvice) existingAdvice.remove();
    const existingSource = this.aiHelpContainerEl.querySelector('.ai-source-text');
    if (existingSource) existingSource.remove();

    // 1행 2열: 대치어 행을 컨테이너에 직접 추가
    const suggestionRow = this.aiHelpContainerEl.createDiv({ cls: 'ai-suggestion-row' });

    // 대치어 컨텐츠 (chevrons-right + 대치어 텍스트)
    const suggestionContent = suggestionRow.createDiv({ cls: 'ai-suggestion-content' });

    // chevrons-right 아이콘
    const arrowIcon = suggestionContent.createSpan({ cls: 'ai-suggestion-arrow' });
    setIcon(arrowIcon, 'chevrons-right');

    // 대치어 텍스트 (띄어쓰기 시각화)
    const suggestionText = suggestionContent.createSpan({ cls: 'ai-suggestion-text' });
    const visualizedSuggestion = this.visualizeSpacingChanges(correction.original, correction.aiSuggestion || '');
    suggestionText.appendChild(visualizedSuggestion);

    // 색상 및 봇 아이콘 색상 설정
    if (correction.aiNeedsCorrection) {
      suggestionContent.style.color = '#66bb6a'; // 초록색
      this.botButtonEl.style.color = '#66bb6a';
    } else {
      suggestionContent.style.color = '#ffa726'; // 주황색
      this.botButtonEl.style.color = '#ffa726';
    }

    // 2행 2열: 상세 설명을 컨테이너에 직접 추가
    const adviceText = this.aiHelpContainerEl.createDiv({ cls: 'ai-advice-text' });
    adviceText.textContent = correction.aiAdvice;

    // 3행 2열: 출처를 컨테이너에 직접 추가
    if (correction.aiSource) {
      const sourceText = this.aiHelpContainerEl.createDiv({ cls: 'ai-source-text' });
      sourceText.textContent = `출처: ${correction.aiSource}`;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // 키보드 스코프 해제
    this.app.keymap.popScope(this.keyboardScope);
  }
}
