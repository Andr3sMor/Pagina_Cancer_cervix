import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService, ModelConfig } from '../../services/session.service';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss']
})
export class StatisticsComponent implements OnInit {
  models: ModelConfig[] = [];
  selectedModelId = '';
  selectedModel: ModelConfig | null = null;
  showCompareModal = false;
  isDarkTheme = false;

  METRICS = [
    { key: 'accuracy',  testKey: 'testAccuracy', label: 'Accuracy',   icon: '🎯', color: '#38bdf8', description: 'Porcentaje de píxeles clasificados correctamente' },
    { key: 'iou',       testKey: 'testIoU',      label: 'IoU (mIoU)',  icon: '⬡',  color: '#818cf8', description: 'Intersección sobre Unión (Media)' },
    { key: 'f1',        testKey: 'testF1',       label: 'F1 Score',    icon: '◆',  color: '#fb923c', description: 'Media armónica de Precisión y Recall' },
    { key: 'precision', testKey: '',             label: 'Precisión',   icon: '◎',  color: '#fbbf24', description: 'Capacidad de evitar falsos positivos' },
    { key: 'recall',    testKey: '',             label: 'Recall',      icon: '◉',  color: '#f472b6', description: 'Capacidad de detectar todos los casos positivos' },
  ];

  TRAIN_METRICS = [
    { key: 'trainEpochs', label: 'Épocas' },
    { key: 'trainLoss',   label: 'Train Loss' },
    { key: 'valLoss',     label: 'Val Loss' },
  ];

  TEST_METRICS = [
    { key: 'testAccuracy', label: 'Test Acc' },
    { key: 'testIoU',      label: 'Test IoU' },
    { key: 'testF1',       label: 'Test F1'  },
  ];

  TECHNICAL_ANALYSIS = [
    {
      title: 'Segmentación de Bordes (IoU/F1)',
      winner: 'MMM Res-UNet',
      icon: '🏆',
      desc: 'Con un IoU de 68.19% en validación, es el modelo más preciso para delimitar el mapa de células, superando a las demás variantes arquitecturales.',
      color: 'var(--accent)'
    },
    {
      title: 'Generalización Clínica (Test Global)',
      winner: 'MMM U-Cervix',
      icon: '🛡️',
      desc: 'Demuestra la mayor robustez en datos no vistos (Test) con un 55.8% de IoU promedio, siendo el modelo más estable frente a variabilidad del dataset.',
      color: '#10b981'
    }
  ];

  constructor(public session: SessionService) {}

  ngOnInit() {
    this.isDarkTheme = document.body.classList.contains('dark-theme');
    this.models = this.session.MODELS;
    this.session.selectedModel$.subscribe(m => {
      this.selectedModelId = m.id;
      this.selectedModel = m;
    });
  }

  onModelChange() { this.session.selectModel(this.selectedModelId); }

  getStatNum(model: ModelConfig, key: string): number {
    return (model.stats as any)[key] ?? 0;
  }

  getStatStr(model: ModelConfig, key: string): string {
    const v = (model.stats as any)[key];
    if (key === 'valLoss' || key === 'trainLoss') return v?.toFixed(4) || '0.0000';
    return v !== undefined ? String(v) : '—';
  }

  isWinner(modelId: string, metricKey: string): boolean {
    const model = this.models.find(m => m.id === modelId);
    if (!model) return false;
    const val = this.getStatNum(model, metricKey);
    const max = Math.max(...this.models.map(m => this.getStatNum(m, metricKey)));
    return val === max && val > 0;
  }

  getDatasetMetric(model: ModelConfig, dataset: 'sipakmed' | 'mendeley', key: string): number {
    return (model.stats as any)[dataset]?.[key] ?? 0;
  }

  getMetricValue(key: string): number {
    return this.selectedModel ? this.getStatNum(this.selectedModel, key) : 0;
  }

  getTrainValue(key: string): string {
    return this.selectedModel ? this.getStatStr(this.selectedModel, key) : '—';
  }

  toPercent(v: number): string { return (v * 100).toFixed(1) + '%'; }
  barWidth(v: number): string  { return (v * 100) + '%'; }
  toggleCompare() { this.showCompareModal = !this.showCompareModal; }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    if (this.isDarkTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}
