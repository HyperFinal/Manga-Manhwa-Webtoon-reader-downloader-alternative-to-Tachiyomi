import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, BookOpen } from 'lucide-react';

interface LibraryProps {
  onFileSelect: (file: File) => void;
}

export const Library: React.FC<LibraryProps> = ({ onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md w-full"
      >
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center text-pink-400">
            <BookOpen size={48} />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold mb-2 text-gray-700">Manga Reader</h1>
        <p className="text-gray-500 mb-8">Read your favorite stories in style ✨</p>

        <div 
          className="cute-card p-8 border-2 border-dashed border-pink-200 cursor-pointer hover:border-pink-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto mb-4 text-pink-300" size={32} />
          <p className="font-medium">Tap to open a .cbz file</p>
          <p className="text-sm text-gray-400 mt-2">Supports .cbz and .zip archives</p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".cbz,.zip,application/zip,application/x-zip-compressed"
          className="hidden"
        />
      </motion.div>
    </div>
  );
};
