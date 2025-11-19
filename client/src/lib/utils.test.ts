import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className utility)', () => {
  it('merges class names correctly', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const result = cn('foo', false && 'bar', 'baz');
    expect(result).toBe('foo baz');
  });

  it('merges tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4');
    // tailwind-merge should keep only px-4
    expect(result).toBe('py-1 px-4');
  });

  it('handles arrays of classes', () => {
    const result = cn(['foo', 'bar'], 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('handles objects with conditional classes', () => {
    const result = cn({
      foo: true,
      bar: false,
      baz: true,
    });
    expect(result).toBe('foo baz');
  });

  it('handles undefined and null', () => {
    const result = cn('foo', undefined, null, 'bar');
    expect(result).toBe('foo bar');
  });

  it('handles empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('handles duplicate classes', () => {
    const result = cn('foo', 'bar', 'foo');
    // clsx/tailwind-merge may or may not deduplicate non-Tailwind classes
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('handles complex tailwind conflicts', () => {
    const result = cn('text-red-500 hover:text-blue-500', 'text-green-500');
    // Should keep hover:text-blue-500 but replace text-red-500 with text-green-500
    expect(result).toContain('text-green-500');
    expect(result).toContain('hover:text-blue-500');
  });
});
