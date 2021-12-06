#!/usr/bin/env node
const speedTest = require('./index')
const { bold, green } = require('./chalk.js');

function logSpeed(label, speed) {
  console.log(
    bold(
      `  ${label}:`,
      green(speed, 'Mbps')
    )
  );
}

const cli = async () => {
  const {downloadSpeed, uploadSpeed} = await speedTest();
  logSpeed('Upload Speed', uploadSpeed);
  logSpeed('Download Speed', downloadSpeed);
}

cli();
