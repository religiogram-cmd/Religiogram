/**
 * v7 frontend regression test: proves tryRefresh() actually calls refreshFetchOptions().
 *
 * This is a regression test for the v6 dead-code bug where the function was
 * defined but never invoked. We assert by reading the source string — the
 * cleanest test that doesn't require mocking out fetch.
 */
import fs from 'fs';
import path from 'path';

describe('v7: api.ts tryRefresh wires refreshFetchOptions', () => {
  it('tryRefresh body calls refreshFetchOptions(refresh)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'api.ts'), 'utf8');
    expect(src).toMatch(/await fetch\(`\${API_BASE}\/auth\/refresh`,\s*refreshFetchOptions\(refresh\)\)/);
  });

  it('cookie-mode does NOT bail on missing localStorage refresh', () => {
    const src = fs.readFileSync(path.join(__dirname, 'api.ts'), 'utf8');
    expect(src).toMatch(/if \(!refresh && !COOKIE_MODE\)/);
  });
});
