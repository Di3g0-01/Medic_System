/** Configuración desde variables de entorno (ver server/.env.example). */
const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value == null) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

export function loadConfig() {
  return {
    port: Number(env("PORT", "4000")),
    jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
    jwtExpiresIn: env("JWT_EXPIRES_IN", "8h"),
    corsOrigin: env("CORS_ORIGIN", "*"),
    initialUserPassword: env("INITIAL_USER_PASSWORD", "demo123"),
    centralUrl: env("CENTRAL_DATABASE_URL", "postgres://rc_app:rc_app_pass@localhost:5432/red_central"),
    postgresUrl: env("POSTGRES_URL", "postgres://rc_app:rc_app_pass@localhost:5432/hospital_general"),
    mysqlUrl: env("MYSQL_URL", "mysql://rc_app:rc_app_pass@localhost:3306/clinica_odontologica"),
    mongoUrl: env("MONGO_URL", "mongodb://localhost:27017/?replicaSet=rs0"),
    mongoDb: env("MONGO_DB", "laboratorio_clinico"),
    firebaseProjectId: env("FIREBASE_PROJECT_ID", "demo-red-clinica"),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
