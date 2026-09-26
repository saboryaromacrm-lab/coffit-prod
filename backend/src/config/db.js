const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // TCP keepalive en las conexiones del pool: si una conexion queda muerta del
  // otro lado sin avisar (algo que en redes de contenedores puede pasar), el
  // sistema operativo lo detecta con sondeos periodicos en vez de dejar una
  // query colgada esperando una respuesta que nunca llega.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

module.exports = pool;
