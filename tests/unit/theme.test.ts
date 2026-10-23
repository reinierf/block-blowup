import { describe, expect, it } from 'vitest';
import { cssVariables, cssVariablesRule, theme } from '../../src/render/theme';

describe('cssVariablesRule', () => {
  it('is a :root rule declaring every theme variable', () => {
    const rule = cssVariablesRule();
    expect(rule.startsWith(':root{')).toBe(true);
    expect(rule.endsWith('}')).toBe(true);
    for (const [name, value] of Object.entries(cssVariables())) {
      expect(rule).toContain(`${name}:${value}`);
    }
  });

  it('includes the page background, so the first paint is not white', () => {
    expect(cssVariablesRule()).toContain(`--bg-top:${theme.bgTop}`);
    expect(cssVariablesRule()).toContain(`--bg-bottom:${theme.bgBottom}`);
  });
});
