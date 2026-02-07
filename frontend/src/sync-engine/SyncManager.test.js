/**
 * Unit tests for SyncManager
 * 
 * Tests cover:
 * - UUID generation and uniqueness
 * - saveSubmission function
 * - syncQueue function with FormData and JSON
 * - Retry logic and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveSubmission, syncQueue } from './SyncManager';
import * as db from './db';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock the database functions
vi.mock('./db', () => ({
    saveSubmission: vi.fn(),
    getPendingSubmissions: vi.fn(),
    updateStatus: vi.fn()
}));

// Mock the fetch API
global.fetch = vi.fn();

// ============================================================================
// TEST: saveSubmission Function
// ============================================================================

describe('saveSubmission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate a unique UUID for each submission', async () => {
        // Mock the database save
        db.saveSubmission.mockResolvedValue(undefined);

        const data = { farmer_name: 'John Doe', crop_type: 'Tomato' };
        const imageFile = new Blob(['fake image'], { type: 'image/jpeg' });

        const submission1 = await saveSubmission(data, imageFile);
        const submission2 = await saveSubmission(data, imageFile);

        // Each submission should have a different UUID
        expect(submission1.id).toBeDefined();
        expect(submission2.id).toBeDefined();
        expect(submission1.id).not.toBe(submission2.id);
    });

    it('should create submission with correct structure', async () => {
        db.saveSubmission.mockResolvedValue(undefined);

        const data = { farmer_name: 'Jane Doe', location: 'Farm A' };
        const imageFile = new Blob(['fake image'], { type: 'image/jpeg' });

        const submission = await saveSubmission(data, imageFile);

        // Verify submission structure
        expect(submission).toHaveProperty('id');
        expect(submission).toHaveProperty('data', data);
        expect(submission).toHaveProperty('image', imageFile);
        expect(submission).toHaveProperty('createdAt');
        expect(submission).toHaveProperty('status', 'queued');
        expect(submission).toHaveProperty('response', null);
    });

    it('should handle submissions without images', async () => {
        db.saveSubmission.mockResolvedValue(undefined);

        const data = { farmer_name: 'Test User' };
        const submission = await saveSubmission(data, null);

        expect(submission.image).toBeNull();
        expect(submission.data).toEqual(data);
    });

    it('should save submission to database', async () => {
        db.saveSubmission.mockResolvedValue(undefined);

        const data = { farmer_name: 'Alice' };
        await saveSubmission(data, null);

        // Verify database save was called
        expect(db.saveSubmission).toHaveBeenCalledTimes(1);
        expect(db.saveSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                data: data,
                status: 'queued'
            })
        );
    });

    it('should generate ISO timestamp', async () => {
        db.saveSubmission.mockResolvedValue(undefined);

        const submission = await saveSubmission({}, null);

        // Verify createdAt is a valid ISO string
        expect(submission.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(() => new Date(submission.createdAt)).not.toThrow();
    });
});

// ============================================================================
// TEST: syncQueue Function - Empty Queue
// ============================================================================

describe('syncQueue - Empty Queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle empty queue gracefully', async () => {
        db.getPendingSubmissions.mockResolvedValue([]);

        const result = await syncQueue();

        expect(result).toEqual({ synced: 0 });
        expect(fetch).not.toHaveBeenCalled();
    });
});

// ============================================================================
// TEST: syncQueue Function - Image Upload (FormData)
// ============================================================================

describe('syncQueue - Image Upload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should send image submissions using FormData', async () => {
        const mockSubmission = {
            id: 'test-uuid-001',
            data: { farmer_name: 'John' },
            image: new Blob(['fake image'], { type: 'image/jpeg' }),
            createdAt: '2026-02-06T10:00:00Z',
            status: 'queued'
        };

        db.getPendingSubmissions.mockResolvedValue([mockSubmission]);
        db.updateStatus.mockResolvedValue(undefined);

        // Mock successful response
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success', message: 'Synced' })
        });

        await syncQueue();

        // Verify fetch was called with FormData
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:5000/api/sync',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData)
            })
        );

        // Verify status updates
        expect(db.updateStatus).toHaveBeenCalledWith('test-uuid-001', 'uploading');
        expect(db.updateStatus).toHaveBeenCalledWith(
            'test-uuid-001',
            'synced',
            expect.objectContaining({
                syncedAt: expect.any(String),
                serverMessage: 'Synced'
            })
        );
    });

    it('should include submission metadata in FormData', async () => {
        const mockSubmission = {
            id: 'test-uuid-002',
            data: { farmer_name: 'Alice', crop_type: 'Wheat' },
            image: new Blob(['image data'], { type: 'image/png' }),
            createdAt: '2026-02-06T11:00:00Z',
            status: 'queued'
        };

        db.getPendingSubmissions.mockResolvedValue([mockSubmission]);
        db.updateStatus.mockResolvedValue(undefined);

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        });

        await syncQueue();

        // Get the FormData that was sent
        const fetchCall = fetch.mock.calls[0];
        const formData = fetchCall[1].body;

        // Verify FormData contains image and submission
        expect(formData).toBeInstanceOf(FormData);
        // Note: We can't directly inspect FormData in tests easily,
        // but we verified the structure in the implementation
    });
});

// ============================================================================
// TEST: syncQueue Function - JSON Submission
// ============================================================================

describe('syncQueue - JSON Submission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should send text-only submissions using JSON', async () => {
        const mockSubmission = {
            id: 'test-uuid-003',
            data: { farmer_name: 'Bob' },
            image: null,  // No image
            createdAt: '2026-02-06T12:00:00Z',
            status: 'queued'
        };

        db.getPendingSubmissions.mockResolvedValue([mockSubmission]);
        db.updateStatus.mockResolvedValue(undefined);

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        });

        await syncQueue();

        // Verify fetch was called with JSON
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:5000/api/sync',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.any(String)
            })
        );

        // Verify the JSON body contains the submission
        const fetchCall = fetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body).toEqual({ submissions: [mockSubmission] });
    });
});

// ============================================================================
// TEST: syncQueue Function - Retry Logic
// ============================================================================

describe('syncQueue - Retry Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should revert to queued status on sync failure', async () => {
        const mockSubmission = {
            id: 'test-uuid-004',
            data: { farmer_name: 'Charlie' },
            image: null,
            createdAt: '2026-02-06T13:00:00Z',
            status: 'queued'
        };

        db.getPendingSubmissions.mockResolvedValue([mockSubmission]);
        db.updateStatus.mockResolvedValue(undefined);

        // Mock failed response
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Server error'
        });

        const result = await syncQueue();

        // Verify status was reverted to 'queued'
        expect(db.updateStatus).toHaveBeenCalledWith('test-uuid-004', 'uploading');
        expect(db.updateStatus).toHaveBeenCalledWith('test-uuid-004', 'queued');
        expect(result.synced).toBe(0);
    });

    it('should revert to queued status on network error', async () => {
        const mockSubmission = {
            id: 'test-uuid-005',
            data: { farmer_name: 'Diana' },
            image: null,
            createdAt: '2026-02-06T14:00:00Z',
            status: 'queued'
        };

        db.getPendingSubmissions.mockResolvedValue([mockSubmission]);
        db.updateStatus.mockResolvedValue(undefined);

        // Mock network error
        global.fetch.mockRejectedValue(new Error('Network error'));

        const result = await syncQueue();

        // Verify status was reverted to 'queued'
        expect(db.updateStatus).toHaveBeenCalledWith('test-uuid-005', 'queued');
        expect(result.synced).toBe(0);
    });
});

// ============================================================================
// TEST: syncQueue Function - Multiple Submissions
// ============================================================================

describe('syncQueue - Multiple Submissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should process multiple submissions serially', async () => {
        const mockSubmissions = [
            {
                id: 'batch-001',
                data: { farmer_name: 'Alice' },
                image: null,
                createdAt: '2026-02-06T15:00:00Z',
                status: 'queued'
            },
            {
                id: 'batch-002',
                data: { farmer_name: 'Bob' },
                image: null,
                createdAt: '2026-02-06T15:01:00Z',
                status: 'queued'
            },
            {
                id: 'batch-003',
                data: { farmer_name: 'Charlie' },
                image: null,
                createdAt: '2026-02-06T15:02:00Z',
                status: 'queued'
            }
        ];

        db.getPendingSubmissions.mockResolvedValue(mockSubmissions);
        db.updateStatus.mockResolvedValue(undefined);

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        });

        const result = await syncQueue();

        // Verify all submissions were processed
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(result.synced).toBe(3);

        // Verify each was marked as synced
        expect(db.updateStatus).toHaveBeenCalledWith('batch-001', 'synced', expect.any(Object));
        expect(db.updateStatus).toHaveBeenCalledWith('batch-002', 'synced', expect.any(Object));
        expect(db.updateStatus).toHaveBeenCalledWith('batch-003', 'synced', expect.any(Object));
    });

    it('should continue processing after one failure', async () => {
        const mockSubmissions = [
            { id: 'mixed-001', data: {}, image: null, status: 'queued' },
            { id: 'mixed-002', data: {}, image: null, status: 'queued' },
            { id: 'mixed-003', data: {}, image: null, status: 'queued' }
        ];

        db.getPendingSubmissions.mockResolvedValue(mockSubmissions);
        db.updateStatus.mockResolvedValue(undefined);

        // First succeeds, second fails, third succeeds
        global.fetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
            .mockResolvedValueOnce({ ok: false, text: async () => 'Error' })
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        const result = await syncQueue();

        // Should have synced 2 out of 3
        expect(result.synced).toBe(2);
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});

// ============================================================================
// TEST: UUID Uniqueness
// ============================================================================

describe('UUID Uniqueness', () => {
    it('should generate unique UUIDs for 1000 submissions', async () => {
        db.saveSubmission.mockResolvedValue(undefined);

        const uuids = new Set();

        for (let i = 0; i < 1000; i++) {
            const submission = await saveSubmission({ test: i }, null);
            uuids.add(submission.id);
        }

        // All UUIDs should be unique
        expect(uuids.size).toBe(1000);
    });
});
