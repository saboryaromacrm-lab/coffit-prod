import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Antes todo error sin mensaje del servidor se mostraba como "Error de
// conexion": un timeout, un 502 del proxy o una caida de red se veian igual y
// no habia forma de saber que habia pasado. Ahora cada caso tiene su mensaje,
// y el detalle tecnico queda en la consola del navegador (F12) para diagnosticar.
function mensajeDeError(error: AxiosError<{ message?: string }>): string {
  const status = error.response?.status;
  const delServidor = error.response?.data?.message;
  if (delServidor) return delServidor;

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    // Un guardado que tarda puede haberse completado igual del lado del servidor:
    // avisarlo evita que se reintente y se cree algo duplicado.
    return 'El servidor tardo demasiado en responder. Revisa si se guardo antes de reintentar.';
  }
  if (status) return `El servidor respondio con un error (HTTP ${status}). Reintenta en unos segundos.`;
  return 'Sin conexion con el servidor. Reintenta en unos segundos.';
}

api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{ message?: string }>) => {
    const message = mensajeDeError(error);
    console.error('[api]', error.config?.method?.toUpperCase(), error.config?.url, {
      status: error.response?.status ?? null,
      code: error.code ?? null,
      detalle: error.message,
    });
    return Promise.reject(new Error(message));
  }
);

export default api;
