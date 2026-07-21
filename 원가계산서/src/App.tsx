import { useMemo, useState } from 'react';
import { recognitionSummary, progressSteps, sampleResults } from './data/sampleResults';
import { DashboardScreen } from './screens/DashboardScreen';
import { DetailScreen } from './screens/DetailScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RecognitionScreen } from './screens/RecognitionScreen';
import { UploadScreen } from './screens/UploadScreen';
import type {
  FileMeta,
  ProcurementType,
  RecognitionSummary,
  ReferenceRate,
  ResultFilters,
  ValidationMode,
  ValidationResult,
  WorkbookIR,
} from './types';
import { filterResults, getAdjacentResult, getReviewResults, sortResultsByPriority } from './utils/results';
import { irSheetToRecognition } from './utils/excel';
import { buildReferenceRows, parseRate, runValidation } from './utils/validation';

type Step = 'upload' | 'recognition' | 'progress' | 'dashboard' | 'detail';

interface AppProps {
  initialStep?: Step;
}

const fallbackExcel: FileMeta = {
  name: '추정가격내역서_최종.xlsx',
  sizeLabel: '2.4MB',
  detail: '18개 시트 · 912개 수식 · 시연 메타데이터',
};

const fallbackPdfs: FileMeta[] = [
  { name: '2026년 건설공사 원가계산 제비율 적용기준.pdf', sizeLabel: '1.2MB', detail: '28개 기준' },
  { name: '2026년 상반기 건설업 임금실태조사 보고서.pdf', sizeLabel: '3.8MB', detail: '142개 직종' },
  { name: '조달청 시설공사 표준품셈.pdf', sizeLabel: '8.4MB', detail: '317개 항목' },
];

export default function App({ initialStep = 'upload' }: AppProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [procurementType, setProcurementType] = useState<ProcurementType>('CONSTRUCTION');
  const [excelFile, setExcelFile] = useState<FileMeta | null>(initialStep === 'upload' ? null : fallbackExcel);
  const [workbookIR, setWorkbookIR] = useState<WorkbookIR | null>(null);
  const [pdfFiles, setPdfFiles] = useState<FileMeta[]>(initialStep === 'upload' ? [] : fallbackPdfs);
  const [mode, setMode] = useState<ValidationMode>('ARITHMETIC_ONLY');
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState('');
  const [filters, setFilters] = useState<ResultFilters>({
    status: 'ALL',
    validationType: 'ALL',
    sheetName: 'ALL',
  });

  // 실제 결과가 있으면 그것을, 없으면(딥링크 데모) 샘플을 사용
  const orderedResults = useMemo(
    () => (results.length ? sortResultsByPriority(results) : sortResultsByPriority(sampleResults)),
    [results],
  );
  const visibleResults = useMemo(() => filterResults(orderedResults, filters), [filters, orderedResults]);
  const selectedResult =
    orderedResults.find((result) => result.resultId === selectedResultId) ?? visibleResults[0] ?? orderedResults[0];

  const summary = useMemo<RecognitionSummary>(() => {
    if (!workbookIR || workbookIR.sheets.length === 0) return recognitionSummary;
    return { ...recognitionSummary, sheets: workbookIR.sheets.map(irSheetToRecognition) };
  }, [workbookIR]);

  const referenceRows = useMemo<ReferenceRate[]>(() => (workbookIR ? buildReferenceRows(workbookIR) : []), [workbookIR]);

  const steps = useMemo(() => {
    if (!workbookIR) return progressSteps;
    const { sheetCount, formulaCount, mergeCount } = workbookIR.totals;
    const structureDetail = `${sheetCount}개 시트, ${formulaCount.toLocaleString()}개 수식, ${mergeCount.toLocaleString()}개 병합범위`;
    return progressSteps.map((s) => (s.label === 'Excel 시트 및 셀 구조 분석' ? { ...s, detail: structureDetail } : s));
  }, [workbookIR]);

  function handleExcelChange(meta: FileMeta, ir: WorkbookIR | null) {
    setExcelFile(meta);
    setWorkbookIR(ir);
    setRateInputs({});
  }

  function handleRun() {
    if (workbookIR) {
      const referenceRates: Record<string, ReferenceRate> = {};
      for (const row of referenceRows) {
        const raw = rateInputs[row.canonicalName];
        const rate = raw != null && raw.trim() !== '' ? parseRate(raw, null) : row.rate;
        referenceRates[row.canonicalName] = { canonicalName: row.canonicalName, rate };
      }
      const real = sortResultsByPriority(runValidation(workbookIR, { mode, referenceRates }));
      setResults(real);
      setSelectedResultId(getReviewResults(real)[0]?.resultId ?? real[0]?.resultId ?? '');
    }
    setStep('progress');
  }

  function applyFilters(nextFilters: ResultFilters) {
    setFilters(nextFilters);
    const nextVisible = filterResults(orderedResults, nextFilters);
    if (nextVisible.length > 0 && !nextVisible.some((result) => result.resultId === selectedResultId)) {
      setSelectedResultId(nextVisible[0].resultId);
    }
  }

  if (step === 'upload') {
    return (
      <UploadScreen
        excelFile={excelFile}
        onExcelChange={handleExcelChange}
        onPdfChange={setPdfFiles}
        onProcurementTypeChange={setProcurementType}
        onStart={() => setStep('recognition')}
        pdfFiles={pdfFiles}
        procurementType={procurementType}
      />
    );
  }

  if (step === 'recognition') {
    return (
      <RecognitionScreen
        excelFile={excelFile ?? fallbackExcel}
        mode={mode}
        onBack={() => setStep('upload')}
        onModeChange={setMode}
        onRateInput={(name, value) => setRateInputs((prev) => ({ ...prev, [name]: value }))}
        onRun={handleRun}
        pdfFiles={pdfFiles}
        rateInputs={rateInputs}
        referenceRows={referenceRows}
        summary={summary}
        workbookIR={workbookIR}
      />
    );
  }

  if (step === 'progress') {
    return <ProgressScreen excelFile={excelFile ?? fallbackExcel} onDone={() => setStep('dashboard')} steps={steps} />;
  }

  if (step === 'detail') {
    return (
      <DetailScreen
        onBack={() => setStep('dashboard')}
        onNavigate={(direction) => {
          const adjacent = getAdjacentResult(orderedResults, selectedResult.resultId, direction);
          if (adjacent) setSelectedResultId(adjacent.resultId);
        }}
        result={selectedResult}
      />
    );
  }

  return (
    <DashboardScreen
      excelFile={excelFile ?? fallbackExcel}
      filters={filters}
      onFilterChange={applyFilters}
      onOpenDetail={() => setStep('detail')}
      onRestart={() => setStep('upload')}
      onSelectResult={setSelectedResultId}
      pdfFiles={pdfFiles.length ? pdfFiles : fallbackPdfs}
      results={orderedResults}
      selectedResult={selectedResult}
    />
  );
}
