/** Type declarations for server-only adapter modules that access Node.js APIs. */
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  pid: number;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(
    path: string,
    data: string,
    encoding: string,
  ): void;
  export function writeFileSync(
    path: string,
    data: string,
    options: { encoding?: string; flag?: string; mode?: number },
  ): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function readdirSync(path: string): string[];
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): string | undefined;
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}
