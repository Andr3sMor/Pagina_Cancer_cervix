import { Injectable } from '@angular/core';
import JSZip from 'jszip';

export interface ZipExtractResult {
  entries: JSZip.JSZipObject[];
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
   * Extrae la lista de imágenes de un archivo ZIP sin cargarlas todas en memoria RAM de golpe.
   * Devuelve los JSZipObject que se pueden descomprimir individualmente después.
   */
  async extractImages(
    zipFile: File
  ): Promise<ZipExtractResult> {
    const zip = new JSZip();
    // Leer el archivo directamente minimiza el uso de RAM comparado con arrayBuffer()
    const loaded = await zip.loadAsync(zipFile);

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

    return { entries: imageEntries, zipName: zipFile.name };
  }

  getMimeType(ext: string): string {
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
