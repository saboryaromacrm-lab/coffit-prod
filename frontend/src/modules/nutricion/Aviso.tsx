// Recuadro de avisos del detalle nutricional (faltantes, sin controlar, alertas).
export default function Aviso({ clase, titulo, children }: { clase: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`border rounded-lg px-3 py-2 text-xs ${clase}`}>
      <div className="font-semibold mb-0.5">{titulo}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
