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

// Source Folder Node (tree). Left handle = incoming parent edge; right
// handle = outgoing edges to child folders and to destinations.
export const FolderNode = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState(null); // null = not yet fetched
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState({ total: 0, truncated: false });

  // Lazily fetch file names the first time the node is expanded (click
  // handler, not an effect — keeps the fetch off the render path).
  const toggle = async (e) => {
    e.stopPropagation();
    const next = !expanded;
    setExpanded(next);
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

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '15px', minWidth: '220px', maxWidth: '300px' }}>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '8px', borderRadius: '8px' }}>
          <Folder size={20} color="#6366f1" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{data.name || 'Unnamed Folder'}</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {data.path ? (data.path.length > 25 ? '...' + data.path.slice(-25) : data.path) : ''}
          </span>
        </div>
        <button
          className="nodrag"
          onClick={toggle}
          title={expanded ? 'Hide files' : 'Show files'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>Files: {data.file_count || 0}</span>
        <span>Size: {data.size_formatted || '0 B'}</span>
      </div>

      {expanded && (
        <div
          className="nodrag nowheel"
          style={{ marginTop: '10px', maxHeight: '180px', overflowY: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}
        >
          {loading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</div>
          ) : files && files.length ? (
            <ul style={{ listStyle: 'disc', margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No files in this folder</div>
          )}
        </div>
      )}
    </div>
  );
};

// SharePoint Destination Node (right side of the canvas)
export const DestinationNode = ({ data }) => {
  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '15px', minWidth: '220px', borderLeft: '3px solid var(--success)' }}>
      <Handle type="target" position={Position.Left} id="a" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '8px', borderRadius: '8px' }}>
          <Globe size={20} color="#10b981" />
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
