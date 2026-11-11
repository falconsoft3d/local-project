/** Minimal, dependency-free .xlsx writer and reader.
 *
 * Writer: one or more sheets with inline strings, numbers and dates, a small style registry
 * (fill, font colour/bold/italic, alignment, thin borders, number formats), frozen panes,
 * merged cells, column widths and page setup (A4 landscape, fit to width). Packaged as a ZIP
 * with "stored" (uncompressed) entries — valid for Excel, LibreOffice and Numbers.
 *
 * Reader: first worksheet of any .xlsx as a grid of strings/numbers. Deflated entries are
 * inflated with the browser's DecompressionStream("deflate-raw"). */

export type CellValue = string | number | null | undefined;

export interface CellStyle {
  /** Background colour, "#rrggbb". */
  fill?: string;
  /** Font colour, "#rrggbb". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  align?: "left" | "center" | "right";
  wrap?: boolean;
  border?: boolean;
  numFmt?: "date" | "int" | "dec2" | "pct" | "money";
}

export interface Cell {
  v: CellValue;
  s?: CellStyle;
  /** `v` is an ISO date (yyyy-mm-dd) to store as an Excel date. */
  date?: boolean;
}

export type CellInput = CellValue | Cell;

export interface SheetSpec {
  name: string;
  rows: CellInput[][];
  /** Column widths in characters. */
  colWidths?: number[];
  /** Frozen header rows / columns. */
  freeze?: { rows: number; cols: number };
  /** "A1:C1" ranges. */
  merges?: string[];
  landscape?: boolean;
  fitToWidth?: boolean;
  /** 0-based row index → height in points. */
  rowHeights?: Record<number, number>;
  /** Rows repeated at the top of each printed page (1-based inclusive range). */
  printTitleRows?: [number, number];
}

// ---------------------------------------------------------------------------------------
// Helpers

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Days since 1899-12-30 (Excel's 1900 date system). */
export function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

export function excelSerialToISO(serial: number): string {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s
    // Characters XML 1.0 cannot carry.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function argb(hex: string): string {
  const h = hex.replace("#", "").toUpperCase();
  return `FF${h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------------------
// Styles

const NUMFMT_IDS: Record<NonNullable<CellStyle["numFmt"]>, number> = {
  int: 1,
  dec2: 4,
  pct: 9,
  date: 164,
  money: 165,
};

class StyleRegistry {
  fonts: string[] = ['<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>'];
  fills: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  borders: string[] = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    '<border><left style="thin"><color rgb="FFD4D4D4"/></left><right style="thin"><color rgb="FFD4D4D4"/></right><top style="thin"><color rgb="FFD4D4D4"/></top><bottom style="thin"><color rgb="FFD4D4D4"/></bottom><diagonal/></border>',
  ];
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private keys = new Map<string, number>([["{}", 0]]);
  private fontKeys = new Map<string, number>([["", 0]]);
  private fillKeys = new Map<string, number>();

  id(style: CellStyle | undefined): number {
    if (!style) return 0;
    const key = JSON.stringify(style);
    const existing = this.keys.get(key);
    if (existing !== undefined) return existing;

    const fontKey = `${style.bold ? "b" : ""}|${style.italic ? "i" : ""}|${style.color ?? ""}|${style.size ?? ""}`;
    let fontId = this.fontKeys.get(fontKey === "|||" ? "" : fontKey);
    if (fontId === undefined) {
      fontId = this.fonts.length;
      this.fonts.push(
        `<font>${style.bold ? "<b/>" : ""}${style.italic ? "<i/>" : ""}<sz val="${style.size ?? 10}"/>` +
          `${style.color ? `<color rgb="${argb(style.color)}"/>` : ""}<name val="Calibri"/><family val="2"/></font>`,
      );
      this.fontKeys.set(fontKey, fontId);
    }
    let fillId = 0;
    if (style.fill) {
      const f = this.fillKeys.get(style.fill);
      if (f !== undefined) fillId = f;
      else {
        fillId = this.fills.length;
        this.fills.push(
          `<fill><patternFill patternType="solid"><fgColor rgb="${argb(style.fill)}"/><bgColor indexed="64"/></patternFill></fill>`,
        );
        this.fillKeys.set(style.fill, fillId);
      }
    }
    const borderId = style.border ? 1 : 0;
    const numFmtId = style.numFmt ? NUMFMT_IDS[style.numFmt] : 0;
    const align =
      style.align || style.wrap
        ? `<alignment${style.align ? ` horizontal="${style.align}"` : ""} vertical="center"${style.wrap ? ' wrapText="1"' : ""}/>`
        : "";
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}` +
      `${borderId ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    const id = this.xfs.length;
    this.xfs.push(xf);
    this.keys.set(key, id);
    return id;
  }

  xml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>' +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

// ---------------------------------------------------------------------------------------
// Sheet XML

function normalizeCell(c: CellInput): Cell {
  if (c !== null && typeof c === "object") return c;
  return { v: c };
}

function sheetXml(sheet: SheetSpec, styles: StyleRegistry): string {
  const rowsXml: string[] = [];
  let maxCol = 0;
  sheet.rows.forEach((row, ri) => {
    const cells: string[] = [];
    row.forEach((raw, ci) => {
      const cell = normalizeCell(raw);
      const ref = `${colLetter(ci)}${ri + 1}`;
      const style = cell.date ? { numFmt: "date" as const, ...cell.s } : cell.s;
      const s = styles.id(style);
      const sAttr = s ? ` s="${s}"` : "";
      const v = cell.v;
      if (v === null || v === undefined || v === "") {
        if (s) cells.push(`<c r="${ref}"${sAttr}/>`);
        return;
      }
      maxCol = Math.max(maxCol, ci);
      if (cell.date && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        cells.push(`<c r="${ref}"${sAttr}><v>${isoToExcelSerial(v)}</v></c>`);
      } else if (typeof v === "number" && Number.isFinite(v)) {
        cells.push(`<c r="${ref}"${sAttr}><v>${v}</v></c>`);
      } else {
        cells.push(`<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
      }
      maxCol = Math.max(maxCol, ci);
    });
    const ht = sheet.rowHeights?.[ri];
    rowsXml.push(
      `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells.join("")}</row>`,
    );
  });
  maxCol = Math.max(maxCol, (sheet.colWidths?.length ?? 1) - 1);
  const dim = `A1:${colLetter(maxCol)}${Math.max(1, sheet.rows.length)}`;

  let pane = "";
  if (sheet.freeze && (sheet.freeze.rows || sheet.freeze.cols)) {
    const { rows, cols } = sheet.freeze;
    const active = rows && cols ? "bottomRight" : rows ? "bottomLeft" : "topRight";
    pane =
      `<pane${cols ? ` xSplit="${cols}"` : ""}${rows ? ` ySplit="${rows}"` : ""}` +
      ` topLeftCell="${colLetter(cols)}${rows + 1}" activePane="${active}" state="frozen"/>` +
      `<selection pane="${active}"/>`;
  }
  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const fit = sheet.fitToWidth;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (fit ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "") +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    merges +
    '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>' +
    `<pageSetup paperSize="9" orientation="${sheet.landscape ? "landscape" : "portrait"}"` +
    `${fit ? ' fitToWidth="1" fitToHeight="0"' : ""}/>` +
    "</worksheet>"
  );
}

function sheetName(name: string, used: Set<string>): string {
  let n = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Hoja";
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const styles = new StyleRegistry();
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  const files: { name: string; data: string }[] = [];
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, styles) }));

  const definedNames = sheets
    .map((s, i) =>
      s.printTitleRows
        ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${names[i].replace(/'/g, "''")}'!$${s.printTitleRows[0]}:$${s.printTitleRows[1]}</definedName>`
        : "",
    )
    .join("");

  files.unshift(
    {
      name: "[Content_Types].xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        (definedNames ? `<definedNames>${definedNames}</definedNames>` : "") +
        "</workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
  );
  files.push({ name: "xl/styles.xml", data: styles.xml() });
  const enc = new TextEncoder();
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })));
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------------------------------
// ZIP (stored)

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Reading

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP/XLSX file.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + compSize);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflateRaw(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/_x000D_/g, "");
}

function textRuns(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out += m[1];
  return decodeEntities(out);
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m?.[1];
}

/** Reads the first worksheet as a grid. Numbers stay numbers (dates come as Excel serials). */
export async function readXlsx(buffer: ArrayBuffer): Promise<CellValue[][]> {
  const files = await unzip(buffer);
  const dec = new TextDecoder();
  const get = (name: string) => {
    const f = files.get(name);
    return f ? dec.decode(f) : undefined;
  };

  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = get("xl/workbook.xml");
  const rels = get("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const first = /<sheet\b([^>]*)\/?>/.exec(wb);
    const rid = first ? attr(first[1], "r:id") : undefined;
    if (rid) {
      const relRe = /<Relationship\b([^>]*)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = relRe.exec(rels))) {
        if (attr(m[1], "Id") === rid) {
          const target = attr(m[1], "Target") ?? "";
          sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
        }
      }
    }
  }
  const sheet = get(sheetPath) ?? get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook has no worksheet.");

  const shared: string[] = [];
  const ss = get("xl/sharedStrings.xml");
  if (ss) {
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ss))) shared.push(textRuns(m[1]));
  }

  const grid: CellValue[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let rowIdx = 0;
  while ((rm = rowRe.exec(sheet))) {
    const r = attr(rm[1], "r");
    const ri = r ? Number(r) - 1 : rowIdx;
    rowIdx = ri + 1;
    const row: CellValue[] = [];
    const body = rm[2] ?? "";
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let colIdx = 0;
    while ((cm = cellRe.exec(body))) {
      const ref = attr(cm[1], "r");
      const ci = ref ? colIndex(ref.replace(/\d+/g, "")) : colIdx;
      colIdx = ci + 1;
      const type = attr(cm[1], "t");
      const inner = cm[2] ?? "";
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let value: CellValue = null;
      if (type === "s" && vMatch) value = shared[Number(vMatch[1])] ?? "";
      else if (type === "inlineStr") value = textRuns(inner);
      else if (type === "str" && vMatch) value = decodeEntities(vMatch[1]);
      else if (type === "b" && vMatch) value = vMatch[1] === "1" ? 1 : 0;
      else if (type === "e") value = null;
      else if (vMatch) {
        const n = Number(vMatch[1]);
        value = Number.isFinite(n) ? n : decodeEntities(vMatch[1]);
      }
      row[ci] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    grid[ri] = row;
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  return grid;
}
