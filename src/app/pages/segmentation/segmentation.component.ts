import {
  Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionService, ImageRecord, ModelConfig } from '../../services/session.service';
import { ZipExtractorService } from '../../services/zip-extractor.service';
import JSZip from 'jszip';

type ViewMode = 'overlay' | 'side' | 'mask';

@Component({
  selector: 'app-segmentation',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './segmentation.component.html',
  styleUrls: ['./segmentation.component.scss']
})
export class SegmentationComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('maskCanvas') maskCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas') overlayCanvasRef!: ElementRef<HTMLCanvasElement>;

  models: ModelConfig[] = [];
  selectedModelId = '';
  records: ImageRecord[] = [];
  activeRecord: ImageRecord | null = null;
  viewMode: ViewMode = 'overlay';
  isDragging = false;
  isLoading = false;
  showCompareTip = false;
  isDarkTheme = false;
  showClinicalAnalysis = false;
  showLabels = false;

  // ── Batch / ZIP state ─────────────────────────────────────────
  isBatchMode = false;
  batchTotal = 0;
  batchProcessed = 0;
  batchErrors = 0;
  batchZipName = '';
  batchSize = 4;          // imágenes enviadas en paralelo por lote
  showBatchPanel = false; // panel inferior de descarga masiva
  isExtractingZip = false;
  zipExtractPct = 0;
  isBatchDone = false;

  private subs = new Subscription();

  CLASS_COLORS = [
    { r: 0, g: 0, b: 0, a: 0 },          // 0: fondo - transparent
    { r: 255, g: 0, b: 0, a: 180 },       // 1: anormal - rojo
    { r: 0, g: 255, b: 0, a: 180 },       // 2: normal - verde
  ];

  constructor(
    public session: SessionService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zipExtractor: ZipExtractorService
  ) { }

  ngOnInit() {
    this.isDarkTheme = document.body.classList.contains('dark-theme');
    this.models = this.session.MODELS;
    this.subs.add(this.session.selectedModel$.subscribe(m => {
      this.selectedModelId = m.id;
    }));
    this.subs.add(this.session.records$.subscribe(r => {
      this.records = r;
      if (r.length > 0 && !this.activeRecord) {
        this.activeRecord = r[0];
      }
    }));
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  onModelChange() { this.session.selectModel(this.selectedModelId); }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    if (this.isDarkTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }

  triggerFileInput() { this.fileInputRef.nativeElement.click(); }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFile(input.files[0]);
      input.value = '';
    }
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging = true; }
  onDragLeave() { this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.handleFile(file);
  }

  // ─────────────────────────────────────────────────────────────
  // Entry point: detect ZIP vs single image
  // ─────────────────────────────────────────────────────────────
  async handleFile(file: File) {
    if (this.zipExtractor.isRar(file)) {
      alert(
        'Los archivos RAR no son compatibles con el navegador.\n' +
        'Por favor convierte el archivo a ZIP y vuelve a intentarlo.'
      );
      return;
    }

    if (this.zipExtractor.isZip(file)) {
      await this.handleZipFile(file);
      return;
    }

    // Single image
    const allowed = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/tiff'];
    if (!allowed.includes(file.type)) {
      alert('Formato no soportado. Use: JPG, PNG, BMP, WEBP, TIFF o ZIP');
      return;
    }

    await this.processSingleImage(file);
  }

  // ─────────────────────────────────────────────────────────────
  // ZIP: extract → batch process
  // ─────────────────────────────────────────────────────────────
  async handleZipFile(zipFile: File) {
    this.isExtractingZip = true;
    this.zipExtractPct = 0; // Se puede usar para indicar que está cargando el índice
    this.isBatchMode = true;
    this.isBatchDone = false;
    this.showBatchPanel = false;
    this.batchZipName = zipFile.name;
    this.cdr.detectChanges();

    let extractResult;
    try {
      extractResult = await this.zipExtractor.extractImages(zipFile);
    } catch (err) {
      alert('Error al leer el ZIP. Verifica que el archivo no esté dañado.');
      this.isExtractingZip = false;
      this.isBatchMode = false;
      this.cdr.detectChanges();
      return;
    }

    this.isExtractingZip = false;

    if (extractResult.entries.length === 0) {
      alert(
        `El ZIP "${zipFile.name}" no contiene imágenes soportadas (JPG, PNG, BMP, WEBP, TIFF).`
      );
      this.isBatchMode = false;
      this.cdr.detectChanges();
      return;
    }

    this.batchTotal = extractResult.entries.length;
    this.batchProcessed = 0;
    this.batchErrors = 0;
    this.cdr.detectChanges();

    await this.processBatch(extractResult.entries);

    this.isBatchDone = true;
    this.showBatchPanel = true;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // ─────────────────────────────────────────────────────────────
  // Process images in groups of `batchSize` concurrently
  // ─────────────────────────────────────────────────────────────
  private async processBatch(entries: JSZip.JSZipObject[]) {
    this.isLoading = true;

    for (let i = 0; i < entries.length; i += this.batchSize) {
      const chunk = entries.slice(i, i + this.batchSize);
      
      // Extract ONLY the current chunk into memory (Blobs -> Files)
      const filesChunk: File[] = [];
      for (const entry of chunk) {
        try {
          const blob = await entry.async('blob');
          const fileName = entry.name.split('/').pop() || entry.name;
          const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = this.zipExtractor.getMimeType(ext);
          filesChunk.push(new File([blob], fileName, { type: mimeType }));
        } catch {
          // If extraction fails for one file, skip it or mark as error
          this.batchErrors++;
          this.batchProcessed++;
        }
      }

      await Promise.all(filesChunk.map(f => this.processSingleImage(f)));
    }

    this.isLoading = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Single image processing (used both standalone & in batches)
  // ─────────────────────────────────────────────────────────────
  async processSingleImage(file: File) {
    const normalizedBlob = await this.getNormalizedBlob(file);
    const normalizedFile = new File([normalizedBlob], file.name, { type: 'image/jpeg' });
    const originalUrl = await this.fileToDataUrl(normalizedFile);

    const model = this.session.selectedModel;
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      fileName: file.name,
      originalUrl,
      maskData: null,
      detections: null,
      maskCanvas: null,
      overlayCanvas: null,
      modelUsed: model.name,
      timestamp: new Date(),
      status: 'processing',
      isYolo: model.type === 'detection'
    };

    this.session.addRecord(record);
    if (!this.isBatchMode) {
      this.activeRecord = record;
      this.isLoading = true;
    } else {
      // In batch mode, always show latest processed image
      this.activeRecord = record;
    }
    this.cdr.detectChanges();

    try {
      const formData = new FormData();
      formData.append('file', normalizedFile, file.name);

      const result = await this.http.post<any>(model.apiUrl, formData).toPromise();

      let maskCanvas: string | null = null;
      let overlayCanvas: string | null = null;

      if (model.type === 'segmentation') {
        maskCanvas = await this.renderMask(result.mask, result.shape[0], result.shape[1]);
        overlayCanvas = await this.renderOverlay(originalUrl, result.mask, result.shape[0], result.shape[1]);
      } else if (model.type === 'detection') {
        overlayCanvas = await this.renderYoloOverlay(originalUrl, result.detections);
        if (this.viewMode === 'mask') {
          this.viewMode = 'overlay';
        }
      }

      const stats = this.calculateClinicalStats(result.mask, result.detections, model);

      this.session.updateRecord(record.id, {
        status: 'done',
        maskData: result.mask || null,
        detections: result.detections || null,
        maskCanvas,
        overlayCanvas,
        clinicalStats: stats
      });

      this.activeRecord = this.session.records.find(r => r.id === record.id) || null;
      if (this.activeRecord && !this.isBatchMode) {
        this.showClinicalAnalysis = true;
      }
    } catch (err: any) {
      const msg = err?.error?.detail || err?.message || 'Error al conectar con el modelo';
      this.session.updateRecord(record.id, { status: 'error', errorMsg: msg });
      this.activeRecord = this.session.records.find(r => r.id === record.id) || null;
      if (this.isBatchMode) this.batchErrors++;
    }

    if (this.isBatchMode) {
      this.batchProcessed++;
      this.cdr.detectChanges();
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Batch download: generate ZIP with all results + CSV summary
  // ─────────────────────────────────────────────────────────────
  async downloadAllResults() {
    const doneRecords = this.records.filter(r => r.status === 'done');
    if (doneRecords.length === 0) {
      alert('No hay resultados procesados para descargar.');
      return;
    }

    const zip = new JSZip();
    const csvRows: string[] = [
      'Archivo,Diagnóstico,Células Anormales (%),Células Normales (%),Confianza (%),Modelo'
    ];

    for (const record of doneRecords) {
      // Overlay image
      if (record.overlayCanvas) {
        const overlayData = record.overlayCanvas.split(',')[1];
        zip.file(`overlay_${record.fileName.replace(/\.[^/.]+$/, '')}.jpg`, overlayData, { base64: true });
      }
      // Mask image (only for segmentation)
      if (record.maskCanvas && !record.isYolo) {
        const maskData = record.maskCanvas.split(',')[1];
        zip.file(`mask_${record.fileName.replace(/\.[^/.]+$/, '')}.jpg`, maskData, { base64: true });
      }
      // CSV row
      const stats = record.clinicalStats;
      if (stats) {
        csvRows.push(
          `"${record.fileName}","${stats.diagnosis}",` +
          `${stats.abnormalPercentage.toFixed(2)},${stats.normalPercentage.toFixed(2)},` +
          `${(stats.avgConfidence * 100).toFixed(1)},"${record.modelUsed}"`
        );
      }
    }

    zip.file('resumen.csv', csvRows.join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = this.batchZipName
      ? this.batchZipName.replace(/\.zip$/i, '')
      : 'resultados';
    a.href = url;
    a.download = `resultados_${baseName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  get batchProgress(): number {
    if (this.batchTotal === 0) return 0;
    return Math.round((this.batchProcessed / this.batchTotal) * 100);
  }

  get batchSuccessCount(): number {
    return this.batchProcessed - this.batchErrors;
  }

  closeBatchPanel() {
    this.showBatchPanel = false;
    this.isBatchMode = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Clinical stats
  // ─────────────────────────────────────────────────────────────
  private calculateClinicalStats(mask: number[][] | null, detections: any[] | null, model: any): any {
    let abnormalPixels = 0;
    let normalPixels = 0;
    let totalCellPixels = 0;
    let avgConfidence = 0;
    let cancerousCellCount = 0;

    if (mask) {
      mask.forEach(row => {
        row.forEach(cls => {
          if (cls === 1) abnormalPixels++;
          if (cls === 2) normalPixels++;
        });
      });
      totalCellPixels = abnormalPixels + normalPixels;
    }

    if (detections) {
      cancerousCellCount = detections.filter(d =>
        (d.class_name || '').toLowerCase().includes('anormal') || d.class_id === 1
      ).length;
      const sumConf = detections.reduce((acc, d) => acc + (d.confidence || 0), 0);
      avgConfidence = detections.length > 0 ? sumConf / detections.length : 0;
    } else {
      avgConfidence = model.stats.accuracy;
    }

    const abnormalPercentage = totalCellPixels > 0 ? (abnormalPixels / totalCellPixels) * 100 : 0;
    const normalPercentage = totalCellPixels > 0 ? (normalPixels / totalCellPixels) * 100 : 0;

    const hasCancer = abnormalPixels > 10 || cancerousCellCount > 0;
    const diagnosis = hasCancer ? 'ANORMAL' : 'NORMAL';
    const diagnosisMsg = hasCancer
      ? 'Se han detectado indicios de celularidad anormal que sugieren presencia de lesiones o cáncer.'
      : 'No se detectaron células anormales significativas en la muestra analizada.';

    return {
      abnormalPixels,
      normalPixels,
      totalCellPixels,
      abnormalPercentage,
      normalPercentage,
      cancerousCellCount,
      avgConfidence,
      diagnosis,
      diagnosisMsg
    };
  }

  private findClusters(mask: number[][]): any[] {
    const h = mask.length;
    const w = mask[0].length;
    const visited = Array.from({ length: h }, () => new Uint8Array(w));
    const clusters: any[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cls = mask[y][x];
        if (cls > 0 && !visited[y][x]) {
          const cluster = { cls, minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };
          const queue: [number, number][] = [[x, y]];
          visited[y][x] = 1;

          while (queue.length > 0) {
            const [cx, cy] = queue.shift()!;
            cluster.pixels++;
            if (cx < cluster.minX) cluster.minX = cx;
            if (cx > cluster.maxX) cluster.maxX = cx;
            if (cy < cluster.minY) cluster.minY = cy;
            if (cy > cluster.maxY) cluster.maxY = cy;

            const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
                !visited[ny][nx] && mask[ny][nx] === cls) {
                visited[ny][nx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
          if (cluster.pixels > 20) {
            clusters.push(cluster);
          }
        }
      }
    }
    return clusters;
  }

  async toggleLabels() {
    this.showLabels = !this.showLabels;
    if (this.activeRecord && this.activeRecord.status === 'done') {
      const model = this.session.selectedModel;
      if (model.type === 'segmentation') {
        const overlay = await this.renderOverlay(
          this.activeRecord.originalUrl,
          this.activeRecord.maskData!,
          this.activeRecord.maskData!.length,
          this.activeRecord.maskData![0].length
        );
        this.session.updateRecord(this.activeRecord.id, { overlayCanvas: overlay });
        this.activeRecord = this.session.records.find(r => r.id === this.activeRecord!.id) || null;
      }
      this.cdr.detectChanges();
    }
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target!.result as string);
      reader.readAsDataURL(file);
    });
  }

  private getNormalizedBlob(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Reads the EXIF orientation tag from a JPEG file.
   */
  private getExifOrientation(file: File): Promise<number> {
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const view = new DataView(e.target!.result as ArrayBuffer);
        if (view.getUint16(0, false) !== 0xFFD8) { res(1); return; }
        let offset = 2;
        while (offset < view.byteLength) {
          if (view.getUint16(offset, false) === 0xFFE1) {
            const exifHeader = view.getUint32(offset + 4, false);
            if (exifHeader !== 0x45786966) { res(1); return; }
            const little = view.getUint16(offset + 10, false) === 0x4949;
            const ifdOffset = view.getUint32(offset + 14, little);
            const tags = view.getUint16(offset + 10 + ifdOffset, little);
            for (let i = 0; i < tags; i++) {
              const tagBase = offset + 10 + ifdOffset + 2 + (i * 12);
              if (view.getUint16(tagBase, little) === 0x0112) {
                res(view.getUint16(tagBase + 8, little));
                return;
              }
            }
            res(1); return;
          }
          offset += 2 + view.getUint16(offset + 2, false);
        }
        res(1);
      };
      reader.onerror = () => res(1);
      reader.readAsArrayBuffer(file.slice(0, 65536));
    });
  }

  private renderMask(mask: number[][], h: number, w: number): Promise<string> {
    return new Promise(res => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(w, h);
      const colors = [
        [15, 23, 42, 255],
        [255, 0, 0, 255],   // anormal: rojo
        [0, 255, 0, 255],   // normal: verde
      ];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cls = mask[y][x];
          const i = (y * w + x) * 4;
          const c = colors[cls] || colors[0];
          imageData.data[i] = c[0];
          imageData.data[i + 1] = c[1];
          imageData.data[i + 2] = c[2];
          imageData.data[i + 3] = c[3];
        }
      }
      ctx.putImageData(imageData, 0, 0);
      res(canvas.toDataURL());
    });
  }

  private renderOverlay(originalUrl: string, mask: number[][], h: number, w: number): Promise<string> {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = imgW; canvas.height = imgH;
        const ctx = canvas.getContext('2d')!;

        ctx.drawImage(img, 0, 0, imgW, imgH);

        const model = this.session.selectedModel;

        const tmp = document.createElement('canvas');
        tmp.width = imgW; tmp.height = imgH;
        const tCtx = tmp.getContext('2d')!;
        const overlayData = tCtx.createImageData(imgW, imgH);
        const colors: ({ r: number; g: number; b: number } | null)[] = [
          null,
          { r: 255, g: 0, b: 0 },   // anormal: rojo
          { r: 0, g: 255, b: 0 },   // normal: verde
        ];
        for (let y = 0; y < imgH; y++) {
          for (let x = 0; x < imgW; x++) {
            const maskY = Math.floor(y * h / imgH);
            const maskX = Math.floor(x * w / imgW);
            const cls = mask[maskY]?.[maskX];
            const c = cls != null ? colors[cls] : null;
            if (c) {
              const i = (y * imgW + x) * 4;
              overlayData.data[i]     = c.r;
              overlayData.data[i + 1] = c.g;
              overlayData.data[i + 2] = c.b;
              overlayData.data[i + 3] = 160;
            }
          }
        }
        tCtx.putImageData(overlayData, 0, 0);
        ctx.drawImage(tmp, 0, 0);

        if (this.showLabels && model.id !== 'mmm-ucervix-yolo') {
          const clusters = this.findClusters(mask);
          const confidence = (model.stats.accuracy * 100).toFixed(1);

          clusters.forEach(c => {
            const x = c.minX * imgW / w;
            const y = c.minY * imgH / h;
            const bw = (c.maxX - c.minX + 1) * imgW / w;
            const className = c.cls === 1 ? 'Anormal' : 'Normal';
            const color = c.cls === 1 ? '#ef4444' : '#22c55e';

            ctx.font = 'bold 20px Inter';
            const label = `${className} (${confidence}%)`;
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = color;
            ctx.fillRect(x, y - 28, textWidth + 12, 28);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 6, y - 8);

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, bw, (c.maxY - c.minY + 1) * imgH / h);
          });
        }

        res(canvas.toDataURL());
      };
      img.src = originalUrl;
    });
  }

  private renderYoloOverlay(originalUrl: string, detections: any[]): Promise<string> {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = imgW; canvas.height = imgH;
        const ctx = canvas.getContext('2d')!;

        ctx.drawImage(img, 0, 0, imgW, imgH);

        ctx.lineWidth = 4;
        ctx.font = 'bold 18px Arial';

        if (detections && detections.length > 0) {
          detections.forEach(d => {
            const [x1, y1, x2, y2] = d.bbox_xyxy;
            const w = x2 - x1;
            const h = y2 - y1;

            let color = '#ff0000';
            const className = (d.class_name || '').toLowerCase();
            if (className.includes('normal') && !className.includes('anormal')) {
              color = '#00ff00';
            } else if (d.class_id === 2 && !className) {
              color = '#00ff00';
            }

            ctx.strokeStyle = color;
            ctx.strokeRect(x1, y1, w, h);

            ctx.fillStyle = color;
            const text = `${d.class_name} (${(d.confidence * 100).toFixed(1)}%)`;
            const textWidth = ctx.measureText(text).width;
            ctx.fillRect(x1, y1 - 24, textWidth + 10, 24);

            ctx.fillStyle = '#000000';
            ctx.fillText(text, x1 + 5, y1 - 6);
          });
        }

        res(canvas.toDataURL());
      };
      img.src = originalUrl;
    });
  }

  selectRecord(r: ImageRecord) {
    this.activeRecord = r;
    if (r.isYolo && this.viewMode === 'mask') {
      this.viewMode = 'overlay';
    }
  }

  setView(mode: ViewMode) { this.viewMode = mode; }

  downloadResult() {
    if (!this.activeRecord) return;
    const url = this.viewMode === 'mask'
      ? this.activeRecord.maskCanvas
      : this.viewMode === 'overlay'
        ? this.activeRecord.overlayCanvas
        : this.activeRecord.originalUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultado_${this.activeRecord.fileName}`;
    a.click();
  }

  async downloadBoth() {
    if (!this.activeRecord) return;
    
    const zip = new JSZip();
    
    // Add original
    const origData = this.activeRecord.originalUrl.split(',')[1];
    zip.file(`original_${this.activeRecord.fileName.replace(/\.[^/.]+$/, '')}.jpg`, origData, { base64: true });
    
    // Add result
    let resultUrl = this.viewMode === 'mask' ? this.activeRecord.maskCanvas : this.activeRecord.overlayCanvas;
    if (!resultUrl) resultUrl = this.activeRecord.originalUrl;
    
    const resultData = resultUrl.split(',')[1];
    zip.file(`resultado_${this.activeRecord.fileName.replace(/\.[^/.]+$/, '')}.jpg`, resultData, { base64: true });
    
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparacion_${this.activeRecord.fileName.replace(/\.[^/.]+$/, '')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clearHistory() {
    this.session.clearRecords();
    this.activeRecord = null;
    this.isBatchMode = false;
    this.isBatchDone = false;
    this.showBatchPanel = false;
    this.batchTotal = 0;
    this.batchProcessed = 0;
    this.batchErrors = 0;
    this.batchZipName = '';
  }

  formatTime(d: Date): string {
    return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
}