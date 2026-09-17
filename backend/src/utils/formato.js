// Formato de precio AR listo para mostrar: 4200 -> "4.200,00"
// Lo usan las APIs publicas (carta digital y POS).
function precioAR(n) {
  const num = Number(n) || 0;
  const [ent, dec] = num.toFixed(2).split('.');
  const entSep = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${entSep},${dec}`;
}

module.exports = { precioAR };
