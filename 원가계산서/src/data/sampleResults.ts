import type { ProgressStep, RecognitionSummary, ValidationResult } from '../types';

const previewRows = [
  { A: '31', B: '직접노무비', F: '559,050,000', G: '', H: '' },
  { A: '32', B: '산업안전보건관리비', F: '559,050,000', G: '3.20%', H: '18,420,000' },
  { A: '33', B: '고용보험료', F: '559,050,000', G: '0.87%', H: '4,863,735' },
];

const healthInsuranceRows = [
  { A: '28', B: '산재보험료', F: '102,500,000', G: '3.20%', H: '3,280,000' },
  { A: '29', B: '국민건강보험료', F: '231,750,000', G: '3.545%', H: '8,215,300' },
  { A: '30', B: '노인장기요양보험료', F: '8,215,300', G: '12.95%', H: '1,063,000' },
];

export const recognitionSummary: RecognitionSummary = {
  sheets: [
    {
      sheetName: '추정가격내역서',
      status: '자동 인식',
      role: '원가계산서',
      description: '재료비, 노무비, 경비, 제비율, 총액',
    },
    {
      sheetName: '공사내역서',
      status: '자동 인식',
      role: '세부내역',
      description: '품명, 규격, 수량, 단가, 금액',
    },
    {
      sheetName: '일위대가표',
      status: '자동 인식',
      role: '산출근거',
      description: '단위당 재료, 노무, 경비',
    },
    {
      sheetName: '가격조사서',
      status: '확인 필요',
      role: '단가 기준',
      description: '조사단가와 적용단가 열 구분 필요',
    },
    {
      sheetName: '기타 13개 시트',
      status: '분석 완료',
      role: '보조자료',
      description: '참조 범위와 중간 계산값',
    },
  ],
  criteria: [
    {
      title: '제비율 기준',
      count: 28,
      status: '추출 완료',
      description: '요율, 산출기초, 금액구간, 페이지 근거',
    },
    {
      title: '노임단가',
      count: 142,
      status: '추출 완료',
      description: '직종명, 단가, 기준일',
    },
    {
      title: '표준품셈',
      count: 317,
      status: '추출 완료',
      description: '품명, 규격, 단위, 공량',
    },
    {
      title: '가격조사서 적용단가',
      count: 1,
      status: '확인 필요',
      description: '적용단가 열 후보가 2개입니다.',
    },
  ],
  reviewPrompt: '가격조사서의 적용단가 열을 선택해 주세요.',
};

export const progressSteps: ProgressStep[] = [
  { label: 'Excel 시트 및 셀 구조 분석', detail: '18개 시트, 912개 수식, 391개 병합범위' },
  { label: '수식과 참조 셀 연결', detail: '시트 간 참조와 원본 수식 보존' },
  { label: '수량 × 단가 및 금액 재계산', detail: '공통 산술 규칙 적용' },
  { label: '재료비·노무비·경비 합계 검증', detail: '소계와 총계 비교' },
  { label: '제비율 적용값 비교', detail: '기준자료 요율과 Excel 요율 비교' },
  { label: '노임단가 비교', detail: '대표 직종명 매핑 확인' },
  { label: '표준품셈 적용 여부 확인', detail: '시연용 대표 항목 검토' },
  { label: '최종 추정가격 및 부가세 확인', detail: '공급가액, 부가세, 합계 검증' },
];

const primaryResults: ValidationResult[] = [
  {
    resultId: 'vr-001',
    status: 'ERROR',
    severity: 'HIGH',
    validationType: 'RATE',
    procurementType: 'CONSTRUCTION',
    item: {
      canonicalName: '산업안전보건관리비',
      originalName: '산업 안전 보건 관리비',
      category: '제비율',
    },
    excel: {
      sheetName: '추정가격내역서',
      cell: 'H32',
      rateCell: 'G32',
      inputValue: '18,420,000',
      inputRate: '3.20%',
      formula: '=ROUND(F32*G32,0)',
      referencedCells: ['F32 직접노무비', 'G32 적용요율'],
      previewRows,
    },
    expected: {
      baseAmount: '559,050,000',
      rate: '3.43%',
      rawAmount: '19,175,415',
      roundingMethod: '원 단위 반올림',
      finalAmount: '19,175,415',
    },
    difference: '-755,415',
    summary: '적용금액이 기준과 다릅니다.',
    reason: '선택한 기준자료는 직접노무비에 3.43%를 적용하도록 정하고 있으나 Excel에는 3.20%가 적용되어 있습니다.',
    evidence: {
      documentTitle: '2026년 건설공사 원가계산 제비율 적용기준.pdf',
      page: 14,
      tableTitle: '공사원가 제비율',
      quote: '산업안전보건관리비는 직접노무비의 3.43%를 적용한다.',
      confidence: 0.95,
      appliedCondition: '일반건설공사, 기준일 2026-07-01',
    },
    recommendedAction: '적용요율과 산출기초를 확인하고 해당 셀의 계산식을 수정하십시오.',
  },
  {
    resultId: 'vr-002',
    status: 'ERROR',
    severity: 'HIGH',
    validationType: 'RATE',
    procurementType: 'CONSTRUCTION',
    item: {
      canonicalName: '산재보험료',
      originalName: '산재 보험료',
      category: '제보험료',
    },
    excel: {
      sheetName: '추정가격내역서',
      cell: 'H28',
      rateCell: 'G28',
      inputValue: '3,280,000',
      inputRate: '3.20%',
      formula: '=INT(F28*G28)',
      referencedCells: ['F28 직접노무비', 'G28 적용요율'],
      previewRows,
    },
    expected: {
      baseAmount: '102,500,000',
      rate: '3.56%',
      rawAmount: '3,649,000',
      roundingMethod: '원 단위 절사',
      finalAmount: '3,649,000',
    },
    difference: '-369,000',
    summary: '기준요율과 다른 요율이 적용되었습니다.',
    reason: '기준자료의 산재보험료 요율은 3.56%이나 Excel에는 3.20%가 적용되어 있습니다.',
    evidence: {
      documentTitle: '2026년 건설공사 원가계산 제비율 적용기준.pdf',
      page: 4,
      tableTitle: '제보험료 적용기준',
      quote: '산재보험료 ... 직접노무비 ... 3.56%',
      confidence: 0.93,
      appliedCondition: '모든 공사',
    },
    recommendedAction: '산재보험료 요율과 산출금액을 기준자료에 맞게 수정하십시오.',
  },
  {
    resultId: 'vr-003',
    status: 'ERROR',
    severity: 'HIGH',
    validationType: 'TOTAL',
    procurementType: 'CONSTRUCTION',
    item: {
      canonicalName: '부가가치세',
      originalName: '부가세',
      category: '최종합계',
    },
    excel: {
      sheetName: '표지',
      cell: 'F18',
      inputValue: '48,920,000',
      formula: '=ROUND(F17*0.1,0)',
      referencedCells: ['F17 공급가액'],
      previewRows: [
        { A: '16', B: '추정가격', F: '489,800,000' },
        { A: '17', B: '공급가액', F: '496,280,000' },
        { A: '18', B: '부가가치세', F: '48,920,000' },
      ],
    },
    expected: {
      baseAmount: '496,280,000',
      rate: '10%',
      rawAmount: '49,628,000',
      roundingMethod: '원 단위 반올림',
      finalAmount: '49,628,000',
    },
    difference: '-708,000',
    summary: '부가가치세가 공급가액의 10%와 일치하지 않습니다.',
    reason: '공급가액 496,280,000원의 10%는 49,628,000원입니다.',
    evidence: {
      documentTitle: '부가가치세법 기본 기준',
      page: 1,
      tableTitle: '부가가치세율',
      quote: '재화 또는 용역의 공급에 대한 부가가치세율은 10%로 한다.',
      confidence: 0.9,
      appliedCondition: '부가세 별도',
    },
    recommendedAction: '공급가액 기준 셀과 부가가치세 계산식을 확인하십시오.',
  },
  {
    resultId: 'vr-004',
    status: 'NEEDS_REVIEW',
    severity: 'MEDIUM',
    validationType: 'FORMULA',
    procurementType: 'CONSTRUCTION',
    item: {
      canonicalName: '국민건강보험료',
      originalName: '국민 건강 보험료',
      category: '제보험료',
    },
    excel: {
      sheetName: '추정가격내역서',
      cell: 'H29',
      rateCell: 'G29',
      inputValue: '8,215,300',
      inputRate: '3.545%',
      formula: '=ROUNDDOWN(F29*G29,-1)',
      referencedCells: ['F29 직접노무비', 'G29 적용요율'],
      previewRows: healthInsuranceRows,
    },
    expected: {
      baseAmount: '231,750,000',
      rate: '3.545%',
      rawAmount: '8,215,537.5',
      roundingMethod: '십 원 단위 절사 추정',
      finalAmount: '8,215,530',
    },
    difference: '-230',
    summary: '끝수처리 확인이 필요합니다.',
    reason: '요율은 일치하지만 원본 수식의 절사 단위와 기준자료의 표시 단위가 다릅니다.',
    evidence: {
      documentTitle: '2026년 건설공사 원가계산 제비율 적용기준.pdf',
      page: 5,
      tableTitle: '제보험료 적용기준',
      quote: '국민건강보험료는 직접노무비에 해당 요율을 적용한다.',
      confidence: 0.74,
      appliedCondition: '사용자 입력 조건 의존',
    },
    recommendedAction: '끝수처리 단위를 원본 기준 또는 발주처 기준과 대조하십시오.',
  },
  {
    resultId: 'vr-005',
    status: 'NEEDS_REVIEW',
    severity: 'MEDIUM',
    validationType: 'BASE',
    procurementType: 'CONSTRUCTION',
    item: {
      canonicalName: '가격조사 적용단가',
      originalName: '적용단가',
      category: '단가기준',
    },
    excel: {
      sheetName: '가격조사서',
      cell: 'J14',
      inputValue: '124,000',
      formula: '=MIN(G14:I14)',
      referencedCells: ['G14 조사단가1', 'H14 조사단가2', 'I14 조사단가3'],
      previewRows: [
        { A: '13', B: '밸브 교체', G: '128,000', H: '124,000', I: '126,000', J: '124,000' },
        { A: '14', B: '보온재', G: '12,400', H: '12,900', I: '12,700', J: '12,400' },
      ],
    },
    expected: {
      baseAmount: '124,000',
      rawAmount: '124,000',
      roundingMethod: '최저가 선택',
      finalAmount: '124,000',
    },
    difference: '0',
    summary: '적용단가 열 후보가 복수로 탐지되었습니다.',
    reason: '가격조사서에 조사단가와 적용단가로 보이는 열이 여러 개 있어 자동 확정하지 않았습니다.',
    evidence: {
      documentTitle: '가격 산정지침.pdf',
      page: 8,
      tableTitle: '가격조사 적용 방식',
      quote: '복수 견적을 비교하여 적용 단가를 결정한다.',
      confidence: 0.62,
      appliedCondition: '열 매핑 확인 필요',
    },
    recommendedAction: '가격조사서에서 실제 적용단가 열을 확인하십시오.',
  },
];

const needsReviewNames = ['고용보험료', '표준품셈 대표항목', '노임단가 배관공', '공사기간 조건', '일반관리비 기준일'];
const warningNames = ['수식 하드코딩 의심', '외부참조 확인'];
const okNames = ['직접재료비', '간접재료비', '직접노무비', '기타경비', '일반관리비', '이윤', '공급가액', '총액'];

const generatedNeedsReview: ValidationResult[] = needsReviewNames.map((name, index) => ({
  ...primaryResults[3],
  resultId: `vr-${String(index + 6).padStart(3, '0')}`,
  item: { canonicalName: name, originalName: name, category: index % 2 === 0 ? '조건' : '기준자료' },
  validationType: index % 2 === 0 ? 'CONDITION' : 'STANDARD',
  summary: index % 2 === 0 ? '적용조건 확인이 필요합니다.' : '기준자료 근거 매핑 신뢰도가 보통입니다.',
  reason: `${name} 항목은 자동 확정에 필요한 조건 일부가 사용자 입력 또는 기준자료 구조에 의존합니다.`,
}));

const generatedWarnings: ValidationResult[] = warningNames.map((name, index) => ({
  ...primaryResults[3],
  resultId: `vr-01${index + 1}`,
  status: 'WARNING',
  severity: 'LOW',
  validationType: index === 0 ? 'FORMULA' : 'REFERENCE',
  item: { canonicalName: name, originalName: name, category: '검토 권고' },
  summary: index === 0 ? '주변 셀과 달리 직접 입력된 값입니다.' : '외부 파일 참조가 발견되었습니다.',
  reason: `${name} 항목은 계산값은 일치하지만 추후 검토를 권장합니다.`,
}));

const generatedOk: ValidationResult[] = Array.from({ length: 126 }, (_, index) => {
  const name = okNames[index % okNames.length];
  return {
    ...primaryResults[2],
    resultId: `vr-ok-${String(index + 1).padStart(3, '0')}`,
    status: 'OK',
    severity: 'INFO',
    validationType: index % 3 === 0 ? 'ARITHMETIC' : index % 3 === 1 ? 'TOTAL' : 'RATE',
    item: {
      canonicalName: `${name} ${Math.floor(index / okNames.length) + 1}`,
      originalName: name,
      category: '정상 검증',
    },
    excel: {
      ...primaryResults[2].excel,
      sheetName: index % 2 === 0 ? '추정가격내역서' : '공사내역서',
      cell: `H${index + 40}`,
      inputValue: '1,240,000',
    },
    expected: {
      baseAmount: '1,240,000',
      rate: index % 3 === 2 ? '10%' : undefined,
      rawAmount: '1,240,000',
      roundingMethod: '원 단위',
      finalAmount: '1,240,000',
    },
    difference: '0',
    summary: '기준에 맞게 계산되었습니다.',
    reason: `${name} 항목은 원본 수식과 시스템 재계산값이 일치합니다.`,
    recommendedAction: '추가 조치가 필요하지 않습니다.',
  };
});

export const sampleResults: ValidationResult[] = [
  ...primaryResults,
  ...generatedNeedsReview,
  ...generatedWarnings,
  ...generatedOk,
];
