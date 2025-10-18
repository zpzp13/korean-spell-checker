import { Plugin, MarkdownView, Notice } from 'obsidian';
import { PluginSettings } from './src/types/interfaces';
import { DEFAULT_SETTINGS, SpellCheckerSettingTab } from './src/services/settings';
import { HanspellService } from './src/services/hanspell';
import { CorrectionModal } from './src/ui/correctionModal';

/**
 * 한국어 맞춤법 검사 플러그인
 */
export default class KoreanSpellCheckerPlugin extends Plugin {
  settings: PluginSettings;
  hanspellService: HanspellService;

  async onload() {
    console.log('Korean Spell Checker 플러그인 로딩');

    // 설정 로드
    await this.loadSettings();

    // Hanspell 서비스 초기화
    this.hanspellService = new HanspellService();

    // 명령어 등록
    this.addCommand({
      id: 'check-korean-spelling',
      name: '한국어 맞춤법 검사',
      callback: async () => {
        await this.executeSpellCheck();
      }
    });

    // 설정 탭 추가
    this.addSettingTab(new SpellCheckerSettingTab(this.app, this));

    console.log('Korean Spell Checker 플러그인 로딩 완료');
  }

  onunload() {
    console.log('Korean Spell Checker 플러그인 언로딩');
  }

  /**
   * 설정 로드
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * 설정 저장
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * 맞춤법 검사 실행
   */
  async executeSpellCheck(): Promise<void> {
    try {
      // 활성 마크다운 뷰 가져오기
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) {
        new Notice('활성화된 마크다운 편집기가 없습니다.');
        return;
      }

      const editor = activeView.editor;
      if (!editor) {
        new Notice('편집기를 찾을 수 없습니다.');
        return;
      }

      // 선택된 텍스트 또는 전체 문서 가져오기
      let selectedText = editor.getSelection();
      let selectionStart = editor.getCursor('from');
      let selectionEnd = editor.getCursor('to');

      // 선택된 텍스트가 없으면 전체 문서 사용
      if (!selectedText || selectedText.trim().length === 0) {
        selectedText = editor.getValue();
        const totalLines = editor.lineCount();
        const lastLine = totalLines - 1;
        const lastLineText = editor.getLine(lastLine);
        selectionStart = { line: 0, ch: 0 };
        selectionEnd = { line: lastLine, ch: lastLineText.length };
      }

      if (!selectedText || selectedText.trim().length === 0) {
        new Notice('검사할 텍스트가 없습니다.');
        return;
      }

      // 로딩 알림
      const loadingNotice = new Notice(`맞춤법 검사 중... (${selectedText.length}자)`, 0);

      try {
        // Hanspell DAUM 검사 호출
        console.log(`맞춤법 검사 시작: ${selectedText.length}자`);
        const result = await this.hanspellService.checkSpelling(selectedText);
        console.log(`Hanspell 검사 완료: ${result.corrections.length}개 발견`);

        // 예외 단어 필터링
        const filteredCorrections = result.corrections.filter(correction => {
          return !this.settings.ignoredWords.includes(correction.original);
        });

        console.log(`예외 단어 필터링 후: ${filteredCorrections.length}개`);

        loadingNotice.hide();

        if (filteredCorrections.length === 0) {
          new Notice('수정할 것이 없습니다. 훌륭합니다!');
          return;
        }

        // 교정 모달 표시
        const modal = new CorrectionModal(this.app, {
          corrections: filteredCorrections,
          selectedText: selectedText,
          start: selectionStart,
          end: selectionEnd,
          editor: editor,
          ignoredWords: this.settings.ignoredWords,
          settings: this.settings,
          onExceptionWordsAdded: (words: string[]) => this.handleExceptionWords(words)
        });

        modal.open();

      } catch (error) {
        loadingNotice.hide();
        console.error('맞춤법 검사 오류:', error);
        new Notice(`맞춤법 검사 중 오류가 발생했습니다: ${error.message}`);
      }

    } catch (error) {
      console.error('맞춤법 검사 실행 오류:', error);
      new Notice(`오류가 발생했습니다: ${error.message}`);
    }
  }

  /**
   * 예외 단어 처리
   */
  private async handleExceptionWords(words: string[]): Promise<void> {
    if (words.length === 0) {
      // 빈 배열이면 현재 설정 저장 (삭제 시나리오)
      await this.saveSettings();
      console.log('예외 단어 목록 저장 완료:', this.settings.ignoredWords);
      return;
    }

    // 중복 제거
    const uniqueWords = [...new Set([...this.settings.ignoredWords, ...words])];

    if (uniqueWords.length > this.settings.ignoredWords.length) {
      const addedCount = uniqueWords.length - this.settings.ignoredWords.length;
      this.settings.ignoredWords = uniqueWords;
      await this.saveSettings();

      new Notice(`${addedCount}개의 단어가 예외 목록에 추가되었습니다.`);
      console.log('예외 단어 저장 완료:', this.settings.ignoredWords);
    }
  }
}
