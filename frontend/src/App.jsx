import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { Play, Database, Plus, FolderOpen, Download, ShieldCheck } from 'lucide-react';
import { FolderNode, DestinationNode } from './components/CustomNodes';
import FolderPicker from './components/FolderPicker';

// Defined outside the component to avoid React Flow warning #002
const nodeTypes = {
  folder: FolderNode,
  destination: DestinationNode,
};

const API_BASE = 'http://127.0.0.1:8000/api';

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

  // Keep a ref to nodes so callbacks never read a stale closure
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const fetchDestinations = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/destinations`);
      const dests = res.data;

      setNodes((nds) => {
        const folderNodes = nds.filter(n => n.type === 'folder');
        const destNodes = dests.map((d, i) => ({
          id: `dest-${d.site_url}-${d.library_name}-${d.subfolder || ''}`,
          type: 'destination',
          position: { x: 800, y: i * 150 + 50 },
          data: d
        }));
        return [...folderNodes, ...destNodes];
      });
    } catch (e) {
      console.error("Failed to fetch destinations", e);
    }
  }, []);

  // Build mapping edges, but only emit edges whose source AND target nodes
  // currently exist on the canvas — otherwise React Flow silently drops
  // dangling edges. Pass the freshly-built node list after a scan so the
  // restored edges resolve against the new folder nodes.
  const fetchMappings = useCallback(async (availableNodes) => {
    try {
      const res = await axios.get(`${API_BASE}/mappings`);
      const mappings = res.data;
      const nodeIds = new Set((availableNodes || nodesRef.current).map(n => n.id));

      const newEdges = mappings
        .map(m => ({
          id: `e-${m.source_path}-${m.destination_site_url}`,
          source: `folder-${m.source_path}`,
          target: `dest-${m.destination_site_url}-${m.destination_library}-${m.destination_subfolder || ''}`,
          animated: true,
        }))
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
      setEdges(newEdges);
    } catch (e) {
      console.error("Failed to fetch mappings", e);
    }
  }, []);

  const handleScan = useCallback(async (path = scanPath) => {
    if (!path) return;
    setIsScanning(true);
    try {
      const res = await axios.post(`${API_BASE}/scan`, { path });
      const folders = res.data.folders;

      const newFolderNodes = folders.map((f, i) => ({
        id: `folder-${f.path}`,
        type: 'folder',
        position: { x: 50, y: i * 100 + 50 },
        data: { ...f, size_formatted: formatSize(f.total_size) }
      }));

      const destNodes = nodesRef.current.filter(n => n.type === 'destination');
      const allNodes = [...newFolderNodes, ...destNodes];
      nodesRef.current = allNodes;
      setNodes(allNodes);

      // Re-resolve persisted mappings now that the folder nodes exist.
      await fetchMappings(allNodes);
    } catch (e) {
      alert("Scan failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setIsScanning(false);
    }
  }, [scanPath, fetchMappings]);

  // Fetch initial data on mount
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

  // Uses nodesRef to avoid stale closure
  const onConnect = useCallback(async (params) => {
    const currentNodes = nodesRef.current;
    const sourceNode = currentNodes.find(n => n.id === params.source);
    const targetNode = currentNodes.find(n => n.id === params.target);

    if (sourceNode?.type === 'folder' && targetNode?.type === 'destination') {
      try {
        await axios.post(`${API_BASE}/mappings`, {
          source_path: sourceNode.data.path,
          destination: {
            site_url: targetNode.data.site_url,
            library_name: targetNode.data.library_name,
            subfolder: targetNode.data.subfolder
          },
          file_count: sourceNode.data.file_count,
          total_size_bytes: sourceNode.data.total_size,
        });
        setEdges((eds) => addEdge({ ...params, animated: true }, eds));
      } catch (e) {
        console.error("Mapping failed", e);
        alert("Failed to create mapping");
      }
    } else {
      alert("Please connect a Source Folder to a SharePoint Destination");
    }
  }, []);

  const addDestination = useCallback(async () => {
    const url = prompt("Enter SharePoint Site URL (e.g., https://contoso.sharepoint.com/sites/HR):");
    if (!url) return;
    try {
      // Validate before sending so a malformed URL never reaches the canvas.
      new URL(url);
    } catch {
      alert("Please enter a valid absolute URL, including https://");
      return;
    }
    const library = prompt("Enter Library Name (e.g., Documents):");
    if (!library) return;

    try {
      await axios.post(`${API_BASE}/destinations`, {
        site_url: url,
        library_name: library,
        subfolder: null
      });
      fetchDestinations();
    } catch {
      alert("Failed to add destination");
    }
  }, [fetchDestinations]);

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
          <Background color="#fff" gap={20} size={1} opacity={0.05} />
          <Controls />
          <MiniMap 
            nodeColor={(n) => {
              if (n.type === 'folder') return '#6366f1';
              if (n.type === 'destination') return '#10b981';
              return '#eee';
            }} 
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            maskColor="rgba(0,0,0,0.2)"
          />
        </ReactFlow>
      </main>
    </div>
  );
}
