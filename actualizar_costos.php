<?php
/**
 * ============================================================================
 * ACTUALIZAR_COSTOS.PHP - Re-sincronizar costos desde CoffitCost
 * ============================================================================
 *
 * Este endpoint actualiza los costos de productos existentes sin re-sincronizar
 * las ventas de Fudo. Útil cuando se actualizan precios en CoffitCost.
 *
 * POST /api/actualizar_costos.php
 *     Body: { "anio": 2026, "mes": 1, "limpiar_cache": true }
 *     Actualiza costos de todos los productos del periodo
 *
 * GET /api/actualizar_costos.php?anio=2026&mes=1
 *     Ver productos pendientes de costo en el periodo
 */

define('APP_RUNNING', true);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/coffitcost.php';

validateMethod(['GET', 'POST']);

$db = getDB();

// ============================================================================
// GET - Ver productos sin costo del periodo
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $anio = intval($_GET['anio'] ?? date('Y'));
    $mes = intval($_GET['mes'] ?? date('n'));

    // Productos sin costo o con costo pendiente
    $stmt = $db->prepare("
        SELECT DISTINCT producto_nombre, COUNT(*) as cantidad
        FROM ventas_items
        WHERE anio = ? AND mes = ?
        AND (costo_unitario IS NULL OR costo_origen = 'pendiente')
        GROUP BY producto_nombre
        ORDER BY cantidad DESC
    ");
    $stmt->execute([$anio, $mes]);
    $sinCosto = $stmt->fetchAll();

    // Total de items
    $stmtTotal = $db->prepare("
        SELECT COUNT(*) as total,
               SUM(CASE WHEN costo_origen = 'coffitcost' THEN 1 ELSE 0 END) as coffitcost,
               SUM(CASE WHEN costo_origen = 'manual' THEN 1 ELSE 0 END) as manual,
               SUM(CASE WHEN costo_origen = 'pendiente' OR costo_unitario IS NULL THEN 1 ELSE 0 END) as pendiente
        FROM ventas_items
        WHERE anio = ? AND mes = ?
    ");
    $stmtTotal->execute([$anio, $mes]);
    $totales = $stmtTotal->fetch();

    jsonResponse([
        'success' => true,
        'periodo' => ['anio' => $anio, 'mes' => $mes],
        'productos_sin_costo' => $sinCosto,
        'resumen' => [
            'total_items' => (int)$totales['total'],
            'con_costo_coffitcost' => (int)$totales['coffitcost'],
            'con_costo_manual' => (int)$totales['manual'],
            'sin_costo' => (int)$totales['pendiente']
        ]
    ]);
}

// ============================================================================
// POST - Actualizar costos desde CoffitCost
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getJsonInput();

    $anio = intval($input['anio'] ?? date('Y'));
    $mes = intval($input['mes'] ?? date('n'));
    $limpiarCache = $input['limpiar_cache'] ?? true;

    // Limpiar cache si se solicita
    $cacheFile = __DIR__ . '/../cache/coffitcost_cache.json';
    if ($limpiarCache && file_exists($cacheFile)) {
        unlink($cacheFile);
        logError("Cache CoffitCost eliminado para actualización", ['anio' => $anio, 'mes' => $mes]);
    }

    // Obtener productos únicos del periodo que NO tienen costo manual
    $stmt = $db->prepare("
        SELECT DISTINCT vi.producto_nombre
        FROM ventas_items vi
        LEFT JOIN productos_costo_manual pcm ON vi.producto_nombre = pcm.producto_nombre AND pcm.activo = 1
        WHERE vi.anio = ? AND vi.mes = ?
        AND pcm.id IS NULL
        ORDER BY vi.producto_nombre
    ");
    $stmt->execute([$anio, $mes]);
    $productos = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($productos)) {
        jsonResponse([
            'success' => true,
            'mensaje' => 'No hay productos para actualizar (todos tienen costo manual)',
            'actualizados' => 0
        ]);
    }

    // Inicializar API CoffitCost
    $coffitCost = new CoffitCostAPI();

    $actualizados = 0;
    $errores = [];
    $costos = [];

    // Consultar cada producto
    foreach ($productos as $nombreProducto) {
        $resultado = $coffitCost->getCosto($nombreProducto);

        if ($resultado['success'] && $resultado['costo'] > 0) {
            $costos[$nombreProducto] = $resultado['costo'];

            // Actualizar items de este producto en el periodo
            $stmtUpdate = $db->prepare("
                UPDATE ventas_items
                SET costo_unitario = ?,
                    costo_total = cantidad * ?,
                    costo_origen = 'coffitcost'
                WHERE producto_nombre = ?
                AND anio = ? AND mes = ?
                AND costo_origen != 'manual'
            ");
            $stmtUpdate->execute([
                $resultado['costo'],
                $resultado['costo'],
                $nombreProducto,
                $anio,
                $mes
            ]);

            $actualizados += $stmtUpdate->rowCount();
        } else {
            $errores[] = [
                'producto' => $nombreProducto,
                'error' => $resultado['error'] ?? 'No encontrado',
                'sugerencias' => $resultado['sugerencias'] ?? []
            ];
        }
    }

    // También actualizar items de PedidosYa si existen
    $stmtPya = $db->prepare("
        SELECT DISTINCT producto_nombre
        FROM ventas_pedidosya_items
        WHERE anio = ? AND mes = ?
        AND (costo_origen IS NULL OR costo_origen = 'pendiente')
    ");
    $stmtPya->execute([$anio, $mes]);
    $productosPya = $stmtPya->fetchAll(PDO::FETCH_COLUMN);

    $actualizadosPya = 0;
    foreach ($productosPya as $nombreProducto) {
        // Primero buscar si hay costo manual
        $stmtManual = $db->prepare("
            SELECT costo_unitario FROM productos_costo_manual
            WHERE producto_nombre = ? AND activo = 1
        ");
        $stmtManual->execute([$nombreProducto]);
        $costoManual = $stmtManual->fetchColumn();

        if ($costoManual) {
            $costo = $costoManual;
            $origen = 'manual';
        } elseif (isset($costos[$nombreProducto])) {
            $costo = $costos[$nombreProducto];
            $origen = 'coffitcost';
        } else {
            // Consultar a CoffitCost
            $resultado = $coffitCost->getCosto($nombreProducto);
            if ($resultado['success'] && $resultado['costo'] > 0) {
                $costo = $resultado['costo'];
                $origen = 'coffitcost';
            } else {
                continue;
            }
        }

        $stmtUpdatePya = $db->prepare("
            UPDATE ventas_pedidosya_items
            SET costo_unitario = ?,
                costo_origen = ?
            WHERE producto_nombre = ?
            AND anio = ? AND mes = ?
        ");
        $stmtUpdatePya->execute([$costo, $origen, $nombreProducto, $anio, $mes]);
        $actualizadosPya += $stmtUpdatePya->rowCount();
    }

    logError("Costos actualizados desde CoffitCost", [
        'anio' => $anio,
        'mes' => $mes,
        'items_actualizados' => $actualizados,
        'items_pya_actualizados' => $actualizadosPya,
        'productos_consultados' => count($productos),
        'errores' => count($errores)
    ]);

    jsonResponse([
        'success' => true,
        'mensaje' => "Costos actualizados: $actualizados items locales, $actualizadosPya items PedidosYa",
        'periodo' => ['anio' => $anio, 'mes' => $mes],
        'items_actualizados' => $actualizados,
        'items_pya_actualizados' => $actualizadosPya,
        'productos_consultados' => count($productos),
        'productos_sin_costo' => $errores,
        'cache_limpiado' => $limpiarCache
    ]);
}
