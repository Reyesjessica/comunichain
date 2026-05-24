const {
  rpc, Contract, Keypair, TransactionBuilder, Networks,
  nativeToScVal, scValToNative, xdr, BASE_FEE
} = require('@stellar/stellar-sdk');

const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = process.env.CONTRACT_ID;
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const SECRET_KEY = process.env.SECRET_KEY;

if (!CONTRACT_ID) console.error('ADVERTENCIA: CONTRACT_ID no configurado en .env');
if (!SECRET_KEY) console.error('ADVERTENCIA: SECRET_KEY no configurado en .env');

const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);
const keypair = Keypair.fromSecret(SECRET_KEY);

function strVal(v) {
  return nativeToScVal(v || '', { type: 'string' });
}

function i128Val(v) {
  return nativeToScVal(Math.floor(Number(v || 0)), { type: 'i128' });
}

function u64Val(v) {
  return nativeToScVal(Math.floor(Number(v || 0)), { type: 'u64' });
}

function boolVal(v) {
  return nativeToScVal(v === true || v === 1, { type: 'bool' });
}

function vecVal(arr) {
  if (!Array.isArray(arr)) return xdr.ScVal.scvVec([]);
  const items = arr.map(v => nativeToScVal(v, { type: 'string' }));
  return xdr.ScVal.scvVec(items);
}

function mapEntry(key, val) {
  return new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol(key),
    val
  });
}

function comunidadToScVal(c) {
  return xdr.ScVal.scvMap([
    mapEntry('id', strVal(c.id)),
    mapEntry('nombre', strVal(c.nombre)),
    mapEntry('direccion', strVal(c.direccion)),
    mapEntry('descripcion', strVal(c.descripcion)),
    mapEntry('representante', strVal(c.representante)),
    mapEntry('telefono', strVal(c.telefono)),
    mapEntry('fondos_recibidos', i128Val(c.fondos_recibidos)),
    mapEntry('activa', boolVal(c.activa !== false)),
    mapEntry('fecha_registro', u64Val(c.fecha_registro)),
  ]);
}

function proyectoToScVal(p) {
  return xdr.ScVal.scvMap([
    mapEntry('id', strVal(p.id)),
    mapEntry('nombre', strVal(p.nombre)),
    mapEntry('lugar', strVal(p.lugar)),
    mapEntry('descripcion', strVal(p.descripcion)),
    mapEntry('objetivo', strVal(p.objetivo)),
    mapEntry('fondeo_requerido', i128Val(p.fondeo_requerido)),
    mapEntry('fondeo_recibido', i128Val(p.fondeo_recibido)),
    mapEntry('comunidad_id', strVal(p.comunidad_id)),
    mapEntry('estado', strVal(p.estado)),
    mapEntry('fecha_creacion', u64Val(p.fecha_creacion)),
    mapEntry('fotos', vecVal(p.fotos || [])),
  ]);
}

function avanceToScVal(a) {
  return xdr.ScVal.scvMap([
    mapEntry('id', strVal(a.id)),
    mapEntry('descripcion', strVal(a.descripcion)),
    mapEntry('fotos', vecVal(a.fotos || [])),
    mapEntry('fecha', u64Val(a.fecha)),
  ]);
}

function fondeoToScVal(f) {
  return xdr.ScVal.scvMap([
    mapEntry('id', strVal(f.id)),
    mapEntry('proyecto_id', strVal(f.proyecto_id)),
    mapEntry('monto', i128Val(f.monto)),
    mapEntry('fondeador', strVal(f.fondeador)),
    mapEntry('descripcion', strVal(f.descripcion)),
    mapEntry('fecha', u64Val(f.fecha)),
  ]);
}

async function getAccount() {
  try {
    return await server.getAccount(keypair.publicKey());
  } catch (e) {
    throw new Error(`Cuenta Stellar no disponible: ${e.message}. Verifica SECRET_KEY y RPC_URL en .env`);
  }
}

async function simulateContract(functionName, scArgs) {
  const account = await getAccount();
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(functionName, ...scArgs))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!sim) throw new Error('Simulación fallida: sin respuesta del RPC');

  const result = rpc.Api.parseRawSimulation(sim);
  if (result.error) throw new Error(`Error de simulación: ${result.error}`);

  return result;
}

async function invokeContract(functionName, scArgs) {
  const account = await getAccount();
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(functionName, ...scArgs))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!sim) throw new Error('Simulación fallida');

  const prepared = await server.prepareTransaction(tx, sim);
  prepared.sign(keypair);

  const result = await server.sendTransaction(prepared);
  if (result.status === 'ERROR' || result.status === 'FAILED') {
    throw new Error(`Transacción rechazada: ${result.errorResult?.result?.code || 'desconocido'}`);
  }

  const hash = result.hash;
  let attempts = 0;
  while (attempts < 30) {
    const status = await server.getTransaction(hash);
    if (status.status === 'SUCCESS') return { hash, status };
    if (status.status === 'FAILED') throw new Error(`Transacción fallida en red: ${hash}`);
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }
  throw new Error(`Timeout esperando confirmación: ${hash}`);
}

async function extractRetval(simResult) {
  try {
    if (simResult?.results?.[0]?.retval) {
      return scValToNative(simResult.results[0].retval);
    }
  } catch {}
  return null;
}

async function registrarComunidad(comunidad) {
  const result = await invokeContract('registrar_comunidad', [comunidadToScVal(comunidad)]);
  return result.hash;
}

async function crearProyecto(proyecto) {
  const result = await invokeContract('crear_proyecto', [proyectoToScVal(proyecto)]);
  return result.hash;
}

async function agregarAvance(proyectoId, avance) {
  const result = await invokeContract('agregar_avance', [strVal(proyectoId), avanceToScVal(avance)]);
  return result.hash;
}

async function fondearProyecto(fondeo) {
  const result = await invokeContract('fondear_proyecto', [fondeoToScVal(fondeo)]);
  return result.hash;
}

async function obtenerEstadisticas() {
  const sim = await simulateContract('obtener_estadisticas', []);
  const vals = await extractRetval(sim);
  if (vals && Array.isArray(vals)) {
    return {
      totalComunidades: Number(vals[0]),
      totalProyectos: Number(vals[1]),
      totalFondeado: Number(vals[2]),
      totalFondeos: Number(vals[3]),
    };
  }
  return null;
}

module.exports = {
  registrarComunidad,
  crearProyecto,
  agregarAvance,
  fondearProyecto,
  obtenerEstadisticas
};
