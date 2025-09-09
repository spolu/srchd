#!/usr/bin/env node

// To be run from the root of the srchd repository

import { readdir, readFile, writeFile } from "fs/promises";
import path, { resolve } from "path";

(async () => {
  if (!process.cwd().endsWith("/srchd")) {
    console.error(
      "Run this script from the root of the srchd repository",
      process.cwd()
    );
    process.exit(1);
  }
  if (
    !(
      await readdir(path.join(process.cwd(), "problems/ARC-AGI-2/vendor"))
    ).includes("readme.md")
  ) {
    console.error(
      "problems/ARC-AGI-2/vendor not found. Run `git submodule update --init --recursive`"
    );
    process.exit(1);
  }

  const trainingProblems = (
    await readFile(
      path.join(process.cwd(), "problems/ARC-AGI-2/vendor/data/evaluation.txt"),
      "utf-8"
    )
  ).split("\n");

  const template = await readFile(
    path.join(process.cwd(), "problems/ARC-AGI-2/template.md"),
    "utf-8"
  );

  console.log(`Found ${trainingProblems.length} evaluation problems`);
  console.log(trainingProblems);
  for (const problem of trainingProblems) {
    const problemData = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "problems/ARC-AGI-2/vendor/data/evaluation",
          `${problem}.json`
        ),
        "utf-8"
      )
    );

    let training = [];
    for (const example of problemData.train) {
      let t = "INPUT:\n";
      t += example.input.map((row: number[]) => row.join(" ")).join("\n");
      t += "\nOUTPUT:\n";
      t += example.output.map((row: number[]) => row.join(" ")).join("\n");
      training.push(t);
    }

    let test = [];
    for (const example of problemData.test) {
      let t = "INPUT:\n";
      t += example.input.map((row: number[]) => row.join(" ")).join("\n");
      test.push(t);
    }

    const p = template
      .replace("{{PROBLEM}}", problem)
      .replace("{{TRAINING}}", training.join("\n\n"))
      .replace("{{TEST}}", test.join("\n\n"));

    await writeFile(
      path.join(
        process.cwd(),
        "problems/ARC-AGI-2/generated",
        `${problem}.problem`
      ),
      p,
      "utf-8"
    );
  }
})();
