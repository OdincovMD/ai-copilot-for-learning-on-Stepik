import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";

const backendUrl = getEnvValue("VITE_BACKEND_URL");
if (!backendUrl) {
  throw new Error("VITE_BACKEND_URL must be set in .env or .env.example");
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BACKEND_URL": JSON.stringify(backendUrl),
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        content: "src/content.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});

function getEnvValue(name: string): string | undefined {
  return process.env[name] ?? readEnvValue(".env", name) ?? readEnvValue(".env.example", name);
}

function readEnvValue(filePath: string, name: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    return trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
  }

  return undefined;
}
