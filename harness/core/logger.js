const fs = require('fs');

// Minimal logger: mirrors every line to the console and to the session's log.txt.
class Logger {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
    fs.writeFileSync(this.logFilePath, '');
  }

  log(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    console.log(stamped);
    fs.appendFileSync(this.logFilePath, stamped + '\n');
  }

  append(rawChunk) {
    process.stdout.write(rawChunk);
    fs.appendFileSync(this.logFilePath, rawChunk);
  }
}

module.exports = { Logger };
