import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Folder, ArrowLeft, X, Check } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function FolderPicker({ onSelect, onClose, initialPath = '~' }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDirectories = useCallback(async (path) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/browse`, { params: { path } });
      setCurrentPath(res.data.current_path);
      setDirectories(res.data.directories);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectories(currentPath);
  }, [currentPath, fetchDirectories]);

  const handleDirClick = (dir) => {
    setCurrentPath(dir.path);
  };

  return (
    <div style={styles.overlay}>
      <div className="glass-panel" style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>Select Folder to Scan</h3>
          <button className="btn btn-secondary" style={{ padding: '4px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        
        <div style={styles.pathBar}>
          <input 
            className="input-field" 
            value={currentPath} 
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchDirectories(currentPath); }}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={() => fetchDirectories(currentPath)}>Go</button>
        </div>

        {error && <div style={{ color: 'var(--danger)', padding: '10px' }}>{error}</div>}

        <div style={styles.listContainer}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : (
            <ul style={styles.list}>
              {directories.map((dir, idx) => (
                <li key={idx} style={styles.listItem} onClick={() => handleDirClick(dir)}>
                  {dir.name === '..' ? <ArrowLeft size={18} /> : <Folder size={18} color="#6366f1" />}
                  <span>{dir.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={styles.footer}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSelect(currentPath)}>
            <Check size={18} /> Select Current Folder
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    width: '600px', maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--border-color)'
  },
  pathBar: {
    display: 'flex', gap: '10px', padding: '16px 20px',
    background: 'rgba(0,0,0,0.1)'
  },
  listContainer: {
    flex: 1, overflowY: 'auto', minHeight: '300px'
  },
  list: {
    listStyle: 'none', padding: 0, margin: 0
  },
  listItem: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    cursor: 'pointer', transition: 'background 0.2s'
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '12px',
    padding: '16px 20px', borderTop: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.2)'
  }
};
