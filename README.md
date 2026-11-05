# Red Clínica

Frontend navegable para una red de historiales clínicos electrónicos. Está construido con React 19, TypeScript, Vite, Tailwind CSS v4 y React Router.

## Acceso de demostración

Usa cualquiera de estos usuarios: `medico`, `secretaria`, `admin`, `pediatra` o `laboratorio`. La contraseña para todos es `demo123`. La institución y el rol se detectan automáticamente.

## Estructura

- `src/pages`: pantallas y flujos principales.
- `src/components`: componentes reutilizables, modales, badges y controles.
- `src/layouts`: estructura de navegación autenticada.
- `src/services`: única capa de acceso a datos.
- `src/types`: entidades y tipos compartidos.
- `src/mocks`: datos ficticios de las cuatro instituciones.
- `src/hooks`: contexto y hooks de sesión.
- `src/app`: configuración del enrutador.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Para producir una compilación:

```bash
pnpm build
```

## Reemplazar los mocks por una API REST

Los componentes nunca importan `src/mocks`. Toda lectura o escritura pasa por funciones tipadas en `src/services`. Para conectar una API:

1. Conserva las firmas públicas de cada servicio.
2. Reemplaza `mockResponse` y las operaciones sobre arreglos por `fetch` o el cliente HTTP del equipo.
3. Configura la URL base mediante una variable de entorno de Vite.
4. Convierte la respuesta de la API a los tipos de `src/types` y centraliza allí el manejo de errores.

De esta forma las pantallas y los componentes no requieren cambios y permanecen independientes de la tecnología de persistencia.

# Medic_System
