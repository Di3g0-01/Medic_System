/** La misma suite de contrato contra los 4 motores reales (Liskov + Eje B + Eje C). */
import { FirestoreProvider } from "../src/adapters/firestore/FirestoreProvider.ts";
import { MongoProvider } from "../src/adapters/mongo/MongoProvider.ts";
import { MySqlProvider } from "../src/adapters/mysql/MySqlProvider.ts";
import { PostgresProvider } from "../src/adapters/postgres/PostgresProvider.ts";
import { loadConfig } from "../src/config.ts";
import { contractSuite } from "./contract.ts";

const config = loadConfig();

contractSuite({ name: "PostgreSQL (Hospital General)", institutionId: 1, provider: () => new PostgresProvider(config.postgresUrl), slotBackstop: true });
contractSuite({ name: "MySQL (Clínica Odontológica)", institutionId: 2, provider: () => new MySqlProvider(config.mysqlUrl), slotBackstop: true });
contractSuite({ name: "MongoDB (Laboratorio Clínico)", institutionId: 3, provider: () => new MongoProvider(config.mongoUrl, config.mongoDb), slotBackstop: true });
contractSuite({ name: "Firestore (Centro Médico Pediátrico)", institutionId: 4, provider: () => new FirestoreProvider(config.firebaseProjectId), slotBackstop: false });
