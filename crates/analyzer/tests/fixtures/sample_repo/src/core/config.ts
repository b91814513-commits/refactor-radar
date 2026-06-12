export interface AppConfig {
  appName: string;
  version: string;
  debug: boolean;
}

export function loadConfig(): AppConfig {
  return {
    appName: "fixture-app",
    version: "0.1.0",
    debug: false
  };
}

export function isDebugMode(config: AppConfig): boolean {
  return config.debug;
}
