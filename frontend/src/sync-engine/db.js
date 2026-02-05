import { openDB } from 'idb';

const DB_NAME = 'farmer-app-db';
const STORE_NAME = 'offline-queue';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const addToQueue = async (submission) => {
  const db = await initDB();
  await db.put(STORE_NAME, submission);
};

export const getQueue = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const clearQueueItem = async (id) => {
    const db = await initDB();
    await db.delete(STORE_NAME, id);
}

export const clearQueue = async () => {
    const db = await initDB();
    await db.clear(STORE_NAME);
}
