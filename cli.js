#!/usr/bin/env node

const { performance } = require('perf_hooks');
const https = require('https');
const stats = require('./stats.js');

function request(options, data = '') {
  let started;
  let dnsLookup;
  let tcpHandshake;
  let sslHandshake;
  let ttfb;
  let ended;

  return new Promise((resolve, reject) => {
    started = performance.now();
    const req = https.request(options, (res) => {
      res.once('readable', () => {
        ttfb = performance.now();
      });
      res.on('data', () => {});
      res.on('end', () => {
        ended = performance.now();
        resolve([
          started,
          dnsLookup,
          tcpHandshake,
          sslHandshake,
          ttfb,
          ended,
          parseFloat(res.headers['server-timing'].slice(22)),
        ]);
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsLookup = performance.now();
      });
      socket.on('connect', () => {
        tcpHandshake = performance.now();
      });
      socket.on('secureConnect', () => {
        sslHandshake = performance.now();
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

function download(bytes) {
  const options = {
    hostname: 'speed.cloudflare.com',
    path: `/__down?bytes=${bytes}`,
    method: 'GET',
  };

  return request(options);
}

function upload(bytes) {
  const data = '0'.repeat(bytes);
  const options = {
    hostname: 'speed.cloudflare.com',
    path: '/__up',
    method: 'POST',
    headers: {
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return request(options, data);
}

function measureSpeed(bytes, duration) {
  return (bytes * 8) / (duration / 1000) / 1e6;
}

async function measureLatency() {
  const measurements = [];

  for (let i = 0; i < 20; i += 1) {
    await download(1000).then(
      (response) => {
        // TTFB - Server processing time
        measurements.push(response[4] - response[0] - response[6]);
      },
      (error) => {
        console.log(`Error: ${error}`);
      }
    );
  }

  return [
    Math.min(...measurements),
    Math.max(...measurements),
    stats.average(measurements),
    stats.median(measurements),
  ];
}

async function measureDownload(bytes, iterations) {
  const measurements = [];

  for (let i = 0; i < iterations; i += 1) {
    await download(bytes).then(
      (response) => {
        const transferTime = response[5] - response[4];
        measurements.push(measureSpeed(bytes, transferTime));
      },
      (error) => {
        console.log(`Error: ${error}`);
      }
    );
  }

  return measurements;
}

async function measureUpload(bytes, iterations) {
  const measurements = [];

  for (let i = 0; i < iterations; i += 1) {
    await upload(bytes).then(
      (response) => {
        const transferTime = response[6];
        measurements.push(measureSpeed(bytes, transferTime));
      },
      (error) => {
        console.log(`Error: ${error}`);
      }
    );
  }

  return measurements;
}

async function speedTest() {
  const ping = await measureLatency();

  console.log(
    '\x1b[35m%s%s\x1b[0m',
    '       Latency: ',
    `${ping[3].toFixed(2)} ms`
  );

  const test1 = await measureDownload(11000, 10);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '    10kB speed: ',
    `${stats.median(test1).toFixed(2)} Mbps`
  );

  const test2 = await measureDownload(101000, 10);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '   100kB speed: ',
    `${stats.median(test2).toFixed(2)} Mbps`
  );

  const test3 = await measureDownload(1001000, 8);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '     1MB speed: ',
    `${stats.median(test3).toFixed(2)} Mbps`
  );

  const test4 = await measureDownload(10001000, 5);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '    10MB speed: ',
    `${stats.median(test4).toFixed(2)} Mbps`
  );

  const test5 = await measureDownload(25001000, 5);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '    25MB speed: ',
    `${stats.median(test5).toFixed(2)} Mbps`
  );
  const test6 = await measureDownload(100001000, 5);

  console.log(
    '\x1b[1m%s\x1b[33m%s\x1b[0m',
    '   100MB speed: ',
    `${stats.median(test6).toFixed(2)} Mbps`
  );

  console.log(
    '\x1b[1m%s\x1b[32m%s\x1b[0m',
    'Download speed: ',
    `${stats
      .quartile(
        [...test1, ...test2, ...test3, ...test4, ...test5, ...test6],
        0.9
      )
      .toFixed(2)} Mbps`
  );

  const test7 = await measureUpload(11000, 10);
  const test8 = await measureUpload(101000, 10);
  const test9 = await measureUpload(1001000, 8);

  console.log(
    '\x1b[1m%s\x1b[32m%s\x1b[0m',
    '  Upload speed: ',
    `${stats.quartile([...test7, ...test8, ...test9], 0.9).toFixed(2)} Mbps`
  );
}

speedTest();
