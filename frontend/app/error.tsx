"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Jose-Morinho UI]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#09090b] px-6 py-12 text-zinc-200">
      <h1 className="text-lg font-semibold text-zinc-100">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-zinc-400">
        {error.message || "Unexpected error while rendering the page."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
      >
        Try again
      </button>
    </div>
  );
}
