import { useState } from 'react';
import axios from 'axios';
import { Handle, Position } from 'reactflow';
import { Folder, Globe, ChevronRight, ChevronDown } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

/**
 * Extract a short display path from a URL string, with safe fallback
 * if the URL is malformed (avoids crashing the React render tree).
 */
function safePathname(url) {
  if (!url) return '';
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

// Source Folder Node. Left handle = incoming parent edge; right handle =
// outgoing edges to child folders and destinations. The node is color-coded
// (data.color), has a tree collapse toggle (left), and a file-list toggle.
export const FolderNode = ({ data }) => {
  const [showFiles, setShowFiles] = useState(false);
  const [files, setFiles] = useState(null); // null = not yet fetched
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState({ total: 0, truncated: false });

  const color = data.color || '#9d6b4e';

  // Lazily fetch file names the first time the list is opened.
  const toggleFiles = async (e) => {
    e.stopPropagation();
    const next = !showFiles;
    setShowFiles(next);
    if (next && files === null && !loading) {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/files`, { params: { path: data.path } });
        setFiles(res.data.files || []);
        setInfo({ total: res.data.total || 0, truncated: !!res.data.truncated });
      } catch {
        setFiles([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleCollapse = (e) => {
    e.stopPropagation();
    data.onToggleCollapse?.(data.path);
  };

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{ padding: '12px 14px', minWidth: '210px', maxWidth: '290px', borderLeft: `3px solid ${color}` }}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        {data.childCount > 0 ? (
          <button
            className="nodrag"
            onClick={toggleCollapse}
            title={data.collapsed ? `Expand ${data.childCount} subfolder(s)` : 'Collapse subfolders'}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }}
          >
            {data.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : (
          <span style={{ width: 16, display: 'inline-block', flexShrink: 0 }} />
        )}

        <div style={{ background: `${color}33`, padding: '7px', borderRadius: '8px', display: 'flex' }}>
          <Folder size={18} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name || 'Unnamed Folder'}
          </h4>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {data.collapsed && data.childCount > 0
              ? `${data.childCount} subfolder${data.childCount > 1 ? 's' : ''} hidden`
              : (data.path ? (data.path.length > 24 ? '...' + data.path.slice(-24) : data.path) : '')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{data.file_count || 0} files · {data.size_formatted || '0 B'}</span>
        <button
          className="nodrag"
          onClick={toggleFiles}
          title={showFiles ? 'Hide files' : 'Show files'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px', padding: 0, fontSize: '0.72rem' }}
        >
          files {showFiles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {showFiles && (
        <div
          className="nodrag nowheel"
          style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}
        >
          {loading ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading…</div>
          ) : files && files.length ? (
            <ul style={{ listStyle: 'disc', margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {files.map((f, i) => (
                <li key={i} style={{ wordBreak: 'break-all' }}>{f}</li>
              ))}
              {info.truncated && (
                <li style={{ listStyle: 'none', marginLeft: '-18px', color: 'var(--text-muted)' }}>
                  … and {info.total - files.length} more
                </li>
              )}
            </ul>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No files in this folder</div>
          )}
        </div>
      )}
    </div>
  );
};

// SharePoint Destination Node (right side). Color-coded by site (data.color).
export const DestinationNode = ({ data }) => {
  const color = data.color || '#7d8a4f';
  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '14px', minWidth: '210px', borderLeft: `3px solid ${color}` }}>
      <Handle type="target" position={Position.Left} id="a" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <div style={{ background: `${color}33`, padding: '8px', borderRadius: '8px', display: 'flex' }}>
          <Globe size={20} color={color} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{data.library_name || 'Library'}</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {safePathname(data.site_url)}
          </span>
        </div>
      </div>
      {data.subfolder && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px' }}>
          ↳ {data.subfolder}
        </div>
      )}
    </div>
  );
};
