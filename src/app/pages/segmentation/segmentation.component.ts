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
    { r: 0, g: 0, b: 0, a: 0 },          // background - transparent
    { r: 56, g: 189, b: 248, a: 180 },    // class 1 - teal
    { r: 129, g: 140, b: 248, a: 180 },   // class 2 - indigo
  ];

  constructor(
    public session: SessionService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

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
    const allowed = ['image/jpeg','image/png','image/bmp','image/webp','image/tiff'];
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
      const result = await this.http.post<any>(model.apiUrl, formData).toPromise();

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

  private renderMask(mask: number[][], h: number, w: number): Promise<string> {
    return new Promise(res => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(w, h);
      const colors = [
        [15, 23, 42, 255],
        [56, 189, 248, 255],
        [129, 140, 248, 255],
      ];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cls = mask[y][x];
          const i = (y * w + x) * 4;
          const c = colors[cls] || colors[0];
          imageData.data[i] = c[0];
          imageData.data[i+1] = c[1];
          imageData.data[i+2] = c[2];
          imageData.data[i+3] = c[3];
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
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const overlayData = ctx.createImageData(w, h);
        const colors = [
          null,
          { r: 56, g: 189, b: 248, a: 140 },
          { r: 129, g: 140, b: 248, a: 140 },
        ];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const cls = mask[y][x];
            const c = colors[cls];
            if (c) {
              const i = (y * w + x) * 4;
              overlayData.data[i] = c.r;
              overlayData.data[i+1] = c.g;
              overlayData.data[i+2] = c.b;
              overlayData.data[i+3] = c.a;
            }
          }
        }
        // Draw base image
        ctx.drawImage(img, 0, 0, w, h);
        // Draw overlay
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const tCtx = tmp.getContext('2d')!;
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
