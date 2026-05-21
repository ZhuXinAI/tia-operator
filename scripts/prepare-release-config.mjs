import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "src-tauri", "tauri.conf.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const repository = process.env.GITHUB_REPOSITORY || process.env.TIA_OPERATOR_REPOSITORY;
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY;
const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
const requireUpdater = process.env.REQUIRE_TAURI_UPDATER === "1";

if (requireUpdater && !repository) {
  console.error("GITHUB_REPOSITORY or TIA_OPERATOR_REPOSITORY is required.");
  process.exit(1);
}

if (requireUpdater && !publicKey) {
  console.error("TAURI_UPDATER_PUBLIC_KEY is required for updater-ready releases.");
  process.exit(1);
}

if (requireUpdater && !privateKey) {
  console.error("TAURI_SIGNING_PRIVATE_KEY is required for updater-ready releases.");
  process.exit(1);
}

if (repository) {
  config.bundle.homepage = `https://github.com/${repository}`;
  config.plugins.updater.endpoints = [
    `https://github.com/${repository}/releases/latest/download/latest.json`,
  ];
}

if (publicKey) {
  config.plugins.updater.pubkey = publicKey;
}

config.bundle.createUpdaterArtifacts = Boolean(privateKey);

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
