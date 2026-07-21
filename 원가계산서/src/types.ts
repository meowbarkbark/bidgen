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

export interface ResultFilters {
  status: ValidationStatus | 'ALL';
  validationType: ValidationType | 'ALL';
  sheetName: string;
}
