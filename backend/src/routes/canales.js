const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET / - List active sales channels
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM canales_venta WHERE activo = 1 ORDER BY orden'
    );
    success(res, rows);
  })
);

module.exports = router;
