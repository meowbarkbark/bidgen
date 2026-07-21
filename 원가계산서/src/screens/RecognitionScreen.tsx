import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileSearch, FileText, TriangleAlert } from '../components/icons';
import type { FileMeta, RecognitionSummary, WorkbookIR } from '../types';
import { Button, Panel } from '../components/ui';
import { downloadJson } from '../utils/download';

interface RecognitionScreenProps {
  excelFile: FileMeta | null;
  pdfFiles: FileMeta[];
  summary: RecognitionSummary;
  workbookIR: WorkbookIR | null;
  onBack: () => void;
  onRun: () => void;
}

export function RecognitionScreen({ excelFile, pdfFiles, summary, workbookIR, onBack, onRun }: RecognitionScreenProps) {
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
