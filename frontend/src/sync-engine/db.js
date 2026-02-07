import { openDB } from 'idb';

const DB_NAME = 'farmer-app-db';
const STORE_NAME = 'submissions'; // Changed from 'offline-queue' to 'submissions'

// Migration Note: In a real app we'd handle version bumps to migrate data.
// For this prototype, we'll just bump version and create the new store.
export const initDB = async () => {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('createdAt', 'createdAt');
      }
      // If we had an old store, we could migrate here, but we'll start fresh for simplicity
      if (db.objectStoreNames.contains('offline-queue')) {
        db.deleteObjectStore('offline-queue');
      }
    },
  });
};

export const saveSubmission = async (submission) => {
  const db = await initDB();
  await db.put(STORE_NAME, submission);
};

export const getPendingSubmissions = async () => {
  const db = await initDB();
  // Get all where status is 'queued', 'syncing', or 'uploading'
  const all = await db.getAll(STORE_NAME);
  return all.filter(item => ['queued', 'syncing', 'uploading'].includes(item.status));
};

export const getHistory = async () => {
  const db = await initDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(item => item.status === 'synced' || item.status === 'diagnosis_ready').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export const updateStatus = async (id, status, extraData = {}) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const item = await store.get(id);
  if (item) {
    item.status = status;
    Object.assign(item, extraData); // Merge any extra data like server response
    await store.put(item);
  }
  await tx.done;
}

export const clearAll = async () => {
  const db = await initDB();
  await db.clear(STORE_NAME);
}
