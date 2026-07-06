import { describe, expect, it } from 'vitest';

import { getHelpFaqSections } from '@/domain/help/faq';

describe('help faq content', () => {
  it('includes franchise guidance and public contact paths without exposing numeric ratings', () => {
    const sections = getHelpFaqSections();
    const allText = JSON.stringify(sections).toLowerCase();

    expect(sections.map((section) => section.title)).toContain('Contact');
    expect(allText).toContain('marlollc@icloud.com');
    expect(allText).toContain('franchisemobile');
    expect(allText).toContain('letter grades');
    expect(allText).toContain('league hub');
    expect(allText).toContain('sport context');
    expect(allText).toContain('5-out');
    expect(allText).toContain('two defenses');
    expect(allText).toContain('two counters');
    expect(allText).not.toContain('inside the nba');
    expect(allText).not.toContain('basketball context');
    expect(allText).not.toContain('numeric ratings');
  });
});
