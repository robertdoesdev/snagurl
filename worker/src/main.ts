import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.ts";
import { createProber, createTranscoder } from "./ffmpeg.ts";
import { fetchToFile } from "./fetch.ts";
import { JobManager } from "./jobs.ts";
import { createServer } from "./server.ts";

const config = loadConfig();
const paths = { ffmpegPath: config.ffmpegPath, ffprobePath: config.ffprobePath };

const ffmpegReady =
  spawnSync(config.ffmpegPath, ["-version"], { stdio: "ignore" }).status === 0 &&
  spawnSync(config.ffprobePath, ["-version"], { stdio: "ignore" }).status === 0;

const jobs = new JobManager(config, {
  fetchSource: fetchToFile,
  probe: createProber(paths),
  transcode: createTranscoder(paths),
});
await jobs.init();

const sweeper = setInterval(() => {
  jobs.sweep().catch(() => undefined);
}, config.sweepIntervalMs);
sweeper.unref();

const server = createServer({ config, jobs, ffmpegReady });
server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({ level: "info", message: "worker listening", port: config.port, ffmpegReady }),
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await jobs.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
