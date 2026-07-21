import { FileSpreadsheet, FileText, Play, ShieldCheck } from '../components/icons';
import type { FileMeta, ProcurementType } from '../types';
import { Button, Panel, UploadPanel } from '../components/ui';

const procurementOptions: Array<{ value: ProcurementType; label: string; description: string }> = [
  { value: 'CONSTRUCTION', label: '공사', description: '요율, 노임단가, 표준품셈까지 상세 검증' },
  { value: 'SERVICE', label: '용역', description: '인건비, 경비, 합계 중심 공통 검증' },
  { value: 'GOODS', label: '물품', description: '수량, 단가, 부가세, 총액 검증' },
];

interface UploadScreenProps {
  procurementType: ProcurementType;
  excelFile: FileMeta | null;
  pdfFiles: FileMeta[];
  onProcurementTypeChange: (type: ProcurementType) => void;
  onExcelChange: (file: FileMeta) => void;
  onPdfChange: (files: FileMeta[]) => void;
  onStart: () => void;
}

function fileToMeta(file: File, detail: string): FileMeta {
  return {
    name: file.name,
    sizeLabel: `${(file.size / 1024 / 1024 || 0.1).toFixed(1)}MB`,
    detail,
  };
}

export function UploadScreen({
  procurementType,
  excelFile,
  pdfFiles,
  onProcurementTypeChange,
  onExcelChange,
  onPdfChange,
  onStart,
}: UploadScreenProps) {
  return (
    <main className="app-shell upload-layout">
      <aside className="workflow-rail">
        <div className="brand-mark">
          <ShieldCheck size={22} />
        </div>
        <div>
          <span>1 / 5 단계</span>
          <strong>파일 업로드</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>원가계산서 자동검증</h1>
            <p>Excel 계산 구조와 기준자료 근거를 연결해 검증결과를 확인합니다.</p>
          </div>
          <Button variant="ghost">도움말</Button>
        </header>

        <Panel>
          <div className="section-heading">
            <span>발주 유형</span>
            <p>공사는 시연에서 가장 깊게 검증합니다.</p>
          </div>
          <div className="procurement-grid">
            {procurementOptions.map((option) => (
              <button
                className={`procurement-option ${procurementType === option.value ? 'is-selected' : ''}`}
                key={option.value}
                onClick={() => onProcurementTypeChange(option.value)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="upload-grid">
          <Panel>
            <UploadPanel
              accept=".xlsx"
              action="Excel 파일 선택"
              description="원가계산서 Excel 파일을 여기에 놓거나 선택하세요."
              label="Excel 파일 선택"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onExcelChange(fileToMeta(file, '18개 시트 · 912개 수식 · 시연 메타데이터'));
              }}
              title="검증할 원가계산서"
              meta={
                excelFile ? (
                  <span>
                    <FileSpreadsheet size={16} /> {excelFile.name} · {excelFile.detail}
                  </span>
                ) : null
              }
            />
          </Panel>

          <Panel>
            <UploadPanel
              accept=".pdf,.xlsx,.xls"
              action="PDF·Excel 파일 추가"
              description="제비율표, 노임단가표, 표준품셈 등 기준자료(PDF·Excel)를 등록하세요."
              label="PDF·Excel 파일 추가"
              multiple
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                onPdfChange(
                  files.map((file) =>
                    fileToMeta(
                      file,
                      /\.xlsx?$/i.test(file.name) ? '시트 파싱 가능 · 시연 메타데이터' : '텍스트 추출 가능 · 시연 메타데이터',
                    ),
                  ),
                );
              }}
              title="계산기준자료"
              meta={
                pdfFiles.length > 0 ? (
                  <ul className="file-list">
                    {pdfFiles.map((file) => (
                      <li key={file.name}>
                        {/\.xlsx?$/i.test(file.name) ? <FileSpreadsheet size={16} /> : <FileText size={16} />} {file.name}
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            />
          </Panel>
        </div>

        <div className="footer-actions">
          <p>기준자료가 없어도 산술·수식·합계 검증은 진행할 수 있습니다.</p>
          <Button disabled={!excelFile} icon={<Play size={16} />} onClick={onStart} variant="primary">
            자동검증 시작
          </Button>
        </div>
      </section>
    </main>
  );
}
