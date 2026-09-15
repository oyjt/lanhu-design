import { CommanderError } from "commander";
import { createProgram } from "./program.js";
import { LanhuError } from "../errors/lanhu-error.js";

try {
  await createProgram().exitOverride().parseAsync(process.argv);
} catch (error) {
  if (error instanceof LanhuError) {
    process.exitCode = error.exitCode;
  } else if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
