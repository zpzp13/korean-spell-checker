import { App, PluginSettingTab, Setting } from 'obsidian';
import { PluginSettings } from '../types/interfaces';
import { GeminiService } from './geminiService';
import { DictionaryService } from './dictionaryService';
import { ETRIMorphService } from './etriMorphService';

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: PluginSettings = {
  ignoredWords: [],
  geminiApiKey: '',
  geminiApiStatus: 'none',
  dictionaryApiKey: '',
  dictionaryApiStatus: 'none',
  etriApiKey: '',
  etriApiStatus: 'none'
};

/**
 * 설정 탭 UI
 */
export class SpellCheckerSettingTab extends PluginSettingTab {
  plugin: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 최상단 제목
    containerEl.createEl('h1', {
      text: 'Korean Spell Checker plugin setting',
      cls: 'korean-spell-checker-settings-title'
    });

    // 맞춤법 검사 설명 (plain text)
    containerEl.createEl('p', {
      text: '이 플러그인은 다음(DAUM)의 비공식 맞춤법 검사 API를 사용합니다. 별도의 API 키가 필요하지 않으며, 언제든지 서비스가 중단될 수 있습니다.',
      cls: 'setting-item-description'
    });

    // AI 분석 섹션
    containerEl.createEl('h1', { text: 'AI 분석' });

    // 언어모델 (Gemini)
    containerEl.createEl('h2', { text: '언어모델' });
    const geminiDesc = containerEl.createDiv({ cls: 'setting-item-description' });
    geminiDesc.createEl('p', {
      text: 'Gemini AI를 사용하여 맞춤법 검사 결과를 검증하고 추가 조언을 받을 수 있습니다.'
    });
    const geminiLink = geminiDesc.createEl('a', {
      text: 'Google AI Studio에서 API 키 발급받기',
      href: 'https://aistudio.google.com/api-keys',
      cls: 'external-link'
    });
    geminiLink.setAttr('target', '_blank');

    // Gemini API 키
    new Setting(containerEl)
      .setName('Gemini API 키')
      .setDesc('Google AI Studio에서 발급받은 Gemini API 키를 입력하세요')
      .addText(text => {
        text
          .setPlaceholder('API 키 입력')
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value;

            // API 검증
            if (value && value.trim().length > 0) {
              this.plugin.settings.geminiApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링 (검증 중 표시)

              const isValid = await GeminiService.validateApiKey(value);
              this.plugin.settings.geminiApiStatus = isValid ? 'success' : 'error';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            } else {
              this.plugin.settings.geminiApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            }
          });
      });

    // API 상태 표시
    if (this.plugin.settings.geminiApiKey && this.plugin.settings.geminiApiKey.trim().length > 0) {
      const statusEl = containerEl.createDiv({ cls: 'api-status' });
      if (this.plugin.settings.geminiApiStatus === 'success') {
        statusEl.createSpan({ cls: 'api-status-success', text: '✓ 연결 성공' });
      } else if (this.plugin.settings.geminiApiStatus === 'error') {
        statusEl.createSpan({ cls: 'api-status-error', text: '✗ 연결 실패' });
      } else {
        statusEl.createSpan({ cls: 'api-status', text: '검증 중...' });
      }
    }

    // 어휘 분석 (표준국어대사전)
    containerEl.createEl('h2', { text: '어휘 분석' });
    const dictDesc = containerEl.createDiv({ cls: 'setting-item-description' });
    dictDesc.createEl('p', {
      text: '국립국어원 표준국어대사전 Open API를 사용하여 단어의 품사 및 뜻 정보를 조회합니다. AI 검증 시 사전 검색 기능을 제공하여 정확도를 높입니다.'
    });
    const dictLink = dictDesc.createEl('a', {
      text: '표준국어대사전 홈페이지에서 API 키 발급받기',
      href: 'https://stdict.korean.go.kr/openapi/openApiInfo.do',
      cls: 'external-link'
    });
    dictLink.setAttr('target', '_blank');
    
    new Setting(containerEl)
      .setName('표준국어대사전 API 키')
      .setDesc('국립국어원 Open API에서 발급받은 API 키를 입력하세요')
      .addText(text => {
        text
          .setPlaceholder('API 키 입력')
          .setValue(this.plugin.settings.dictionaryApiKey)
          .onChange(async (value) => {
            this.plugin.settings.dictionaryApiKey = value;

            // API 검증
            if (value && value.trim().length > 0) {
              this.plugin.settings.dictionaryApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링

              const isValid = await DictionaryService.validateApiKey(value);
              this.plugin.settings.dictionaryApiStatus = isValid ? 'success' : 'error';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            } else {
              this.plugin.settings.dictionaryApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            }
          });
      });

    // Dictionary API 상태 표시
    if (this.plugin.settings.dictionaryApiKey && this.plugin.settings.dictionaryApiKey.trim().length > 0) {
      const statusEl = containerEl.createDiv({ cls: 'api-status' });
      if (this.plugin.settings.dictionaryApiStatus === 'success') {
        statusEl.createSpan({ cls: 'api-status-success', text: '✓ 연결 성공' });
      } else if (this.plugin.settings.dictionaryApiStatus === 'error') {
        statusEl.createSpan({ cls: 'api-status-error', text: '✗ 연결 실패' });
      } else {
        statusEl.createSpan({ cls: 'api-status', text: '검증 중...' });
      }
    }

    // 형태소 분석 (ETRI)
    containerEl.createEl('h2', { text: '형태소 분석' });

    const etriDesc = containerEl.createDiv({ cls: 'setting-item-description' });
    etriDesc.createEl('p', {
      text: 'ETRI 언어 분석 API를 사용하여 정확한 형태소 분석을 수행합니다.'
    });
    etriDesc.createEl('p', {
      text: '무료 API (5,000건/일 제한)'
    });

    const etriLink = etriDesc.createEl('a', {
      text: 'ETRI AI Open API에서 발급받기',
      href: 'https://epretx.etri.re.kr/',
      cls: 'external-link'
    });
    etriLink.setAttr('target', '_blank');

    new Setting(containerEl)
      .setName('ETRI API 키')
      .setDesc('ETRI AI Open API에서 발급받은 API 키를 입력하세요')
      .addText(text => {
        text
          .setPlaceholder('API 키 입력')
          .setValue(this.plugin.settings.etriApiKey)
          .onChange(async (value) => {
            this.plugin.settings.etriApiKey = value;

            // API 검증
            if (value && value.trim().length > 0) {
              this.plugin.settings.etriApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링

              const isValid = await ETRIMorphService.validateApiKey(value);
              this.plugin.settings.etriApiStatus = isValid ? 'success' : 'error';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            } else {
              this.plugin.settings.etriApiStatus = 'none';
              await this.plugin.saveSettings();
              this.display(); // 재렌더링
            }
          });
      });

    // ETRI API 상태 표시
    if (this.plugin.settings.etriApiKey && this.plugin.settings.etriApiKey.trim().length > 0) {
      const statusEl = containerEl.createDiv({ cls: 'api-status' });
      if (this.plugin.settings.etriApiStatus === 'success') {
        statusEl.createSpan({ cls: 'api-status-success', text: '✓ 연결 성공' });
      } else if (this.plugin.settings.etriApiStatus === 'error') {
        statusEl.createSpan({ cls: 'api-status-error', text: '✗ 연결 실패' });
      } else {
        statusEl.createSpan({ cls: 'api-status', text: '검증 중...' });
      }
    }

    // 편의 기능 섹션
    containerEl.createEl('h2', { text: '편의 기능' });

    // 예외 단어 목록
    new Setting(containerEl)
      .setName('예외 단어 목록')
      .setDesc('맞춤법 검사에서 제외할 단어 목록 (쉼표로 구분)')
      .addTextArea(text => text
        .setPlaceholder('단어1, 단어2, 단어3')
        .setValue(this.plugin.settings.ignoredWords.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.ignoredWords = value
            .split(',')
            .map(word => word.trim())
            .filter(word => word.length > 0);
          await this.plugin.saveSettings();
        }));

    // 맞춤법 검사 모달 단축키 (읽기 전용)
    containerEl.createEl('h4', { text: '맞춤법 검사 모달 단축키' });
    const shortcutsDesc = containerEl.createDiv({ cls: 'setting-item-description' });
    const shortcutsList = shortcutsDesc.createEl('ul');
    shortcutsList.createEl('li', { text: 'Tab / Shift+Tab: 다음/이전 오류로 이동' });
    shortcutsList.createEl('li', { text: '← / →: 상태 변경 (오류 / 수정 / 예외 / 직접입력 / 고유명사)' });
    shortcutsList.createEl('li', { text: '↑ / ↓: 다음/이전 오류로 이동' });
    shortcutsList.createEl('li', { text: 'Alt+I: AI 검증 실행' });
    shortcutsList.createEl('li', { text: 'Alt+Enter: 교정 적용' });
    shortcutsList.createEl('li', { text: 'Alt+F4: 모달 닫기' });
  }
}
