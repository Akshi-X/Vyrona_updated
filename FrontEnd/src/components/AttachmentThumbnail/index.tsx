import React, { useState, useEffect, useCallback } from 'react';
import { getFileTypeInfo, formatFileSize, getFileIconComponent, isImageFile } from '../../utils/fileUtils';
import { feedbackService } from '../../services/feedbackService';

export interface AttachmentThumbnailProps {
  file?: File; // For new uploads
  attachmentPath?: string; // For existing attachments from API
  filename: string;
  fileSize?: number; // Optional for existing attachments
  uploadedAt?: string; // Optional for existing attachments
  onRemove?: () => void;
  canRemove?: boolean;
  className?: string;
}

const AttachmentThumbnail: React.FC<AttachmentThumbnailProps> = ({
  file,
  attachmentPath,
  filename,
  fileSize,
  uploadedAt: _uploadedAt,
  onRemove,
  canRemove = false,
  className = '',
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getDisplayName = useCallback(() => {
    if (file) return file.name;
    return filename;
  }, [file, filename]);

  const getFileSize = useCallback(() => {
    if (file) return formatFileSize(file.size);
    if (fileSize) return formatFileSize(fileSize);
    return null;
  }, [file, fileSize]);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (attachmentPath) {
      // Set previewUrl for all file types, not just images
      setPreviewUrl(feedbackService.getAttachmentUrl(attachmentPath));
    } else {
      setPreviewUrl(null);
    }
  }, [file, attachmentPath, filename]);

  const displayName = getDisplayName();
  const formattedFileSize = getFileSize();
  const isImage = isImageFile(filename);

  const handleClick = () => {
    if (attachmentPath && previewUrl) {
      // Open attachment in new tab for viewing/downloading
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <div 
      className={`relative bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden ${attachmentPath ? 'cursor-pointer hover:border-blue-300' : ''} ${className}`}
      onClick={attachmentPath ? handleClick : undefined}
      title={attachmentPath ? 'Click to view/download' : undefined}
    >
      {/* Thumbnail/Icon - Smaller size */}
      <div className="h-16 bg-gray-50 flex items-center justify-center relative overflow-hidden">
        {previewUrl && isImage ? (
          <img
            src={previewUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={() => setPreviewUrl(null)}
          />
        ) : (
          <div className="flex items-center justify-center">
            {getFileIconComponent(getFileTypeInfo(filename), 'h-8 w-8 text-gray-400')}
          </div>
        )}
        
        {/* Download icon for existing attachments */}
        {attachmentPath && (
          <div className="absolute top-1 right-1 p-1 bg-blue-500 text-white rounded-full">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* File Info - Compact */}
      <div className="p-2">
        <h4 className="text-xs font-medium text-gray-900 truncate" title={displayName}>
          {displayName}
        </h4>
        {formattedFileSize && (
          <p className="text-xs text-gray-500 mt-0.5">{formattedFileSize}</p>
        )}
      </div>

      {/* Remove button - Smaller */}
      {canRemove && onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
          title="Remove file"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default AttachmentThumbnail;

