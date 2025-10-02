import Docker, { Container } from "dockerode";
import tar from "tar-stream";
import { Writable } from "stream";
import path from "path";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";

const docker = new Docker();
const COMPUTER_IMAGE = "agent-computer:base";
const VOLUME_PREFIX = "srchd_computer_";
const NAME_PREFIX = "srchd-computer-";
const DEFAULT_WORKDIR = "/workspace";

function containerName(id: string) {
  return `${NAME_PREFIX}${id}`;
}
function volumeName(id: string) {
  return `${VOLUME_PREFIX}${id}`;
}

async function ensureImage(image: string) {
  try {
    await docker.getImage(image).inspect();
  } catch {
    throw new Error(`image not found: ${image}`);
  }
}

async function ensureVolume(name: string) {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
  }
}

export class Computer {
  private id: string;
  private container: Container;

  private constructor(id: string, container: Container) {
    this.id = id;
    this.container = container;
  }

  static async create(
    computerId: string
  ): Promise<Result<Computer, SrchdError>> {
    try {
      const name = containerName(computerId);
      const volume = volumeName(computerId);

      await ensureImage(COMPUTER_IMAGE);
      await ensureVolume(volume);

      let privileged = false;
      const usernsMode = "1000:100000:65536";

      const container = await docker.createContainer({
        name,
        Image: COMPUTER_IMAGE,
        WorkingDir: DEFAULT_WORKDIR,
        Env: undefined,
        ExposedPorts: undefined,
        Tty: true,
        User: "agent:agent",
        // ReadonlyRootfs: readonlyRootfs,
        HostConfig: {
          Binds: [`${volume}:${DEFAULT_WORKDIR}:rw`],
          PortBindings: undefined,
          Memory: 512 * 1024 * 1024, // Default 512MB limit
          MemorySwap: 1024 * 1024 * 1024, // Swap limit
          NanoCpus: 1e9, // Default 1 vCPU limit
          CpuShares: 512, // Lower priority
          PidsLimit: 4096, // Limit number of processes
          Ulimits: [
            { Name: "nproc", Soft: 65535, Hard: 65535 },
            { Name: "nofile", Soft: 1048576, Hard: 1048576 },
          ],

          CapAdd: [],
          CapDrop: [],
          SecurityOpt: [],
          Privileged: privileged,
          UsernsMode: usernsMode, // Proper user namespace isolation
          NetworkMode: "bridge", // Isolated network
          IpcMode: "", // Don't share IPC
          PidMode: "", // Don't share PID namespace
          // Prevent access to sensitive host paths
          Tmpfs: {
            "/tmp": "rw,noexec,nosuid,size=100m",
            "/var/tmp": "rw,noexec,nosuid,size=100m",
          },
        },
        Cmd: ["/bin/bash"],
      });

      await container.start();
      await container.inspect();

      return new Ok(new Computer(computerId, container));
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to create computer: ${error.message}`,
          error
        )
      );
    }
  }

  static async findById(computerId: string): Promise<Computer | null> {
    const name = containerName(computerId);
    try {
      const container = docker.getContainer(name);
      // This will raise an error if the container does not exist which will in turn return null.
      await container.inspect();
      return new Computer(computerId, container);
    } catch (err) {
      return null;
    }
  }

  static async ensure(
    computerId: string
  ): Promise<Result<Computer, SrchdError>> {
    const c = await Computer.findById(computerId);
    if (c) {
      const status = await c.status();
      if (status !== "running") {
        await c.container.start();
        if ((await c.status()) !== "running") {
          return new Err(
            new SrchdError(
              "computer_run_error",
              "Computer `ensure` failed set the computer as running"
            )
          );
        }
      } else {
      }
      return new Ok(c);
    }
    return Computer.create(computerId);
  }

  static async listComputerIds() {
    try {
      const list = await docker.listContainers({
        all: true,
        filters: { name: [NAME_PREFIX] },
      });
      return new Ok(
        list.map((c) => c.Names?.[0]?.slice(NAME_PREFIX.length + 1))
      );
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to list computers: ${error.message}`,
          error
        )
      );
    }
  }

  async status(): Promise<string> {
    const i = await this.container.inspect();
    return i.State.Status;
  }

  async terminate(removeVolume = true): Promise<Result<boolean, SrchdError>> {
    const volume = volumeName(this.id);

    try {
      try {
        await this.container.stop({ t: 5 });
      } catch (err) {
        // ignore
      }
      await this.container.remove({ v: removeVolume, force: true });
      if (removeVolume) {
        await docker.getVolume(volume).remove();
      }
      return new Ok(true);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to terminate computer: ${error.message}`,
          error
        )
      );
    }
  }

  async execute(
    cmd: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
    }
  ): Promise<
    Result<
      {
        exitCode: number;
        stdout: string;
        stderr: string;
        durationMs: number;
      },
      SrchdError
    >
  > {
    try {
      // Sanitize command to prevent injection
      // const sanitizedCmd = cmd.replace(/[;&|`$(){}[\]\\]/g, "\\$&");
      // const shellCmd = `timeout ${timeout} ${DEFAULT_SHELL} "${sanitizedCmd}" 2>&1`;

      const exec = await this.container.exec({
        Cmd: ["/bin/bash", "-lc", cmd],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: options?.cwd || DEFAULT_WORKDIR,
        Env: options?.env
          ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
          : undefined,
        User: "agent:agent", // Force non-root execution
      });

      const startTs = Date.now();
      const stream = await exec.start({ hijack: true, stdin: false });

      let stdout = "";
      let stderr = "";

      await new Promise<void>((resolve, reject) => {
        if (
          this.container.modem &&
          typeof this.container.modem.demuxStream === "function"
        ) {
          const outChunks: Buffer[] = [];
          const errChunks: Buffer[] = [];

          const outStream = new Writable({
            write(chunk, encoding, callback) {
              outChunks.push(Buffer.from(chunk, encoding));
              callback();
            },
          });

          const errStream = new Writable({
            write(chunk, encoding, callback) {
              errChunks.push(Buffer.from(chunk, encoding));
              callback();
            },
          });

          this.container.modem.demuxStream(stream, outStream, errStream);

          stream.on("end", () => {
            stdout = Buffer.concat(outChunks).toString("utf-8");
            stderr = Buffer.concat(errChunks).toString("utf-8");
            resolve();
          });

          stream.on("error", (e: any) => {
            reject(e);
          });
        } else {
          // Fallback for non-demuxed streams
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            stdout = Buffer.concat(chunks).toString("utf-8");
            resolve();
          });
          stream.on("error", (e: any) => {
            reject(e);
          });
        }
      });

      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode ?? 127;

      return new Ok({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startTs,
      });
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to execute on computer: ${error.message}`,
          error
        )
      );
    }
  }

  checkReadWritePath(p: string) {
    const normalized = path.posix.normalize(p);
    if (!normalized.startsWith("/workspace/")) {
      return false;
    }
    return true;
  }

  async writeFile(
    path: string, // Absolute starting with /workspace/...
    data: Buffer,
    mode?: number
  ): Promise<Result<void, SrchdError>> {
    if (!this.checkReadWritePath(path)) {
      return new Err(
        new SrchdError(
          "computer_run_error",
          "Path must be absolute and under `/workspace`"
        )
      );
    }

    try {
      if (data.length > 10 * 1024 * 1024) {
        return new Err(
          new SrchdError(
            "computer_run_error",
            `Computer writeFile data cannot exceed 10MB`
          )
        );
      }

      const pack = tar.pack();

      const fileName = path.slice("/workspace".length + 1);
      const agentUid = 1000;
      const agentGid = 1000;

      // Create all intermediate directories with proper ownership
      const pathParts = fileName.split("/");
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirPath = pathParts.slice(0, i + 1).join("/");
        pack.entry({
          name: dirPath + "/", // Trailing slash indicates directory
          type: "directory",
          mode: 0o755,
          uid: agentUid,
          gid: agentGid,
        });
      }

      pack.entry(
        {
          name: fileName,
          mode: mode ?? 0o644,
          size: data.length,
          uid: agentUid,
          gid: agentGid,
        },
        data,
        () => {
          pack.finalize();
        }
      );

      const ok = await this.container.putArchive(pack, { path: "/workspace" });
      if (!ok) {
        return new Err(
          new SrchdError(
            "computer_run_error",
            "writeFile failed on container.putArchive"
          )
        );
      }
      return new Ok(undefined);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to write file on computer: ${error.message}`,
          error
        )
      );
    }
  }

  async readFile(
    path: string // Absolute starting with /workspace/...
  ): Promise<Result<Buffer, SrchdError>> {
    if (!this.checkReadWritePath(path)) {
      return new Err(
        new SrchdError(
          "computer_run_error",
          "Path must be absolute and under `/workspace`"
        )
      );
    }

    try {
      const stream = await this.container.getArchive({ path: path });
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      const extract = tar.extract();
      let data: Buffer | null = null;
      await new Promise<void>((resolve, reject) => {
        extract.on("entry", (_header, s, next) => {
          const bufs: Buffer[] = [];
          s.on("data", (d: Buffer) => bufs.push(Buffer.from(d)));
          s.on("end", () => {
            data = Buffer.concat(bufs);
            next();
          });
          s.on("error", reject);
        });
        extract.on("finish", resolve);
        extract.on("error", reject);
        extract.end(Buffer.concat(chunks));
      });

      if (!data) {
        return new Err(
          new SrchdError("computer_run_error", `failed to read data from file`)
        );
      }

      return new Ok(data);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(
        new SrchdError(
          "computer_run_error",
          `Failed to read file on computer: ${error.message}`,
          error
        )
      );
    }
  }
}

// // Snapshot (commit to image)
// app.post("/computers/:id/snapshot", async (req, res) => {
//   const { id } = req.params;
//   const { tag }: { tag?: string } = req.body || {};
//   const c = await getContainerOr404(id, res);
//   if (!c) return;
//   try {
//     const repo = "agent-computer-snap";
//     const image = await c.commit({ repo, tag: tag || id });
//     res.json({
//       image_id: (image as any).Id || image,
//       ref: `${repo}:${tag || id}`,
//     });
//   } catch (e: any) {
//     res.status(400).json({ error: e?.message || String(e) });
//   }
// });

(async () => {
  const c = await Computer.ensure("test4");
  if (c.isOk()) {
    // console.log("writing file");
    // console.log(
    //   await c.value.writeFile(
    //     "/workspace/test3/hello.md",
    //     Buffer.from("hello world\n")
    //   )
    // );

    // console.log("reading file");
    // const b = await c.value.readFile("/workspace/test3/hello.md");
    // console.log(b);
    // if (b.isOk()) {
    //   const decoded = b.value.toString("utf8");
    //   console.log("READ: " + decoded);
    // }

    console.log("executing command");
    const e = await c.value.execute("ls");
    console.log(e);
  } else {
    console.log(c.error);
  }

  console.log(await Computer.listComputerIds());
})();
