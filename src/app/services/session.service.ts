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
  // Métricas de Test (Global)
  testAccuracy: number;
  testIoU: number;
  testF1: number;
  // Métricas por dataset (Test específico)
  sipakmed?: { accuracy: number; iou: number; f1: number };
  mendeley?: { accuracy: number; iou: number; f1: number };
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly MODELS: ModelConfig[] = [
    {
      id: 'mmm-ucervix-base',
      name: 'MMM U-Cervix (Base)',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/best',
      description: 'Modelo de segmentación U-Net base (Multimodal)',
      type: 'segmentation',
      stats: { 
        accuracy: 0.8316, iou: 0.5580, dice: 0.6716, precision: 0.6421, recall: 0.7042, f1: 0.6716, 
        trainEpochs: 100, trainLoss: 0.4351, valLoss: 0.4351,
        testAccuracy: 0.8124, testIoU: 0.5342, testF1: 0.6412,
        sipakmed: { accuracy: 0.7912, iou: 0.5701, f1: 0.7081 },
        mendeley: { accuracy: 0.8602, iou: 0.5348, f1: 0.6359 }
      }
    },
    {
      id: 'mmm-ucervix-resunet',
      name: 'MMM Res-UNet',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/resunet',
      description: 'Modelo Residual U-Net (Mejor IoU global)',
      type: 'segmentation',
      stats: { 
        accuracy: 0.8623, iou: 0.5127, dice: 0.5975, precision: 0.5821, recall: 0.6134, f1: 0.5975, 
        trainEpochs: 64, trainLoss: 0.3690, valLoss: 0.3690,
        testAccuracy: 0.8415, testIoU: 0.4982, testF1: 0.5734,
        sipakmed: { accuracy: 0.8455, iou: 0.4998, f1: 0.5794 },
        mendeley: { accuracy: 0.8742, iou: 0.5118, f1: 0.5930 }
      }
    },
    {
      id: 'mmm-ucervix-spatial',
      name: 'MMM Spatial Dropout',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/spatial',
      description: 'Modelo U-Net con regularización Spatial Dropout',
      type: 'segmentation',
      stats: { 
        accuracy: 0.8596, iou: 0.5092, dice: 0.5906, precision: 0.5752, recall: 0.6081, f1: 0.5906, 
        trainEpochs: 100, trainLoss: 0.3555, valLoss: 0.3555,
        testAccuracy: 0.8351, testIoU: 0.4871, testF1: 0.5642,
        sipakmed: { accuracy: 0.8395, iou: 0.4985, f1: 0.5773 },
        mendeley: { accuracy: 0.8738, iou: 0.5137, f1: 0.5938 }
      }
    },
    {
      id: 'mmm-ucervix-yolo',
      name: 'YOLOv8-Seg (Real-time)',
      apiUrl: 'https://andr3s2004-models.hf.space/predict/yolo',
      description: 'Detección y segmentación en tiempo real (mAP optimizado)',
      type: 'detection',
      stats: { 
        accuracy: 0.8412, iou: 0.3711, dice: 0.5853, precision: 0.5647, recall: 0.6208, f1: 0.6035, 
        trainEpochs: 50, trainLoss: 1.5227, valLoss: 1.7992,
        testAccuracy: 0.8052, testIoU: 0.3421, testF1: 0.5714
      }
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