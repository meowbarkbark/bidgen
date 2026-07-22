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

// 기준자료 입력 (PRD §8.1): 제비율·노임단가는 Excel 필수, 표준품셈은 PDF 선택
export interface ReferenceFiles {
  rateFile: FileMeta | null; // 제비율 Excel (.xlsx) 필수
  laborFile: FileMeta | null; // 노임단가 Excel (.xlsx) 필수
  standardPdf: FileMeta | null; // 표준품셈 PDF (.pdf) 선택
}

// 판단근거 문서 유형 (PRD §13.1)
export type EvidenceDocType = 'RATE_EXCEL' | 'LABOR_RATE_EXCEL' | 'STANDARD_PDF' | 'BUILTIN';

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
    documentType: EvidenceDocType;
    // 기준자료 Excel 근거 (제비율/노임단가)
    sheetName?: string;
    cell?: string;
    displayValue?: string;
    // 선택 표준품셈 PDF 근거
    page?: number;
    tableTitle: string;
    quote: string;
    confidence: number;
    appliedCondition: string;
  };
  recommendedAction: string;
}

// --- 정규화 원가계산서 리포트 (PRD §6.4 / FR-034) ---

export type ResolutionStatus =
  | 'SAME_ROW'
  | 'FORMULA_TRACE'
  | 'CROSS_SHEET_TRACE'
  | 'CROSS_SHEET_UNRESOLVED'
  | 'FORMULA_UNRESOLVED'
  | 'UNRESOLVED';

export interface NormalizedCostRow {
  rowId: string;
  status: ValidationStatus;
  sourceSection: string; // 원본구간
  costNature: string; // 비용성격
  validationPolicy: string; // 검증정책 (RATE_CHECK 등)
  canonicalName: string; // 표준항목
  originalName: string; // 원본항목
  baseLabel: string; // 산출기초명
  baseAmount: string; // 산출기초값
  rate: string; // 요율
  rateSource: string; // 요율출처
  amount: string; // 금액
  calculatedAmount: string; // 계산값
  difference: string; // 차이
  calculationCell: string; // 계산셀
  resolutionStatus: ResolutionStatus; // 해결상태
  formulaConstants: string; // 수식상수
  tracePath: string; // 추적경로
  note: string; // 비고
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
  status: '추출 완료' | '확인 필요' | '검증 불가' | '미수행';
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

// --- 검증 엔진 설정 ---

export type ValidationMode = 'ARITHMETIC_ONLY' | 'ARITHMETIC_AND_RATE';

export type RoundingMethod = 'ROUND_WON' | 'FLOOR_WON' | 'FLOOR_TEN' | 'NONE';

// 기준자료 Excel에서 추출한 요율의 출처 (셀 근거)
export interface RateSource {
  documentTitle: string; // 파일명
  sheetName: string;
  cell: string;
  displayValue: string;
}

export interface ReferenceRate {
  canonicalName: string;
  rate: number | null; // 분수(0.032). null = 미입력
  roundingMethod?: RoundingMethod;
  source?: RateSource; // 제비율 Excel에서 파싱한 경우의 셀 근거
}

// 제비율 Excel에서 파싱한 기준요율 (PRD §8.5 RATE_EXCEL)
export interface RateCriterion {
  canonicalName: string;
  rate: number; // 분수(0.0356)
  sheetName: string;
  cell: string;
  displayValue: string;
  confidence: number;
  condition?: string; // 간접공사비 매트릭스의 적용 구간(직접공사비)·기간 조건
}

// 노임단가 Excel에서 파싱한 직종별 단가 (PRD §8.5 LABOR_RATE_EXCEL)
export interface LaborRate {
  occupationName: string;
  unitPrice: number;
  sheetName: string;
  cell: string;
  displayValue: string;
  confidence: number;
}

export interface ValidationConfig {
  mode: ValidationMode;
  referenceRates: Record<string, ReferenceRate>; // canonicalName 키
  laborRates?: LaborRate[]; // 노임단가 Excel 파싱 결과 (V-CON-007)
  laborDocumentTitle?: string; // 노임단가 파일명 (근거 표기용)
  maxCellsScanned?: number; // 기본 20000
  defaultRounding?: RoundingMethod; // 기본 ROUND_WON
}

export interface DetectedItem {
  canonicalName: string;
  originalLabel: string;
  category: string;
  sheetName: string;
  labelCell: string;
  amountCell: string | null;
  rateCell: string | null;
  amountValue: number | null;
  rateValue: number | null; // 분수
  requiresReference: boolean;
}

export interface ResultFilters {
  status: ValidationStatus | 'ALL';
  validationType: ValidationType | 'ALL';
  sheetName: string;
}
