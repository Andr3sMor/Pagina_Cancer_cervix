import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'segmentation', pathMatch: 'full' },
  {
    path: 'segmentation',
    loadComponent: () =>
      import('./pages/segmentation/segmentation.component').then(m => m.SegmentationComponent)
  },
  {
    path: 'statistics',
    loadComponent: () =>
      import('./pages/statistics/statistics.component').then(m => m.StatisticsComponent)
  },
  { path: '**', redirectTo: 'segmentation' }
];
