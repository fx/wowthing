enum StructureType {
  Array,
  Dictionary,
}

export function luaToJson(luaText: string): string {
  // Strip prefix (e.g. "WWTCSaved = ") and find the first '{'
  const firstBrace = luaText.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No opening brace found in Lua text');
  }
  // Start after the opening '{' — the recurse function will process
  // the inner content and produce the structure
  const stripped = luaText.substring(firstBrace + 1);

  const converter = new LuaToJsonConverter(stripped.length);
  const lines = stripped.split(/\r?\n/);
  const state = { index: 0, lines };
  converter.recurse(state, '');

  // Remove trailing commas in a string-aware way to produce valid JSON.
  return removeTrailingCommas(converter.toString());
}

/**
 * Remove trailing commas from a JSON-like string without touching commas
 * inside string values. A comma is "trailing" if the next non-whitespace
 * character is ']', '}', or end-of-input.
 */
function removeTrailingCommas(jsonLike: string): string {
  let result = '';
  const len = jsonLike.length;
  let inString = false;
  let escape = false;

  for (let i = 0; i < len; i++) {
    const ch = jsonLike[i];

    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === ',') {
      // Look ahead for the next non-whitespace character.
      let j = i + 1;
      while (j < len && /\s/.test(jsonLike[j])) {
        j++;
      }
      const next = j < len ? jsonLike[j] : '';
      // Skip trailing comma before ']', '}', or end-of-input
      if (!next || next === ']' || next === '}') {
        continue;
      }
      result += ch;
      continue;
    }

    result += ch;
  }

  return result;
}

interface LineState {
  index: number;
  lines: string[];
}

class LuaToJsonConverter {
  private parts: string[] = [];

  constructor(_luaSize: number) {
    this.parts = [];
  }

  toString(): string {
    return this.parts.join('');
  }

  recurse(state: LineState, outerKey: string): void {
    let wroteOpener = false;
    const initialLength = this.parts.length;
    let type = StructureType.Array;

    while (state.index < state.lines.length) {
      const rawLine = state.lines[state.index];
      state.index++;

      // Strip leading whitespace (tabs and spaces)
      const startIndex = rawLine.search(/[^\s]/);
      if (startIndex === -1) {
        continue;
      }

      let endIndex = rawLine.length;

      // Strip Lua comment suffixes: find "--" outside of quoted strings
      const commentIndex = findLuaComment(rawLine, startIndex);
      if (commentIndex > startIndex) {
        endIndex = commentIndex;
        // Also strip trailing whitespace and comma before comment
        while (endIndex > startIndex && /[\s,]/.test(rawLine[endIndex - 1])) {
          endIndex--;
        }
      }

      // Strip trailing comma
      if (rawLine[endIndex - 1] === ',') {
        endIndex--;
      }

      const line = rawLine.substring(startIndex, endIndex);

      if (line[0] === '{') {
        if (!wroteOpener) {
          this.writeKey(outerKey);
        }
        wroteOpener = this.writeOpener(wroteOpener, type);
        this.recurse(state, '');
        continue;
      }

      if (line[0] === '}') {
        if (this.parts.length > initialLength) {
          this.writeCloser(type);
        } else {
          // Empty table: emit a valid JSON structure
          if (!wroteOpener) {
            this.writeKey(outerKey);
            type = StructureType.Dictionary;
            wroteOpener = this.writeOpener(wroteOpener, type);
          }
          this.writeCloser(type);
        }
        break;
      }

      // ["foo"] = value  or  [123] = value
      if (line[0] === '[') {
        const closeBracket = line.indexOf(']');
        const keySpan = line.substring(1, closeBracket);
        const eqIndex = line.indexOf(' = ');
        const valueSpan = line.substring(eqIndex + 3);

        type = StructureType.Dictionary;

        if (!wroteOpener) {
          this.writeKey(outerKey);
        }
        wroteOpener = this.writeOpener(wroteOpener, type);

        if (valueSpan[0] === '{') {
          // Check for inline table: { value1, value2, ... }
          const closingBrace = valueSpan.lastIndexOf('}');
          if (closingBrace > 0) {
            // Inline table — parse the contents directly
            this.writeKey(keySpan);
            this.parseInlineTable(valueSpan.substring(1, closingBrace));
            this.parts.push(',');
          } else {
            this.recurse(state, keySpan);
          }
          continue;
        }

        this.writeKey(keySpan);
        this.writeValue(valueSpan);
        this.parts.push(',');
      } else {
        // Array element (bare value)
        if (!wroteOpener) {
          this.writeKey(outerKey);
        }
        wroteOpener = this.writeOpener(wroteOpener, type);

        this.writeValue(line);
        this.parts.push(',');
      }
    }
  }

  private writeOpener(written: boolean, type: StructureType): boolean {
    if (!written) {
      this.parts.push(type === StructureType.Array ? '[' : '{');
    }
    return true;
  }

  private writeCloser(type: StructureType): void {
    this.parts.push(type === StructureType.Array ? ']' : '}');
    this.parts.push(',');
  }

  private parseInlineTable(content: string): void {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      this.parts.push('[]');
      return;
    }

    // Split by comma, trim each element
    const elements = trimmed.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
    if (elements.length === 0) {
      this.parts.push('[]');
      return;
    }

    // Detect if this is a dictionary or array by checking first element
    const isDictionary = elements[0].startsWith('[');
    if (isDictionary) {
      this.parts.push('{');
      for (const elem of elements) {
        const closeBracket = elem.indexOf(']');
        const keySpan = elem.substring(1, closeBracket);
        const eqIdx = elem.indexOf(' = ');
        const val = elem.substring(eqIdx + 3);
        this.writeKey(keySpan);
        this.writeValue(val);
        this.parts.push(',');
      }
      this.parts.push('}');
    } else {
      this.parts.push('[');
      for (const elem of elements) {
        this.writeValue(elem);
        this.parts.push(',');
      }
      this.parts.push(']');
    }
  }

  private writeValue(value: string): void {
    if (value === 'nil') {
      this.parts.push('null');
    } else {
      this.parts.push(value);
    }
  }

  private writeKey(key: string): void {
    if (key.length === 0) {
      return;
    }

    if (key[0] === '"') {
      this.parts.push(key);
      this.parts.push(':');
    } else {
      this.parts.push('"');
      this.parts.push(key);
      this.parts.push('"');
      this.parts.push(':');
    }
  }
}

/**
 * Find the index of a Lua line comment ("--") that is not inside a quoted string.
 * Returns -1 if no comment is found.
 */
function findLuaComment(line: string, start: number): number {
  let inString = false;
  let stringQuote = '';
  for (let i = start; i < line.length - 1; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === '-' && line[i + 1] === '-') {
      return i;
    }
  }
  return -1;
}
