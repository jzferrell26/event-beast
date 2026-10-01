import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const prd = 'library/requirements/in-work/prd-002-pressure-monkey-qualification';
const files = ['README.md', 'docs/PRESSURE-MONKEY.md', 'docs/POST-MOMENTUM-BUILDER-PRODUCT.md',
  'library/requirements/backlog/README.md', 'library/requirements/in-work/README.md',
  ...['prd-002-pressure-monkey-qualification-index.md','prd-002a-capacity-and-workload.md','prd-002b-failure-and-recovery.md','prd-002c-implementation-and-acceptance.md'].map(file => prd + '/' + file)];
describe('repository overview and active reliability documentation', () => {
  it.each(files)('keeps local Markdown links reachable: %s', file => {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^(https?:|mailto:)/.test(destination)) continue;
      expect(existsSync(path.resolve(path.dirname(file), destination)), `${file} -> ${destination}`).toBe(true);
    }
  });
  it('documents only npm commands that exist and does not call unrun capacity a pass', () => {
    const readme = readFileSync('README.md', 'utf8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const match of readme.matchAll(/npm run ([\w:-]+)/g)) expect(pkg.scripts[match[1]], match[1]).toBeTruthy();
    expect(readme).toContain('Actual 500-session results remain unqualified');
    expect(readme).toContain('not lock-screen push notifications');
  });
});
