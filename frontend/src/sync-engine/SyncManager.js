import { addToQueue, getQueue, clearQueueItem } from './db';
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = 'http://localhost:5000/api/sync';

export const saveSubmission = async (data) => {
    const submission = {
        id: uuidv4(),
        data: data,
        createdAt: new Date().toISOString(),
        status: 'queued' // queued, syncing, synced
    };
    await addToQueue(submission);
    return submission;
};

export const syncQueue = async () => {
    const queue = await getQueue();
    if (queue.length === 0) return { synced: 0 };

    console.log("Attempting to sync...", queue.length, "items");

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissions: queue })
        });

        if (response.ok) {
            // If successful, clear them from the queue
            // In a real app we might want to keep them as "history"
            // For now, we remove them to denote successful sync
            for (const item of queue) {
                await clearQueueItem(item.id);
            }
            return { synced: queue.length };
        } else {
            console.error("Sync failed", response.status);
            throw new Error("Server rejected sync");
        }
    } catch (error) {
        console.error("Sync error:", error);
        throw error;
    }
};
