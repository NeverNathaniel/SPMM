import { useState } from 'react';
import axios from 'axios';
import { X, Plus } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

/**
 * Modal form for adding a SharePoint destination. Replaces the old
 * window.prompt() flow, which is blocked in sandboxed preview iframes and
 * provided no validation.
 */
export default function AddDestinationModal({ onClose, onCreated }) {
  const [siteUrl, setSiteUrl] = useState('');
  const [library, setLibrary] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    try {
      new URL(siteUrl);
    } catch {
      setError('Enter a valid absolute URL, including https://');
      return;
    }
    if (!library.trim()) {
      setError('Library name is required');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/destinations`, {
        site_url: siteUrl.trim(),
        library_name: library.trim(),
        subfolder: subfolder.trim() || null,
      });
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add destination');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onClose?.();
  };

  return (
    <div style={styles.overlay}>
      <div className="glass-panel" style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>Add SharePoint Destination</h3>
          <button className="btn btn-secondary" style={{ padding: '4px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          <label style={styles.label}>Site URL</label>
          <input
            className="input-field"
            autoFocus
            placeholder="https://contoso.sharepoint.com/sites/HR"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            onKeyDown={onKeyDown}
          />

          <label style={styles.label}>Library Name</label>
          <input
            className="input-field"
            placeholder="Documents"
            value={library}
            onChange={(e) => setLibrary(e.target.value)}
            onKeyDown={onKeyDown}
          />

          <label style={styles.label}>Subfolder (optional)</label>
          <input
            className="input-field"
            placeholder="Archive/2024"
            value={subfolder}
            onChange={(e) => setSubfolder(e.target.value)}
            onKeyDown={onKeyDown}
          />

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>}
        </div>

        <div style={styles.footer}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            <Plus size={16} /> {saving ? 'Adding…' : 'Add Destination'}
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
    zIndex: 1000,
  },
  modal: {
    width: '480px', maxWidth: '90vw',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
  },
  body: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px',
  },
  label: {
    fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px',
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '12px',
    padding: '16px 20px', borderTop: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.2)',
  },
};
