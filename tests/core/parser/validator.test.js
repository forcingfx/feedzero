import { describe, it, expect } from 'vitest';
import { validate } from '../../../src/core/parser/validator.js';
import { isOk, isErr, unwrap } from '../../../src/utils/result.js';

describe('Validator', () => {
  it('should accept valid RSS 2.0', () => {
    const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title></channel></rss>';
    const result = validate(xml);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe('rss');
  });

  it('should accept valid Atom feed', () => {
    const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title></feed>';
    const result = validate(xml);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe('atom');
  });

  it('should reject empty input', () => {
    expect(isErr(validate(''))).toBe(true);
    expect(isErr(validate(null))).toBe(true);
  });

  it('should reject invalid XML', () => {
    const result = validate('<rss><unclosed');
    expect(isErr(result)).toBe(true);
  });

  it('should reject unknown root element', () => {
    const xml = '<?xml version="1.0"?><html><body>Not a feed</body></html>';
    const result = validate(xml);
    expect(isErr(result)).toBe(true);
  });
});
