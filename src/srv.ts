#!/usr/bin/env node

import { Command } from "commander";
import http from "http";
import fs from "fs";
import path from "path";
import { getDb } from "./db";

const program = new Command();

program
  .name("srv")
  .description("or1g1n/srv sqlite db")
  .argument("<database-path>", "Path to SQLite database file")
  .action((dbPath: string) => {
    console.log("or1g1n/srv sqlite db");

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = getDb(dbPath);

    const server = http.createServer((req, res) => {
      switch (req.url) {
        case "/":
          switch (req.method) {
            case "GET": {
              res.writeHead(200, { "Content-Type": "text/plain" });
              res.end("ok");
              return;
            }
          }
      }
      res.writeHead(404);
      res.end();
    });

    const port = 1337;
    server.listen(port, () => {
      console.log(`or1g1n/srv running on port ${port}`);
    });
  });

program.parse();
