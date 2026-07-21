export type ProcurementType = 'CONSTRUCTION' | 'SERVICE' | 'GOODS';

export type ValidationStatus = 'ERROR' | 'NEEDS_REVIEW' | 'WARNING' | 'OK' | 'UNAVAILABLE';

export type ValidationType =
  | 'ARITHMETIC'
  | 'TOTAL'
  | 'RATE'
  | 'BASE'
  | 'CONDITION'
  | 'FORMULA'
  | 'REFERENCE'
  | 'LABOR'
  | 'STANDARD';

export interface FileMeta {
  name: string;
  sizeLabel: string;
  detail: string;
}

export interface ValidationResult {
  resultId: string;
  status: ValidationStatus;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  validationType: ValidationType;
  procurementType: ProcurementType;
  item: {
    canonicalName: string;
    originalName: string;
    category: string;
  };
  excel: {
    sheetName: string;
    cell: string;
    rateCell?: string;
    inputValue: string;
    inputRate?: string;
    formula: string;
    referencedCells: string[];
    previewRows: Array<Record<string, string>>;
  };
  expected: {
    baseAmount: string;
    rate?: string;
    rawAmount: string;
    roundingMethod: string;
    finalAmount: string;
  };
  difference: string;
  summary: string;
  reason: string;
  evidence: {
    documentTitle: string;
    page: number;
    tableTitle: string;
    quote: string;
    confidence: number;
    appliedCondition: string;
  };
  recommendedAction: string;
}

export interface RecognitionSheet {
  sheetName: string;
  status: '자동 인식' | '확인 필요' | '분석 완료';
  role: string;
  description: string;
}

export interface RecognitionCriterion {
  title: string;
  count: number;
  status: '추출 완료' | '확인 필요' | '검증 불가';
  description: string;
}

export interface RecognitionSummary {
  sheets: RecognitionSheet[];
  criteria: RecognitionCriterion[];
  reviewPrompt: string;
}

export interface ProgressStep {
  label: string;
  detail: string;
}

// --- Workbook IR: 양식과 무관한 고정 JSON 스키마 (PRD §9.2 기반) ---

export type SheetRole =
  | 'COVER_SUMMARY'
  | 'COST_SUMMARY'
  | 'CONSTRUCTION_ITEMS'
  | 'QUANTITY'
  | 'UNIT_PRICE'
  | 'PRICE_SURVEY'
  | 'WAGE_RATE'
  | 'RATE_STANDARD'
  | 'OTHER';

export type IRCellType = 'FORMULA' | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'DATE' | 'ERROR' | 'BLANK';

export interface IRCell {
  address: string; // "F12"
  dataType: IRCellType;
  rawValue: string; // 수식이면 "=INT(F8*F10)", 아니면 리터럴
  cachedValue: string | number | boolean | null; // 마지막 저장 계산값
  displayValue: string; // 표시 텍스트
  numberFormat: string | null;
  mergedRange: string | null; // 병합 앵커 셀이면 "A1:B1", 아니면 null
  hidden: boolean; // 행 또는 열 숨김
  references: string[]; // 수식에서 추출 (로컬 + 시트간)
}

export interface IRSheet {
  sheetName: string;
  sheetRole: SheetRole;
  rowCount: number;
  columnCount: number;
  cellCount: number;
  formulaCount: number;
  mergeCount: number;
  cells: IRCell[];
}

export interface WorkbookIR {
  schemaVersion: string; // "1.0"
  fileName: string;
  procurementType: ProcurementType;
  generatedAt: string; // ISO
  sheets: IRSheet[];
  totals: { sheetCount: number; cellCount: number; formulaCount: number; mergeCount: number };
}

export interface ResultFilters {
  status: ValidationStatus | 'ALL';
  validationType: ValidationType | 'ALL';
  sheetName: string;
}
