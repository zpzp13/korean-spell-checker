import { EditorPosition, Editor } from "obsidian";

/**
 * 맞춤법 교정 정보
 */
export interface Correction {
  original: string;
  corrected: string[];
  help: string;
  type?: string; // 오류 타입 (space, spell, doubt 등)
  aiSuggestion?: string; // AI가 제안하는 대치어
  aiNeedsCorrection?: boolean; // AI 판단: 교정 필요 여부 (true: 교정 필요, false: 원문 유지)
  aiAdvice?: string; // AI 분석 도움말 (상세)
  aiSource?: string; // AI 도움말 출처
}

/**
 * 플러그인 설정
 */
export interface PluginSettings {
  ignoredWords: string[];
  geminiApiKey: string;
  geminiApiStatus: 'none' | 'success' | 'error';
  dictionaryApiKey: string; // 표준국어대사전 API 키
  dictionaryApiStatus: 'none' | 'success' | 'error';
  etriApiKey: string; // ETRI 형태소 분석 API 키
  etriApiStatus: 'none' | 'success' | 'error';
}

/**
 * 맞춤법 검사 결과
 */
export interface SpellCheckResult {
  resultOutput: string;
  corrections: Correction[];
}

/**
 * 모달 설정
 */
export interface ModalConfig {
  corrections: Correction[];
  selectedText: string;
  start: EditorPosition;
  end: EditorPosition;
  editor: Editor;
  ignoredWords: string[];
  settings: PluginSettings; // 플러그인 설정 추가
  onExceptionWordsAdded?: (words: string[]) => void;
}

/**
 * 교정 상태 타입
 */
export type CorrectionState = 'error' | 'corrected' | 'exception-processed' | 'original-kept' | 'user-edited';

/**
 * 교정 상태 정보
 */
export interface CorrectionStateInfo {
  correctionIndex: number;
  currentState: CorrectionState;
  selectedValue: string;
  isExceptionState?: boolean;
  isUserEdited?: boolean;
}
