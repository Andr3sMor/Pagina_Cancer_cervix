import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ModelService {
  constructor(private http: HttpClient) {}

  async predict(apiUrl: string, file: File): Promise<{ mask: number[][], shape: number[], classes: number }> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<any>(apiUrl, formData).toPromise();
  }
}
