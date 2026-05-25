import { Injectable } from '@angular/core';
import JSZip from 'jszip';

export interface ZipExtractResult {
  files: File[];
  skipped: number;
  zipName: string;
}

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'tiff', 'tif'];
const EXCLUDED_PREFIXES = ['__MACOSX/', '.'];

@Injectable({ providedIn: 'root' })
export class ZipExtractorService {

  /** Detecta si el archivo es un ZIP válido */
  isZip(file: File): boolean {
    return (
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      file.type === 'application/x-zip' ||
      file.name.toLowerCase().endsWith('.zip')
    );
  }

  /** Detecta si el archivo es un RAR */
  isRar(file: File): boolean {
    return (
      file.type === 'application/x-rar-compressed' ||
      file.type === 'application/vnd.rar' ||
      file.name.toLowerCase().endsWith('.rar')
    );
  }

  /**
   * Extrae todas las imágenes de un archivo ZIP.
   * @param zipFile Archivo ZIP
   * @param onProgress Callback de progreso (0-100)
   */
  async extractImages(
    zipFile: File,
    onProgress?: (pct: number) => void
  ): Promise<ZipExtractResult> {
    const zip = new JSZip();
    const arrayBuffer = await zipFile.arrayBuffer();
    const loaded = await zip.loadAsync(arrayBuffer);

    const imageEntries: JSZip.JSZipObject[] = [];

    loaded.forEach((relativePath, entry) => {
      // Ignorar directorios, archivos de sistema y no-imágenes
      if (entry.dir) return;
      if (EXCLUDED_PREFIXES.some(p => relativePath.startsWith(p))) return;

      const ext = relativePath.split('.').pop()?.toLowerCase() || '';
      if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        imageEntries.push(entry);
      }
    });

    const files: File[] = [];
    let processed = 0;
    const total = imageEntries.length;

    for (const entry of imageEntries) {
      try {
        const blob = await entry.async('blob');
        const fileName = entry.name.split('/').pop() || entry.name;
        const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = this.getMimeType(ext);
        const file = new File([blob], fileName, { type: mimeType });
        files.push(file);
      } catch {
        // Si falla la extracción de un archivo, se omite
      }
      processed++;
      onProgress?.(Math.round((processed / total) * 100));
    }

    const skipped = total - files.length;
    return { files, skipped, zipName: zipFile.name };
  }

  private getMimeType(ext: string): string {
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      bmp: 'image/bmp',
      webp: 'image/webp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
    };
    return map[ext] || 'image/jpeg';
  }
}
