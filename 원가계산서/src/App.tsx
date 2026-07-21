import { useMemo, useState } from 'react';
import { recognitionSummary, progressSteps, sampleResults } from './data/sampleResults';
import { DashboardScreen } from './screens/DashboardScreen';
import { DetailScreen } from './screens/DetailScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RecognitionScreen } from './screens/RecognitionScreen';
import { UploadScreen } from './screens/UploadScreen';
import type { FileMeta, ProcurementType, ResultFilters } from './types';
import { filterResults, getAdjacentResult, sortResultsByPriority } from './utils/results';

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
  const [pdfFiles, setPdfFiles] = useState<FileMeta[]>(initialStep === 'upload' ? [] : fallbackPdfs);
  const [selectedResultId, setSelectedResultId] = useState('vr-001');
  const [filters, setFilters] = useState<ResultFilters>({
    status: 'ALL',
    validationType: 'ALL',
    sheetName: 'ALL',
  });

  const orderedResults = useMemo(() => sortResultsByPriority(sampleResults), []);
  const visibleResults = useMemo(() => filterResults(orderedResults, filters), [filters, orderedResults]);
  const selectedResult = orderedResults.find((result) => result.resultId === selectedResultId) ?? visibleResults[0] ?? orderedResults[0];

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
        onExcelChange={setExcelFile}
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
        onBack={() => setStep('upload')}
        onRun={() => setStep('progress')}
        pdfFiles={pdfFiles}
        summary={recognitionSummary}
      />
    );
  }

  if (step === 'progress') {
    return <ProgressScreen excelFile={excelFile ?? fallbackExcel} onDone={() => setStep('dashboard')} steps={progressSteps} />;
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
