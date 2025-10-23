/**
 * File utility functions for handling file operations
 */

export interface FileTypeInfo {
  type: 'image' | 'document' | 'pdf' | 'excel' | 'text' | 'archive' | 'other';
  mimeType: string;
  extension: string;
  icon: string;
}

/**
 * Get file type information based on filename or MIME type
 */
export function getFileTypeInfo(filename: string, mimeType?: string): FileTypeInfo {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  // Check MIME type first if provided
  if (mimeType) {
    if (mimeType.startsWith('image/')) {
      return {
        type: 'image',
        mimeType,
        extension,
        icon: '🖼️'
      };
    }
    if (mimeType === 'application/pdf') {
      return {
        type: 'pdf',
        mimeType,
        extension,
        icon: '📄'
      };
    }
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return {
        type: 'excel',
        mimeType,
        extension,
        icon: '📊'
      };
    }
    if (mimeType.startsWith('text/')) {
      return {
        type: 'text',
        mimeType,
        extension,
        icon: '📝'
      };
    }
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) {
      return {
        type: 'archive',
        mimeType,
        extension,
        icon: '📦'
      };
    }
  }
  
  // Fallback to extension-based detection
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const documentExtensions = ['doc', 'docx'];
  const pdfExtensions = ['pdf'];
  const excelExtensions = ['xls', 'xlsx', 'csv'];
  const textExtensions = ['txt', 'md', 'rtf'];
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz'];
  
  if (imageExtensions.includes(extension)) {
    return {
      type: 'image',
      mimeType: mimeType || `image/${extension}`,
      extension,
      icon: '🖼️'
    };
  }
  
  if (documentExtensions.includes(extension)) {
    return {
      type: 'document',
      mimeType: mimeType || 'application/msword',
      extension,
      icon: '📄'
    };
  }
  
  if (pdfExtensions.includes(extension)) {
    return {
      type: 'pdf',
      mimeType: 'application/pdf',
      extension,
      icon: '📄'
    };
  }
  
  if (excelExtensions.includes(extension)) {
    return {
      type: 'excel',
      mimeType: mimeType || 'application/vnd.ms-excel',
      extension,
      icon: '📊'
    };
  }
  
  if (textExtensions.includes(extension)) {
    return {
      type: 'text',
      mimeType: mimeType || 'text/plain',
      extension,
      icon: '📝'
    };
  }
  
  if (archiveExtensions.includes(extension)) {
    return {
      type: 'archive',
      mimeType: mimeType || 'application/zip',
      extension,
      icon: '📦'
    };
  }
  
  return {
    type: 'other',
    mimeType: mimeType || 'application/octet-stream',
    extension,
    icon: '📎'
  };
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if file is an image
 */
export function isImageFile(filename: string, mimeType?: string): boolean {
  const fileInfo = getFileTypeInfo(filename, mimeType);
  return fileInfo.type === 'image';
}

/**
 * Get file icon component based on file type
 */
export function getFileIconComponent(fileInfo: FileTypeInfo, className: string = 'h-8 w-8'): React.ReactNode {
  const iconMap = {
    image: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    pdf: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    document: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    excel: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    text: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    archive: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    other: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    )
  };
  
  return iconMap[fileInfo.type] || iconMap.other;
}

