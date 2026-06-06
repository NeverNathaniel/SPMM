import { Handle, Position } from 'reactflow';
import { Folder, Globe } from 'lucide-react';

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

// Source Folder Node (Left side)
export const FolderNode = ({ data }) => {
  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '15px', minWidth: '220px' }}>
      <Handle type="source" position={Position.Right} id="a" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '8px', borderRadius: '8px' }}>
          <Folder size={20} color="#6366f1" />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{data.name || 'Unnamed Folder'}</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {data.path ? (data.path.length > 25 ? '...' + data.path.slice(-25) : data.path) : ''}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>Files: {data.file_count || 0}</span>
        <span>Size: {data.size_formatted || '0 B'}</span>
      </div>
    </div>
  );
};

// SharePoint Destination Node (Right side)
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
