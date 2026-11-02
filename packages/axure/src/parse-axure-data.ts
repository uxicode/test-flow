/**
 * Axure 게시본의 `document.js`, 페이지 `data.js`를 코드 실행 없이 값으로 읽는다.
 *
 * 두 파일은 `_(키, 값, 키, 값 …)` 호출, 배열, 그리고 `var a="…",b=true` 변수 테이블로만 이루어진다.
 * 토큰으로 나눠 이 문법만 해석하며, 그 밖의 구문을 만나면 실행하지 않고 에러를 낸다.
 */
export type AxureValue = string | number | boolean | null | AxureValue[] | { [key: string]: AxureValue };

export type AxureObject = { [key: string]: AxureValue };

type Token =
  | { kind: "ident"; text: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "punct"; text: string };

const IDENT_START = /[A-Za-z_$]/u;
const IDENT_PART = /[\w$]/u;
const NUMBER = /^-?(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/iu;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (/\s/u.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
      if (j >= source.length) throw new Error("Axure 데이터: 닫히지 않은 문자열입니다.");
      tokens.push({ kind: "string", value: readStringLiteral(source.slice(i, j + 1)) });
      i = j + 1;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && IDENT_PART.test(source[j] ?? "")) j += 1;
      tokens.push({ kind: "ident", text: source.slice(i, j) });
      i = j;
      continue;
    }
    const numberMatch = NUMBER.exec(source.slice(i, i + 40));
    if (numberMatch && (/\d/u.test(ch) || ch === "-")) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]) });
      i += numberMatch[0].length;
      continue;
    }
    if ("()[],=;{}".includes(ch)) {
      tokens.push({ kind: "punct", text: ch });
      i += 1;
      continue;
    }
    throw new Error(`Axure 데이터: 해석할 수 없는 문자 '${ch}' 입니다.`);
  }
  return tokens;
}

function readStringLiteral(literal: string): string {
  const quote = literal[0];
  const inner = literal.slice(1, -1);
  const jsonLike = quote === "'" ? `"${inner.replace(/"/gu, '\\"').replace(/\\'/gu, "'")}"` : literal;
  try {
    return JSON.parse(jsonLike) as string;
  } catch {
    throw new Error("Axure 데이터: 문자열 이스케이프를 해석하지 못했습니다.");
  }
}

class Reader {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly vars: Map<string, AxureValue>,
  ) {}

  done(): boolean {
    return this.pos >= this.tokens.length;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new Error("Axure 데이터: 예상보다 일찍 끝났습니다.");
    this.pos += 1;
    return token;
  }

  expectPunct(text: string): void {
    const token = this.next();
    if (token.kind !== "punct" || token.text !== text) {
      throw new Error(`Axure 데이터: '${text}' 가 필요합니다.`);
    }
  }

  isPunct(text: string): boolean {
    const token = this.peek();
    return token?.kind === "punct" && token.text === text;
  }

  value(): AxureValue {
    const token = this.next();
    if (token.kind === "string" || token.kind === "number") return token.value;
    if (token.kind === "punct") {
      if (token.text === "[") return this.list();
      throw new Error(`Axure 데이터: 예상하지 못한 '${token.text}' 입니다.`);
    }
    if (token.text === "true") return true;
    if (token.text === "false") return false;
    if (token.text === "null") return null;
    if (token.text === "_") return this.object();
    if (token.text === "new") return this.dateLiteral();
    if (this.vars.has(token.text)) return this.vars.get(token.text) ?? null;
    throw new Error(`Axure 데이터: 정의되지 않은 이름 '${token.text}' 입니다.`);
  }

  /** `new Date(1770267725567)` 만 허용한다. 밀리초 숫자로 돌려준다. */
  private dateLiteral(): number {
    const ctor = this.next();
    if (ctor.kind !== "ident" || ctor.text !== "Date") throw new Error("Axure 데이터: 허용하지 않는 new 구문입니다.");
    this.expectPunct("(");
    const millis = this.value();
    this.expectPunct(")");
    if (typeof millis !== "number") throw new Error("Axure 데이터: Date 인자가 숫자가 아닙니다.");
    return millis;
  }

  private list(): AxureValue[] {
    const items: AxureValue[] = [];
    while (!this.isPunct("]")) {
      items.push(this.value());
      if (this.isPunct(",")) this.next();
    }
    this.expectPunct("]");
    return items;
  }

  private object(): AxureObject {
    this.expectPunct("(");
    const result: AxureObject = {};
    while (!this.isPunct(")")) {
      const key = this.value();
      if (typeof key !== "string") throw new Error("Axure 데이터: 객체 키가 문자열이 아닙니다.");
      this.expectPunct(",");
      result[key] = this.value();
      if (this.isPunct(",")) this.next();
    }
    this.expectPunct(")");
    return result;
  }
}

function readVarTable(tokens: Token[]): Map<string, AxureValue> {
  const vars = new Map<string, AxureValue>();
  const empty = new Map<string, AxureValue>();
  const reader = new Reader(tokens, empty);
  while (!reader.done()) {
    const name = reader.next();
    if (name.kind !== "ident") throw new Error("Axure 데이터: 변수 이름이 필요합니다.");
    reader.expectPunct("=");
    vars.set(name.text, reader.value());
    if (reader.isPunct(",")) reader.next();
    else break;
  }
  return vars;
}

/** `$axure.loadDocument(...)` / `$axure.loadCurrentPage(...)` 본문을 값으로 읽는다. */
export function parseAxureData(source: string): AxureObject {
  const creator = /var\s+_creator\s*=\s*function\s*\(\)\s*\{\s*return\s+/u.exec(source);
  if (!creator) throw new Error("Axure 데이터: _creator 를 찾지 못했습니다.");
  const afterCreator = source.slice(creator.index + creator[0].length);
  const tableStart = afterCreator.search(/\}\s*;\s*\r?\nvar\s+[A-Za-z_$]/u);
  if (tableStart < 0) throw new Error("Axure 데이터: 변수 테이블을 찾지 못했습니다.");
  const expression = afterCreator.slice(0, tableStart);
  const tableSource = afterCreator
    .slice(tableStart)
    .replace(/^\}\s*;\s*\r?\nvar\s+/u, "")
    .replace(/;\s*return\s+_creator\(\)[\s\S]*$/u, "");

  const vars = readVarTable(tokenize(tableSource));
  const reader = new Reader(tokenize(expression), vars);
  const root = reader.value();
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("Axure 데이터: 최상위 값이 객체가 아닙니다.");
  }
  return root;
}
