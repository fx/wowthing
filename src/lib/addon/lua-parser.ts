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

  // The converter produces trailing commas after values and closers.
  // Remove them to produce valid JSON.
  let result = converter.toString();
  // Remove trailing comma before ] or }
  result = result.replace(/,([}\]])/g, '$1');
  // Remove final trailing comma
  result = result.replace(/,$/, '');

  return result;
}

interface LineState {
  index: number;
  lines: string[];
}

class LuaToJsonConverter {
  private parts: string[] = [];

  constructor(luaSize: number) {
    // Pre-allocate hint (not strictly needed in JS but mirrors C# intent)
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

      // Strip leading tabs/whitespace
      const startIndex = rawLine.search(/[^\t]/);
      if (startIndex === -1) {
        continue;
      }

      let endIndex = rawLine.length;

      // Strip ", -- " comment suffixes
      const commentIndex = rawLine.lastIndexOf(', -- ');
      if (commentIndex > 0) {
        endIndex = commentIndex;
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
