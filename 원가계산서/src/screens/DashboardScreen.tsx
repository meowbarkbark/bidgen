import { ArrowRight, FileSearch, RotateCcw } from '../components/icons';
import type { FileMeta, ResultFilters, ValidationResult, ValidationStatus, ValidationType } from '../types';
import { Button, Panel, StatusBadge, SummaryCard } from '../components/ui';
import {
  filterResults,
  formatConfidence,
  getStatusCounts,
  statusLabels,
  uniqueSheets,
  validationTypeLabels,
} from '../utils/results';

interface DashboardScreenProps {
  excelFile: FileMeta | null;
  pdfFiles: FileMeta[];
  results: ValidationResult[];
  filters: ResultFilters;
  selectedResult: ValidationResult;
  onFilterChange: (filters: ResultFilters) => void;
  onSelectResult: (id: string) => void;
  onOpenDetail: () => void;
  onRestart: () => void;
}

const statusFilters: Array<ValidationStatus | 'ALL'> = ['ALL', 'ERROR', 'NEEDS_REVIEW', 'WARNING', 'OK'];
const typeFilters: Array<ValidationType | 'ALL'> = ['ALL', 'ARITHMETIC', 'TOTAL', 'RATE', 'BASE', 'CONDITION', 'FORMULA'];

export function DashboardScreen({
  excelFile,
  pdfFiles,
  results,
  filters,
  selectedResult,
  onFilterChange,
  onSelectResult,
  onOpenDetail,
  onRestart,
}: DashboardScreenProps) {
  const counts = getStatusCounts(results);
  const filtered = filterResults(results, filters);
  const sheets = uniqueSheets(results);

  return (
    <main className="app-shell dashboard-layout">
      <aside className="workflow-rail">
        <span>4 / 5 단계</span>
        <strong>검증결과</strong>
      </aside>

      <section className="workspace dashboard-workspace">
        <header className="topbar dashboard-topbar">
          <div>
            <h1>검증결과</h1>
            <p>{excelFile?.name ?? '추정가격내역서_최종.xlsx'} · 기준자료 {pdfFiles.length || 3}개 · 공사</p>
          </div>
          <Button icon={<RotateCcw size={16} />} onClick={onRestart}>
            파일 다시 검증
          </Button>
        </header>

        <div className="summary-grid">
          <SummaryCard label="종합 결과" tone="review" value={counts.ERROR > 0 ? '확인 필요' : '정상'} />
          <SummaryCard label="오류" tone="error" value={`${counts.ERROR}건`} />
          <SummaryCard label="확인 필요" tone="review" value={`${counts.NEEDS_REVIEW}건`} />
          <SummaryCard label="주의" tone="warning" value={`${counts.WARNING}건`} />
          <SummaryCard label="정상" tone="ok" value={`${counts.OK}건`} />
        </div>

        <div className="dashboard-grid">
          <Panel className="filter-panel">
            <h2>검증 항목</h2>
            <div className="filter-group">
              {statusFilters.map((status) => {
                const label = status === 'ALL' ? `전체 ${results.length}` : `${statusLabels[status]} ${counts[status]}`;
                return (
                  <button
                    className={filters.status === status ? 'is-selected' : ''}
                    key={status}
                    onClick={() => onFilterChange({ ...filters, status })}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <h2>검증 종류</h2>
            <div className="check-list">
              {typeFilters.map((type) => (
                <button
                  className={filters.validationType === type ? 'is-selected' : ''}
                  key={type}
                  onClick={() => onFilterChange({ ...filters, validationType: type })}
                  type="button"
                >
                  {type === 'ALL' ? '전체' : validationTypeLabels[type]}
                </button>
              ))}
            </div>

            <label className="select-label">
              시트
              <select
                onChange={(event) => onFilterChange({ ...filters, sheetName: event.target.value })}
                value={filters.sheetName}
              >
                <option value="ALL">전체</option>
                {sheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            </label>
          </Panel>

          <Panel className="result-list-panel">
            <div className="panel-heading-row">
              <h2>검증결과</h2>
              <span>{filtered.length}개 표시</span>
            </div>
            <div className="result-list">
              {filtered.map((result) => (
                <button
                  className={`result-row ${selectedResult.resultId === result.resultId ? 'is-selected' : ''}`}
                  key={result.resultId}
                  onClick={() => onSelectResult(result.resultId)}
                  type="button"
                >
                  <StatusBadge status={result.status} />
                  <div>
                    <strong>{result.item.canonicalName}</strong>
                    <span>{result.summary}</span>
                  </div>
                  <small>{result.excel.sheetName}!{result.excel.cell}</small>
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="evidence-panel">
            <div className="panel-heading-row">
              <h2>선택 항목 판단근거</h2>
              <FileSearch size={18} />
            </div>
            <StatusBadge status={selectedResult.status} />
            <h3>{selectedResult.item.canonicalName}</h3>
            <p>{selectedResult.reason}</p>

            <dl className="evidence-metrics">
              <div>
                <dt>Excel 입력값</dt>
                <dd>{selectedResult.excel.inputValue}원</dd>
              </div>
              <div>
                <dt>시스템 계산값</dt>
                <dd>{selectedResult.expected.finalAmount}원</dd>
              </div>
              <div>
                <dt>차이</dt>
                <dd>{selectedResult.difference}원</dd>
              </div>
              <div>
                <dt>적용 기준</dt>
                <dd>
                  {selectedResult.expected.baseAmount} × {selectedResult.expected.rate ?? '기준식'}
                </dd>
              </div>
            </dl>

            <div className="quote-box">
              <strong>기준자료 판단근거</strong>
              <p>{selectedResult.evidence.quote}</p>
              <span>
                {selectedResult.evidence.documentTitle} · {selectedResult.evidence.page}페이지 · 신뢰도{' '}
                {formatConfidence(selectedResult.evidence.confidence)}
              </span>
            </div>

            <Button icon={<ArrowRight size={16} />} onClick={onOpenDetail} variant="primary">
              상세 근거 보기
            </Button>
          </Panel>
        </div>
      </section>
    </main>
  );
}
