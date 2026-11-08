import { describe, expect, it, vi } from 'vitest';
vi.mock('../workers/growth', () => ({ npmStatistics: vi.fn() }));
import { npmStatistics } from '../workers/growth';
import { badge, downloadsBadge } from '../workers/badges';
describe('public npm badge', () => {
  it('renders validated npm statistics, including zero, with honest fallback labels', async () => {
    for (const [status, downloads30d, expected] of [
      ['available', 0, '0 / 30d'],
      ['available', 1500, '1.5K / 30d'],
      ['pending', null, 'pending'],
      ['unavailable', null, 'unavailable'],
    ] as const) {
      vi.mocked(npmStatistics).mockResolvedValue({ status, downloads30d } as Awaited<
        ReturnType<typeof npmStatistics>
      >);
      const response = await downloadsBadge(
        new Request('https://spider.fluri.xyz/readme/npm-downloads.svg'),
      );
      expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
      expect(await response.text()).toContain(expected);
    }
  });
  it('escapes SVG labels and rejects writes', async () => {
    expect(badge('<script>', '"&')).not.toContain('<script>');
    expect(
      (
        await downloadsBadge(
          new Request('https://spider.fluri.xyz/readme/npm-downloads.svg', { method: 'POST' }),
        )
      ).status,
    ).toBe(405);
  });
});
