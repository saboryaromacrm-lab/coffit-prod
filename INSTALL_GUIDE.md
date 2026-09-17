# Guia de Instalacion - CoffitCost

Guia paso a paso para instalar CoffitCost en un cliente nuevo desde cero.

---

## Requisitos Previos

### Hosting (Backend + Base de Datos)
- Plan Hostinger con soporte **Node.js** (Business o superior)
- Base de datos **MySQL** incluida en el plan
- Acceso a **phpMyAdmin**
- Acceso al **Administrador de archivos** o FTP
- Un subdominio configurado (ej: `coffitcost.clientenuevo.com`)

### Hosting (Frontend)
- Cuenta en **Vercel** (plan gratuito alcanza)
- O cualquier hosting de sitios estaticos (Netlify, Cloudflare Pages, etc.)

### En tu PC (para build y deploy)
- **Node.js 18+** instalado
- **npm** instalado
- **Vercel CLI** instalado: `npm install -g vercel`
- Acceso a la carpeta del proyecto CoffitCost

---

## Paso 1: Crear la Base de Datos

### 1.1 Crear base de datos en Hostinger

1. Ir a **Panel Hostinger** → **Bases de datos** → **MySQL**
2. Crear nueva base de datos:
   - Nombre de la BD: elegir un nombre (ej: `u123456789_cofcost`)
   - Usuario: se genera automatico o elegir uno
   - Password: generar una password segura
3. **Anotar estos 3 datos** (los vas a necesitar despues):
   - Nombre de la BD
   - Usuario
   - Password

### 1.2 Crear las tablas

1. Ir a **phpMyAdmin** desde el panel de Hostinger
2. Seleccionar la base de datos recien creada
3. Ir a la pestana **SQL**
4. Copiar y pegar TODO el contenido de `backend/database/schema.sql`
5. Ejecutar
6. Verificar que se crearon **15 tablas**:
   - unidades
   - configuracion
   - proveedores
   - categorias_ingredientes
   - categorias_productos
   - canales_venta
   - conceptos_costo
   - ingredientes
   - subrecetas
   - subreceta_ingredientes
   - productos
   - producto_ingredientes
   - ofertas
   - oferta_productos
   - conceptos_canales

### 1.3 Cargar datos iniciales

1. En phpMyAdmin, ir nuevamente a la pestana **SQL**
2. Copiar y pegar TODO el contenido de `backend/database/seed.sql`
3. Ejecutar
4. Esto carga:
   - 6 unidades de medida (g, kg, ml, L, u, doc)
   - 7 configuraciones iniciales (IVA, IIBB, comisiones, etc.)
   - 3 canales de venta (Tarjeta, Efectivo, PedidosYa)
   - 5 conceptos de costo
   - 9 relaciones concepto-canal

> **IMPORTANTE**: Los porcentajes de IVA, IIBB, comisiones y descuentos vienen con valores por defecto. El cliente puede modificarlos despues desde la app en Configuracion.

---

## Paso 2: Configurar el Subdominio

1. En **Panel Hostinger** → **Dominios** → **Subdominios**
2. Crear subdominio: `coffitcost.dominiodelcliente.com`
3. Apuntarlo a la carpeta donde va a estar el backend (o usar la carpeta por defecto)
4. Esperar propagacion DNS (puede tardar hasta 24hs, normalmente minutos)
5. Activar **SSL/HTTPS** para el subdominio (Hostinger lo hace automatico con Let's Encrypt)

---

## Paso 3: Instalar el Backend

### 3.1 Preparar el archivo .env

Antes de subir, editar `backend/.env` con los datos del cliente nuevo:

```env
DB_HOST=127.0.0.1
DB_NAME=u123456789_cofcost
DB_USER=u123456789_cofcost
DB_PASSWORD=LaPasswordDelCliente123
DB_PORT=3306
PORT=3001
CORS_ORIGIN=https://coffitcost-cliente.vercel.app
NODE_ENV=production
```

**Reemplazar**:
| Variable | Que poner |
|---|---|
| DB_NAME | Nombre de la BD creada en Paso 1 |
| DB_USER | Usuario de la BD creada en Paso 1 |
| DB_PASSWORD | Password de la BD creada en Paso 1 |
| CORS_ORIGIN | La URL del frontend una vez que se deploye (se puede actualizar despues) |

> `DB_HOST` siempre es `127.0.0.1` en Hostinger (conexion local).

### 3.2 Subir archivos al servidor

Subir toda la carpeta `backend/` al servidor de Hostinger mediante:
- **Administrador de archivos** de Hostinger, o
- **FTP** (FileZilla u otro cliente)

La estructura en el servidor debe quedar:

```
public_html/   (o la carpeta del subdominio)
  |-- .env
  |-- package.json
  |-- package-lock.json
  |-- database/
  |   |-- schema.sql
  |   |-- seed.sql
  |   |-- migrate.js
  |-- src/
      |-- index.js
      |-- config/
      |-- middleware/
      |-- routes/
      |-- utils/
```

### 3.3 Configurar Node.js en Hostinger

1. Ir a **Panel Hostinger** → **Avanzado** → **Node.js**
2. Configurar la aplicacion:
   - **Node.js version**: 18 o superior
   - **Archivo de inicio**: `src/index.js`
   - **Carpeta raiz**: la carpeta donde subiste el backend
3. Ejecutar **NPM Install** desde el panel (boton disponible en la config de Node.js)
4. **Iniciar** la aplicacion

### 3.4 Verificar que funciona

Abrir en el navegador:

```
https://coffitcost.dominiodelcliente.com/api/health
```

Debe responder:
```json
{ "success": true, "message": "CoffitCost API running" }
```

Si da error:
- Verificar que el `.env` tiene los datos correctos
- Verificar que las tablas se crearon bien en phpMyAdmin
- Revisar los **logs** de Node.js en el panel de Hostinger

---

## Paso 4: Instalar el Frontend

### 4.1 Configurar la URL de la API

Editar `frontend/.env.production`:

```env
VITE_API_URL=https://coffitcost.dominiodelcliente.com/api
```

Reemplazar con la URL real del subdominio del backend del cliente.

### 4.2 Hacer el build

```bash
cd frontend
npm install
npm run build
```

Verificar que no haya errores. El build genera la carpeta `dist/`.

### 4.3 Deploy en Vercel

**Primera vez:**

```bash
cd frontend
vercel
```

Vercel va a preguntar:
- Set up and deploy? → **Y**
- Which scope? → Elegir tu cuenta
- Link to existing project? → **N**
- Project name? → Poner un nombre descriptivo (ej: `coffitcost-clientenuevo`)
- Directory? → `./`
- Detected Vite. Settings? → **Y** (aceptar defaults)

Despues del deploy de preview, hacer el deploy productivo:

```bash
vercel --prod
```

**Anotar la URL** que devuelve Vercel (ej: `https://coffitcost-clientenuevo.vercel.app`)

### 4.4 Actualizar CORS en el backend

Ahora que tenemos la URL del frontend, actualizar el `.env` del backend en Hostinger:

```env
CORS_ORIGIN=https://coffitcost-clientenuevo.vercel.app
```

**Reiniciar** la aplicacion Node.js desde el panel de Hostinger.

### 4.5 (Opcional) Dominio personalizado en Vercel

Si el cliente quiere una URL personalizada (ej: `app.clientenuevo.com`):

1. En Vercel → Settings → Domains → Agregar dominio
2. Configurar el DNS del dominio del cliente:
   - Tipo: CNAME
   - Nombre: `app` (o el subdominio que quieran)
   - Valor: `cname.vercel-dns.com`
3. Vercel genera SSL automaticamente
4. Actualizar `CORS_ORIGIN` en el backend con la nueva URL

---

## Paso 5: Verificacion Final

### Checklist de prueba

Abrir la URL del frontend en el navegador y verificar:

- [ ] La app carga sin errores en consola
- [ ] El Dashboard muestra datos (o esta vacio si es nuevo)
- [ ] **Ingredientes**: crear un ingrediente de prueba, verificar que calcula costo
- [ ] **Subrecetas**: crear una subreceta con el ingrediente de prueba
- [ ] **Productos**: crear un producto con ingredientes, verificar MC Neto
- [ ] **Configuracion**: verificar que los porcentajes de IVA/IIBB/comisiones son correctos para el cliente
- [ ] **Categorias**: crear categorias de productos e ingredientes
- [ ] **Proveedores**: cargar proveedores
- [ ] **Preparaciones**: crear instrucciones de preparacion de un producto
- [ ] **Ofertas**: crear una oferta de prueba

### Errores comunes

| Error | Solucion |
|---|---|
| CORS error en consola | Verificar que `CORS_ORIGIN` en `.env` del backend coincide exactamente con la URL del frontend (con https, sin / al final) |
| Network Error / no carga datos | Verificar que la URL en `frontend/.env.production` es correcta y el backend esta corriendo |
| Unknown column en alguna tabla | Ejecutar el schema.sql completo. Si la BD ya existia, ejecutar los ALTER TABLE necesarios |
| Connection refused en backend | Verificar credenciales de BD en `.env`, verificar que MySQL esta activo |
| 502 Bad Gateway | El Node.js no esta corriendo. Iniciar desde el panel de Hostinger |

---

## Paso 6: Personalizacion para el Cliente

### 6.1 Datos a cargar

Una vez la app esta funcionando, el cliente debe cargar (o vos le cargás):

1. **Configuracion** → Ajustar porcentajes:
   - IVA (puede variar segun tipo de negocio)
   - IIBB (varia segun provincia)
   - Comision tarjeta (depende del proveedor de pagos)
   - Descuento efectivo (politica del negocio)
   - Comision PedidosYa/Rappi (segun contrato)
   - Nombre del negocio

2. **Categorias** → Crear categorias de productos e ingredientes propias

3. **Proveedores** → Cargar proveedores del cliente

4. **Ingredientes** → Cargar todos los ingredientes con precios actualizados

5. **Subrecetas** → Crear las preparaciones base (masas, salsas, cremas, etc.)

6. **Productos** → Crear productos finales con recetas y precios

### 6.2 Si el cliente tiene la app RentCoffit (integracion de costos)

Si este cliente tambien usa la app de ventas/rentabilidad (RentCoffit):

1. Subir `coffitcost.php` y `actualizar_costos.php` a la carpeta `api/` de RentCoffit
2. En el `credentials.php` de RentCoffit agregar:
   ```php
   define('COFFITCOST_API_URL', 'https://coffitcost.dominiodelcliente.com/api/costo-producto');
   define('COFFITCOST_API_KEY', '');
   ```
3. Agregar el dominio de RentCoffit al CORS del backend:
   ```env
   CORS_ORIGIN=https://coffitcost-clientenuevo.vercel.app,https://dominiodelcliente.com
   ```
4. Reiniciar Node.js en Hostinger
5. Probar: `https://coffitcost.dominiodelcliente.com/api/costo-producto?nombre=NombreDeProducto`

---

## Resumen de Archivos que se Modifican por Cliente

| Archivo | Que cambiar |
|---|---|
| `backend/.env` | DB_NAME, DB_USER, DB_PASSWORD, CORS_ORIGIN |
| `frontend/.env.production` | VITE_API_URL (URL del backend del cliente) |
| `credentials.php` (RentCoffit) | COFFITCOST_API_URL (si aplica) |

**Todo lo demas queda igual** entre clientes. No se modifica codigo.

---

## Resumen de URLs por Cliente

| Que | Ejemplo |
|---|---|
| Backend API | `https://coffitcost.dominiodelcliente.com/api` |
| Frontend App | `https://coffitcost-clientenuevo.vercel.app` |
| Health Check | `https://coffitcost.dominiodelcliente.com/api/health` |
| API Costos | `https://coffitcost.dominiodelcliente.com/api/costo-producto?nombre=...` |

---

## Tiempo Estimado de Instalacion

| Tarea | Tiempo aprox. |
|---|---|
| Crear BD + tablas + seed | 10 min |
| Configurar subdominio + SSL | 5 min (+ esperar DNS) |
| Subir backend + configurar Node.js | 15 min |
| Build + deploy frontend | 10 min |
| Ajustar CORS + verificacion | 5 min |
| **Total** | **~45 min** |

> Esto es solo la instalacion tecnica. La carga de datos del cliente (ingredientes, recetas, precios) es aparte y depende de la cantidad de productos.
