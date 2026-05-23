import { describe, it, expect } from 'vitest';
import { validate } from '../../../src/core/parser/validator.ts';
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

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

  it('should reject RSS 1.0 (unsupported version)', () => {
    const xml =
      '<?xml version="1.0"?><rss version="1.0"><channel><title>RDF</title></channel></rss>';
    const result = validate(xml);
    expect(isErr(result)).toBe(true);
  });

  it('should reject RSS without a version attribute', () => {
    const xml = '<?xml version="1.0"?><rss><channel><title>X</title></channel></rss>';
    const result = validate(xml);
    expect(isErr(result)).toBe(true);
  });

  it('should accept <feed> without an atom namespace as Atom', () => {
    const xml = '<?xml version="1.0"?><feed><title>NoNs</title></feed>';
    const result = validate(xml);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe('atom');
  });

  it('should accept JSON Feed when version string includes jsonfeed', () => {
    const json = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON Feed',
      items: [],
    });
    const result = validate(json);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe('jsonfeed');
  });

  it('should reject JSON object missing the jsonfeed version marker', () => {
    const json = JSON.stringify({ title: 'fake', items: [] });
    const result = validate(json);
    expect(isErr(result)).toBe(true);
  });

  it('should reject JSON object whose version is not a string', () => {
    const json = JSON.stringify({ version: 1.1, title: 'X', items: [] });
    const result = validate(json);
    expect(isErr(result)).toBe(true);
  });

  it('falls through to XML parsing when input starts with { but is not valid JSON', () => {
    // The malformed JSON triggers the catch on JSON.parse; falls into XML
    // path which returns an XML error.
    const result = validate('{this is not valid json');
    expect(isErr(result)).toBe(true);
  });
});
