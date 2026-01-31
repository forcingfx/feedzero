import { ok, err } from '../../utils/result.js';

/**
 * Validate that XML string is a recognizable feed format.
 * Returns the feed type ('rss' or 'atom') or an error.
 */
export function validate(xml) {
  if (!xml || typeof xml !== 'string') {
    return err('Feed content is empty or not a string');
  }

  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return err(`Invalid XML: ${parseError.textContent.slice(0, 200)}`);
  }

  const root = doc.documentElement;
  if (!root) {
    return err('No root element found');
  }

  const tag = root.tagName.toLowerCase();

  if (tag === 'rss') {
    const version = root.getAttribute('version');
    if (version && version.startsWith('2')) {
      return ok('rss');
    }
    return err(`Unsupported RSS version: ${version}`);
  }

  if (tag === 'feed') {
    const ns = root.namespaceURI || '';
    if (ns.includes('atom') || ns.includes('Atom')) {
      return ok('atom');
    }
    // Also accept <feed> without namespace as Atom
    return ok('atom');
  }

  return err(`Unrecognized feed format: <${root.tagName}>`);
}
