import {
  Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionService, ImageRecord, ModelConfig } from '../../services/session.service';

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

  private subs = new Subscription();

  CLASS_COLORS = [
    { r: 0, g: 0, b: 0, a: 0 },          // 0: fondo - transparent
    { r: 255, g: 0, b: 0, a: 180 },       // 1: anormal - rojo
    { r: 0, g: 255, b: 0, a: 180 },       // 2: normal - verde
  ];

  constructor(
    public session: SessionService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
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

  async handleFile(file: File) {
    const allowed = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/tiff'];
    if (!allowed.includes(file.type)) {
      alert('Formato no soportado. Use: JPG, PNG, BMP, WEBP o TIFF');
      return;
    }

    const originalUrl = await this.fileToDataUrl(file);
    const model = this.session.selectedModel;
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      fileName: file.name,
      originalUrl,
      maskData: null,
      maskCanvas: null,
      overlayCanvas: null,
      modelUsed: model.name,
      timestamp: new Date(),
      status: 'processing'
    };

    this.session.addRecord(record);
    this.activeRecord = record;
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      
      console.log('Conectando con el modelo:', model.apiUrl);
      const result = await this.http.post<any>(model.apiUrl, formData).toPromise();
      console.log('Respuesta del modelo:', result);

      const maskCanvas = await this.renderMask(result.mask, result.shape[0], result.shape[1]);
      const overlayCanvas = await this.renderOverlay(originalUrl, result.mask, result.shape[0], result.shape[1]);

      this.session.updateRecord(record.id, {
        status: 'done',
        maskData: result.mask,
        maskCanvas,
        overlayCanvas
      });

      this.activeRecord = this.session.records.find(r => r.id === record.id) || null;
    } catch (err: any) {
      const msg = err?.error?.detail || err?.message || 'Error al conectar con el modelo';
      this.session.updateRecord(record.id, { status: 'error', errorMsg: msg });
      this.activeRecord = this.session.records.find(r => r.id === record.id) || null;
    }

    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target!.result as string);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Reads the EXIF orientation tag from a JPEG file.
   * Returns a value from 1–8 (1 = normal, no rotation needed).
   */
  private getExifOrientation(file: File): Promise<number> {
    return new Promise(res => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const view = new DataView(e.target!.result as ArrayBuffer);
        // Check JPEG SOI marker
        if (view.getUint16(0, false) !== 0xFFD8) { res(1); return; }
        let offset = 2;
        while (offset < view.byteLength) {
          if (view.getUint16(offset, false) === 0xFFE1) {
            // APP1 marker found
            const exifHeader = view.getUint32(offset + 4, false);
            if (exifHeader !== 0x45786966) { res(1); return; } // 'Exif'
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

  /**
   * Returns a corrected data URL that has EXIF rotation baked in,
   * so canvas operations produce the same orientation the browser would show.
   */
  private async normalizeOrientation(file: File, dataUrl: string): Promise<string> {
    const orientation = await this.getExifOrientation(file);
    if (orientation <= 1) return dataUrl; // already correct

    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        // Orientations 5–8 swap width and height
        if (orientation >= 5) { canvas.width = h; canvas.height = w; }
        else                   { canvas.width = w; canvas.height = h; }

        // Apply the transform that undoes the EXIF rotation
        switch (orientation) {
          case 2: ctx.transform(-1, 0, 0,  1, w, 0); break;
          case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
          case 4: ctx.transform( 1, 0, 0, -1, 0, h); break;
          case 5: ctx.transform( 0, 1, 1,  0, 0, 0); break;
          case 6: ctx.transform( 0, 1,-1,  0, h, 0); break;
          case 7: ctx.transform( 0,-1,-1,  0, h, w); break;
          case 8: ctx.transform( 0,-1, 1,  0, 0, w); break;
        }
        ctx.drawImage(img, 0, 0);
        res(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = dataUrl;
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
        // Usar las dimensiones reales de la imagen, no las del modelo
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = imgW; canvas.height = imgH;
        const ctx = canvas.getContext('2d')!;

        // Dibujar imagen en su tamaño original
        ctx.drawImage(img, 0, 0, imgW, imgH);

        // Construir overlay escalando la máscara al tamaño real de la imagen
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
            // Mapear coordenadas de la imagen a coordenadas de la máscara
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
        res(canvas.toDataURL());
      };
      img.src = originalUrl;
    });
  }

  selectRecord(r: ImageRecord) { this.activeRecord = r; }

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

  clearHistory() {
    this.session.clearRecords();
    this.activeRecord = null;
  }

  formatTime(d: Date): string {
    return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
}       