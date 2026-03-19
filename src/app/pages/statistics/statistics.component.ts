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

  METRICS = [
    { key: 'accuracy',  label: 'Accuracy',   icon: '🎯', color: '#38bdf8', description: 'Porcentaje de píxeles clasificados correctamente' },
    { key: 'iou',       label: 'IoU',         icon: '⬡',  color: '#818cf8', description: 'Intersección sobre Unión (Jaccard Index)' },
    { key: 'dice',      label: 'Dice Score',  icon: '◈',  color: '#34d399', description: 'Coeficiente de similitud de Dice (F1 espacial)' },
    { key: 'precision', label: 'Precisión',   icon: '◎',  color: '#fbbf24', description: 'TP / (TP + FP)' },
    { key: 'recall',    label: 'Recall',      icon: '◉',  color: '#f472b6', description: 'TP / (TP + FN) — Sensibilidad' },
    { key: 'f1',        label: 'F1 Score',    icon: '◆',  color: '#fb923c', description: 'Media armónica de Precisión y Recall' },
  ];

  TRAIN_METRICS = [
    { key: 'trainEpochs', label: 'Épocas' },
    { key: 'trainLoss',   label: 'Train Loss' },
    { key: 'valLoss',     label: 'Val Loss' },
  ];

  constructor(public session: SessionService) {}

  ngOnInit() {
    this.models = this.session.MODELS;
    this.session.selectedModel$.subscribe(m => {
      this.selectedModelId = m.id;
      this.selectedModel = m;
    });
  }

  onModelChange() { this.session.selectModel(this.selectedModelId); }

  getStatNum(model: ModelConfig, key: string): number {
    return ((model.stats as unknown) as Record<string, number>)[key] ?? 0;
  }

  getStatStr(model: ModelConfig, key: string): string {
    const v = ((model.stats as unknown) as Record<string, number | string>)[key];
    return v !== undefined ? String(v) : '—';
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
}
