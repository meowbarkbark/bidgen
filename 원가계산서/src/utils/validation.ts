import type {
  DetectedItem,
  IRCell,
  ProcurementType,
  ReferenceRate,
  RoundingMethod,
  ValidationConfig,
  ValidationResult,
  ValidationStatus,
  ValidationType,
  WorkbookIR,
} from '../types';

// ---------------------------------------------------------------------------
// A1 좌표 헬퍼 (xlsx 비의존 → node 타입스트립 테스트 가능)
// ---------------------------------------------------------------------------

function decodeCol(letters: string): number {
  let c = 0;
  for (const ch of letters) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1; // 0-based
}

function encodeCol(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function decodeCell(addr: string): { c: number; r: number } {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(addr);
  if (!m) return { c: 0, r: 0 };
  return { c: decodeCol(m[1]), r: parseInt(m[2], 10) - 1 };
}

// ---------------------------------------------------------------------------
// 숫자·요율 파싱
// ---------------------------------------------------------------------------

export function parseKoreanNumber(raw: string | number | boolean | null): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return null;
  let s = String(raw).trim().replace(/[,\s원]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('%')) s = s.slice(0, -1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseRate(raw: string | number | boolean | null, numberFormat: string | null): number | null {
  const n = parseKoreanNumber(raw);
  if (n == null) return null;
  if (numberFormat && numberFormat.includes('%')) return n; // SheetJS는 %서식 값을 분수로 저장
  if (typeof raw === 'string' && raw.includes('%')) return n / 100;
  if (n > 1) return n / 100; // 3.2 → 0.032
  return n; // 이미 분수
}

export function normalizeLabel(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// 표준 원가항목 사전
// ---------------------------------------------------------------------------

interface CanonicalDef {
  canonical: string;
  category: string;
  aliases: string[]; // 정규화된 형태
  requiresReference: boolean;
  defaultRate?: number;
}

const CANONICAL_ITEMS: CanonicalDef[] = [
  { canonical: '산재보험료', category: '제보험료', aliases: ['산업재해보상보험료', '산재보험료', '산재보험'], requiresReference: true },
  { canonical: '고용보험료', category: '제보험료', aliases: ['고용보험료', '고용보험'], requiresReference: true },
  { canonical: '국민건강보험료', category: '제보험료', aliases: ['국민건강보험료', '건강보험료'], requiresReference: true },
  { canonical: '노인장기요양보험료', category: '제보험료', aliases: ['노인장기요양보험료', '장기요양보험료'], requiresReference: true },
  { canonical: '산업안전보건관리비', category: '제경비', aliases: ['산업안전보건관리비', '안전보건관리비'], requiresReference: true },
  { canonical: '일반관리비', category: '일반관리비', aliases: ['일반관리비'], requiresReference: true },
  { canonical: '이윤', category: '이윤', aliases: ['이윤'], requiresReference: true },
  { canonical: '환경보전비', category: '제경비', aliases: ['환경보전비'], requiresReference: true },
  { canonical: '안전관리비', category: '제경비', aliases: ['안전관리비'], requiresReference: true },
  { canonical: '부가가치세', category: '부가세', aliases: ['부가가치세', '부가세', 'vat'], requiresReference: false, defaultRate: 0.1 },
];

// 긴 별칭 우선 매칭 (부분포함 오탐 최소화)
const ALIAS_INDEX: Array<{ alias: string; def: CanonicalDef }> = CANONICAL_ITEMS.flatMap((def) =>
  def.aliases.map((alias) => ({ alias, def })),
).sort((a, b) => b.alias.length - a.alias.length);

function matchCanonical(label: string): CanonicalDef | null {
  const norm = normalizeLabel(label);
  if (!norm) return null;
  for (const { alias, def } of ALIAS_INDEX) {
    if (norm.includes(alias)) return def;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 워크북 컨텍스트
// ---------------------------------------------------------------------------

interface SheetCtx {
  name: string;
  role: string;
  byAddr: Map<string, IRCell>;
  byRow: Map<number, IRCell[]>;
}

// 총액/라벨 탐색 시 시트 우선순위 (표지는 마지막)
const ROLE_PRIORITY: Record<string, number> = {
  COST_SUMMARY: 0,
  CONSTRUCTION_ITEMS: 1,
  QUANTITY: 2,
  UNIT_PRICE: 3,
  PRICE_SURVEY: 4,
  WAGE_RATE: 5,
  RATE_STANDARD: 6,
  OTHER: 7,
  COVER_SUMMARY: 9,
};

interface Ctx {
  sheets: Map<string, SheetCtx>;
  lookup: (addr: string, currentSheet: string) => number | null;
}

function buildCtx(ir: WorkbookIR): Ctx {
  const sheets = new Map<string, SheetCtx>();
  for (const sheet of ir.sheets) {
    const byAddr = new Map<string, IRCell>();
    const byRow = new Map<number, IRCell[]>();
    for (const cell of sheet.cells) {
      byAddr.set(cell.address, cell);
      const { r } = decodeCell(cell.address);
      const arr = byRow.get(r) ?? [];
      arr.push(cell);
      byRow.set(r, arr);
    }
    for (const arr of byRow.values()) arr.sort((a, b) => decodeCell(a.address).c - decodeCell(b.address).c);
    sheets.set(sheet.sheetName, { name: sheet.sheetName, role: sheet.sheetRole, byAddr, byRow });
  }

  const lookup = (addr: string, currentSheet: string): number | null => {
    let sheetName = currentSheet;
    let cellRef = addr.replace(/\$/g, '');
    const bang = cellRef.indexOf('!');
    if (bang >= 0) {
      sheetName = cellRef.slice(0, bang).replace(/^'|'$/g, '');
      cellRef = cellRef.slice(bang + 1);
    }
    const s = sheets.get(sheetName);
    if (!s) return null;
    const cell = s.byAddr.get(cellRef);
    if (!cell) return null;
    return parseKoreanNumber(cell.cachedValue);
  };

  return { sheets, lookup };
}

// ---------------------------------------------------------------------------
// 안전한 수식 평가기 ( + - * / ( ), SUM, ROUND, ROUNDDOWN, INT 만 )
// ---------------------------------------------------------------------------

type Token = { type: 'num' | 'ref' | 'range' | 'fn' | 'op' | 'lparen' | 'rparen' | 'comma'; value: string };

class Unsupported extends Error {}

const REF_RE = /^(?:(?:'[^']+'|[A-Za-z0-9_가-힣]+)!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/;
const FN_RE = /^(SUM|ROUND|ROUNDDOWN|INT)\s*(?=\()/i;
const NUM_RE = /^\d+(?:\.\d+)?/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    const rest = src.slice(i);
    const fn = FN_RE.exec(rest);
    if (fn) {
      tokens.push({ type: 'fn', value: fn[1].toUpperCase() });
      i += fn[0].length;
      continue;
    }
    const ref = REF_RE.exec(rest);
    if (ref) {
      tokens.push({ type: ref[0].includes(':') ? 'range' : 'ref', value: ref[0] });
      i += ref[0].length;
      continue;
    }
    const num = NUM_RE.exec(rest);
    if (num) {
      tokens.push({ type: 'num', value: num[0] });
      i += num[0].length;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
      i += 1;
      continue;
    }
    throw new Unsupported(); // 미지원 문자/함수/식별자
  }
  return tokens;
}

function roundHalfAway(x: number, n: number): number {
  const f = Math.pow(10, n);
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
}

export function evaluateFormula(
  rawValue: string,
  lookup: (addr: string) => number | null,
): { value: number | null; supported: boolean } {
  let src = rawValue.trim();
  if (src.startsWith('=')) src = src.slice(1);
  if (!src) return { value: null, supported: false };

  let tokens: Token[];
  try {
    tokens = tokenize(src);
  } catch {
    return { value: null, supported: false };
  }

  let pos = 0;
  let nullOperand = false;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expandRange(rangeToken: string): number {
    const [a, b] = rangeToken.split(':');
    const start = decodeCell(a.replace(/.*!/, '').replace(/\$/g, ''));
    const end = decodeCell(b.replace(/.*!/, '').replace(/\$/g, ''));
    const sheetPrefix = rangeToken.includes('!') ? rangeToken.slice(0, rangeToken.indexOf('!') + 1) : '';
    let sum = 0;
    for (let r = Math.min(start.r, end.r); r <= Math.max(start.r, end.r); r += 1) {
      for (let c = Math.min(start.c, end.c); c <= Math.max(start.c, end.c); c += 1) {
        const v = lookup(`${sheetPrefix}${encodeCol(c)}${r + 1}`);
        if (v != null) sum += v;
      }
    }
    return sum;
  }

  function parseExpr(depth: number): number | null {
    if (depth > 64) throw new Unsupported();
    let left = parseTerm(depth);
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm(depth);
      if (left == null || right == null) left = null;
      else left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(depth: number): number | null {
    let left = parseFactor(depth);
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      const right = parseFactor(depth);
      if (left == null || right == null) left = null;
      else if (op === '*') left = left * right;
      else {
        if (right === 0) left = null;
        else left = left / right;
      }
    }
    return left;
  }

  function parseFactor(depth: number): number | null {
    const t = peek();
    if (!t) throw new Unsupported();
    if (t.type === 'op' && t.value === '-') {
      next();
      const v = parseFactor(depth);
      return v == null ? null : -v;
    }
    if (t.type === 'op' && t.value === '+') {
      next();
      return parseFactor(depth);
    }
    if (t.type === 'lparen') {
      next();
      const v = parseExpr(depth + 1);
      if (!peek() || next().type !== 'rparen') throw new Unsupported();
      return v;
    }
    if (t.type === 'num') {
      next();
      return Number(t.value);
    }
    if (t.type === 'ref') {
      next();
      const v = lookup(t.value.replace(/\$/g, ''));
      if (v == null) nullOperand = true;
      return v;
    }
    if (t.type === 'fn') {
      return parseFunc(depth);
    }
    throw new Unsupported(); // range 단독(SUM 밖) 등
  }

  function parseFunc(depth: number): number | null {
    const fn = next().value;
    if (!peek() || next().type !== 'lparen') throw new Unsupported();
    const args: Array<number | null> = [];
    if (fn === 'SUM') {
      let total = 0;
      // SUM 인자: range 또는 expr, 콤마 구분
      do {
        const t = peek();
        if (t && t.type === 'range') {
          next();
          total += expandRange(t.value);
        } else {
          const v = parseExpr(depth + 1);
          if (v != null) total += v;
        }
      } while (peek() && peek().type === 'comma' && next());
      if (!peek() || next().type !== 'rparen') throw new Unsupported();
      return total;
    }
    // ROUND / ROUNDDOWN / INT
    while (true) {
      const v = parseExpr(depth + 1);
      args.push(v);
      const t = peek();
      if (t && t.type === 'comma') {
        next();
        continue;
      }
      break;
    }
    if (!peek() || next().type !== 'rparen') throw new Unsupported();
    if (fn === 'INT') return args[0] == null ? null : Math.floor(args[0]);
    const x = args[0];
    const n = args[1] ?? 0;
    if (x == null || n == null) return null;
    if (fn === 'ROUND') return roundHalfAway(x, n);
    if (fn === 'ROUNDDOWN') {
      const f = Math.pow(10, n);
      return Math.trunc(x * f) / f;
    }
    throw new Unsupported();
  }

  try {
    const value = parseExpr(0);
    if (pos !== tokens.length) return { value: null, supported: false };
    if (nullOperand || value == null || !Number.isFinite(value)) return { value: null, supported: true };
    return { value, supported: true };
  } catch {
    return { value: null, supported: false };
  }
}

// ---------------------------------------------------------------------------
// 항목 탐지
// ---------------------------------------------------------------------------

export function detectItems(ir: WorkbookIR, opts?: { maxCells?: number }): DetectedItem[] {
  const maxCells = opts?.maxCells ?? 20000;
  const items: DetectedItem[] = [];
  const seen = new Set<string>();
  let scanned = 0;

  for (const sheet of ir.sheets) {
    const byRow = new Map<number, IRCell[]>();
    for (const cell of sheet.cells) {
      const { r } = decodeCell(cell.address);
      const arr = byRow.get(r) ?? [];
      arr.push(cell);
      byRow.set(r, arr);
    }

    for (const cell of sheet.cells) {
      if (scanned++ > maxCells) break;
      if (cell.dataType !== 'STRING') continue;
      const label = typeof cell.cachedValue === 'string' ? cell.cachedValue : cell.displayValue;
      const def = matchCanonical(label);
      if (!def) continue;

      const { r, c: labelCol } = decodeCell(cell.address);
      const rowCells = (byRow.get(r) ?? []).filter((rc) => decodeCell(rc.address).c > labelCol);

      // 금액 셀: 라벨 오른쪽에서 숫자값을 가진 가장 오른쪽 셀
      let amountCell: IRCell | null = null;
      let rateCell: IRCell | null = null;
      for (const rc of rowCells) {
        const num = parseKoreanNumber(rc.cachedValue);
        if (num == null) continue;
        const asRate = parseRate(rc.cachedValue, rc.numberFormat);
        const looksRate = (rc.numberFormat?.includes('%') ?? false) || (num > 0 && num < 1);
        if (looksRate && asRate != null) {
          if (!rateCell) rateCell = rc;
        } else {
          amountCell = rc; // 오른쪽으로 갈수록 갱신 → 최종 = 가장 오른쪽
        }
      }
      if (!amountCell) continue; // 금액 없는 라벨-only 매칭 제외

      const key = `${sheet.sheetName}!${amountCell.address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        canonicalName: def.canonical,
        originalLabel: label,
        category: def.category,
        sheetName: sheet.sheetName,
        labelCell: cell.address,
        amountCell: amountCell.address,
        rateCell: rateCell?.address ?? null,
        amountValue: parseKoreanNumber(amountCell.cachedValue),
        rateValue: rateCell ? parseRate(rateCell.cachedValue, rateCell.numberFormat) : null,
        requiresReference: def.requiresReference,
      });
    }
  }
  return items;
}

export function buildReferenceRows(ir: WorkbookIR): ReferenceRate[] {
  const detected = detectItems(ir);
  const byName = new Map<string, ReferenceRate>();
  for (const item of detected) {
    if (byName.has(item.canonicalName)) continue;
    const def = CANONICAL_ITEMS.find((d) => d.canonical === item.canonicalName);
    byName.set(item.canonicalName, { canonicalName: item.canonicalName, rate: def?.defaultRate ?? null });
  }
  return Array.from(byName.values());
}

// ---------------------------------------------------------------------------
// 결과 팩토리 (렌더 계약 보장하는 단일 진입점)
// ---------------------------------------------------------------------------

function fmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US');
}

const SEVERITY: Record<ValidationStatus, ValidationResult['severity']> = {
  ERROR: 'HIGH',
  NEEDS_REVIEW: 'MEDIUM',
  WARNING: 'LOW',
  OK: 'INFO',
  UNAVAILABLE: 'INFO',
};

function buildPreviewRows(ctx: Ctx, sheetName: string, address: string, fallbackLabel: string, fallbackInput: string) {
  const sheet = ctx.sheets.get(sheetName);
  const { r } = decodeCell(address);
  const rowStart = r > 0 ? r - 1 : 0;
  const rows: Array<Record<string, string>> = [];
  for (let rr = rowStart; rr <= rowStart + 2; rr += 1) {
    const cells = sheet?.byRow.get(rr) ?? [];
    const row: Record<string, string> = {};
    for (const cell of cells) {
      const col = encodeCol(decodeCell(cell.address).c);
      row[col] = cell.displayValue || (cell.cachedValue == null ? '' : String(cell.cachedValue));
    }
    if (!('A' in row)) row.A = String(rr + 1);
    rows.push(row);
  }
  const hasContent = rows.some((row) => Object.keys(row).length > 1);
  if (!hasContent) return [{ A: String(r + 1), B: fallbackLabel, F: fallbackInput }];
  return rows;
}

function buildReferencedCells(ctx: Ctx, sheetName: string, cell: IRCell | undefined): string[] {
  if (!cell || cell.references.length === 0) return cell && cell.dataType !== 'FORMULA' ? ['입력값 (수식 아님)'] : [];
  const sheet = ctx.sheets.get(sheetName);
  return cell.references.map((ref) => {
    if (ref.includes('!')) return ref;
    const { r } = decodeCell(ref);
    const rowCells = sheet?.byRow.get(r) ?? [];
    const labelCell = rowCells.find((rc) => rc.dataType === 'STRING');
    const label = labelCell ? String(labelCell.cachedValue ?? labelCell.displayValue) : '';
    return label ? `${ref} ${label}` : ref;
  });
}

interface ResultInput {
  status: ValidationStatus;
  validationType: ValidationType;
  procurementType: ProcurementType;
  canonicalName: string;
  originalName?: string;
  category?: string;
  sheetName: string;
  cell: string;
  formula?: string;
  inputValue?: string;
  inputRate?: string;
  rateCell?: string;
  baseAmount?: string;
  rate?: string;
  rawAmount?: string;
  roundingMethod?: string;
  finalAmount?: string;
  difference?: string;
  summary: string;
  reason: string;
  recommendedAction?: string;
  evidence: {
    documentTitle: string;
    tableTitle: string;
    quote: string;
    confidence: number;
    page?: number;
    appliedCondition?: string;
  };
}

function makeResult(id: string, ctx: Ctx, input: ResultInput): ValidationResult {
  const cellObj = ctx.sheets.get(input.sheetName)?.byAddr.get(input.cell);
  return {
    resultId: id,
    status: input.status,
    severity: SEVERITY[input.status],
    validationType: input.validationType,
    procurementType: input.procurementType,
    item: {
      canonicalName: input.canonicalName,
      originalName: input.originalName ?? input.canonicalName,
      category: input.category ?? '기타',
    },
    excel: {
      sheetName: input.sheetName,
      cell: input.cell,
      rateCell: input.rateCell,
      inputValue: input.inputValue ?? (cellObj ? cellObj.displayValue : ''),
      inputRate: input.inputRate,
      formula: input.formula ?? (cellObj?.dataType === 'FORMULA' ? cellObj.rawValue : '(직접 입력)'),
      referencedCells: buildReferencedCells(ctx, input.sheetName, cellObj),
      previewRows: buildPreviewRows(ctx, input.sheetName, input.cell, input.originalName ?? input.canonicalName, input.inputValue ?? ''),
    },
    expected: {
      baseAmount: input.baseAmount ?? '',
      rate: input.rate,
      rawAmount: input.rawAmount ?? input.finalAmount ?? '',
      roundingMethod: input.roundingMethod ?? '원 단위 반올림',
      finalAmount: input.finalAmount ?? '',
    },
    difference: input.difference ?? '0',
    summary: input.summary,
    reason: input.reason,
    evidence: {
      documentTitle: input.evidence.documentTitle,
      page: input.evidence.page ?? 0,
      tableTitle: input.evidence.tableTitle,
      quote: input.evidence.quote,
      confidence: input.evidence.confidence,
      appliedCondition: input.evidence.appliedCondition ?? '파일 내 값 기준',
    },
    recommendedAction: input.recommendedAction ?? '해당 셀을 확인하십시오.',
  };
}

// ---------------------------------------------------------------------------
// 반올림 적용 (요율 기대금액 계산용)
// ---------------------------------------------------------------------------

function applyRounding(value: number, method: RoundingMethod): number {
  switch (method) {
    case 'FLOOR_WON':
      return Math.floor(value);
    case 'FLOOR_TEN':
      return Math.floor(value / 10) * 10;
    case 'NONE':
      return value;
    case 'ROUND_WON':
    default:
      return Math.round(value);
  }
}

// 금액 셀 수식에서 반올림 방식 추론
function inferRounding(formula: string | undefined, fallback: RoundingMethod): RoundingMethod {
  if (!formula) return fallback;
  const f = formula.toUpperCase();
  if (f.includes('ROUNDDOWN') || f.includes('INT(')) return 'FLOOR_WON';
  if (f.includes('ROUND(')) return 'ROUND_WON';
  return fallback;
}

// ---------------------------------------------------------------------------
// 규칙들
// ---------------------------------------------------------------------------

const TOTAL_LABELS = {
  supply: ['공급가액', '공급가'],
  vat: ['부가가치세', '부가세'],
  total: ['합계', '총계', '총액', '도급액', '총공사비'],
};

function findLabeledAmount(ctx: Ctx, keys: string[]): { sheetName: string; cell: IRCell; label: string } | null {
  const ordered = Array.from(ctx.sheets.values()).sort(
    (a, b) => (ROLE_PRIORITY[a.role] ?? 7) - (ROLE_PRIORITY[b.role] ?? 7),
  );
  for (const sheet of ordered) {
    const sheetName = sheet.name;
    for (const cell of sheet.byAddr.values()) {
      if (cell.dataType !== 'STRING') continue;
      const norm = normalizeLabel(String(cell.cachedValue ?? cell.displayValue));
      if (!keys.some((k) => norm.includes(normalizeLabel(k)))) continue;
      const { r, c } = decodeCell(cell.address);
      const rowCells = (sheet.byRow.get(r) ?? []).filter((rc) => decodeCell(rc.address).c > c);
      let amount: IRCell | null = null;
      for (const rc of rowCells) {
        if (parseKoreanNumber(rc.cachedValue) != null) amount = rc;
      }
      if (amount) return { sheetName, cell: amount, label: String(cell.cachedValue ?? cell.displayValue) };
    }
  }
  return null;
}

export function runValidation(ir: WorkbookIR, config: ValidationConfig): ValidationResult[] {
  const ctx = buildCtx(ir);
  const results: ValidationResult[] = [];
  const pt = ir.procurementType;
  const defaultRounding = config.defaultRounding ?? 'ROUND_WON';
  const maxCells = config.maxCellsScanned ?? 20000;
  let seq = 0;
  const nextId = () => `vr-${String(++seq).padStart(3, '0')}`;
  let okCount = 0;
  const OK_CAP = 200;
  const pushOk = (input: ResultInput) => {
    if (okCount >= OK_CAP) return;
    okCount += 1;
    results.push(makeResult(nextId(), ctx, input));
  };

  // 시트별 검사 커버리지 (모든 시트를 검사했음을 보여주기 위함)
  const coverage = new Map<string, { checked: number; passed: number; anchor: string }>();
  const cov = (sheetName: string, anchor: string) => {
    const c = coverage.get(sheetName) ?? { checked: 0, passed: 0, anchor };
    if (!c.anchor || c.anchor === 'A1') c.anchor = anchor;
    coverage.set(sheetName, c);
    return c;
  };

  // 항목 탐지 (커버리지·규칙 공용)
  const detected = detectItems(ir, { maxCells });
  const itemsPerSheet = new Map<string, number>();
  for (const it of detected) itemsPerSheet.set(it.sheetName, (itemsPerSheet.get(it.sheetName) ?? 0) + 1);

  // 1) 참조 오류 (#REF! 등)
  let scanned = 0;
  let truncated = false;
  for (const sheet of ir.sheets) {
    for (const cell of sheet.cells) {
      if (scanned++ > maxCells) {
        truncated = true;
        break;
      }
      if (cell.dataType === 'ERROR') {
        results.push(
          makeResult(nextId(), ctx, {
            status: 'ERROR',
            validationType: 'REFERENCE',
            procurementType: pt,
            canonicalName: '참조 오류',
            category: '참조',
            sheetName: sheet.sheetName,
            cell: cell.address,
            summary: '참조 오류가 있는 셀입니다.',
            reason: `${sheet.sheetName}!${cell.address} 셀에 오류값(${cell.displayValue || '#REF!'})이 있습니다. 삭제된 참조나 잘못된 수식일 수 있습니다.`,
            recommendedAction: '해당 셀의 수식과 참조 범위를 수정하십시오.',
            evidence: {
              documentTitle: '자동 산술 검증 (기준자료 불필요)',
              tableTitle: '참조 오류',
              quote: `${cell.address} = ${cell.displayValue || '#REF!'}`,
              confidence: 1,
            },
          }),
        );
      }
    }
    if (truncated) break;
  }

  // 2) 수식 자기일관성
  scanned = 0;
  for (const sheet of ir.sheets) {
    for (const cell of sheet.cells) {
      if (scanned++ > maxCells) break;
      if (cell.dataType !== 'FORMULA') continue;
      const cached = parseKoreanNumber(cell.cachedValue);
      if (cached == null) continue;
      const { value, supported } = evaluateFormula(cell.rawValue, (addr) => ctx.lookup(addr, sheet.sheetName));
      if (!supported || value == null) continue;
      const c = cov(sheet.sheetName, cell.address);
      c.checked += 1;
      const diff = cached - value;
      const absdiff = Math.abs(diff);
      if (absdiff <= 1) {
        c.passed += 1;
        continue; // 일치(끝수 이내)
      }
      const isRounding = /ROUND|INT|SUM/i.test(cell.rawValue);
      results.push(
        makeResult(nextId(), ctx, {
          status: absdiff < 10 ? 'NEEDS_REVIEW' : 'ERROR',
          validationType: isRounding ? 'FORMULA' : 'ARITHMETIC',
          procurementType: pt,
          canonicalName: '수식 자기일관성',
          category: '수식',
          sheetName: sheet.sheetName,
          cell: cell.address,
          baseAmount: fmt(value),
          rawAmount: fmt(value),
          finalAmount: fmt(value),
          difference: fmt(diff),
          summary: '저장된 값이 수식 재계산 결과와 다릅니다.',
          reason: `${sheet.sheetName}!${cell.address}의 저장값 ${fmt(cached)}은(는) 수식 ${cell.rawValue}을(를) 참조셀 값으로 재계산한 ${fmt(value)}과(와) ${fmt(diff)} 차이가 납니다. 하드코딩 또는 미재계산이 의심됩니다.`,
          recommendedAction: '수식을 다시 계산하거나 직접 입력된 값을 확인하십시오.',
          evidence: {
            documentTitle: '자동 산술 검증 (기준자료 불필요)',
            tableTitle: '수식 자기일관성 검증',
            quote: `${cell.rawValue} → 재계산 ${fmt(value)} vs 저장 ${fmt(cached)}`,
            confidence: 0.9,
          },
        }),
      );
    }
  }

  // 3) 총액·부가세
  const supply = findLabeledAmount(ctx, TOTAL_LABELS.supply);
  const vat = findLabeledAmount(ctx, TOTAL_LABELS.vat);
  const total = findLabeledAmount(ctx, TOTAL_LABELS.total);
  if (supply && vat && total) {
    const sv = parseKoreanNumber(supply.cell.cachedValue) ?? 0;
    const vv = parseKoreanNumber(vat.cell.cachedValue) ?? 0;
    const tv = parseKoreanNumber(total.cell.cachedValue) ?? 0;
    const diff = tv - (sv + vv);
    const status: ValidationStatus = Math.abs(diff) <= 1 ? 'OK' : 'ERROR';
    const input: ResultInput = {
      status,
      validationType: 'TOTAL',
      procurementType: pt,
      canonicalName: '총액 검증',
      category: '합계',
      sheetName: total.sheetName,
      cell: total.cell.address,
      baseAmount: fmt(sv),
      rawAmount: fmt(sv + vv),
      finalAmount: fmt(sv + vv),
      difference: fmt(diff),
      summary: status === 'OK' ? '공급가액+부가세가 합계와 일치합니다.' : '공급가액+부가세가 합계와 다릅니다.',
      reason: `공급가액 ${fmt(sv)} + 부가세 ${fmt(vv)} = ${fmt(sv + vv)}, 합계 셀은 ${fmt(tv)}입니다 (차이 ${fmt(diff)}).`,
      recommendedAction: status === 'OK' ? '이상 없습니다.' : '합계 셀의 수식을 확인하십시오.',
      evidence: {
        documentTitle: '자동 산술 검증 (기준자료 불필요)',
        tableTitle: '총액·부가세 검증',
        quote: `${fmt(sv)} + ${fmt(vv)} = ${fmt(sv + vv)} vs ${fmt(tv)}`,
        confidence: 0.95,
      },
    };
    if (status === 'OK') pushOk(input);
    else results.push(makeResult(nextId(), ctx, input));
  }

  // 4) 탐지 항목: 하드코딩(공통) + 요율(요율 모드)
  const refMode = config.mode === 'ARITHMETIC_AND_RATE';
  for (const item of detected) {
    if (!item.amountCell) continue;
    const amountCellObj = ctx.sheets.get(item.sheetName)?.byAddr.get(item.amountCell);
    const isFormula = amountCellObj?.dataType === 'FORMULA';

    // 하드코딩 검사 (요율/보험료 금액이 수식이 아님)
    if (!isFormula && item.requiresReference) {
      results.push(
        makeResult(nextId(), ctx, {
          status: 'WARNING',
          validationType: 'FORMULA',
          procurementType: pt,
          canonicalName: item.canonicalName,
          originalName: item.originalLabel,
          category: item.category,
          sheetName: item.sheetName,
          cell: item.amountCell,
          inputValue: fmt(item.amountValue),
          summary: '금액이 수식이 아닌 직접 입력값입니다.',
          reason: `${item.canonicalName} 금액(${item.sheetName}!${item.amountCell})이 수식 없이 숫자로 직접 입력되어 있습니다. 요율·기초 변경 시 자동 반영되지 않습니다.`,
          recommendedAction: '산출기초 × 요율 수식으로 입력하는 것을 권장합니다.',
          evidence: {
            documentTitle: '자동 산술 검증 (기준자료 불필요)',
            tableTitle: '수식 누락·하드코딩',
            quote: `${item.amountCell} = ${fmt(item.amountValue)} (수식 없음)`,
            confidence: 0.85,
          },
        }),
      );
    }

    if (!refMode || !item.requiresReference) continue;

    const ref = config.referenceRates[item.canonicalName];
    if (!ref || ref.rate == null) {
      results.push(
        makeResult(nextId(), ctx, {
          status: 'UNAVAILABLE',
          validationType: 'RATE',
          procurementType: pt,
          canonicalName: item.canonicalName,
          originalName: item.originalLabel,
          category: item.category,
          sheetName: item.sheetName,
          cell: item.amountCell,
          inputValue: fmt(item.amountValue),
          inputRate: item.rateValue != null ? `${(item.rateValue * 100).toFixed(3)}%` : undefined,
          rateCell: item.rateCell ?? undefined,
          summary: '기준요율이 입력되지 않아 검증할 수 없습니다.',
          reason: `${item.canonicalName} 항목의 기준요율을 입력하면 적용요율·금액을 검증합니다.`,
          recommendedAction: '기준요율을 입력하십시오.',
          evidence: {
            documentTitle: '기준요율 미입력',
            tableTitle: '제비율/보험료 요율',
            quote: '기준요율을 입력하면 검증됩니다.',
            confidence: 0,
          },
        }),
      );
      continue;
    }

    // base 추정: 요율 셀 제외한 선행셀 중 금액값
    let base: number | null = null;
    if (amountCellObj && amountCellObj.dataType === 'FORMULA') {
      for (const r of amountCellObj.references) {
        if (item.rateCell && r.replace(/\$/g, '') === item.rateCell) continue;
        const v = ctx.lookup(r, item.sheetName);
        if (v != null && (base == null || v > base)) base = v;
      }
    }
    const rounding = inferRounding(amountCellObj?.rawValue, defaultRounding);
    const amount = item.amountValue ?? 0;
    if (base == null) {
      // base 미상: 적용요율만 비교
      const applied = item.rateValue;
      const status: ValidationStatus = applied == null ? 'UNAVAILABLE' : Math.abs(applied - ref.rate) < 1e-6 ? 'OK' : 'ERROR';
      const input: ResultInput = {
        status,
        validationType: 'RATE',
        procurementType: pt,
        canonicalName: item.canonicalName,
        originalName: item.originalLabel,
        category: item.category,
        sheetName: item.sheetName,
        cell: item.amountCell,
        inputValue: fmt(amount),
        inputRate: applied != null ? `${(applied * 100).toFixed(3)}%` : undefined,
        rate: `${(ref.rate * 100).toFixed(3)}%`,
        rateCell: item.rateCell ?? undefined,
        summary:
          status === 'OK' ? '적용요율이 기준요율과 일치합니다.' : status === 'ERROR' ? '적용요율이 기준요율과 다릅니다.' : '적용요율을 찾지 못했습니다.',
        reason:
          applied != null
            ? `${item.canonicalName} 적용요율 ${(applied * 100).toFixed(3)}% vs 기준요율 ${(ref.rate * 100).toFixed(3)}%.`
            : `${item.canonicalName} 산출기초·적용요율 셀을 특정하지 못했습니다.`,
        recommendedAction: status === 'ERROR' ? '적용요율을 기준요율에 맞게 수정하십시오.' : '이상 없습니다.',
        evidence: {
          documentTitle: '사용자 입력 기준요율',
          tableTitle: '제비율/보험료 요율 (수기 입력)',
          quote: `${item.canonicalName} 기준요율 ${(ref.rate * 100).toFixed(3)}% (사용자 입력)`,
          confidence: 0.99,
          appliedCondition: '사용자 수기 입력 · 기준일 미지정',
        },
      };
      if (status === 'OK') pushOk(input);
      else results.push(makeResult(nextId(), ctx, input));
      continue;
    }

    const expected = applyRounding(base * ref.rate, rounding);
    const diff = amount - expected;
    const status: ValidationStatus = Math.abs(diff) <= 1 ? 'OK' : 'ERROR';
    const input: ResultInput = {
      status,
      validationType: 'RATE',
      procurementType: pt,
      canonicalName: item.canonicalName,
      originalName: item.originalLabel,
      category: item.category,
      sheetName: item.sheetName,
      cell: item.amountCell,
      inputValue: fmt(amount),
      inputRate: item.rateValue != null ? `${(item.rateValue * 100).toFixed(3)}%` : undefined,
      rateCell: item.rateCell ?? undefined,
      baseAmount: fmt(base),
      rate: `${(ref.rate * 100).toFixed(3)}%`,
      rawAmount: fmt(base * ref.rate),
      finalAmount: fmt(expected),
      roundingMethod: rounding === 'FLOOR_WON' ? '원 단위 절사' : rounding === 'FLOOR_TEN' ? '십원 단위 절사' : '원 단위 반올림',
      difference: fmt(diff),
      summary: status === 'OK' ? '기준요율 적용금액과 일치합니다.' : '기준요율로 계산한 금액과 다릅니다.',
      reason: `산출기초 ${fmt(base)} × 기준요율 ${(ref.rate * 100).toFixed(3)}% = ${fmt(expected)} (${
        rounding === 'FLOOR_WON' ? '절사' : '반올림'
      }), Excel 금액 ${fmt(amount)} (차이 ${fmt(diff)}).`,
      recommendedAction: status === 'OK' ? '이상 없습니다.' : '적용요율과 산출금액을 기준요율에 맞게 수정하십시오.',
      evidence: {
        documentTitle: '사용자 입력 기준요율',
        tableTitle: '제비율/보험료 요율 (수기 입력)',
        quote: `${item.canonicalName} 기준요율 ${(ref.rate * 100).toFixed(3)}% 적용 시 기대금액 ${fmt(expected)}`,
        confidence: 0.99,
        appliedCondition: '사용자 수기 입력 · 기준일 미지정',
      },
    };
    if (status === 'OK') pushOk(input);
    else results.push(makeResult(nextId(), ctx, input));
  }

  // 5) 시트별 검사 커버리지 (모든 시트를 검사했음을 표시)
  for (const sheet of ir.sheets) {
    const c = coverage.get(sheet.sheetName);
    const items = itemsPerSheet.get(sheet.sheetName) ?? 0;
    const checked = c?.checked ?? 0;
    const passed = c?.passed ?? 0;
    if (checked === 0 && items === 0) continue; // 검사할 게 없는 시트(빈/텍스트만)는 생략
    pushOk({
      status: 'OK',
      validationType: 'FORMULA',
      procurementType: pt,
      canonicalName: `${sheet.sheetName} 검사`,
      category: '검사범위',
      sheetName: sheet.sheetName,
      cell: c?.anchor ?? sheet.cells[0]?.address ?? 'A1',
      summary: `${sheet.sheetName} 시트 검사 완료`,
      reason: `${sheet.sheetName}: 수식 ${passed}/${checked}건 자기일관성 통과, 제비율·보험료 항목 ${items}건 인식. (전체 셀 ${sheet.cellCount}개 · 수식 ${sheet.formulaCount}개)`,
      recommendedAction: '이상 없음. 세부 항목은 각 결과에서 확인하십시오.',
      finalAmount: '',
      difference: '0',
      evidence: {
        documentTitle: '자동 산술 검증 (기준자료 불필요)',
        tableTitle: '시트 검사 범위',
        quote: `수식 ${passed}/${checked}건 통과 · 항목 ${items}건`,
        confidence: 1,
        appliedCondition: `역할: ${sheet.sheetRole}`,
      },
    });
  }

  // 검출 0건 안내 (업로드 파일은 샘플로 대체하지 않음)
  if (results.length === 0) {
    results.push(
      makeResult(nextId(), ctx, {
        status: 'UNAVAILABLE',
        validationType: 'ARITHMETIC',
        procurementType: pt,
        canonicalName: '검출된 검증 항목 없음',
        category: '안내',
        sheetName: ir.sheets[0]?.sheetName ?? '-',
        cell: 'A1',
        summary: '이 파일에서 검증할 항목을 찾지 못했습니다.',
        reason:
          '수식·총액·제비율 항목을 인식하지 못했습니다. 시트 라벨이 표준 항목명과 다르거나, 수식이 아닌 값으로 작성되었을 수 있습니다. 요율 모드로 기준요율을 입력하면 항목을 더 잡을 수 있습니다.',
        recommendedAction: '시트 구성을 확인하거나 요율 모드로 기준요율을 입력해 다시 검증하십시오.',
        evidence: {
          documentTitle: '자동 산술 검증 (기준자료 불필요)',
          tableTitle: '검출 결과',
          quote: '검출된 검증 항목이 없습니다.',
          confidence: 0,
        },
      }),
    );
  }

  // 대용량 절단 안내
  if (truncated) {
    results.push(
      makeResult(nextId(), ctx, {
        status: 'WARNING',
        validationType: 'ARITHMETIC',
        procurementType: pt,
        canonicalName: '대용량 파일',
        category: '안내',
        sheetName: ir.sheets[0]?.sheetName ?? '-',
        cell: 'A1',
        summary: '셀 수가 많아 일부만 검사했습니다.',
        reason: `검사 상한(${maxCells.toLocaleString('en-US')}셀)을 초과하여 이후 셀은 검사하지 않았습니다.`,
        recommendedAction: '필요 시 시트를 나누어 다시 검증하십시오.',
        evidence: {
          documentTitle: '자동 산술 검증 (기준자료 불필요)',
          tableTitle: '검사 범위',
          quote: `상한 ${maxCells.toLocaleString('en-US')}셀 초과`,
          confidence: 1,
        },
      }),
    );
  }

  return results;
}
