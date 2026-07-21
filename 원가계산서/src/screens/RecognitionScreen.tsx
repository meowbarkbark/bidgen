import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileSearch, FileText, TriangleAlert } from '../components/icons';
import type { FileMeta, RecognitionSummary, ReferenceRate, ValidationMode, WorkbookIR } from '../types';
import { Button, Panel } from '../components/ui';
import { downloadJson } from '../utils/download';

interface RecognitionScreenProps {
  excelFile: FileMeta | null;
  pdfFiles: FileMeta[];
  summary: RecognitionSummary;
  workbookIR: WorkbookIR | null;
  mode: ValidationMode;
  onModeChange: (mode: ValidationMode) => void;
  referenceRows: ReferenceRate[];
  rateInputs: Record<string, string>;
  onRateInput: (canonicalName: string, value: string) => void;
  onBack: () => void;
  onRun: () => void;
}

const MODE_OPTIONS: Array<{ value: ValidationMode; label: string; description: string }> = [
  { value: 'ARITHMETIC_ONLY', label: '산술/합계/수식 검증만', description: '기준자료 없이 파일 내 값만으로 검증' },
  { value: 'ARITHMETIC_AND_RATE', label: '산술 + 요율 검증', description: '아래 기준요율을 입력해 제비율·보험료까지 검증' },
];

export function RecognitionScreen({
  excelFile,
  pdfFiles,
  summary,
  workbookIR,
  mode,
  onModeChange,
  referenceRows,
  rateInputs,
  onRateInput,
  onBack,
  onRun,
}: RecognitionScreenProps) {
  const [showJson, setShowJson] = useState(false);

  return (
    <main className="app-shell">
      <aside className="workflow-rail">
        <span>2 / 5 단계</span>
        <strong>문서 인식</strong>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>문서 인식 결과</h1>
            <p>{excelFile?.name ?? '원가계산서'} · 기준자료 {pdfFiles.length || 3}개</p>
          </div>
        </header>

        <Panel>
          <div className="section-heading">
            <span>Excel 구조 인식</span>
            <p>시트 역할과 주요 내용을 자동 분류했습니다.</p>
          </div>
          <div className="data-table">
            <div className="table-row table-head">
              <span>시트명</span>
              <span>인식 결과</span>
              <span>주요 내용</span>
            </div>
            {summary.sheets.map((sheet) => (
              <div className="table-row" key={sheet.sheetName}>
                <strong>{sheet.sheetName}</strong>
                <span className={sheet.status === '확인 필요' ? 'text-review' : 'text-ok'}>
                  {sheet.status === '확인 필요' ? <TriangleAlert size={15} /> : <CheckCircle2 size={15} />}
                  {sheet.status}
                </span>
                <span>
                  {sheet.role} · {sheet.description}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {workbookIR ? (
          <Panel>
            <div className="section-heading">
              <span>구조 JSON (Workbook IR)</span>
              <p>
                양식과 무관한 고정 스키마 v{workbookIR.schemaVersion} · 시트 {workbookIR.totals.sheetCount}개 · 셀{' '}
                {workbookIR.totals.cellCount.toLocaleString()}개 · 수식 {workbookIR.totals.formulaCount.toLocaleString()}개 · 병합{' '}
                {workbookIR.totals.mergeCount.toLocaleString()}개
              </p>
            </div>
            <div className="json-actions">
              <Button icon={<FileSearch size={16} />} onClick={() => setShowJson((v) => !v)}>
                {showJson ? '구조 JSON 닫기' : '구조 JSON 보기'}
              </Button>
              <Button
                icon={<FileText size={16} />}
                onClick={() => downloadJson(`${workbookIR.fileName.replace(/\.[^.]+$/, '')}.ir.json`, workbookIR)}
              >
                JSON 다운로드
              </Button>
            </div>
            {showJson ? <pre className="json-view">{JSON.stringify(workbookIR, null, 2)}</pre> : null}
          </Panel>
        ) : null}

        <Panel>
          <div className="section-heading">
            <span>검증 모드</span>
            <p>기준요율 없이 산술만 검증하거나, 요율까지 함께 검증할 수 있습니다.</p>
          </div>
          <div className="procurement-grid">
            {MODE_OPTIONS.map((option) => (
              <button
                className={`procurement-option ${mode === option.value ? 'is-selected' : ''}`}
                key={option.value}
                onClick={() => onModeChange(option.value)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </Panel>

        {mode === 'ARITHMETIC_AND_RATE' ? (
          <Panel>
            <div className="section-heading">
              <span>기준요율 입력</span>
              <p>파일에서 탐지한 제비율·보험료 항목입니다. 기준요율(%)을 입력하면 적용요율·금액을 검증합니다.</p>
            </div>
            {workbookIR && referenceRows.length > 0 ? (
              <div className="rate-table">
                {referenceRows.map((row) => (
                  <label className="rate-row" key={row.canonicalName}>
                    <span>{row.canonicalName}</span>
                    <span className="rate-input">
                      <input
                        aria-label={`${row.canonicalName} 기준요율(%)`}
                        inputMode="decimal"
                        onChange={(event) => onRateInput(row.canonicalName, event.target.value)}
                        placeholder={row.rate != null ? (row.rate * 100).toString() : '예: 3.56'}
                        type="text"
                        value={rateInputs[row.canonicalName] ?? (row.rate != null ? (row.rate * 100).toString() : '')}
                      />
                      <em>%</em>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="review-note">
                <TriangleAlert size={18} />
                <span>{workbookIR ? '탐지된 제비율·보험료 항목이 없습니다. 산술 검증만 진행됩니다.' : 'Excel을 업로드하면 기준요율을 입력할 수 있습니다.'}</span>
              </div>
            )}
          </Panel>
        ) : null}

        <Panel>
          <div className="section-heading">
            <span>기준자료 인식</span>
            <p>추출된 기준 종류와 확인 필요 항목입니다.</p>
          </div>
          <div className="criteria-grid">
            {summary.criteria.map((criterion) => (
              <div className="criterion" key={criterion.title}>
                <strong>{criterion.title}</strong>
                <span>{criterion.count}개 기준</span>
                <p>{criterion.description}</p>
              </div>
            ))}
          </div>
          <div className="review-note">
            <TriangleAlert size={18} />
            <span>{summary.reviewPrompt}</span>
          </div>
        </Panel>

        <div className="footer-actions">
          <Button icon={<ArrowLeft size={16} />} onClick={onBack}>
            파일 다시 선택
          </Button>
          <Button icon={<ArrowRight size={16} />} onClick={onRun} variant="primary">
            검증 실행
          </Button>
        </div>
      </section>
    </main>
  );
}
