// app/uploadfile/page.tsx
'use client';

import { useState, useRef } from 'react';

const categories = {
  f1: ['2025', 'general'],
  movietv: {
    movie: [],
    tv: ['penguin'],
  },
  experience: [],
  tech: [],
};

function getAllPaths() {
  const result: string[] = [];
  for (const [cat, sub] of Object.entries(categories)) {
    if (Array.isArray(sub) && sub.length) {
      sub.forEach(s => result.push(`${cat}/${s}`));
    } else if (typeof sub === 'object') {
      for (const [k, v] of Object.entries(sub)) {
        if ((v as string[]).length) {
          (v as string[]).forEach(s => result.push(`${cat}/${k}/${s}`));
        } else {
          result.push(`${cat}/${k}`);
        }
      }
    } else {
      result.push(cat);
    }
  }
  return result;
}

export default function UploadFilePage() {
  const [selectedPath, setSelectedPath] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const paths = getAllPaths();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selectedPath) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', selectedPath);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    setUploadedUrl(data.url);
    setUploading(false);
  }

  return (
    <main style={{maxWidth:400,margin:"2em auto",padding:20,background:"#f9f9f9",borderRadius:10}}>
      <h2>Upload Image</h2>
      <form onSubmit={handleUpload}>
        <div>
          <label>Folder/Location:</label>
          <select
            required
            value={selectedPath}
            onChange={e => setSelectedPath(e.target.value)}
          >
            <option value="">-- select --</option>
            {paths.map(p => (
              <option value={p} key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div style={{marginTop:12}}>
          <label>
            Select file:
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              ref={fileInput}
              required
              style={{marginLeft:8}}
            />
          </label>
        </div>
        {file && (
          <div style={{margin:"8px 0"}}>Selected file: <strong>{file.name}</strong></div>
        )}
        <button type="submit" disabled={uploading || !file || !selectedPath} style={{marginTop:15}}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>
      {uploadedUrl && (
        <div style={{marginTop:20,wordBreak:'break-all'}}>
          <strong>File URL:</strong>
          <a href={uploadedUrl} target="_blank" rel="noopener noreferrer">{uploadedUrl}</a>
        </div>
      )}
    </main>
  );
}
