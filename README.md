# ComuniChain — Plataforma de Transparencia Comunitaria


## Tabla de Contenidos

- [Descripción del Proyecto](#descripción-del-proyecto)
- [Propuesta de Valor](#propuesta-de-valor)
- [Arquitectura](#arquitectura)
- [Tecnologías](#tecnologías)
- [Instalación Local](#instalación-local)
- [Variables de Entorno](#variables-de-entorno)
- [Despliegue en Producción](#despliegue-en-producción)
- [Uso de la Plataforma](#uso-de-la-plataforma)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Colaboración en el Ecosistema Stellar](#colaboración-en-el-ecosistema-stellar)
- [Retrospectiva y Mejoras Futuras](#retrospectiva-y-mejoras-futuras)
- [Equipo](#equipo)
- [Licencia](#licencia)

---

## Descripción del Proyecto

**ComuniChain** es una plataforma web de transparencia comunitaria que conecta comunidades con el gobierno. Permite publicar proyectos con metas de fondeo, registrar avances con evidencia fotográfica y tener un historial verificable de todos los recursos asignados.

El sistema usa **Passkeys (WebAuthn)** para autenticación biométrica — sin contraseñas — y **Stellar Soroban** como capa de registro inmutable para cada transacción importante.

**Problema que resuelve:** La desconfianza ciudadana en el uso de recursos públicos por falta de transparencia y mecanismos de rendición de cuentas accesibles.

**Solución:** Una plataforma donde comunidades documentan sus proyectos, el gobierno fondea con trazabilidad total y cualquier ciudadano puede verificar el historial desde el navegador.

---

## Propuesta de Valor

| Actor | Beneficio |
|---|---|
| **Comunidad** | Registro de proyectos, solicitud de fondos y publicación de avances con fotos |
| **Gobierno** | Panel unificado para revisar y fondear proyectos con historial verificable |
| **Ciudadano** | Consulta pública de proyectos, avances y fondeos sin necesidad de cuenta |

---

##  Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                │
│         HTML + CSS + JavaScript (Vanilla)           │
│         Passkeys via @simplewebauthn/browser        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / REST API
┌──────────────────────▼──────────────────────────────┐
│                 SERVIDOR (Node.js)                  │
│                  Express.js API                     │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Auth Layer │  │ Comunidades │  │  Gobierno   │ │
│  │  WebAuthn   │  │  Proyectos  │  │   Fondeos   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │           src/database.js (MySQL2)          │    │
│  │           src/blockchain.js (Stellar SDK)   │    │
│  │           src/validation.js                 │    │
│  └─────────────────────────────────────────────┘    │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼─────────────────┐
│     MySQL 8.0       │  │    Stellar Soroban        │
│  Base de datos      │  │    Smart Contract (Rust)  │
│  (Railway / local)  │  │    Testnet                │
└─────────────────────┘  └──────────────────────────┘
```

### Diagrama de Flujo de Autenticación (WebAuthn)

```
Usuario           Navegador              Servidor
   │                  │                      │
   │─── Username ────►│                      │
   │                  │─── /register/begin ─►│
   │                  │◄── Challenge ────────│
   │◄── Biometría ───►│                      │
   │    (Windows      │                      │
   │    Hello/Face ID)│                      │
   │                  │─── Credential ──────►│
   │                  │◄── Token JWT ────────│
   │◄── Sesión ───────│                      │
```

---

##  Tecnologías

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| **Backend** | Node.js + Express | 20 / 4.x | Servidor HTTP y API REST |
| **Base de datos** | MySQL2 | 3.x | Persistencia de datos |
| **Auth** | @simplewebauthn/server | 9.x | Passkeys / WebAuthn |
| **Blockchain** | @stellar/stellar-sdk | 15.x | Integración con Stellar Soroban |
| **Smart Contract** | Rust (Soroban) | — | Registro inmutable en Stellar |
| **Storage** | Multer + Cloudinary | — | Subida de imágenes |
| **Frontend** | HTML + CSS + JS Vanilla | — | Interfaz sin frameworks |
| **Deploy** | Railway | — | Hosting de producción |

---

## Instalación Local

### Prerrequisitos

- Node.js 18 o superior
- MySQL 8.0 corriendo localmente
- Git

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/Reyesjessica/comunichain.git
cd comunichain

# 2. Instalar dependencias
npm install

# 3. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores (ver sección siguiente)

# 4. Crear la base de datos en MySQL
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS comunichain;"

# 5. Iniciar el servidor (las tablas se crean automáticamente)
npm start
```

Abre http://localhost:3000 en el navegador.

Para desarrollo con recarga automática:
```bash
npm run dev
```

---

##  Variables de Entorno

Copia `.env.example` como `.env` y completa los valores:

```env
# Servidor
PORT=3000
NODE_ENV=development

# WebAuthn — RP_ID debe coincidir con el dominio exacto
RP_ID=localhost
ORIGIN=http://localhost:3000
CORS_ORIGINS=http://localhost:3000

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=comunichain

# Stellar Soroban
CONTRACT_ID=CCPS7OWL25OIBYGBMM7EXLFPQBKTOIREWIKYZZR2FM5MTFVOOO6UTMTF
PUBLIC_KEY=tu_public_key
SECRET_KEY=tu_secret_key
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
RPC_URL=https://soroban-testnet.stellar.org

# Cloudinary (opcional — si se omite, usa disco local)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

### Generar un nuevo keypair de Stellar

```bash
node -e "
const { Keypair } = require('@stellar/stellar-sdk');
const k = Keypair.random();
console.log('PUBLIC_KEY=' + k.publicKey());
console.log('SECRET_KEY=' + k.secret());
"
```

Fondear la cuenta nueva en testnet: https://friendbot.stellar.org/?addr=TU_PUBLIC_KEY

---

##  Despliegue en Producción

El proyecto está desplegado en [Vercel](https://railway.app).

**URL de producción:** (https://comunichain-iota.vercel.app/)

##  Uso de la Plataforma

### Como Comunidad

1. Ve a la plataforma y haz clic en **"Conectar"**
2. Ingresa un nombre de usuario y regístrate con **biometría** (huella, Face ID o PIN)
3. Selecciona el rol **Comunidad** y registra los datos de tu comunidad
4. Crea proyectos con descripción, objetivo, monto requerido y fotos
5. Sube avances periódicos con evidencia fotográfica

### Como Gobierno

1. Crea una cuenta con el flujo biométrico
2. Selecciona el rol **Gobierno**
3. Desde el panel revisa todos los proyectos activos
4. Fondea proyectos asignando montos directamente
5. Consulta el historial completo de fondeos

### Como Ciudadano (sin cuenta)

- La página principal muestra todos los proyectos públicamente
- Puedes ver avances, fotos y el historial de fondeos sin registro

---

## Estructura del Proyecto

```
comunichain/
├── index.js                 # Servidor principal y rutas API
├── package.json             # Dependencias y scripts
├── .env.example             # Plantilla de variables de entorno
├── railway.toml             # Configuración Railway
├── render.yaml              # Configuración Render
├── fly.toml                 # Configuración Fly.io
├── Dockerfile               # Contenedor Docker
├── DEPLOY.md                # Guía detallada de despliegue
├── src/
│   ├── database.js          # Pool MySQL y todas las queries
│   ├── blockchain.js        # Integración Stellar Soroban SDK
│   └── validation.js        # Validaciones de entrada de datos
├── public/
│   └── index.html           # Frontend completo (SPA)
└── smart-contracts/
    ├── Cargo.toml            # Manifiesto del contrato Rust
    └── src/
        └── lib.rs            # Smart contract Soroban
```

### Endpoints principales de la API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register/begin` | Inicia registro WebAuthn |
| POST | `/auth/register/complete` | Completa registro biométrico |
| POST | `/auth/login/begin` | Inicia autenticación |
| POST | `/auth/login/complete` | Completa autenticación biométrica |
| POST | `/api/comunidad/registrar` | Registra nueva comunidad |
| GET | `/api/comunidad/mi-perfil` | Perfil y proyectos de la comunidad |
| POST | `/api/proyectos/crear` | Crea proyecto con fotos |
| GET | `/api/proyectos` | Lista todos los proyectos |
| POST | `/api/proyectos/:id/avances` | Agrega avance con fotos |
| POST | `/api/gobierno/fondear` | Fondea un proyecto |
| GET | `/api/estadisticas` | Estadísticas globales |
| GET | `/health` | Health check del servidor |

---

## Colaboración en el Ecosistema Stellar

Como parte del desarrollo de este proyecto participamos en las comunidades oficiales de Stellar:

- **Discord de Stellar Developers** — `discord.gg/stellardev`  
  Participación en canales `#soroban-help` y `#smart-contracts` consultando sobre la integración del SDK con Node.js y el despliegue de contratos en testnet.

- **GitHub Discussions de Stellar**  
  Seguimiento de issues relacionados con `@stellar/stellar-sdk` v15 y compatibilidad con `soroban-rpc`.

- **Stellar Quest / Laboratory**  
  Uso del [Stellar Laboratory](https://laboratory.stellar.org) para pruebas de cuentas y transacciones en testnet.

---

## Retrospectiva y Mejoras Futuras

### Lo que funcionó bien 

- La autenticación con Passkeys fue la parte más valorada en las pruebas con usuarios — eliminar contraseñas redujo la fricción significativamente.
- La arquitectura Express + MySQL resultó flexible para iterar rápido durante el sprint.
- Vercel simplificó enormemente el proceso de despliegue continuo.

### Áreas de mejora identificadas (feedback del sprint) 🔧

| Feedback recibido | Acción propuesta |
|---|---|
| "No sé si mi solicitud se procesó" | Agregar notificaciones en tiempo real (WebSockets) |
| "Quiero buscar proyectos por municipio" | Implementar filtros y búsqueda geográfica |
| "El panel de gobierno es muy básico" | Dashboard con gráficas de inversión por región |
| "¿Cómo sé que las fotos son reales?" | Geolocalización de imágenes (EXIF metadata) |

### Ruta de crecimiento 

**Corto plazo (próximo sprint)**
- Notificaciones por correo al recibir fondeos
- Búsqueda y filtros en la lista de proyectos
- Roles adicionales: ciudadano verificador

**Mediano plazo**
- App móvil nativa con soporte biométrico (Face ID / huella)
- Integración con INEGI para validar datos geográficos de las comunidades
- Panel analítico para gobierno con visualizaciones de impacto por región

**Largo plazo**
- Migrar a Stellar Mainnet para proyectos con fondos reales
- API pública para que ONGs y organismos internacionales puedan consultar datos
- Sistema de votación comunitaria para priorizar proyectos

---

##  Equipo

| Nombre | Rol |
|---|---|
| Jessica Reyes Rosario | Líder de Proyecto |
Antonia María Santos García 
Cuevas López Ivonne Aylin 
Karen García García

**Institución:** _[Instituto Tecnologico de Tlaxiaco]_  
**Materia:** _[Desarrollo de Aplicaciones Descentralizadas]_  
**Periodo:** Enero-Junio 2026

---

##  Licencia

Este proyecto está bajo la licencia **MIT**.

```
MIT License

Copyright (c) 2026 ComuniChain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">

**ComuniChain** · Construido con ❤️ para comunidades reales

[🌐 Demo en vivo](https://comunichain-iota.vercel.app/) · 

</div>
