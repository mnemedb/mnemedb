/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MNEME_GATEWAY_URL?:      string;
  readonly VITE_AGENT_REGISTRY_ADDRESS?: string;
  readonly VITE_PRIVY_APP_ID?:           string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
