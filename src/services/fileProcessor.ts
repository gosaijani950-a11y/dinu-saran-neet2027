import * as pdfjsLib from 'pdfjs-dist';
import type { ProcessedFilePage, ProcessedUploadBundle } from '../types';

// Configure PDF.js worker using Vite-resolvable local module URL (zero CDN dependency)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.78;
const SCANNED_TEXT_THRESHOLD = 95; // Below 95 chars/page => render page to compressed JPEG for vision

/**
 * Compresses & normalizes orientation of an uploaded photo/scan (JPG, PNG, WEBP) via HTML5 <canvas>.
 */
export async function compressImageFile(file: File): Promise<ProcessedFilePage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(async () => {
    // Fallback via HTMLImageElement if createImageBitmap options fail
    return loadImageElement(file);
  });

  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;
  const scale = srcWidth > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / srcWidth : 1;
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for image compression.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1] ?? '';

  return {
    fileName: file.name,
    pageNumber: 1,
    text: '',
    imageBase64: base64,
    mimeType: 'image/jpeg',
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to decode image file: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Extracts embedded text page-by-page from a PDF in the browser using PDF.js.
 * For scanned or diagram-heavy pages (low extracted text), renders page to <canvas>
 * as compressed JPEG (max-width: 1024px, quality: 0.78).
 */
export async function processPdfFile(
  file: File,
  onProgress?: (info: string) => void
): Promise<ProcessedFilePage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages: ProcessedFilePage[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(`Reading ${file.name}: page ${pageNum} / ${totalPages}`);
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const extractedText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let imageBase64: string | undefined;

    // Render page as JPEG if scanned/image-heavy (low embedded text)
    if (extractedText.length < SCANNED_TEXT_THRESHOLD) {
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_IMAGE_WIDTH / Math.max(1, baseViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        imageBase64 = dataUrl.split(',')[1];
      }
    }

    pages.push({
      fileName: file.name,
      pageNumber: pageNum,
      text: extractedText,
      imageBase64,
      mimeType: imageBase64 ? 'image/jpeg' : undefined,
    });
  }

  return pages;
}

/**
 * Processes a mixed batch of PDFs and Photos (JPG, PNG, WEBP) completely client-side.
 */
export async function processUploadedFiles(
  fileList: File[],
  onProgress?: (info: string) => void
): Promise<ProcessedUploadBundle> {
  const pages: ProcessedFilePage[] = [];
  const filesMeta: { name: string; type: string; pages: number }[] = [];

  for (let idx = 0; idx < fileList.length; idx++) {
    const file = fileList[idx];
    const lower = file.name.toLowerCase();

    if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const pdfPages = await processPdfFile(file, onProgress);
      pages.push(...pdfPages);
      filesMeta.push({ name: file.name, type: 'pdf', pages: pdfPages.length });
    } else if (
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp)$/i.test(lower)
    ) {
      onProgress?.(`Compressing photo ${idx + 1} / ${fileList.length}: ${file.name}`);
      const imgPage = await compressImageFile(file);
      pages.push(imgPage);
      filesMeta.push({ name: file.name, type: 'image', pages: 1 });
    } else {
      throw new Error(`Unsupported file format: ${file.name}. Use PDF, JPG, PNG, or WEBP.`);
    }
  }

  const totalTextChars = pages.reduce((acc, p) => acc + p.text.length, 0);
  const imagePageCount = pages.filter((p) => Boolean(p.imageBase64)).length;

  return {
    files: filesMeta,
    pages,
    totalPages: pages.length,
    totalTextChars,
    imagePageCount,
  };
}
