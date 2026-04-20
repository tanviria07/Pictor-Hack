// Parcel 2 inlines `process.env.*` at build time from `frontend/.env`.
// Declare the shape we use so TypeScript is happy in the browser bundle.
declare const process: {
  env: {
    readonly API_BASE?: string;
    readonly ASYNC_RUN?: string;
    readonly VOICE_COACH_ENABLED?: string;
    readonly VITE_VOICE_COACH_ENABLED?: string;
    readonly [key: string]: string | undefined;
  };
};
