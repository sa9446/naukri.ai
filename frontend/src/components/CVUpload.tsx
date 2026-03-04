'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface CVUploadProps {
  multiple?: boolean;
  onUpload: (files: File[]) => Promise<void>;
  loading?: boolean;
}

export default function CVUpload({ multiple = false, onUpload, loading = false }: CVUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(multiple ? accepted : [accepted[0]]);
    setUploaded(false);
  }, [multiple]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    multiple,
  });

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!files.length) return;
    await onUpload(files);
    setUploaded(true);
    setFiles([]);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition',
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-3 text-gray-400" size={40} />
        <p className="text-gray-600 font-medium">
          {isDragActive ? 'Drop files here...' : `Drag & drop ${multiple ? 'CVs' : 'your CV'} here`}
        </p>
        <p className="text-sm text-gray-400 mt-1">PDF or DOCX — max 10MB each</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-primary-500" />
                <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                  {file.name}
                </span>
                <span className="text-xs text-gray-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2.5 rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-60 transition"
          >
            {loading ? 'Processing...' : `Upload ${files.length > 1 ? `${files.length} CVs` : 'CV'}`}
          </button>
        </div>
      )}

      {uploaded && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-4 py-3">
          <CheckCircle size={18} />
          <span className="text-sm font-medium">
            Upload complete! Job matching is running in the background.
          </span>
        </div>
      )}
    </div>
  );
}
