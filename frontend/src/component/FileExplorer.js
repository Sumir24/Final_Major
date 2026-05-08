import React, { useState, useEffect, useRef, useCallback } from 'react';

const FileItem = ({ item, depth = 0, onSelect, onDelete, onPreview, onFolderTarget, isTargeted }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div style={{ marginLeft: depth * 12 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '13px',
                    color: isTargeted ? '#00dbe9' : '#D1D4DC',
                    backgroundColor: isTargeted ? 'rgba(0, 219, 233, 0.1)' : 'transparent',
                    border: isTargeted ? '1px solid rgba(0, 219, 233, 0.2)' : '1px solid transparent',
                    marginBottom: '2px'
                }}
                onMouseEnter={(e) => {
                    if (!isTargeted) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                    if (!isTargeted) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={(e) => {
                    if (item.isDirectory) {
                        setIsOpen(!isOpen);
                        onFolderTarget(item); // Set this folder as the upload target
                    } else {
                        onSelect(item);
                    }
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span className="material-symbols-outlined" style={{
                        fontSize: '18px',
                        color: isTargeted ? '#00dbe9' : (item.isDirectory ? '#f1c40f' : '#3498db')
                    }}>
                        {item.isDirectory ? (isOpen ? 'folder_open' : 'folder') : 'description'}
                    </span>
                    <span style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: (item.isDirectory || isTargeted) ? '600' : '400'
                    }}>{item.name}</span>
                </div>

                <div className="file-actions" style={{ display: 'flex', gap: '4px' }}>
                    {!item.isDirectory && (
                        <span
                            className="material-symbols-outlined"
                            style={{ fontSize: '14px', color: '#00dbe9', padding: '4px' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onPreview(item);
                            }}
                        >visibility</span>
                    )}
                    <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '14px', color: '#ff4757', padding: '4px' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id, item.name);
                        }}
                    >delete</span>
                </div>
            </div>

            {item.isDirectory && isOpen && item.children && (
                <div>
                    {item.children.map(child => (
                        <FileItem
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onPreview={onPreview}
                            onFolderTarget={onFolderTarget}
                            isTargeted={isTargeted}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FileExplorer = ({ onFileSelect, onFilePreview }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [targetFolder, setTargetFolder] = useState({ id: null, path: '' });
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef(null);

    const fetchFiles = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/files');
            if (response.ok) {
                const data = await response.json();
                setFiles(data);
            }
        } catch (err) {
            console.error("Error fetching files:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        try {
            const response = await fetch('/api/files/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newFolderName,
                    parentPath: targetFolder.path
                })
            });
            if (response.ok) {
                setNewFolderName('');
                setIsCreatingFolder(false);
                fetchFiles();
            }
        } catch (err) {
            console.error("Error creating folder:", err);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('path', targetFolder.path);
        formData.append('file', file);

        try {
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                fetchFiles();
            }
        } catch (err) {
            console.error("Error uploading file:", err);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
        try {
            const response = await fetch(`/api/files/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchFiles();
            }
        } catch (err) {
            console.error("Error deleting:", err);
        }
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#131315',
            color: '#D1D4DC',
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Toolbar */}
            <div style={{
                padding: '12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                gap: '8px'
            }}>
                <button
                    onClick={() => fileInputRef.current.click()}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: 'rgba(0, 219, 233, 0.1)',
                        border: '1px solid rgba(0, 219, 233, 0.3)',
                        borderRadius: '6px',
                        color: '#00dbe9',
                        fontSize: '11px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                    }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                    UPLOAD
                </button>
                <button
                    onClick={() => setIsCreatingFolder(true)}
                    style={{
                        padding: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#8b949e',
                        cursor: 'pointer'
                    }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>create_new_folder</span>
                </button>
                <button
                    onClick={() => setTargetFolder({ id: null, path: '' })}
                    style={{
                        padding: '8px',
                        background: targetFolder.id === null ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                        border: targetFolder.id === null ? '1px solid rgba(0, 230, 118, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: targetFolder.id === null ? '#00E676' : '#8b949e',
                        cursor: 'pointer'
                    }}
                    title="Reset to Root"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>home</span>
                </button>
            </div>

            {/* Folder Creation Input */}
            {isCreatingFolder && (
                <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            autoFocus
                            type="text"
                            placeholder={`New folder in ${targetFolder.path || 'root'}...`}
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                            style={{
                                flex: 1,
                                background: '#0A0A0B',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '4px',
                                color: '#fff',
                                padding: '6px 8px',
                                fontSize: '12px',
                                outline: 'none'
                            }}
                        />
                        <button onClick={handleCreateFolder} style={{ color: '#00E676', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>check</span>
                        </button>
                        <button onClick={() => setIsCreatingFolder(false)} style={{ color: '#ff4757', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                        </button>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleUpload}
            />

            {/* File List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                {loading && files.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#5f6368', fontSize: '12px' }}>
                        Loading assets...
                    </div>
                ) : files.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#5f6368', fontSize: '12px' }}>
                        Empty database.
                    </div>
                ) : (
                    files.map(item => (
                        <FileItem
                            key={item.id}
                            item={item}
                            onSelect={onFileSelect}
                            onDelete={handleDelete}
                            onPreview={onFilePreview}
                            onFolderTarget={(folder) => setTargetFolder({ id: folder.id, path: folder.path })}
                            isTargeted={targetFolder.id === item.id}
                        />
                    ))
                )}
            </div>

            {/* Status Bar */}
            <div style={{
                padding: '6px 12px',
                background: '#0D0D10',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '10px',
                color: '#5f6368',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span className="material-symbols-outlined" style={{ fontSize: '12px', color: targetFolder.id ? '#00dbe9' : '#5f6368' }}>
                    {targetFolder.id ? 'folder_open' : 'database'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: targetFolder.id ? '#00dbe9' : '#5f6368' }}>
                    TARGET: /{targetFolder.path || 'root'}
                </span>
            </div>
        </div>
    );
};

export default React.memo(FileExplorer);
