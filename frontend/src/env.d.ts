/** Injected at build time by Parcel (see .env / Docker ENV). */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_BASE?: string;
    readonly ASYNC_RUN?: string;
    readonly NODE_ENV?: "development" | "production" | "test";
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
