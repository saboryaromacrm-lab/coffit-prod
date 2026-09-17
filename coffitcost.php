<?php
/**
 * ============================================================================
 * CLASE COFFITCOST API - Rentabilidad Gastronómica
 * ============================================================================
 */

class CoffitCostAPI {

    private $baseUrl;
    private $apiKey;
    private $cache = []; // Cache en memoria para evitar llamadas repetidas
    private $maxRetries = 3;
    private $retryDelayMs = 500;
    private $timeout = 30;
    private $cacheFile;
    private $cacheTTL = 86400; // 24 horas en segundos

    public function __construct() {
        $this->baseUrl = defined('COFFITCOST_API_URL') ? COFFITCOST_API_URL : 'https://coffitcost.saboryaroma.com/api/costo-producto';
        $this->apiKey = defined('COFFITCOST_API_KEY') ? COFFITCOST_API_KEY : '';
        $this->cacheFile = __DIR__ . '/../cache/coffitcost_cache.json';
        $this->loadPersistentCache();
    }

    /**
     * Cargar cache persistente desde archivo
     */
    private function loadPersistentCache() {
        if (file_exists($this->cacheFile)) {
            $data = json_decode(file_get_contents($this->cacheFile), true);
            if (is_array($data)) {
                // Filtrar entradas expiradas
                $now = time();
                foreach ($data as $key => $entry) {
                    if (isset($entry['timestamp']) && ($now - $entry['timestamp']) < $this->cacheTTL) {
                        $this->cache[$key] = $entry['data'];
                    }
                }
            }
        }
    }

    /**
     * Guardar cache persistente a archivo
     */
    private function savePersistentCache($key, $data) {
        // Crear directorio cache si no existe
        $cacheDir = dirname($this->cacheFile);
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }

        // Cargar cache existente
        $allCache = [];
        if (file_exists($this->cacheFile)) {
            $allCache = json_decode(file_get_contents($this->cacheFile), true) ?? [];
        }

        // Agregar/actualizar entrada
        $allCache[$key] = [
            'data' => $data,
            'timestamp' => time()
        ];

        // Guardar
        file_put_contents($this->cacheFile, json_encode($allCache, JSON_PRETTY_PRINT));
    }
    
    /**
     * Obtener costo de un producto por nombre exacto
     * @param string $nombreProducto Nombre exacto del producto
     * @return array ['success' => bool, 'costo' => float|null, 'sugerencias' => array]
     */
    public function getCosto($nombreProducto) {
        // Verificar cache (memoria o persistente)
        if (isset($this->cache[$nombreProducto])) {
            return $this->cache[$nombreProducto];
        }

        $result = $this->callWithRetry($nombreProducto);

        // Guardar en cache memoria y persistente (solo si fue exitoso o error definitivo)
        $this->cache[$nombreProducto] = $result;
        if ($result['success'] || !isset($result['retry'])) {
            $this->savePersistentCache($nombreProducto, $result);
        }

        return $result;
    }

    /**
     * Llamar a la API con retry y backoff exponencial
     */
    private function callWithRetry($nombreProducto, $attempt = 1) {
        $url = $this->baseUrl . '?' . http_build_query([
            'nombre' => $nombreProducto,
            'api_key' => $this->apiKey,
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_errno($ch);
        $errorMsg = curl_error($ch);
        curl_close($ch);

        // Errores que permiten retry
        $retryableCurlErrors = [
            CURLE_OPERATION_TIMEDOUT,
            CURLE_COULDNT_CONNECT,
            CURLE_COULDNT_RESOLVE_HOST,
            CURLE_GOT_NOTHING,
            CURLE_RECV_ERROR,
            CURLE_SEND_ERROR,
        ];
        $retryableHttpCodes = [408, 429, 500, 502, 503, 504];

        $shouldRetry = in_array($curlError, $retryableCurlErrors) ||
                       in_array($httpCode, $retryableHttpCodes);

        if ($shouldRetry && $attempt < $this->maxRetries) {
            // Backoff exponencial
            usleep($this->retryDelayMs * 1000 * $attempt);
            return $this->callWithRetry($nombreProducto, $attempt + 1);
        }

        if ($curlError || $errorMsg) {
            logError("Error CoffitCost API", [
                'error' => $errorMsg,
                'producto' => $nombreProducto,
                'attempt' => $attempt
            ]);
            return [
                'success' => false,
                'costo' => null,
                'error' => 'Error de conexión',
                'retry' => $shouldRetry
            ];
        }

        $data = json_decode($response, true);

        if ($data['success'] === true) {
            return [
                'success' => true,
                'costo' => $data['costo_porcion'],
                'producto' => $data['producto'],
            ];
        } else {
            return [
                'success' => false,
                'costo' => null,
                'error' => $data['error'] ?? 'Producto no encontrado',
                'sugerencias' => $data['sugerencias'] ?? [],
            ];
        }
    }
    
    /**
     * Obtener costos de múltiples productos
     * @param array $nombres Array de nombres de productos
     * @return array ['nombre' => ['success' => bool, 'costo' => float|null], ...]
     */
    public function getCostosBatch($nombres) {
        $resultados = [];
        
        foreach ($nombres as $nombre) {
            $resultados[$nombre] = $this->getCosto($nombre);
        }
        
        return $resultados;
    }
    
    /**
     * Limpiar cache
     */
    public function clearCache() {
        $this->cache = [];
    }
}
