#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, String, Vec, Map, Address, Symbol, symbol_short, IntoVal, TryFromVal};

#[contracttype]
#[derive(Clone, Debug)]
pub struct Comunidad {
    pub id: String,
    pub nombre: String,
    pub direccion: String,
    pub descripcion: String,
    pub representante: String,
    pub fondos_recibidos: i128,
    pub activa: bool,
    pub fecha_registro: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proyecto {
    pub id: String,
    pub nombre: String,
    pub lugar: String,
    pub descripcion: String,
    pub objetivo: String,
    pub fondeo_requerido: i128,
    pub fondeo_recibido: i128,
    pub comunidad_id: String,
    pub estado: u32,
    pub fecha_creacion: u64,
    pub fotos: Vec<String>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Avance {
    pub id: String,
    pub descripcion: String,
    pub fotos: Vec<String>,
    pub fecha: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Fondeo {
    pub id: String,
    pub proyecto_id: String,
    pub monto: i128,
    pub fondeador: String,
    pub descripcion: String,
    pub fecha: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ComunidadCount,
    ProyectoCount,
    FondeoCount,
    Comunidad(String),
    Proyecto(String),
    Avances(String),
    FondeosProyecto(String),
    TotalFondeado,
}

#[contract]
pub struct ComunichainContract;

#[contractimpl]
impl ComunichainContract {
    pub fn registrar_comunidad(env: Env, id: String, nombre: String, direccion: String, descripcion: String, representante: String) -> bool {
        let key = DataKey::Comunidad(id.clone());
        if env.storage().persistent().has(&key) {
            return false;
        }

        let comunidad = Comunidad {
            id: id.clone(),
            nombre,
            direccion,
            descripcion,
            representante,
            fondos_recibidos: 0,
            activa: true,
            fecha_registro: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &comunidad);

        let count: u32 = env.storage().persistent().get(&DataKey::ComunidadCount).unwrap_or(0);
        env.storage().persistent().set(&DataKey::ComunidadCount, &(count + 1));

        true
    }

    pub fn obtener_comunidad(env: Env, id: String) -> Option<Comunidad> {
        let key = DataKey::Comunidad(id);
        env.storage().persistent().get(&key)
    }

    pub fn crear_proyecto(
        env: Env,
        id: String,
        nombre: String,
        lugar: String,
        descripcion: String,
        objetivo: String,
        fondeo_requerido: i128,
        comunidad_id: String,
        fotos: Vec<String>,
    ) -> bool {
        let com_key = DataKey::Comunidad(comunidad_id.clone());
        let comunidad_opt: Option<Comunidad> = env.storage().persistent().get(&com_key);
        if comunidad_opt.is_none() { return false; }

        let proy_key = DataKey::Proyecto(id.clone());
        if env.storage().persistent().has(&proy_key) { return false; }

        let proyecto = Proyecto {
            id: id.clone(),
            nombre,
            lugar,
            descripcion,
            objetivo,
            fondeo_requerido,
            fondeo_recibido: 0,
            comunidad_id,
            estado: 0,
            fecha_creacion: env.ledger().timestamp(),
            fotos,
        };

        env.storage().persistent().set(&proy_key, &proyecto);

        let count: u32 = env.storage().persistent().get(&DataKey::ProyectoCount).unwrap_or(0);
        env.storage().persistent().set(&DataKey::ProyectoCount, &(count + 1));

        true
    }

    pub fn obtener_proyecto(env: Env, id: String) -> Option<Proyecto> {
        let key = DataKey::Proyecto(id);
        env.storage().persistent().get(&key)
    }

    pub fn agregar_avance(
        env: Env,
        proyecto_id: String,
        avance_id: String,
        descripcion: String,
        fotos: Vec<String>,
    ) -> bool {
        let proy_key = DataKey::Proyecto(proyecto_id.clone());
        let proyecto_opt: Option<Proyecto> = env.storage().persistent().get(&proy_key);
        if proyecto_opt.is_none() { return false; }

        let avance = Avance {
            id: avance_id.clone(),
            descripcion,
            fotos,
            fecha: env.ledger().timestamp(),
        };

        let avances_key = DataKey::Avances(proyecto_id);
        let mut avances: Vec<Avance> = env.storage().persistent().get(&avances_key).unwrap_or(Vec::new(&env));
        avances.push_back(avance);
        env.storage().persistent().set(&avances_key, &avances);

        true
    }

    pub fn obtener_avances(env: Env, proyecto_id: String) -> Vec<Avance> {
        let key = DataKey::Avances(proyecto_id);
        env.storage().persistent().get(&key).unwrap_or(Vec::new(&env))
    }

    pub fn fondear_proyecto(
        env: Env,
        fondeo_id: String,
        proyecto_id: String,
        monto: i128,
        fondeador: String,
        descripcion: String,
    ) -> bool {
        let proy_key = DataKey::Proyecto(proyecto_id.clone());
        let mut proyecto_opt: Option<Proyecto> = env.storage().persistent().get(&proy_key);
        if proyecto_opt.is_none() { return false; }

        let mut proyecto = proyecto_opt.unwrap();
        proyecto.fondeo_recibido += monto;

        if proyecto.fondeo_recibido >= proyecto.fondeo_requerido {
            proyecto.estado = 2;
        } else if proyecto.fondeo_recibido > 0 {
            proyecto.estado = 1;
        }

        env.storage().persistent().set(&proy_key, &proyecto);

        let com_key = DataKey::Comunidad(proyecto.comunidad_id.clone());
        let mut comunidad_opt: Option<Comunidad> = env.storage().persistent().get(&com_key);
        if let Some(mut comunidad) = comunidad_opt {
            comunidad.fondos_recibidos += monto;
            env.storage().persistent().set(&com_key, &comunidad);
        }

        let fondeo = Fondeo {
            id: fondeo_id,
            proyecto_id: proyecto_id.clone(),
            monto,
            fondeador,
            descripcion,
            fecha: env.ledger().timestamp(),
        };

        let fondeos_key = DataKey::FondeosProyecto(proyecto_id);
        let mut fondeos: Vec<Fondeo> = env.storage().persistent().get(&fondeos_key).unwrap_or(Vec::new(&env));
        fondeos.push_back(fondeo);
        env.storage().persistent().set(&fondeos_key, &fondeos);

        let total: i128 = env.storage().persistent().get(&DataKey::TotalFondeado).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalFondeado, &(total + monto));

        let count: u32 = env.storage().persistent().get(&DataKey::FondeoCount).unwrap_or(0);
        env.storage().persistent().set(&DataKey::FondeoCount, &(count + 1));

        true
    }

    pub fn obtener_fondeos(env: Env, proyecto_id: String) -> Vec<Fondeo> {
        let key = DataKey::FondeosProyecto(proyecto_id);
        env.storage().persistent().get(&key).unwrap_or(Vec::new(&env))
    }

    pub fn obtener_estadisticas(env: Env) -> Vec<i128> {
        let comunidades: u32 = env.storage().persistent().get(&DataKey::ComunidadCount).unwrap_or(0);
        let proyectos: u32 = env.storage().persistent().get(&DataKey::ProyectoCount).unwrap_or(0);
        let total_fondeado: i128 = env.storage().persistent().get(&DataKey::TotalFondeado).unwrap_or(0);
        let fondeos: u32 = env.storage().persistent().get(&DataKey::FondeoCount).unwrap_or(0);

        Vec::from_array(&env, [
            comunidades as i128,
            proyectos as i128,
            total_fondeado,
            fondeos as i128,
        ])
    }
}
