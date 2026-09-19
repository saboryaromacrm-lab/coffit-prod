import api from './axios';
import type { ApiResponse } from '../types';

export interface ImagenSubida {
  url: string;
  nombre: string;
  bytes: number;
  bytes_original: number;
  ancho: number;
  alto: number;
}

export const uploadsApi = {
  // El Content-Type va en undefined a proposito: el navegador tiene que ponerlo
  // el solo con el boundary del multipart (el default JSON del cliente lo rompe).
  imagen: (file: File, onProgress?: (pct: number) => void): Promise<ApiResponse<ImagenSubida>> => {
    const form = new FormData();
    form.append('imagen', file);
    return api.post('/uploads/imagen', form, {
      headers: { 'Content-Type': undefined },
      timeout: 60000, // una foto pesada por conexion lenta necesita mas que el default
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },
};
