// Devuelve el prefijo del area colaborador CON la access_key si estamos dentro
// de ella (ej: "/colaborador/ab12cd34"), o "" si no. Sirve para que la
// navegacion interna de las paginas se quede dentro del link del colaborador.
export function colabBase(pathname: string): string {
  const m = pathname.match(/^\/colaborador\/[^/]+/);
  return m ? m[0] : '';
}
