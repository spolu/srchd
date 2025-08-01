import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import { normalizeError, SrchdError } from "./error";
import { Err, Ok, Result } from "./result";

export const readFileContent = async (
  filePath: string
): Promise<Result<string, SrchdError>> => {
  try {
    const resolvedPath = filePath.startsWith("~")
      ? path.join(os.homedir(), filePath.slice(1))
      : path.resolve(filePath);

    const content = await fs.readFile(resolvedPath, "utf-8");
    return new Ok(content);
  } catch (error) {
    return new Err(
      new SrchdError(
        "reading_file_error",
        `Failed to read file at ${filePath}`,
        normalizeError(error)
      )
    );
  }
};
