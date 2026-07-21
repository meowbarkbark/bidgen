import * as XLSX from 'xlsx';
import type { RecognitionSheet } from '../types';

export interface ExcelInfo {
  sheetNames: string[];
  sheetCount: number;
  formulaCount: number;
  mergeCount: number;
}

/** 업로드한 Excel 파일을 브라우저에서 직접 읽어 실제 시트/수식/병합 정보를 추출합니다. */
export async function parseWorkbook(file: File): Promise<ExcelInfo> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  let formulaCount = 0;
  let mergeCount = 0;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    if (sheet['!merges']) mergeCount += sheet['!merges'].length;
    for (const key of Object.keys(sheet)) {
      if (key.charCodeAt(0) === 33) continue; // '!' 로 시작하는 메타 키 제외
      const cell = sheet[key];
      if (cell && typeof cell === 'object' && 'f' in cell && cell.f) formulaCount += 1;
    }
  }

  return {
    sheetNames: workbook.SheetNames,
    sheetCount: workbook.SheetNames.length,
    formulaCount,
    mergeCount,
  };
}

/** 시트명 키워드로 역할/설명을 가볍게 추정합니다. (실제 검증 로직 이전의 표시용 분류) */
export function classifySheet(sheetName: string): RecognitionSheet {
  if (/원가|계산/.test(sheetName)) {
    return { sheetName, status: '자동 인식', role: '원가계산서', description: '재료비·노무비·경비·제비율·총액' };
  }
  if (/일위대가/.test(sheetName)) {
    return { sheetName, status: '자동 인식', role: '산출근거', description: '단위당 재료·노무·경비' };
  }
  if (/내역/.test(sheetName)) {
    return { sheetName, status: '자동 인식', role: '세부내역', description: '품명·규격·수량·단가·금액' };
  }
  if (/가격조사|단가/.test(sheetName)) {
    return { sheetName, status: '확인 필요', role: '단가 기준', description: '조사단가와 적용단가 열 구분 필요' };
  }
  if (/표지|목차/.test(sheetName)) {
    return { sheetName, status: '분석 완료', role: '표지', description: '문서 표지·목차' };
  }
  return { sheetName, status: '분석 완료', role: '보조자료', description: '참조 범위와 중간 계산값' };
}
