import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchDepartments, searchDivisions, searchManagers } from './search';

describe('Search API Helpers', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('searchDepartments', () => {
    it('makes correct API call', async () => {
      const mockResponse = {
        items: [
          { id: '1', name: 'Engineering', score: 1.0 },
          { id: '2', name: 'Marketing', score: 0.8 },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const results = await searchDepartments('eng');

      expect(fetch).toHaveBeenCalledWith(
        '/api/search/departments?q=eng',
        expect.objectContaining({
          headers: { 'Accept': 'application/json' },
          credentials: 'include',
        })
      );

      expect(results).toEqual(mockResponse.items);
    });

    it('encodes special characters in query', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchDepartments('test & query');

      expect(fetch).toHaveBeenCalledWith(
        '/api/search/departments?q=test%20%26%20query',
        expect.any(Object)
      );
    });

    it('handles empty results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      const results = await searchDepartments('nonexistent');
      expect(results).toEqual([]);
    });

    it('handles missing items property', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const results = await searchDepartments('test');
      expect(results).toEqual([]);
    });

    it('throws error on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      await expect(searchDepartments('test')).rejects.toThrow('searchDepartments 500');
    });

    it('throws error on invalid JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'Invalid response',
      } as Response);

      await expect(searchDepartments('test')).rejects.toThrow('searchDepartments invalid JSON');
    });

    it('truncates long error messages', async () => {
      const longError = 'a'.repeat(300);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => longError,
      } as Response);

      try {
        await searchDepartments('test');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('searchDepartments 400');
        // Error should be truncated to 200 characters
        expect(error.message.length).toBeLessThanOrEqual(250); // Account for prefix
      }
    });
  });

  describe('searchDivisions', () => {
    it('makes correct API call without departmentId', async () => {
      const mockResponse = {
        items: [
          { id: '1', name: 'Division A', score: 1.0 },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const results = await searchDivisions('div');

      expect(fetch).toHaveBeenCalledWith(
        '/api/search/divisions?q=div',
        expect.any(Object)
      );

      expect(results).toEqual(mockResponse.items);
    });

    it('includes departmentId when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchDivisions('div', 'dept-123');

      expect(fetch).toHaveBeenCalledWith(
        '/api/search/divisions?q=div&departmentId=dept-123',
        expect.any(Object)
      );
    });

    it('handles empty departmentId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchDivisions('div', '');

      const callUrl = (fetch as any).mock.calls[0][0];
      expect(callUrl).toBe('/api/search/divisions?q=div');
    });

    it('throws error on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

      await expect(searchDivisions('test')).rejects.toThrow('searchDivisions 404');
    });

    it('returns typed results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: '1', name: 'Division A', score: 1.0 },
            { id: '2', name: 'Division B' }, // No score
          ],
        }),
      } as Response);

      const results = await searchDivisions('div');

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('name');
      expect(results[0].score).toBe(1.0);
      expect(results[1].score).toBeUndefined();
    });
  });

  describe('searchManagers', () => {
    it('makes correct API call with query only', async () => {
      const mockResponse = {
        items: [
          { id: '1', name: 'John Manager', score: 1.0 },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const results = await searchManagers('john');

      expect(fetch).toHaveBeenCalledWith(
        '/api/search/users?q=john&role=manager',
        expect.any(Object)
      );

      expect(results).toEqual(mockResponse.items);
    });

    it('includes divisionId when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchManagers('john', undefined, 'div-123');

      const callUrl = (fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('divisionId=div-123');
      expect(callUrl).not.toContain('departmentId');
    });

    it('includes departmentId when divisionId not provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchManagers('john', 'dept-123', undefined);

      const callUrl = (fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('departmentId=dept-123');
      expect(callUrl).not.toContain('divisionId');
    });

    it('prioritizes divisionId over departmentId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchManagers('john', 'dept-123', 'div-456');

      const callUrl = (fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('divisionId=div-456');
      expect(callUrl).not.toContain('departmentId');
    });

    it('always includes role=manager parameter', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchManagers('test');

      const callUrl = (fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('role=manager');
    });

    it('throws error on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      } as Response);

      await expect(searchManagers('test')).rejects.toThrow('searchManagers 403');
    });

    it('handles network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(searchManagers('test')).rejects.toThrow('Network error');
    });
  });

  describe('Common behavior', () => {
    it('all functions use credentials: include', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchDepartments('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );

      await searchDivisions('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );

      await searchManagers('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('all functions use Accept: application/json header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      await searchDepartments('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );

      await searchDivisions('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );

      await searchManagers('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Accept': 'application/json' }
        })
      );
    });

    it('all functions return empty array for empty results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      } as Response);

      expect(await searchDepartments('test')).toEqual([]);
      expect(await searchDivisions('test')).toEqual([]);
      expect(await searchManagers('test')).toEqual([]);
    });
  });
});
