/** Raíz de composición: el único lugar que conoce los drivers concretos. */
import { bcryptHasher, PostgresCentralDirectory } from "./adapters/central/PostgresCentralDirectory.ts";
import { DatabaseAdapterFactory } from "./adapters/DatabaseAdapterFactory.ts";
import { FirestoreProvider } from "./adapters/firestore/FirestoreProvider.ts";
import { MongoProvider } from "./adapters/mongo/MongoProvider.ts";
import { MySqlProvider } from "./adapters/mysql/MySqlProvider.ts";
import { PostgresProvider } from "./adapters/postgres/PostgresProvider.ts";
import type { AppConfig } from "./config.ts";

/** Asignación institución → motor (INSTRUCCIONES §3 / §5.2). */
export const INSTITUTION_ENGINES = {
  1: "postgres", // Hospital General
  2: "mysql", // Clínica Odontológica
  3: "mongodb", // Laboratorio Clínico
  4: "firestore", // Centro Médico Pediátrico
} as const;

export function buildFactory(config: AppConfig): DatabaseAdapterFactory {
  const factory = new DatabaseAdapterFactory()
    .register("postgres", () => new PostgresProvider(config.postgresUrl))
    .register("mysql", () => new MySqlProvider(config.mysqlUrl))
    .register("mongodb", () => new MongoProvider(config.mongoUrl, config.mongoDb))
    .register("firestore", () => new FirestoreProvider(config.firebaseProjectId));
  for (const [institution, engine] of Object.entries(INSTITUTION_ENGINES)) factory.route(Number(institution), engine);
  return factory;
}

export function buildContainer(config: AppConfig) {
  const central = new PostgresCentralDirectory(config.centralUrl);
  return {
    config,
    factory: buildFactory(config),
    central,
    hasher: bcryptHasher,
    async close() {
      await Promise.all([this.factory.closeAll(), central.close()]);
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
