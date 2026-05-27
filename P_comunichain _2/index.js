require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./src/database');
const {
  validateComunidad, validateProyecto, validateAvance, validateFondeo,
  validateString
} = require('./src/validation');
const {
  registrarComunidad: bcRegistrarComunidad,
  crearProyecto: bcCrearProyecto,
  agregarAvance: bcAgregarAvance,
  fondearProyecto: bcFondearProyecto,
  obtenerEstadisticas: bcObtenerEstadisticas
} = require('./src/blockchain');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const app = express();
const PORT = process.env.PORT || 3000;
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = 'Comunichain';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

const storage = multer.memoryStorage();

async function saveUploadedFiles(files) {
  if (!files || files.length === 0) return [];
  if (process.env.VERCEL) {
    const { put } = require('@vercel/blob');
    return Promise.all(files.map(async (file) => {
      const { url } = await put(`${Date.now()}-${file.originalname}`, file.buffer, { access: 'public' });
      return url;
    }));
  } else {
    return files.map(file => {
      const filename = `${Date.now()}-${file.originalname}`;
      fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
      return `/uploads/${filename}`;
    });
  }
}
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'), false);
  }
});

const challenges = {};

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado.', success: false });
  }
  const token = auth.slice(7);
  const session = await db.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Sesión expirada o inválida.', success: false });
  }
  req.user = { username: session.username, walletId: session.wallet_id, role: session.role };
  req.token = token;
  next();
}

const rpID = RP_ID;

function getOrigin() {
  if (RP_ID === 'localhost') return `http://localhost:${PORT}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return `https://${RP_ID}`;
}

function wrapValidation(fn) {
  return (req, res, next) => {
    try { fn(req, res, next); } catch (err) {
      res.status(400).json({ error: err.message, success: false });
    }
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/auth/register/begin', async (req, res) => {
  const error = validateString(req.body.username, 'Username', { maxLength: 100 });
  if (error) return res.status(400).json({ error, success: false });

  const { username } = req.body;
  let user = await db.getUser(username);
  if (!user) {
    await db.createUser(username, uuidv4());
    user = await db.getUser(username);
  }

  const credentials = await db.getCredentials(username);

  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: Buffer.from(user.user_id).toString('base64url'),
    userName: username,
    attestationType: 'none',
    excludeCredentials: credentials.map(c => ({ id: c.credentialID, type: 'public-key' })),
    supportedAlgorithmIDs: [-7, -257],
  });

  challenges[username] = opts.challenge;
  res.json({ options: opts, success: true });
});

app.post('/auth/register/complete', async (req, res) => {
  const error = validateString(req.body.username, 'Username', { maxLength: 100 });
  if (error) return res.status(400).json({ error, success: false });
  if (!req.body.credential) return res.status(400).json({ error: 'Credencial requerida', success: false });

  const { username, credential } = req.body;
  const expectedChallenge = challenges[username];
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Inicia el registro primero', success: false });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: rpID,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verificación fallida', success: false });
    }

    await db.createUser(username, uuidv4());
    await db.saveCredential(username, verification.registrationInfo);

    const user = await db.getUser(username);
    const walletId = uuidv4();
    const token = uuidv4();
    await db.saveSession(token, username, walletId, user.role, Date.now() + 86400000);

    delete challenges[username];
    res.json({ token, walletId, username, success: true, role: user.role });

  } catch (err) {
    res.status(400).json({ error: err.message, success: false });
  }
});

app.post('/auth/login/begin', async (req, res) => {
  const error = validateString(req.body.username, 'Username', { maxLength: 100 });
  if (error) return res.status(400).json({ error, success: false });

  const { username } = req.body;
  const user = await db.getUser(username);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado', success: false });

  const credentials = await db.getCredentials(username);
  if (credentials.length === 0) {
    return res.status(400).json({ error: 'Este usuario no tiene credenciales registradas. Regístrate primero.', success: false });
  }

  const opts = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(c => ({
      id: c.credentialID,
      type: 'public-key',
    })),
    userVerification: 'preferred',
  });

  challenges[username] = opts.challenge;
  res.json({ options: opts, success: true });
});

app.post('/auth/login/complete', async (req, res) => {
  const error = validateString(req.body.username, 'Username', { maxLength: 100 });
  if (error) return res.status(400).json({ error, success: false });
  if (!req.body.credential) return res.status(400).json({ error: 'Credencial requerida', success: false });

  const { username, credential } = req.body;
  const expectedChallenge = challenges[username];
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Inicia sesión primero', success: false });
  }

  const user = await db.getUser(username);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado', success: false });

  const credentials = await db.getCredentials(username);
  let verified = false;
  let matchedCred = null;

  for (const cred of credentials) {
    try {
      const result = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: getOrigin(),
        expectedRPID: rpID,
        authenticator: {
          credentialID: cred.credentialID,
          credentialPublicKey: cred.credentialPublicKey,
          counter: cred.counter,
        },
      });
      if (result.verified) {
        await db.updateCredentialCounter(username, cred.credentialID, result.authenticationInfo.newCounter);
        verified = true;
        matchedCred = cred;
        break;
      }
    } catch (e) { /* try next credential */ }
  }

  if (!verified) {
    return res.status(400).json({ error: 'Autenticación fallida', success: false });
  }

  const walletId = uuidv4();
  const token = uuidv4();
  await db.saveSession(token, username, walletId, user.role, Date.now() + 86400000);

  delete challenges[username];
  res.json({ token, walletId, username, success: true, role: user.role });
});

app.get('/auth/status', requireAuth, (req, res) => {
  res.json({ valid: true, username: req.user.username, role: req.user.role, success: true });
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  await db.deleteSession(req.token);
  res.json({ success: true });
});

app.post('/api/comunidad/registrar', requireAuth, async (req, res) => {
  try {
    const error = validateComunidad(req.body);
    if (error) return res.status(400).json({ error, success: false });

    const user = await db.getUser(req.user.username);
    if (user.comunidad_id) {
      return res.status(400).json({ error: 'Ya perteneces a una comunidad', success: false });
    }

    const id = uuidv4();
    const comunidad = {
      id,
      nombre: req.body.nombre.trim(),
      direccion: (req.body.direccion || '').trim(),
      descripcion: (req.body.descripcion || '').trim(),
      representante: (req.body.representante || req.user.username).trim(),
      telefono: (req.body.telefono || '').trim(),
      creadoPor: req.user.username,
      fechaRegistro: new Date().toISOString(),
      fondosRecibidos: 0,
    };

    await db.createCommunity(comunidad);
    await db.updateUserComunidad(req.user.username, id);
    await db.updateUserRole(req.user.username, 'comunidad');

    req.user.role = 'comunidad';

    let txHash = null;
    try {
      txHash = await bcRegistrarComunidad({
        id: comunidad.id,
        nombre: comunidad.nombre,
        direccion: comunidad.direccion,
        descripcion: comunidad.descripcion,
        representante: comunidad.representante,
        telefono: comunidad.telefono,
        fondos_recibidos: 0,
        activa: true,
        fecha_registro: Math.floor(Date.now() / 1000),
      });
    } catch (bcErr) {
      console.error('Error registrando en blockchain (no crítico):', bcErr.message);
    }

    const saved = await db.getCommunity(id);
    res.json({ comunidad: saved, txHash, success: true, blockchain: !!txHash });

  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.get('/api/comunidad/mi-perfil', requireAuth, async (req, res) => {
  const user = await db.getUser(req.user.username);
  if (!user || !user.comunidad_id) {
    return res.status(404).json({ error: 'No perteneces a ninguna comunidad', success: false });
  }
  const comunidad = await db.getCommunity(user.comunidad_id);
  if (!comunidad) return res.status(404).json({ error: 'Comunidad no encontrada', success: false });

  const projects = await db.getProjectsByCommunity(user.comunidad_id);
  res.json({ comunidad, proyectos: projects, success: true });
});

app.get('/api/comunidad/:id', async (req, res) => {
  const error = validateString(req.params.id, 'ID de comunidad', { maxLength: 36 });
  if (error) return res.status(400).json({ error, success: false });

  const comunidad = await db.getCommunity(req.params.id);
  if (!comunidad) return res.status(404).json({ error: 'Comunidad no encontrada', success: false });
  res.json({ comunidad, success: true });
});

app.post('/api/proyectos/crear', requireAuth, upload.array('fotos', 10), async (req, res) => {
  try {
    const error = validateProyecto(req.body);
    if (error) return res.status(400).json({ error, success: false });

    const user = await db.getUser(req.user.username);
    if (!user.comunidad_id) {
      return res.status(400).json({ error: 'Debes pertenecer a una comunidad', success: false });
    }

    const comunidad = await db.getCommunity(user.comunidad_id);
    if (!comunidad) return res.status(400).json({ error: 'Comunidad no encontrada', success: false });

    const fotos = await saveUploadedFiles(req.files);
    const id = uuidv4();

    const proyecto = {
      id,
      nombre: req.body.nombre.trim(),
      lugar: req.body.lugar.trim(),
      descripcion: req.body.descripcion.trim(),
      objetivo: req.body.objetivo.trim(),
      fondeoRequerido: parseFloat(req.body.fondeoRequerido),
      fondeoRecibido: 0,
      comunidadId: user.comunidad_id,
      creadoPor: req.user.username,
      fechaCreacion: new Date().toISOString(),
    };

    await db.createProject(proyecto, fotos);

    let txHash = null;
    try {
      txHash = await bcCrearProyecto({
        id: proyecto.id,
        nombre: proyecto.nombre,
        lugar: proyecto.lugar,
        descripcion: proyecto.descripcion,
        objetivo: proyecto.objetivo,
        fondeo_requerido: proyecto.fondeoRequerido,
        fondeo_recibido: 0,
        comunidad_id: proyecto.comunidadId,
        estado: 'pendiente',
        fecha_creacion: Math.floor(Date.now() / 1000),
        fotos: fotos,
      });

      await db.saveTransaction(id, 'creacion', txHash, proyecto.fechaCreacion, {
        nombre: proyecto.nombre, lugar: proyecto.lugar,
        objetivo: proyecto.objetivo, fondeoRequerido: proyecto.fondeoRequerido
      });
    } catch (bcErr) {
      console.error('Error en blockchain (no crítico):', bcErr.message);
      txHash = `sim-${uuidv4().slice(0, 8)}`;
      await db.saveTransaction(id, 'creacion', txHash, proyecto.fechaCreacion, {
        nombre: proyecto.nombre, lugar: proyecto.lugar,
        objetivo: proyecto.objetivo, fondeoRequerido: proyecto.fondeoRequerido
      });
    }

    const saved = await db.getProject(id);
    res.json({ proyecto: saved, txHash, success: true, blockchain: txHash && !txHash.startsWith('sim-') });

  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.get('/api/proyectos', async (req, res) => {
  const proyectos = await db.getAllProjects();
  res.json({ proyectos, total: proyectos.length, success: true });
});

app.get('/api/proyectos/mis-proyectos', requireAuth, async (req, res) => {
  const user = await db.getUser(req.user.username);
  if (!user.comunidad_id) return res.json({ proyectos: [], success: true });
  const proyectos = await db.getProjectsByCommunity(user.comunidad_id);
  res.json({ proyectos, success: true });
});

app.get('/api/proyectos/:id', async (req, res) => {
  const proyecto = await db.getProject(req.params.id);
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado', success: false });
  res.json({ proyecto, success: true });
});

app.post('/api/proyectos/:id/avances', requireAuth, upload.array('fotos', 10), async (req, res) => {
  try {
    const proyecto = await db.getProject(req.params.id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado', success: false });

    const user = await db.getUser(req.user.username);
    if (proyecto.comunidadId !== user.comunidad_id) {
      return res.status(403).json({ error: 'No eres miembro de esta comunidad', success: false });
    }

    const error = validateAvance(req.body);
    if (error) return res.status(400).json({ error, success: false });

    const fotos = await saveUploadedFiles(req.files);
    const avance = {
      id: uuidv4(),
      projectId: req.params.id,
      descripcion: (req.body.descripcion || '').trim(),
      fecha: new Date().toISOString(),
      creadoPor: req.user.username,
    };

    await db.createAvance(avance, fotos);

    let txHash = null;
    try {
      txHash = await bcAgregarAvance(proyecto.id, {
        id: avance.id,
        descripcion: avance.descripcion,
        fotos: fotos,
        fecha: Math.floor(Date.now() / 1000),
      });
    } catch (bcErr) {
      console.error('Error en blockchain (no crítico):', bcErr.message);
    }

    if (txHash) {
      await db.saveTransaction(proyecto.id, 'avance', txHash, avance.fecha, { descripcion: avance.descripcion, fotos });
    }

    res.json({ avance, txHash, success: true, blockchain: !!txHash });

  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/api/gobierno/fondear', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'gobierno') {
      return res.status(403).json({ error: 'Solo el gobierno puede fonderar proyectos', success: false });
    }

    const error = validateFondeo(req.body);
    if (error) return res.status(400).json({ error, success: false });

    const { proyectoId, monto, descripcion } = req.body;
    const proyecto = await db.getProject(proyectoId);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado', success: false });

    const montoNum = parseFloat(monto);
    const nuevoEstado = await db.updateProjectFunding(proyectoId, montoNum);
    await db.updateCommunityFunds(proyecto.comunidadId, montoNum);

    let txHash = null;
    try {
      txHash = await bcFondearProyecto({
        id: uuidv4(),
        proyecto_id: proyectoId,
        monto: montoNum,
        fondeador: req.user.username,
        descripcion: descripcion || 'Fondeo gubernamental',
        fecha: Math.floor(Date.now() / 1000),
      });
    } catch (bcErr) {
      console.error('Error en blockchain (no crítico):', bcErr.message);
    }

    const comunidad = await db.getCommunity(proyecto.comunidadId);

    if (txHash) {
      await db.saveTransaction(proyectoId, 'fondeo', txHash, new Date().toISOString(),
        { monto: montoNum, descripcion, fondeadoPor: req.user.username });
    }

    const record = {
      id: uuidv4(),
      proyectoId,
      proyectoNombre: proyecto.nombre,
      comunidadId: proyecto.comunidadId,
      comunidadNombre: comunidad ? comunidad.nombre : '',
      monto: montoNum,
      descripcion: descripcion || 'Fondeo gubernamental',
      txHash,
      fondeadoPor: req.user.username,
      fecha: new Date().toISOString()
    };
    await db.saveFundingRecord(record);

    const updated = await db.getProject(proyectoId);
    res.json({ fondeo: record, proyecto: updated, success: true, blockchain: !!txHash });

  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.get('/api/gobierno/proyectos', requireAuth, async (req, res) => {
  if (req.user.role !== 'gobierno') {
    return res.status(403).json({ error: 'Acceso no autorizado', success: false });
  }
  const proyectos = await db.getAllProjects();
  res.json({ proyectos, total: proyectos.length, success: true });
});

app.get('/api/gobierno/fondeos', requireAuth, async (req, res) => {
  if (req.user.role !== 'gobierno') {
    return res.status(403).json({ error: 'Acceso no autorizado', success: false });
  }
  const fondeos = await db.getAllFundingRecords();
  fondeos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json({ fondeos, success: true });
});

app.post('/api/gobierno/registrar', requireAuth, async (req, res) => {
  const user = await db.getUser(req.user.username);
  if (user.role && user.role !== 'gobierno') {
    return res.status(400).json({ error: 'Ya tienes un rol asignado', success: false });
  }
  await db.updateUserRole(req.user.username, 'gobierno');
  req.user.role = 'gobierno';
  res.json({ role: 'gobierno', success: true });
});

app.get('/api/estadisticas', async (req, res) => {
  try {
    const stats = await db.getStats();

    let bcStats = null;
    try {
      bcStats = await bcObtenerEstadisticas();
    } catch (e) { /* stats from DB only */ }

    res.json({ estadisticas: { ...stats, blockchain: !!bcStats }, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Solo imágenes') {
    return res.status(400).json({ error: 'Solo se permiten imágenes', success: false });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'La imagen no debe exceder 5MB', success: false });
  }
  res.status(500).json({ error: err.message || 'Error interno', success: false });
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log('==================================================');
    console.log('  Comunichain DApp - Transparencia Comunitaria');
    console.log('==================================================');
    console.log(`  Servidor: http://localhost:${PORT}`);
    console.log(`  Autenticación: Passkeys (WebAuthn)`);
    console.log(`  Red: Stellar Soroban Testnet`);
    console.log(`  Contrato: ${process.env.CONTRACT_ID || 'no configurado'}`);
    console.log('==================================================');

    const initialized = await db.initialize();
    if (initialized) {
      console.log('  Base de datos: MySQL lista');
    } else {
      console.log('  Base de datos: MySQL NO disponible - revisa .env');
    }
    console.log('==================================================');
  });
}

module.exports = app;
