import { NotFoundError } from "../domain/errors.ts";
import type { InstitutionId } from "../domain/values.ts";
import type { AccessContext, EngineDescriptor, EngineProvider, InstitutionRepositories, IRepositoryResolver } from "../ports/index.ts";

export type EngineFactory = () => EngineProvider;

/**
 * Registry/Factory (OP-SEC-02): resuelve los adaptadores del motor de la
 * institución del usuario autenticado.
 *
 * Abierto a extensión, cerrado a modificación: agregar un 5º motor es
 *   factory.register("cassandra", () => new CassandraProvider(cfg)).route(5, "cassandra")
 * sin tocar casos de uso ni controladores. Los proveedores se crean de forma
 * perezosa: el pool del motor se inicializa con el primer usuario que lo usa.
 */
export class DatabaseAdapterFactory implements IRepositoryResolver {
  private readonly factories = new Map<string, EngineFactory>();
  private readonly routes = new Map<InstitutionId, string>();
  private readonly providers = new Map<string, EngineProvider>();

  register(engineKey: string, factory: EngineFactory): this {
    this.factories.set(engineKey, factory);
    return this;
  }

  route(institutionId: InstitutionId, engineKey: string): this {
    this.routes.set(institutionId, engineKey);
    return this;
  }

  /** Proveedor (pool) del motor que atiende a la institución. */
  provider(institutionId: InstitutionId): EngineProvider {
    const key = this.routes.get(institutionId);
    if (!key) throw new NotFoundError(`La institución ${institutionId} no tiene un motor asignado`);
    let provider = this.providers.get(key);
    if (!provider) {
      const factory = this.factories.get(key);
      if (!factory) throw new NotFoundError(`Motor '${key}' no registrado`);
      provider = factory();
      this.providers.set(key, provider);
    }
    return provider;
  }

  describe(institutionId: InstitutionId): EngineDescriptor {
    return this.provider(institutionId).descriptor;
  }

  forContext(ctx: AccessContext): InstitutionRepositories {
    return this.provider(ctx.institutionId).repositories(ctx);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.providers.values()].map((p) => p.close()));
    this.providers.clear();
  }
}
