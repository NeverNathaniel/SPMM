import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { Play, Database, Plus, FolderOpen, Download, ShieldCheck } from 'lucide-react';
import { FolderNode, DestinationNode } from './components/CustomNodes';
import FolderPicker from './components/FolderPicker';
import AddDestinationModal from './components/AddDestinationModal';

// Defined outside the component to avoid React Flow warning #002
const nodeTypes = {
  folder: FolderNode,
  destination: DestinationNode,
};

const API_BASE = 'http://127.0.0.1:8000/api';

// Tree layout: deeper folders shift right, each node gets its own row.
const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 96;

// Earth-tone palette used for both per-folder default colors and site colors.
const EARTH_PALETTE = [
  '#c08552', // clay
  '#7e8a55', // moss
  '#b25d3e', // rust
  '#caa14b', // amber
  '#6f8a73', // sage
  '#9d6b4e', // terracotta-brown
  '#88794a', // olive-tan
  '#5f7f78', // muted teal-green
];

// Stable per-folder default color derived from its path.
function defaultFolderColor(path) {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
  return EARTH_PALETTE[h % EARTH_PALETTE.length];
}

const destKey = (d) => `${d.site_url}-${d.library_name}-${d.subfolder || ''}`;
const destId = (d) => `dest-${destKey(d)}`;

// Place destination nodes just to the right of the deepest folder column.
function computeDestX(folderNodes) {
  const depths = folderNodes.filter(n => n.type === 'folder').map(n => n.data.depth || 0);
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  return Math.max(900, 40 + (maxDepth + 2) * COLUMN_WIDTH);
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [scanPath, setScanPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showDestModal, setShowDestModal] = useState(false);

  // Source data — held in refs for synchronous access inside rebuild().
  const foldersRef = useRef([]);
  const destinationsRef = useRef([]);
  const mappingsRef = useRef([]);
  const collapsedRef = useRef(new Set());
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const rebuildRef = useRef(null);

  // Toggle a folder's collapsed state, then rebuild the graph.
  const toggleCollapse = useCallback((path) => {
    const next = new Set(collapsedRef.current);
    if (next.has(path)) next.delete(path); else next.add(path);
    collapsedRef.current = next;
    rebuildRef.current?.();
  }, []);

  // Derive nodes + edges from the source data. Preserves dragged positions,
  // computes colors (folder default, overridden by nearest mapped ancestor's
  // site color), collapse visibility, and edge styles.
  const rebuild = useCallback(() => {
    const folders = foldersRef.current;
    const dests = destinationsRef.current;
    const mappings = mappingsRef.current;
    const collapsed = collapsedRef.current;

    const prevPos = {};
    nodesRef.current.forEach(n => { prevPos[n.id] = n.position; });

    const byPath = new Map(folders.map(f => [f.path, f]));

    // Site colors by destination order.
    const siteColor = new Map();
    dests.forEach((d, i) => siteColor.set(destKey(d), EARTH_PALETTE[i % EARTH_PALETTE.length]));

    // Directly-mapped folder -> site color.
    const mappedColor = new Map();
    mappings.forEach(m => {
      const key = `${m.destination_site_url}-${m.destination_library}-${m.destination_subfolder || ''}`;
      if (siteColor.has(key)) mappedColor.set(m.source_path, siteColor.get(key));
    });

    // Effective color = nearest mapped ancestor-or-self's site color, else default.
    const effColor = (f) => {
      let cur = f;
      const guard = new Set();
      while (cur && !guard.has(cur.path)) {
        if (mappedColor.has(cur.path)) return mappedColor.get(cur.path);
        guard.add(cur.path);
        cur = cur.parent_path ? byPath.get(cur.parent_path) : null;
      }
      return defaultFolderColor(f.path);
    };

    // Child counts (only count children present in the scan set).
    const childCount = new Map();
    folders.forEach(f => {
      if (f.parent_path && byPath.has(f.parent_path)) {
        childCount.set(f.parent_path, (childCount.get(f.parent_path) || 0) + 1);
      }
    });

    // A folder is hidden if any ancestor is collapsed.
    const isHidden = (f) => {
      let cur = f.parent_path ? byPath.get(f.parent_path) : null;
      const guard = new Set();
      while (cur && !guard.has(cur.path)) {
        if (collapsed.has(cur.path)) return true;
        guard.add(cur.path);
        cur = cur.parent_path ? byPath.get(cur.parent_path) : null;
      }
      return false;
    };

    const folderNodes = folders.map((f, i) => ({
      id: `folder-${f.path}`,
      type: 'folder',
      hidden: isHidden(f),
      position: prevPos[`folder-${f.path}`] || { x: 40 + (f.depth || 0) * COLUMN_WIDTH, y: i * ROW_HEIGHT + 40 },
      data: {
        ...f,
        size_formatted: formatSize(f.total_size),
        color: effColor(f),
        collapsed: collapsed.has(f.path),
        childCount: childCount.get(f.path) || 0,
        onToggleCollapse: toggleCollapse,
      },
    }));

    const destX = computeDestX(folderNodes);
    const destNodes = dests.map((d, i) => ({
      id: destId(d),
      type: 'destination',
      position: prevPos[destId(d)] || { x: destX, y: i * 150 + 40 },
      data: { ...d, color: EARTH_PALETTE[i % EARTH_PALETTE.length] },
    }));

    const allNodes = [...folderNodes, ...destNodes];
    const visible = new Set(allNodes.filter(n => !n.hidden).map(n => n.id));

    // Folder→folder hierarchy edges: angular (smoothstep), dashed, hidden when
    // either endpoint is collapsed away.
    const hierEdges = folders
      .filter(f => f.parent_path && byPath.has(f.parent_path))
      .map(f => ({
        id: `h-${f.path}`,
        source: `folder-${f.parent_path}`,
        sourceHandle: 'out',
        target: `folder-${f.path}`,
        targetHandle: 'in',
        type: 'smoothstep',
        animated: false,
        selectable: false,
        hidden: !visible.has(`folder-${f.parent_path}`) || !visible.has(`folder-${f.path}`),
        style: { stroke: 'var(--text-muted)', strokeDasharray: '4 4' },
      }));

    // Folder→site mapping edges: smooth (default bezier), animated.
    const mapEdges = mappings
      .map(m => ({
        id: `e-${m.source_path}-${m.destination_site_url}`,
        source: `folder-${m.source_path}`,
        sourceHandle: 'out',
        target: `dest-${m.destination_site_url}-${m.destination_library}-${m.destination_subfolder || ''}`,
        targetHandle: 'a',
        animated: true,
      }))
      .filter(e => visible.has(e.source) && visible.has(e.target));

    nodesRef.current = allNodes;
    setNodes(allNodes);
    setEdges([...hierEdges, ...mapEdges]);
  }, [toggleCollapse]);

  // Keep a ref to the latest rebuild so toggleCollapse can call it.
  useEffect(() => { rebuildRef.current = rebuild; }, [rebuild]);

  const fetchDestinations = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/destinations`);
      destinationsRef.current = res.data;
      rebuild();
    } catch (e) {
      console.error("Failed to fetch destinations", e);
    }
  }, [rebuild]);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/mappings`);
      mappingsRef.current = res.data;
      rebuild();
    } catch (e) {
      console.error("Failed to fetch mappings", e);
    }
  }, [rebuild]);

  const handleScan = useCallback(async (path = scanPath) => {
    if (!path) return;
    setIsScanning(true);
    try {
      const res = await axios.post(`${API_BASE}/scan`, { path });
      const folders = res.data.folders;
      foldersRef.current = folders;
      // Condensed initial view: collapse everything at depth >= 2 so the tree
      // is expanded down to depth 2 only.
      collapsedRef.current = new Set(folders.filter(f => (f.depth || 0) >= 2).map(f => f.path));
      // Refresh mappings so colors + edges resolve against the new folders.
      try {
        const mres = await axios.get(`${API_BASE}/mappings`);
        mappingsRef.current = mres.data;
      } catch { /* keep prior mappings */ }
      rebuild();
    } catch (e) {
      alert("Scan failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setIsScanning(false);
    }
  }, [scanPath, rebuild]);

  // Fetch initial data on mount.
  useEffect(() => {
    fetchDestinations();
    fetchMappings();
  }, [fetchDestinations, fetchMappings]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Drag folder→destination to create a mapping. Refetch mappings + rebuild so
  // the site color propagates down the folder's subtree.
  const onConnect = useCallback(async (params) => {
    const cur = nodesRef.current;
    const sourceNode = cur.find(n => n.id === params.source);
    const targetNode = cur.find(n => n.id === params.target);

    if (sourceNode?.type === 'folder' && targetNode?.type === 'destination') {
      try {
        await axios.post(`${API_BASE}/mappings`, {
          source_path: sourceNode.data.path,
          destination: {
            site_url: targetNode.data.site_url,
            library_name: targetNode.data.library_name,
            subfolder: targetNode.data.subfolder,
          },
          file_count: sourceNode.data.file_count,
          total_size_bytes: sourceNode.data.total_size,
        });
        const mres = await axios.get(`${API_BASE}/mappings`);
        mappingsRef.current = mres.data;
        rebuild();
      } catch (e) {
        console.error("Mapping failed", e);
        alert("Failed to create mapping");
      }
    } else {
      alert("Please connect a Source Folder to a SharePoint Destination");
    }
  }, [rebuild]);

  // Opens a modal form. (window.prompt() is blocked in sandboxed preview
  // iframes, which is why the old prompt-based flow silently did nothing.)
  const addDestination = useCallback(() => setShowDestModal(true), []);

  const handleFolderSelect = useCallback((path) => {
    setScanPath(path);
    setShowPicker(false);
    handleScan(path);
  }, [handleScan]);

  const handleExportCsv = useCallback(async () => {
    try {
      const res = await axios.post(`${API_BASE}/export/csv`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'spmm_mappings.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + (e.response?.data?.detail || "No mappings to export"));
    }
  }, []);

  const handleValidate = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/validate`);
      const summary = res.data.summary;
      alert(
        `Validation ${res.data.is_valid ? '✓ Passed' : '✗ Failed'}\n\n` +
        `Errors: ${summary.errors}\n` +
        `Warnings: ${summary.warnings}\n` +
        `Info: ${summary.info}`
      );
    } catch (e) {
      alert("Validation failed: " + (e.response?.data?.detail || e.message));
    }
  }, []);

  return (
    <div className="app-container">
      {showPicker && (
        <FolderPicker
          onSelect={handleFolderSelect}
          onClose={() => setShowPicker(false)}
          initialPath={scanPath || '~'}
        />
      )}

      {showDestModal && (
        <AddDestinationModal
          onClose={() => setShowDestModal(false)}
          onCreated={fetchDestinations}
        />
      )}

      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '8px', borderRadius: '8px' }}>
            <Database size={24} color="white" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>SPMM</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Migration Mapping Tool</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="input-group" style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input-field"
              id="scan-path-input"
              placeholder="Enter local/UNC path to scan..."
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
              style={{ width: '300px' }}
            />
            <button id="browse-btn" className="btn btn-secondary" onClick={() => setShowPicker(true)} title="Browse Folders">
              <FolderOpen size={16} />
            </button>
            <button id="scan-btn" className="btn btn-primary" onClick={() => handleScan()} disabled={isScanning}>
              {isScanning ? 'Scanning...' : <><Play size={16} /> Scan</>}
            </button>
          </div>
          <button id="add-dest-btn" className="btn btn-secondary" onClick={addDestination}>
            <Plus size={16} /> Add Destination
          </button>
          <button id="validate-btn" className="btn btn-secondary" onClick={handleValidate} title="Validate Mappings">
            <ShieldCheck size={16} />
          </button>
          <button id="export-btn" className="btn btn-primary" onClick={handleExportCsv} title="Export CSV">
            <Download size={16} /> Export
          </button>
        </div>
      </header>

      <main className="app-content workspace">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Background color="#fff" gap={20} size={1} opacity={0.04} />
          <Controls />
          <MiniMap
            nodeColor={(n) => n.data?.color || '#888'}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            maskColor="rgba(0,0,0,0.2)"
          />
        </ReactFlow>
      </main>
    </div>
  );
}
