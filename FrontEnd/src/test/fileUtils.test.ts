import { describe, it, expect } from 'vitest'
import { 
  getFileTypeInfo, 
  formatFileSize, 
  isImageFile,
  getFileIconComponent,
  type FileTypeInfo
} from '../utils/fileUtils'

describe('fileUtils', () => {
  describe('getFileTypeInfo', () => {
    describe('MIME type detection', () => {
      it('should detect image from MIME type', () => {
        const info = getFileTypeInfo('test.jpg', 'image/jpeg')
        expect(info.type).toBe('image')
        expect(info.mimeType).toBe('image/jpeg')
        expect(info.extension).toBe('jpg')
        expect(info.icon).toBe('🖼️')
      })

      it('should detect PDF from MIME type', () => {
        const info = getFileTypeInfo('document.pdf', 'application/pdf')
        expect(info.type).toBe('pdf')
        expect(info.mimeType).toBe('application/pdf')
        expect(info.extension).toBe('pdf')
        expect(info.icon).toBe('📄')
      })

      it('should detect Excel from MIME type', () => {
        const info = getFileTypeInfo('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        expect(info.type).toBe('excel')
        expect(info.extension).toBe('xlsx')
        expect(info.icon).toBe('📊')
      })

      it('should detect text from MIME type', () => {
        const info = getFileTypeInfo('readme.txt', 'text/plain')
        expect(info.type).toBe('text')
        expect(info.mimeType).toBe('text/plain')
        expect(info.extension).toBe('txt')
        expect(info.icon).toBe('📝')
      })

      it('should detect archive from MIME type', () => {
        const info = getFileTypeInfo('archive.zip', 'application/zip')
        expect(info.type).toBe('archive')
        expect(info.mimeType).toBe('application/zip')
        expect(info.extension).toBe('zip')
        expect(info.icon).toBe('📦')
      })
    })

    describe('Extension-based detection', () => {
      it('should detect image from extension', () => {
        const info = getFileTypeInfo('photo.png')
        expect(info.type).toBe('image')
        expect(info.extension).toBe('png')
      })

      it('should detect document from extension', () => {
        const info = getFileTypeInfo('document.docx')
        expect(info.type).toBe('document')
        expect(info.extension).toBe('docx')
      })

      it('should detect PDF from extension', () => {
        const info = getFileTypeInfo('file.pdf')
        expect(info.type).toBe('pdf')
        expect(info.extension).toBe('pdf')
      })

      it('should detect Excel from extension', () => {
        const info = getFileTypeInfo('spreadsheet.xls')
        expect(info.type).toBe('excel')
        expect(info.extension).toBe('xls')
      })

      it('should detect CSV as Excel', () => {
        const info = getFileTypeInfo('data.csv')
        expect(info.type).toBe('excel')
        expect(info.extension).toBe('csv')
      })

      it('should detect text from extension', () => {
        const info = getFileTypeInfo('readme.txt')
        expect(info.type).toBe('text')
        expect(info.extension).toBe('txt')
      })

      it('should detect markdown as text', () => {
        const info = getFileTypeInfo('readme.md')
        expect(info.type).toBe('text')
        expect(info.extension).toBe('md')
      })

      it('should detect archive from extension', () => {
        const info = getFileTypeInfo('archive.zip')
        expect(info.type).toBe('archive')
        expect(info.extension).toBe('zip')
      })

      it('should detect RAR as archive', () => {
        const info = getFileTypeInfo('archive.rar')
        expect(info.type).toBe('archive')
        expect(info.extension).toBe('rar')
      })

      it('should handle uppercase extensions', () => {
        const info = getFileTypeInfo('PHOTO.JPG')
        expect(info.type).toBe('image')
        expect(info.extension).toBe('jpg')
      })

      it('should return other type for unknown extensions', () => {
        const info = getFileTypeInfo('unknown.xyz')
        expect(info.type).toBe('other')
        expect(info.extension).toBe('xyz')
        expect(info.icon).toBe('📎')
      })

      it('should handle files without extension', () => {
        const info = getFileTypeInfo('noextension')
        expect(info.type).toBe('other')
        // When there's no extension, split('.').pop() returns the whole filename
        expect(info.extension).toBe('noextension')
      })
    })
  })

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
    })

    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 Bytes')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(2048)).toBe('2 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(2097152)).toBe('2 MB')
      expect(formatFileSize(1572864)).toBe('1.5 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB')
      expect(formatFileSize(2147483648)).toBe('2 GB')
    })

    it('should handle decimal precision', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(2560)).toBe('2.5 KB')
    })
  })

  describe('isImageFile', () => {
    it('should return true for image files by extension', () => {
      expect(isImageFile('photo.jpg')).toBe(true)
      expect(isImageFile('image.png')).toBe(true)
      expect(isImageFile('picture.gif')).toBe(true)
    })

    it('should return true for image files by MIME type', () => {
      expect(isImageFile('file.jpg', 'image/jpeg')).toBe(true)
      expect(isImageFile('file.png', 'image/png')).toBe(true)
    })

    it('should return false for non-image files', () => {
      expect(isImageFile('document.pdf')).toBe(false)
      expect(isImageFile('data.xlsx')).toBe(false)
      expect(isImageFile('readme.txt')).toBe(false)
    })

    it('should prioritize MIME type over extension', () => {
      expect(isImageFile('file.pdf', 'image/jpeg')).toBe(true)
    })
  })

  describe('getFileIconComponent', () => {
    it('should return image icon for image type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'image',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        icon: '🖼️'
      }
      const icon = getFileIconComponent(fileInfo, 'h-10 w-10')
      expect(icon).toBeDefined()
    })

    it('should return PDF icon for pdf type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        icon: '📄'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should return document icon for document type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'document',
        mimeType: 'application/msword',
        extension: 'doc',
        icon: '📄'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should return excel icon for excel type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'excel',
        mimeType: 'application/vnd.ms-excel',
        extension: 'xls',
        icon: '📊'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should return text icon for text type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'text',
        mimeType: 'text/plain',
        extension: 'txt',
        icon: '📝'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should return archive icon for archive type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'archive',
        mimeType: 'application/zip',
        extension: 'zip',
        icon: '📦'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should return other icon for other type', () => {
      const fileInfo: FileTypeInfo = {
        type: 'other',
        mimeType: 'application/octet-stream',
        extension: 'xyz',
        icon: '📎'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })

    it('should use default className when not provided', () => {
      const fileInfo: FileTypeInfo = {
        type: 'image',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        icon: '🖼️'
      }
      const icon = getFileIconComponent(fileInfo)
      expect(icon).toBeDefined()
    })
  })
})

