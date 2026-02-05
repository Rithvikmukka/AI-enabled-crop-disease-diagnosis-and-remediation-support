import { useState, useEffect } from 'react';
import './App.css';
import { saveSubmission, syncQueue } from './sync-engine/SyncManager';
import { getQueue } from './sync-engine/db';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [formData, setFormData] = useState('');
  const [syncStatus, setSyncStatus] = useState('Idle');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load of queue
    refreshQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      handleSync();
    }
  }, [isOnline]);

  const refreshQueue = async () => {
    const q = await getQueue();
    setQueue(q);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData) return;

    await saveSubmission({ text: formData, timestamp: Date.now() });
    setFormData('');
    await refreshQueue();

    // If online, try to sync immediately
    if (navigator.onLine) {
      handleSync();
    }
  };

  const handleSync = async () => {
    setSyncStatus('Syncing...');
    try {
      const result = await syncQueue();
      setSyncStatus(`Synced ${result.synced} items`);
      await refreshQueue();
      setTimeout(() => setSyncStatus('Idle'), 3000);
    } catch (e) {
      setSyncStatus('Sync Failed');
    }
  };

  return (
    <div className={`app-container ${isOnline ? 'online' : 'offline'}`}>
      <header>
        <h1>Farmer Sync & Glue</h1>
        <div className="status-badge">
          {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
        </div>
      </header>

      <main>
        <section className="input-section">
          <h2>New Submission</h2>
          <form onSubmit={handleSubmit}>
            <textarea
              value={formData}
              onChange={(e) => setFormData(e.target.value)}
              placeholder="Enter crop data or notes..."
            />
            <button type="submit">
              {isOnline ? 'Submit Cloud' : 'Save Offline'}
            </button>
          </form>
        </section>

        <section className="queue-section">
          <div className="queue-header">
            <h2>Pending Uploads ({queue.length})</h2>
            <button onClick={handleSync} disabled={queue.length === 0 || !isOnline} className="sync-btn">
              Force Sync 🔄
            </button>
          </div>

          <div className="sync-status">Status: {syncStatus}</div>

          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <span className="id">ID: {item.id.slice(0, 8)}...</span>
                <span className="data">{item.data.text}</span>
                <span className="badge">Pending</span>
              </div>
            ))}
            {queue.length === 0 && <p className="empty-msg">No pending items.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
