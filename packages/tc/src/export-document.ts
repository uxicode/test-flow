export interface ExportCase {
  id: string;
  screenName: string;
  kind: "success" | "failure";
  title: string;
  inputs: Array<{ target: string; value: string }>;
  buttonName: string;
  expectedText: string;
}

const HEADERS = ["번호", "구분", "화면", "제목", "버튼", "입력", "기대 결과"] as const;

function kindLabel(kind: ExportCase["kind"]): string {
  return kind === "success" ? "성공 경로" : "실패 대응";
}

function inputLines(testCase: ExportCase, values: Record<string, string>): string[] {
  return testCase.inputs.map((input) => {
    const typed = values[input.target]?.trim() ?? "";
    const value = testCase.kind === "failure" ? input.value : typed || "실행 시 입력";
    return `${input.target}: ${value}`;
  });
}

function escapeCell(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/\n/gu, "&#10;");
}

export function casesToMarkdown(cases: ExportCase[], valuesByCase: Record<string, Record<string, string>> = {}): string {
  const parts = ["# 테스트 케이스", ""];
  cases.forEach((testCase, index) => {
    const values = valuesByCase[testCase.id] ?? {};
    parts.push(`## ${index + 1}. ${testCase.title}`, "");
    parts.push(`- 구분: ${kindLabel(testCase.kind)}`);
    parts.push(`- 화면: ${testCase.screenName}`);
    parts.push(`- 버튼: ${testCase.buttonName}`);
    parts.push("- 입력");
    for (const line of inputLines(testCase, values)) parts.push(`  - ${line}`);
    parts.push("- 기대 결과:", "");
    parts.push(testCase.expectedText.trim(), "");
  });
  if (cases.length === 0) parts.push("작성된 TC가 없습니다.", "");
  return parts.join("\n");
}

function rowsOf(cases: ExportCase[], valuesByCase: Record<string, Record<string, string>>): string[][] {
  const rows: string[][] = [[...HEADERS]];
  cases.forEach((testCase, index) => {
    const values = valuesByCase[testCase.id] ?? {};
    rows.push([
      String(index + 1),
      kindLabel(testCase.kind),
      testCase.screenName,
      testCase.title,
      testCase.buttonName,
      inputLines(testCase, values).join("\n"),
      testCase.expectedText.trim(),
    ]);
  });
  return rows;
}

function columnName(index: number): string {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function worksheetXml(rows: string[][]): string {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeCell(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = (crc & 1) === 1 ? 0xedb88320 : 0;
      crc = (crc >>> 1) ^ mask;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStored(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]));
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, end]);
}

function xmlFile(name: string, xml: string): { name: string; data: Uint8Array } {
  return { name, data: new TextEncoder().encode(xml) };
}

export function casesToXlsx(cases: ExportCase[], valuesByCase: Record<string, Record<string, string>> = {}): Uint8Array {
  const sheet = worksheetXml(rowsOf(cases, valuesByCase));
  return zipStored([
    xmlFile("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    xmlFile("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    xmlFile("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="TC" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    xmlFile("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    xmlFile("xl/worksheets/sheet1.xml", sheet),
  ]);
}
