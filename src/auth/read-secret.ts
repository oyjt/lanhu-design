export async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      if (chunk === "\u0003") { cleanup(); reject(new Error("已取消")); return; }
      if (chunk === "\r" || chunk === "\n") { cleanup(); resolve(value); return; }
      if (chunk === "\u007f") { value = value.slice(0, -1); return; }
      value += chunk;
    };
    process.stdin.on("data", onData);
  });
}
