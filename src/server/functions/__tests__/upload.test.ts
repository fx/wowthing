import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { parseAddonUpload } from '../upload';

describe('parseAddonUpload', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid Lua addon data', () => {
    const lua = [
      'WWTCSaved = {',
      '["version"] = 1,',
      '["chars"] = {',
      '  ["12345"] = {',
      '    ["level"] = 80,',
      '  },',
      '},',
      '}',
    ].join('\n');
    const result = parseAddonUpload(lua);
    expect(result.version).toBe(1);
    expect(result.chars['12345'].level).toBe(80);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs and re-throws on invalid Lua text (no opening brace)', () => {
    const lua = 'this is not lua at all';
    expect(() => parseAddonUpload(lua)).toThrow('No opening brace');
    expect(errorSpy).toHaveBeenCalledWith(
      '[upload] luaToJson failed:',
      expect.stringContaining('No opening brace'),
      '| input length:',
      22,
    );
  });

  it('logs and re-throws on malformed JSON from luaToJson', () => {
    // Lua text that produces invalid JSON: opening brace with bad content
    const lua = '{ [["badkey = }';
    expect(() => parseAddonUpload(lua)).toThrow();
    // Either luaToJson or JSON.parse will fail; verify console.error was called
    expect(errorSpy).toHaveBeenCalled();
    const firstCall = errorSpy.mock.calls[0];
    expect(firstCall[0]).toMatch(/^\[upload\]/);
  });

  it('logs and re-throws on schema validation failure (missing version)', () => {
    // Valid Lua structure but missing required "version" field
    const lua = [
      '{',
      '["chars"] = {',
      '  ["1"] = {',
      '    ["level"] = 80,',
      '  },',
      '},',
      '}',
    ].join('\n');
    expect(() => parseAddonUpload(lua)).toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[upload] schema validation failed:',
      expect.stringContaining('version'),
      '| top-level keys:',
      expect.arrayContaining(['chars']),
    );
  });

  it('logs and re-throws on schema validation failure (invalid chars type)', () => {
    const lua = '{\n["version"] = 1,\n["chars"] = "not-an-object",\n}';
    expect(() => parseAddonUpload(lua)).toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[upload] schema validation failed:',
      expect.stringContaining('chars'),
      '| top-level keys:',
      expect.arrayContaining(['version', 'chars']),
    );
  });

  it('logs input length instead of raw content in luaToJson error log', () => {
    const longInput = 'x'.repeat(500);
    expect(() => parseAddonUpload(longInput)).toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const call = errorSpy.mock.calls[0];
    // call args: '[upload] luaToJson failed:', message, '| input length:', length
    expect(call[0]).toBe('[upload] luaToJson failed:');
    expect(call[2]).toBe('| input length:');
    expect(call[3]).toBe(500);
  });
});
