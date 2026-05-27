const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'comunichain',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function createTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      role VARCHAR(50) DEFAULT NULL,
      comunidad_id VARCHAR(36) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      credential_id VARCHAR(512) NOT NULL,
      credential_public_key BLOB,
      counter INT DEFAULT 0,
      cred_type VARCHAR(50) DEFAULT NULL,
      transports TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(36) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      wallet_id VARCHAR(36) DEFAULT NULL,
      role VARCHAR(50) DEFAULT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS communities (
      id VARCHAR(36) PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      direccion TEXT DEFAULT NULL,
      descripcion TEXT DEFAULT NULL,
      representante VARCHAR(255) DEFAULT NULL,
      telefono VARCHAR(50) DEFAULT NULL,
      creado_por VARCHAR(255) DEFAULT NULL,
      fecha_registro VARCHAR(50) DEFAULT NULL,
      fondos_recibidos DECIMAL(20,2) DEFAULT 0,
      activa TINYINT(1) DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(36) PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      lugar VARCHAR(255) NOT NULL,
      descripcion TEXT DEFAULT NULL,
      objetivo TEXT DEFAULT NULL,
      fondeo_requerido DECIMAL(20,2) DEFAULT 0,
      fondeo_recibido DECIMAL(20,2) DEFAULT 0,
      comunidad_id VARCHAR(36) DEFAULT NULL,
      creado_por VARCHAR(255) DEFAULT NULL,
      estado VARCHAR(50) DEFAULT 'pendiente',
      fecha_creacion VARCHAR(50) DEFAULT NULL,
      FOREIGN KEY (comunidad_id) REFERENCES communities(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS avances (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL,
      descripcion TEXT DEFAULT NULL,
      fecha VARCHAR(50) DEFAULT NULL,
      creado_por VARCHAR(255) DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS avance_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      avance_id VARCHAR(36) NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (avance_id) REFERENCES avances(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      tx_hash VARCHAR(255) NOT NULL,
      fecha VARCHAR(50) DEFAULT NULL,
      datos JSON DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS funding_records (
      id VARCHAR(36) PRIMARY KEY,
      proyecto_id VARCHAR(36) NOT NULL,
      proyecto_nombre VARCHAR(255) DEFAULT NULL,
      comunidad_id VARCHAR(36) DEFAULT NULL,
      comunidad_nombre VARCHAR(255) DEFAULT NULL,
      monto DECIMAL(20,2) DEFAULT 0,
      descripcion TEXT DEFAULT NULL,
      tx_hash VARCHAR(255) DEFAULT NULL,
      fondeado_por VARCHAR(255) DEFAULT NULL,
      fecha VARCHAR(50) DEFAULT NULL,
      FOREIGN KEY (proyecto_id) REFERENCES projects(id) ON DELETE CASCADE
    )`
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (err) {
      console.error('Error creando tabla:', err.message);
    }
  }
}

// Users
async function createUser(username, userId) {
  await pool.query(
    'INSERT INTO users (username, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
    [username, userId]
  );
}

async function getUser(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] || null;
}

async function updateUserRole(username, role) {
  await pool.query('UPDATE users SET role = ? WHERE username = ?', [role, username]);
}

async function updateUserComunidad(username, comunidadId) {
  await pool.query('UPDATE users SET comunidad_id = ? WHERE username = ?', [comunidadId, username]);
}

// Credentials
async function saveCredential(username, credInfo) {
  const credentialId = Buffer.from(credInfo.credentialID).toString('base64url');
  await pool.query(
    `INSERT INTO credentials (username, credential_id, credential_public_key, counter, cred_type, transports)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE counter = VALUES(counter)`,
    [
      username,
      credentialId,
      Buffer.from(credInfo.credentialPublicKey),
      credInfo.counter || 0,
      credInfo.credentialDeviceType || null,
      credInfo.transports ? JSON.stringify(credInfo.transports) : null
    ]
  );
}

async function getCredentials(username) {
  const [rows] = await pool.query('SELECT * FROM credentials WHERE username = ?', [username]);
  return rows.map(r => ({
    credentialID: Buffer.from(r.credential_id, 'base64url'),
    credentialPublicKey: r.credential_public_key,
    counter: r.counter,
    credType: r.cred_type,
    transports: r.transports ? JSON.parse(r.transports) : undefined,
  }));
}

async function updateCredentialCounter(username, credentialId, newCounter) {
  const credId = Buffer.from(credentialId).toString('base64url');
  await pool.query(
    'UPDATE credentials SET counter = ? WHERE username = ? AND credential_id = ?',
    [newCounter, username, credId]
  );
}

// Sessions
async function saveSession(token, username, walletId, role, expiresAt) {
  await pool.query(
    'INSERT INTO sessions (token, username, wallet_id, role, expires_at) VALUES (?, ?, ?, ?, ?)',
    [token, username, walletId, role, expiresAt]
  );
}

async function getSession(token) {
  const [rows] = await pool.query('SELECT * FROM sessions WHERE token = ? AND expires_at > ?', [token, Date.now()]);
  return rows[0] || null;
}

async function deleteSession(token) {
  await pool.query('DELETE FROM sessions WHERE token = ?', [token]);
}

async function cleanupSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

// Communities
async function createCommunity(comunidad) {
  await pool.query(
    `INSERT INTO communities (id, nombre, direccion, descripcion, representante, telefono, creado_por, fecha_registro, fondos_recibidos, activa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [comunidad.id, comunidad.nombre, comunidad.direccion, comunidad.descripcion,
     comunidad.representante, comunidad.telefono, comunidad.creadoPor,
     comunidad.fechaRegistro, comunidad.fondosRecibidos || 0, 1]
  );
}

async function getCommunity(id) {
  const [rows] = await pool.query('SELECT * FROM communities WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const c = rows[0];
  return {
    id: c.id,
    nombre: c.nombre,
    direccion: c.direccion,
    descripcion: c.descripcion,
    representante: c.representante,
    telefono: c.telefono,
    creadoPor: c.creado_por,
    fechaRegistro: c.fecha_registro,
    fondosRecibidos: Number(c.fondos_recibidos),
    activa: !!c.activa,
  };
}

async function updateCommunityFunds(id, amount) {
  await pool.query(
    'UPDATE communities SET fondos_recibidos = fondos_recibidos + ? WHERE id = ?',
    [amount, id]
  );
}

async function getAllCommunities() {
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM communities WHERE activa = 1');
  return rows[0].total;
}

// Projects
async function createProject(proyecto, fotos) {
  await pool.query(
    `INSERT INTO projects (id, nombre, lugar, descripcion, objetivo, fondeo_requerido, fondeo_recibido, comunidad_id, creado_por, estado, fecha_creacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [proyecto.id, proyecto.nombre, proyecto.lugar, proyecto.descripcion, proyecto.objetivo,
     proyecto.fondeoRequerido, 0, proyecto.comunidadId, proyecto.creadoPor, 'pendiente', proyecto.fechaCreacion]
  );
  if (fotos && fotos.length > 0) {
    const vals = fotos.map(f => [proyecto.id, f]);
    await pool.query('INSERT INTO project_photos (project_id, url) VALUES ?', [vals]);
  }
}

async function getProject(id) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const p = rows[0];
  const [fotos] = await pool.query('SELECT url FROM project_photos WHERE project_id = ?', [id]);
  const [avances] = await pool.query('SELECT * FROM avances WHERE project_id = ? ORDER BY fecha DESC', [id]);
  const [txs] = await pool.query('SELECT * FROM transactions WHERE project_id = ? ORDER BY fecha DESC', [id]);
  const [cRows] = await pool.query('SELECT nombre FROM communities WHERE id = ?', [p.comunidad_id]);
  const avancesList = [];
  for (const a of avances) {
    const [aFotos] = await pool.query('SELECT url FROM avance_photos WHERE avance_id = ?', [a.id]);
    avancesList.push({
      id: a.id,
      descripcion: a.descripcion,
      fotos: aFotos.map(f => f.url),
      fecha: a.fecha,
      creadoPor: a.creado_por,
    });
  }
  return {
    id: p.id,
    nombre: p.nombre,
    lugar: p.lugar,
    descripcion: p.descripcion,
    objetivo: p.objetivo,
    fondeoRequerido: Number(p.fondeo_requerido),
    fondeoRecibido: Number(p.fondeo_recibido),
    comunidadId: p.comunidad_id,
    comunidadNombre: cRows[0]?.nombre || '',
    creadoPor: p.creado_por,
    estado: p.estado,
    fechaCreacion: p.fecha_creacion,
    fotos: fotos.map(f => f.url),
    avances: avancesList,
    transacciones: txs.map(t => ({
      tipo: t.tipo,
      txHash: t.tx_hash,
      fecha: t.fecha,
      datos: t.datos,
    })),
  };
}

async function getProjectsByCommunity(comunidadId) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE comunidad_id = ? ORDER BY fecha_creacion DESC', [comunidadId]);
  const result = [];
  for (const p of rows) {
    const [fotos] = await pool.query('SELECT url FROM project_photos WHERE project_id = ?', [p.id]);
    const [txs] = await pool.query('SELECT * FROM transactions WHERE project_id = ? ORDER BY fecha DESC', [p.id]);
    result.push({
      id: p.id,
      nombre: p.nombre,
      lugar: p.lugar,
      descripcion: p.descripcion,
      objetivo: p.objetivo,
      fondeoRequerido: Number(p.fondeo_requerido),
      fondeoRecibido: Number(p.fondeo_recibido),
      comunidadId: p.comunidad_id,
      creadoPor: p.creado_por,
      estado: p.estado,
      fechaCreacion: p.fecha_creacion,
      fotos: fotos.map(f => f.url),
      transacciones: txs.map(t => ({
        tipo: t.tipo,
        txHash: t.tx_hash,
        fecha: t.fecha,
        datos: t.datos,
      })),
    });
  }
  return result;
}

async function getAllProjects() {
  const [rows] = await pool.query('SELECT * FROM projects ORDER BY fecha_creacion DESC');
  const result = [];
  for (const p of rows) {
    const [fotos] = await pool.query('SELECT url FROM project_photos WHERE project_id = ?', [p.id]);
    const [cRows] = await pool.query('SELECT nombre FROM communities WHERE id = ?', [p.comunidad_id]);
    result.push({
      id: p.id,
      nombre: p.nombre,
      lugar: p.lugar,
      descripcion: p.descripcion,
      objetivo: p.objetivo,
      fondeoRequerido: Number(p.fondeo_requerido),
      fondeoRecibido: Number(p.fondeo_recibido),
      comunidadId: p.comunidad_id,
      comunidadNombre: cRows[0]?.nombre || '',
      creadoPor: p.creado_por,
      estado: p.estado,
      fechaCreacion: p.fecha_creacion,
      fotos: fotos.map(f => f.url),
    });
  }
  return result;
}

async function updateProjectFunding(proyectoId, monto) {
  await pool.query(
    'UPDATE projects SET fondeo_recibido = fondeo_recibido + ? WHERE id = ?',
    [monto, proyectoId]
  );
  const [rows] = await pool.query('SELECT fondeo_requerido, fondeo_recibido FROM projects WHERE id = ?', [proyectoId]);
  if (rows[0]) {
    const r = rows[0];
    const nuevoEstado = Number(r.fondeo_recibido) >= Number(r.fondeo_requerido) ? 'completado' : 'en_progreso';
    await pool.query('UPDATE projects SET estado = ? WHERE id = ?', [nuevoEstado, proyectoId]);
    return nuevoEstado;
  }
  return null;
}

// Avances
async function createAvance(avance, fotos) {
  await pool.query(
    'INSERT INTO avances (id, project_id, descripcion, fecha, creado_por) VALUES (?, ?, ?, ?, ?)',
    [avance.id, avance.projectId, avance.descripcion, avance.fecha, avance.creadoPor]
  );
  if (fotos && fotos.length > 0) {
    const vals = fotos.map(f => [avance.id, f]);
    await pool.query('INSERT INTO avance_photos (avance_id, url) VALUES ?', [vals]);
  }
}

// Transactions
async function saveTransaction(projectId, tipo, txHash, fecha, datos) {
  await pool.query(
    'INSERT INTO transactions (project_id, tipo, tx_hash, fecha, datos) VALUES (?, ?, ?, ?, ?)',
    [projectId, tipo, txHash, fecha, datos ? JSON.stringify(datos) : null]
  );
}

// Funding records
async function saveFundingRecord(record) {
  await pool.query(
    `INSERT INTO funding_records (id, proyecto_id, proyecto_nombre, comunidad_id, comunidad_nombre, monto, descripcion, tx_hash, fondeado_por, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.id, record.proyectoId, record.proyectoNombre, record.comunidadId,
     record.comunidadNombre, record.monto, record.descripcion, record.txHash,
     record.fondeadoPor, record.fecha]
  );
}

async function getFundingRecords(proyectoId) {
  let rows;
  if (proyectoId) {
    [rows] = await pool.query('SELECT * FROM funding_records WHERE proyecto_id = ? ORDER BY fecha DESC', [proyectoId]);
  } else {
    [rows] = await pool.query('SELECT * FROM funding_records ORDER BY fecha DESC');
  }
  return rows.map(r => ({
    id: r.id,
    proyectoId: r.proyecto_id,
    proyectoNombre: r.proyecto_nombre,
    comunidadId: r.comunidad_id,
    comunidadNombre: r.comunidad_nombre,
    monto: Number(r.monto),
    descripcion: r.descripcion,
    txHash: r.tx_hash,
    fondeadoPor: r.fondeado_por,
    fecha: r.fecha,
  }));
}

async function getAllFundingRecords() {
  return getFundingRecords(null);
}

// Stats
async function getStats() {
  const [comCount] = await pool.query('SELECT COUNT(*) as c FROM communities WHERE activa = 1');
  const [proyCount] = await pool.query('SELECT COUNT(*) as c FROM projects');
  const [sumRows] = await pool.query('SELECT COALESCE(SUM(monto), 0) as total FROM funding_records');
  const [compCount] = await pool.query("SELECT COUNT(*) as c FROM projects WHERE estado = 'completado'");
  const totalProyectos = proyCount[0].c;
  return {
    totalComunidades: comCount[0].c,
    totalProyectos,
    totalFondeo: Number(sumRows[0].total),
    completados: compCount[0].c,
    enProgreso: totalProyectos - compCount[0].c,
    transparencia: totalProyectos > 0 ? Math.round((compCount[0].c / totalProyectos) * 100) : 0,
  };
}

// Connection
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('MySQL conectado exitosamente');
    conn.release();
    return true;
  } catch (err) {
    console.error('Error conectando a MySQL:', err.message);
    return false;
  }
}

async function initialize() {
  try {
    await testConnection();
    await createTables();
    console.log('Tablas MySQL verificadas/creadas');
    return true;
  } catch (err) {
    console.error('Error inicializando base de datos:', err.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  initialize,
  createUser,
  getUser,
  updateUserRole,
  updateUserComunidad,
  saveCredential,
  getCredentials,
  updateCredentialCounter,
  saveSession,
  getSession,
  deleteSession,
  cleanupSessions,
  createCommunity,
  getCommunity,
  updateCommunityFunds,
  getAllCommunities,
  createProject,
  getProject,
  getProjectsByCommunity,
  getAllProjects,
  updateProjectFunding,
  createAvance,
  saveTransaction,
  saveFundingRecord,
  getFundingRecords,
  getAllFundingRecords,
  getStats,
};
