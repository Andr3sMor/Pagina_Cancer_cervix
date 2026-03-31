import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface BoundingBox {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox_xyxy: [number, number, number, number];
}

export interface ClinicalStats {
  abnormalPixels: number;
  normalPixels: number;
  totalCellPixels: number;
  abnormalPercentage: number;
  normalPercentage: number;
  cancerousCellCount: number;
  avgConfidence: number;
  diagnosis: 'NORMAL' | 'ANORMAL' | 'REQUIERE_REVISIÓN';
  diagnosisMsg: string;
}

export interface ImageRecord {
  id: string;
  fileName: string;
  originalUrl: string;
  maskData: number[][] | null;
  detections: BoundingBox[] | null;
  maskCanvas: string | null;
  overlayCanvas: string | null;
  modelUsed: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  isYolo?: boolean;
  clinicalStats?: ClinicalStats;
}
export interface ModelConfig {
  id: string;
  name: string;
  apiUrl: string;
  description: string;
  type: 'segmentation' | 'detection';
  stats: ModelStats;
}

export interface ModelStats {
  accuracy: number;
  iou: number;
  dice: number;
  precision: number;
  recall: number;
  f1: number;
  trainEpochs: number;
  trainLoss: number;
  valLoss: number;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly MODELS: ModelConfig[] = [
    {
      id: 'mmm-ucervix-best',
      name: 'MMM U-Cervix (Best)',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/best',
      description: 'Modelo U-Net optimizado',
      type: 'segmentation',
      stats: { accuracy: 0.9312, iou: 0.7845, dice: 0.8291, precision: 0.8103, recall: 0.8512, f1: 0.8303, trainEpochs: 50, trainLoss: 0.1823, valLoss: 0.2104 }
    },
    {
      id: 'mmm-ucervix-resunet',
      name: 'MMM Res-UNet',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/resunet',
      description: 'Modelo Residual U-Net',
      type: 'segmentation',
      stats: { accuracy: 0.9187, iou: 0.7634, dice: 0.8102, precision: 0.7956, recall: 0.8284, f1: 0.8117, trainEpochs: 50, trainLoss: 0.1951, valLoss: 0.2238 }
    },
    {
      id: 'mmm-ucervix-spatial',
      name: 'MMM Spatial Dropout',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/spatial',
      description: 'Modelo con Spatial Dropout',
      type: 'segmentation',
      stats: { accuracy: 0.9201, iou: 0.7712, dice: 0.8156, precision: 0.8012, recall: 0.8341, f1: 0.8189, trainEpochs: 50, trainLoss: 0.1895, valLoss: 0.2155 }
    },
    {
      id: 'mmm-ucervix-yolo',
      name: 'YOLOv8 Detección',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/yolo',
      description: 'Modelo YOLOv8 para detección de anomalías cervicales',
      type: 'detection',
      stats: { accuracy: 0.9412, iou: 0.8105, dice: 0.8402, precision: 0.8521, recall: 0.8814, f1: 0.8654, trainEpochs: 100, trainLoss: 0.1502, valLoss: 0.1801 }
    }
  ];

  private recordsSubject = new BehaviorSubject<ImageRecord[]>([]);
  records$ = this.recordsSubject.asObservable();

  private selectedModelSubject = new BehaviorSubject<ModelConfig>(this.MODELS[0]);
  selectedModel$ = this.selectedModelSubject.asObservable();

  get records(): ImageRecord[] { return this.recordsSubject.value; }
  get selectedModel(): ModelConfig { return this.selectedModelSubject.value; }

  selectModel(id: string) {
    const m = this.MODELS.find(x => x.id === id);
    if (m) this.selectedModelSubject.next(m);
  }

  addRecord(r: ImageRecord) {
    this.recordsSubject.next([r, ...this.recordsSubject.value]);
  }

  updateRecord(id: string, patch: Partial<ImageRecord>) {
    const updated = this.recordsSubject.value.map(r =>
      r.id === id ? { ...r, ...patch } : r
    );
    this.recordsSubject.next(updated);
  }

  clearRecords() {
    this.recordsSubject.next([]);
  }
}