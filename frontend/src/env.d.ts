// Parcel 2 inlines `process.env.*` at build time from `frontend/.env`.
// Declare the shape we use so TypeScript is happy in the browser bundle.
declare const process: {
  env: {
    readonly API_BASE?: string;
    readonly ASYNC_RUN?: string;
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_GEMINI_MODEL?: string;
    readonly GEMINI_API_KEY?: string;
    readonly GEMINI_MODEL?: string;
    readonly [key: string]: string | undefined;
  };
};
