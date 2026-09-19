require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Detras de Traefik: sin esto req.protocol siempre diria "http" y las URLs de
// las imagenes subidas saldrian mal armadas.
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// IMAGENES SUBIDAS — estaticas y publicas (las carga la app del menu por <img>
// desde otro dominio). El nombre lleva hash, asi que el contenido nunca cambia
// para una misma URL: se puede cachear fuerte.
// ---------------------------------------------------------------------------
app.use(
  '/uploads',
  cors({ origin: '*' }),
  express.static(require('./utils/imagenes').UPLOADS_DIR, {
    maxAge: '1y',
    immutable: true,
    fallthrough: false, // una foto que no existe da 404, no cae en el resto de rutas
  })
);

// ---------------------------------------------------------------------------
// API PUBLICA DE LA CARTA DIGITAL (read-only) — CORS ABIERTO.
// Se monta ANTES del CORS global porque la app del menu digital puede vivir
// en cualquier dominio. Es solo lectura y no expone datos internos (costo,
// rentabilidad, mapeo). Reemplaza al Google Sheets.
// ---------------------------------------------------------------------------
app.use('/api/public/carta', cors({ origin: '*' }), require('./routes/cartaPublic'));
// API publica del POS: articulos "Para venta" de Sabor y Aroma (solo lectura,
// sin costos). La consume el sistema de ventas de coffit.
app.use('/api/public/pos', cors({ origin: '*' }), require('./routes/posPublic'));

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, etc.)
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  }
}));
// Limite amplio: el import de Sabor y Aroma pega el historial completo del
// sync del CRM (hasta 200 envios con detalle) que supera los 100kb del default.
app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/unidades', require('./routes/unidades'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/canales', require('./routes/canales'));
app.use('/api/conceptos', require('./routes/conceptos'));
app.use('/api/ingredientes', require('./routes/ingredientes'));
app.use('/api/subrecetas', require('./routes/subrecetas'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/ofertas', require('./routes/ofertas'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/preparaciones', require('./routes/preparaciones'));
app.use('/api/produccion', require('./routes/produccion'));
app.use('/api/costo-producto', require('./routes/costoProducto'));
app.use('/api/perdidas', require('./routes/perdidas'));
app.use('/api/costos-productos', require('./routes/costosProductos'));
app.use('/api/envios', require('./routes/envios'));
app.use('/api/envios-coffit', require('./routes/enviosCoffit'));
app.use('/api/public/ingredientes', require('./routes/ingredientesPublic'));
app.use('/api/plan-semanal', require('./routes/planSemanal'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/conceptos-compra', require('./routes/conceptosCompra'));
app.use('/api/metodos-pago', require('./routes/metodosPago'));
app.use('/api/carta', require('./routes/carta'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/colaboradores', require('./routes/colaboradores'));
app.use('/api/sya', require('./routes/sya'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CoffitCost API running' });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
const IMG = require('./utils/imagenes');

// La carpeta de imagenes tiene que existir antes del primer upload (en el VPS
// es un volumen montado, que arranca vacio).
IMG.asegurarCarpeta()
  .catch((e) => console.error('No se pudo crear la carpeta de imagenes:', e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`CoffitCost API running on port ${PORT}`);
      console.log(`Imagenes en: ${IMG.UPLOADS_DIR}`);
    });
  });
