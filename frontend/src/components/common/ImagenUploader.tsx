import { useState, useRef } from 'react';
import { Upload, X, Link as LinkIcon, ImageOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadsApi } from '../../api/uploads';
import { preComprimir, esImagen, formatearPeso } from '../../utils/imagen';

// ============================================================================
// Subida de foto de producto.
// Se puede arrastrar, elegir un archivo o pegar una URL externa (las fotos
// viejas de Hostinger siguen siendo URLs y tienen que poder editarse a mano).
// La foto se achica en el navegador y el servidor la deja en WebP optimizado.
// ============================================================================

interface Props {
  value: string;
  onChange: (url: string) => void;
}

export default function ImagenUploader({ value, onChange }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [modoUrl, setModoUrl] = useState(false);
  const [fallo, setFallo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subir = async (file: File) => {
    if (!esImagen(file)) return toast.error('Ese archivo no es una imagen');
    setSubiendo(true);
    setProgreso(0);
    try {
      const listo = await preComprimir(file);
      const res = await uploadsApi.imagen(listo, setProgreso);
      const d = res.data;
      onChange(d.url);
      setFallo(false);
      toast.success(`Foto lista: ${formatearPeso(file.size)} → ${formatearPeso(d.bytes)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setSubiendo(false);
      setProgreso(0);
      if (inputRef.current) inputRef.current.value = ''; // permite re-subir el mismo archivo
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) subir(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-text-primary">Foto</label>
        <button
          type="button"
          onClick={() => setModoUrl(!modoUrl)}
          className="text-[11px] text-text-muted hover:text-primary flex items-center gap-1"
        >
          <LinkIcon size={11} /> {modoUrl ? 'Subir archivo' : 'Pegar URL'}
        </button>
      </div>

      {modoUrl ? (
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setFallo(false); }}
          placeholder="https://..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          className={`flex items-center gap-3 p-2.5 border border-dashed rounded-lg transition-colors ${
            arrastrando ? 'border-primary bg-primary/5' : 'border-gray-300 bg-gray-50/50'
          }`}
        >
          {/* Preview */}
          <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
            {value && !fallo ? (
              <img src={value} alt="" className="w-full h-full object-cover" onError={() => setFallo(true)} />
            ) : (
              <ImageOff size={18} className="text-gray-300" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {subiendo ? (
              <div>
                <div className="flex items-center gap-2 text-xs text-text-muted mb-1.5">
                  <Loader2 size={13} className="animate-spin" /> Subiendo y optimizando... {progreso}%
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progreso}%` }} />
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-300 hover:border-primary hover:text-primary"
                >
                  <Upload size={12} /> {value ? 'Cambiar foto' : 'Subir foto'}
                </button>
                <p className="text-[10px] text-text-muted mt-1">
                  {fallo
                    ? <span className="text-red-500">La imagen no carga — revisá la URL</span>
                    : 'Arrastrala acá o elegí un archivo. Se optimiza sola para la carta.'}
                </p>
              </>
            )}
          </div>

          {value && !subiendo && (
            <button
              type="button"
              onClick={() => { onChange(''); setFallo(false); }}
              className="p-1.5 text-text-muted hover:text-red-600 shrink-0"
              title="Quitar foto"
            >
              <X size={14} />
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }}
          />
        </div>
      )}
    </div>
  );
}
