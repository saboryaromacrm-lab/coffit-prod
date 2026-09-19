// ============================================================================
// PRE-COMPRESION DE FOTOS EN EL NAVEGADOR
//
// Las fotos del celular pesan 3-12 MB. Subirlas crudas tarda una eternidad, asi
// que antes de mandarlas al servidor las achicamos a un tamaño razonable.
//
// El servidor igual hace la optimizacion final (WebP 1200px): este paso es solo
// para que el upload vuele. Por eso se usa calidad alta (0.92) y un lado mayor
// que el final — no queremos perder calidad dos veces.
//
// Si algo falla, se devuelve el archivo original: subir lento es mejor que no
// poder subir.
// ============================================================================

const LADO_MAX = 2000;
const CALIDAD = 0.92;
// Por debajo de esto no vale la pena: el servidor lo optimiza igual.
const MINIMO_PARA_COMPRIMIR = 1.5 * 1024 * 1024;

export function esImagen(file: File): boolean {
  return file.type.startsWith('image/');
}

export function formatearPeso(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export async function preComprimir(file: File): Promise<File> {
  if (file.size < MINIMO_PARA_COMPRIMIR) return file;

  try {
    // imageOrientation 'from-image' aplica el EXIF: sin esto las fotos
    // verticales del celular quedan acostadas.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1) { bitmap.close(); return file; }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', CALIDAD)
    );
    // Si comprimir no achico nada, no tiene sentido mandar la version recodificada
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
