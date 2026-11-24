/**
 * Les configs et utilitaires de test tournent sous Node, mais le workspace web
 * ne déclare pas @types/node (lockfile gelé en CI). Ce contrat minimal suffit
 * à typechecker test/** en attendant une dépendance dédiée ; les fonctions sont
 * déclarées (pas `const`) pour se fusionner avec d'éventuels types Node réels.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding?: string): string;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module "node:fs/promises" {
  export function mkdtemp(prefix: string): Promise<string>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module "node:path" {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function basename(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:http" {
  /** Alias public : les tests importent `type Server` depuis node:http. */
  export type Server = Serveur;
  export interface Serveur {
    listen(port: number, host: string, callback?: () => void): Serveur;
    address(): { address: string; port: number } | string | null;
    close(callback?: () => void): Serveur;
  }
  export interface ReponseServeur {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string): void;
  }
  export interface ReponseClient {
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    setEncoding(encoding: string): void;
    on(event: string, listener: (morceau: string) => void): void;
  }
  export interface RequeteClient {
    on(event: string, listener: (...arguments_: unknown[]) => void): RequeteClient;
    end(): void;
  }
  export function createServer(listener: (requete: { url?: string }, reponse: ReponseServeur) => void): Serveur;
  export function request(
    options: { host?: string; port?: number; path?: string; method?: string },
    callback: (reponse: ReponseClient) => void,
  ): RequeteClient;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined;
    }
    interface Process {
      env: ProcessEnv;
      exitCode?: number;
      exit(code?: number): never;
    }
  }
  // eslint-disable-next-line no-var
  var process: NodeJS.Process;
}

export {};
