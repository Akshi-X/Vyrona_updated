// html2canvas-pro (not the original html2canvas) — this project's Tailwind v4
// default palette renders in oklch(), which the unmaintained original
// html2canvas cannot parse ("Attempting to parse an unsupported color
// function 'oklch'"). The -pro fork adds oklch/lab/lch/color-mix support.
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

async function toDataUrl(src: string): Promise<string> {
  const res = await fetch(src, { mode: 'cors' });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Swaps every cross-origin <img> under `root` to a same-origin data: URI so
 * html2canvas's capture never taints the canvas — the report's hospital logo
 * and embryo thumbnails are served from a private Azure Blob container via
 * short-lived SAS URLs, which is a different origin from the app itself.
 * Returns a restore function that puts the original SAS URLs back.
 */
async function inlineImages(root: HTMLElement): Promise<() => void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  const restores: Array<() => void> = [];
  await Promise.all(imgs.map(async img => {
    const original = img.getAttribute('src') || '';
    if (!original || original.startsWith('data:')) return;
    try {
      const dataUrl = await toDataUrl(original);
      img.src = dataUrl;
      restores.push(() => { img.src = original; });
    } catch (e) {
      // Leave the original SAS src in place; html2canvas's useCORS fetch may
      // still succeed, and a single missing image shouldn't fail the export.
      console.warn('Report PDF: could not inline image, leaving original src', original, e);
    }
  }));
  return () => restores.forEach(r => r());
}

/**
 * Captures every `.report-page` element inside `root` as a full-bleed A4 page
 * and assembles them into a single PDF blob. Each page must already be laid
 * out at the fixed 794×1123px (A4 @96dpi) canvas size used by the preview.
 */
export async function buildReportPdf(root: HTMLElement): Promise<Blob> {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.report-page'));
  if (pages.length === 0) {
    throw new Error('No report pages found to export');
  }

  const restore = await inlineImages(root);
  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }

    return pdf.output('blob');
  } finally {
    restore();
  }
}
