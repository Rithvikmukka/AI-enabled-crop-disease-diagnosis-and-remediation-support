import { useState, useEffect } from 'react';
import './App.css';
import { saveSubmission, syncQueue } from './sync-engine/SyncManager';
import { getPendingSubmissions, getHistory } from './sync-engine/db';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [formData, setFormData] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [syncStatus, setSyncStatus] = useState('Idle');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load
    refreshData();

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

  const refreshData = async () => {
    const q = await getPendingSubmissions();
    const h = await getHistory();
    setQueue(q);
    setHistory(h);
  };

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      // In a real app, revoke old URL to avoid leaks
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData && !imageFile) return;

    await saveSubmission({ text: formData, timestamp: Date.now() }, imageFile);

    // Reset form
    setFormData('');
    setImageFile(null);
    setPreviewUrl(null);

    await refreshData();

    // If online, try to sync immediately
    if (navigator.onLine) {
      handleSync();
    }
  };

  const handleSync = async () => {
    setSyncStatus('Syncing...');

    // Poll for updates while syncing so UI shows progress
    const intervalId = setInterval(refreshData, 500);

    try {
      const result = await syncQueue();
      if (result.synced > 0) {
        setSyncStatus(`Synced ${result.synced} items`);
      } else {
        setSyncStatus('Idle');
      }
    } catch (e) {
      setSyncStatus('Sync Failed');
    } finally {
      clearInterval(intervalId);
      await refreshData();
      setTimeout(() => setSyncStatus('Idle'), 3000);
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
          <h2>New Crop Submission</h2>
          <form onSubmit={handleSubmit}>
            <textarea
              value={formData}
              onChange={(e) => setFormData(e.target.value)}
              placeholder="Enter crop notes..."
            />

            <div className="file-input-wrapper">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                id="camera-input"
              />
              <label htmlFor="camera-input" className="camera-btn">
                📷 {imageFile ? 'Change Photo' : 'Take Photo'}
              </label>
            </div>

            {previewUrl && (
              <div className="image-preview">
                <img src={previewUrl} alt="Preview" />
              </div>
            )}

            <button type="submit" className="submit-btn">
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
              <div key={item.id} className={`queue-item ${item.status}`}>
                <span className="id">ID: {item.id.slice(0, 8)}...</span>
                <span className="data">
                  {item.image ? '📷 [Image] ' : ''}
                  {item.data.text}
                </span>
                <span className="badge">
                  {item.status === 'uploading' ? '📤 Uploading...' : '⏳ Pending'}
                </span>
              </div>
            ))}
            {queue.length === 0 && <p className="empty-msg">No pending items.</p>}
          </div>
        </section>

        <section className="history-section">
          <h2>Diagnosis Status / History</h2>
          <div className="queue-list">
            {history.map((item) => (
              <div key={item.id} className="queue-item synced">
                <span className="id">ID: {item.id.slice(0, 8)}...</span>
                <span className="data">
                  {item.image ? '📷 [Image] ' : ''}
                  {item.data.text}
                </span>
                <div className="status-group">
                  <span className="badge success">✅ Synced</span>
                  {item.serverMessage && <span className="server-msg">({item.serverMessage})</span>}
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="empty-msg">No history.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
