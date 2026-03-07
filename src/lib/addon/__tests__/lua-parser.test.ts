import { describe, it, expect } from 'vitest';
import { luaToJson } from '../lua-parser';

describe('luaToJson', () => {
  it('parses a simple dictionary', () => {
    const lua = `WWTCSaved = {
\t["version"] = 123,
\t["battleTag"] = "Player#1234",
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe(123);
    expect(parsed.battleTag).toBe('Player#1234');
  });

  it('handles numeric keys as string keys in dictionaries', () => {
    const lua = `WWTCSaved = {
\t["currencies"] = {
\t\t[3008] = "450:0:0:0:0:0:450",
\t\t[2806] = "88:100:1:88:100:0:88",
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.currencies['3008']).toBe('450:0:0:0:0:0:450');
    expect(parsed.currencies['2806']).toBe('88:100:1:88:100:0:88');
  });

  it('handles arrays (bare values)', () => {
    const lua = `WWTCSaved = {
\t["dailyQuests"] = {
\t\t12345,
\t\t12346,
\t\t12347,
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.dailyQuests).toEqual([12345, 12346, 12347]);
  });

  it('strips Lua comments', () => {
    const lua = `WWTCSaved = {
\t["level"] = 90, -- max level
\t["name"] = "Test",
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.level).toBe(90);
    expect(parsed.name).toBe('Test');
  });

  it('handles nested structures', () => {
    const lua = `WWTCSaved = {
\t["chars"] = {
\t\t["12345678"] = {
\t\t\t["level"] = 90,
\t\t\t["copper"] = 12345678,
\t\t},
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.chars['12345678'].level).toBe(90);
    expect(parsed.chars['12345678'].copper).toBe(12345678);
  });

  it('handles mixed nested arrays and dictionaries', () => {
    const lua = `WWTCSaved = {
\t["chars"] = {
\t\t["12345678"] = {
\t\t\t["level"] = 90,
\t\t\t["dailyQuests"] = {
\t\t\t\t12345,
\t\t\t\t12346,
\t\t\t},
\t\t\t["currencies"] = {
\t\t\t\t[3008] = "450:0:0:0:0:0:450",
\t\t\t},
\t\t},
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.chars['12345678'].level).toBe(90);
    expect(parsed.chars['12345678'].dailyQuests).toEqual([12345, 12346]);
    expect(parsed.chars['12345678'].currencies['3008']).toBe(
      '450:0:0:0:0:0:450',
    );
  });

  it('handles the full sample input from the spec', () => {
    const lua = `WWTCSaved = {
\t["version"] = 123,
\t["battleTag"] = "Player#1234",
\t["chars"] = {
\t\t["12345678"] = {
\t\t\t["level"] = 90,
\t\t\t["copper"] = 12345678,
\t\t\t["currencies"] = {
\t\t\t\t[3008] = "450:0:0:0:0:0:450",
\t\t\t\t[2806] = "88:100:1:88:100:0:88",
\t\t\t},
\t\t\t["dailyQuests"] = { 12345, 12346, 12347 },
\t\t},
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe(123);
    expect(parsed.battleTag).toBe('Player#1234');
    expect(parsed.chars['12345678'].level).toBe(90);
    expect(parsed.chars['12345678'].copper).toBe(12345678);
    expect(parsed.chars['12345678'].currencies['3008']).toBe(
      '450:0:0:0:0:0:450',
    );
    expect(parsed.chars['12345678'].dailyQuests).toEqual([12345, 12346, 12347]);
  });

  it('handles boolean values', () => {
    const lua = `WWTCSaved = {
\t["locked"] = true,
\t["expired"] = false,
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.locked).toBe(true);
    expect(parsed.expired).toBe(false);
  });

  it('handles nil values as null', () => {
    const lua = `WWTCSaved = {
\t["value"] = nil,
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.value).toBeNull();
  });

  it('handles empty tables', () => {
    const lua = `WWTCSaved = {
\t["empty"] = {
\t},
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.empty).toEqual({});
  });

  it('strips comments without ", -- " prefix', () => {
    const lua = `WWTCSaved = {
\t["level"] = 90,-- no space before comment
\t["name"] = "Test", --compact comment
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.level).toBe(90);
    expect(parsed.name).toBe('Test');
  });

  it('handles space-indented lines', () => {
    const lua = `WWTCSaved = {
    ["level"] = 90,
    ["name"] = "Test",
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.level).toBe(90);
    expect(parsed.name).toBe('Test');
  });

  it('does not strip -- inside quoted strings', () => {
    const lua = `WWTCSaved = {
\t["tag"] = "hello--world",
}`;
    const result = luaToJson(lua);
    const parsed = JSON.parse(result);
    expect(parsed.tag).toBe('hello--world');
  });
});
