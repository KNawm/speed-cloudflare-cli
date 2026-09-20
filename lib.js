const { performance } = require("perf_hooks");
const https = require("https");
const { magenta, bold, yellow, green, blue } = require("./chalk.js");
const stats = require("./stats.js");
let flushing = true;

/**
 * @typedef {Object} Results
 * @property {string} server_location - Location string.
 * @property {string} your_ip - IP address and location string.
 * @property {{min: string, max: string, average: string, median: string, jitter: string}} latency - Latency metrics.
 * @property {number[]} download_speeds - List of download speeds.
 * @property {Array<{size: string, speed: string}>} download_speeds - List of download speeds.
 * @property {Array<{size: string, speed: string}>} upload_speeds - List of upload speeds.
 */

/** @type {Results} */
let results;

async function get(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: "GET",
      },
      (res) => {
        const body = [];
        res.on("data", (chunk) => {
          body.push(chunk);
        });
        res.on("end", () => {
          try {
            resolve(Buffer.concat(body).toString());
          } catch (e) {
            reject(e);
          }
        });
        req.on("error", (err) => {
          reject(err);
        });
      },
    );

    req.end();
  });
}

async function fetchServerLocationData() {
  const res = JSON.parse(await get("speed.cloudflare.com", "/locations"));

  return res.reduce((data, { iata, city }) => {
    // Bypass prettier "no-assign-param" rules
    const data1 = data;

    data1[iata] = city;
    return data1;
  }, {});
}

function fetchCfCdnCgiTrace() {
  const parseCfCdnCgiTrace = (text) =>
    text
      .split("\n")
      .map((i) => {
        const j = i.split("=");

        return [j[0], j[1]];
      })
      .reduce((data, [k, v]) => {
        if (v === undefined) return data;

        // Bypass prettier
        // "no-assign-param" rules
        const data1 = data;
        // Object.fromEntries is only
        // supported by Node.js 12 or newer
        data1[k] = v;

        return data1;
      }, {});

  return get("speed.cloudflare.com", "/cdn-cgi/trace").then(parseCfCdnCgiTrace);
}

function request(options, data = "") {
  let started;
  let dnsLookup;
  let tcpHandshake;
  let sslHandshake;
  let ttfb;
  let ended;

  options.agent = new https.Agent(options);

  return new Promise((resolve, reject) => {
    started = performance.now();
    const req = https.request(options, (res) => {
      res.once("readable", () => {
        ttfb = performance.now();
      });
      res.on("data", () => {});
      res.on("end", () => {
        ended = performance.now();
        resolve({started, dnsLookup, tcpHandshake, sslHandshake, ttfb, ended,
                 serverTiming: parseFloat(res.headers["server-timing"].slice(22))});
      });
    });

    req.on("socket", (socket) => {
      socket.once("lookup", () => {
        dnsLookup = performance.now();
      });
      socket.once("connect", () => {
        tcpHandshake = performance.now();
      });
      socket.once("secureConnect", () => {
        sslHandshake = performance.now();
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

function download(bytes) {
  const options = {
    hostname: "speed.cloudflare.com",
    path: `/__down?bytes=${bytes}`,
    method: "GET",
  };

  return request(options);
}

function upload(bytes) {
  const data = "0".repeat(bytes);
  const options = {
    hostname: "speed.cloudflare.com",
    path: "/__up",
    method: "POST",
    headers: {
      "Content-Length": Buffer.byteLength(data),
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
        measurements.push(response.ttfb - response.started - response.serverTiming);
      },
      (error) => {
        console.error(`Error: ${error}`);
      },
    );
  }

  return [Math.min(...measurements), Math.max(...measurements), stats.average(measurements), stats.median(measurements), stats.jitter(measurements)];
}

async function measureDownload(bytes, iterations) {
  const measurements = [];

  for (let i = 0; i < iterations; i += 1) {
    await download(bytes).then(
      (response) => {
        const transferTime = response.ended - response.ttfb;
        measurements.push(measureSpeed(bytes, transferTime));
      },
      (error) => {
        console.error(`Error: ${error}`);
      },
    );
  }

  return measurements;
}

async function measureUpload(bytes, iterations) {
  const measurements = [];

  for (let i = 0; i < iterations; i += 1) {
    await upload(bytes).then(
      (response) => {
        const transferTime = response.serverTiming;
        measurements.push(measureSpeed(bytes, transferTime));
      },
      (error) => {
        console.error(`Error: ${error}`);
      },
    );
  }

  return measurements;
}

function logInfo(text, data) {
  if (flushing) {
    console.log(bold(" ".repeat(15 - text.length), `${text}:`, blue(data)));
  }
}

function logLatency(data) {
  if (flushing) {
    console.log(bold("         Latency:", magenta(`${data.median} ms`)));
    console.log(bold("          Jitter:", magenta(`${data.jitter} ms`)));
  }
}

function logSpeedTestResult(display_size, test) {
  const display_speed = stats.median(test).toFixed(2);
  if (flushing) {
    console.log(bold(" ".repeat(9 - display_size.length), display_size, "speed:", yellow(`${display_speed} Mbps`)));
    return;
  }
  results.download_speeds.push({ size: display_size, speed: display_speed });
}

function logDownloadSpeed(tests) {
  const display_speed = stats.quartile(tests, 0.9).toFixed(2);
  if (flushing) {
    console.log(bold("  Download speed:", green(display_speed, "Mbps")));
    return;
  }
  results.download_speeds.push({ size: "overall", speed: display_speed });
}

function logUploadSpeed(tests) {
  const display_speed = stats.quartile(tests, 0.9).toFixed(2);
  if (flushing) {
    console.log(bold("    Upload speed:", green(display_speed, "Mbps")));
    return;
  }
  results.upload_speeds.push({ size: "overall", speed: display_speed });
}

// Function to parse command-line arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith("--")) {
      args[arg.slice(2)] = true;
    }
  });
  return args;
}

async function speedTest() {
  const args = parseArgs();
  const [ping, serverLocationData, { ip, loc, colo }] = await Promise.all([measureLatency(), fetchServerLocationData(), fetchCfCdnCgiTrace()]);
  flushing = !args.json

  const city = serverLocationData[colo];
  results = {
    server_location: `${city} (${colo})`,
    your_ip: `${ip} (${loc})`,
    latency: {
      min: ping[0].toFixed(2),
      max: ping[1].toFixed(2),
      average: ping[2].toFixed(2),
      median: ping[3].toFixed(2),
      jitter: ping[4].toFixed(2)
    },
    download_speeds: [],
    upload_speeds: []
  };
  logInfo("Server Location", results.server_location);
  logInfo("Your IP", results.your_ip);
  logLatency(results.latency);

  const testDown1 = await measureDownload(101000, 10);
  logSpeedTestResult("100kB", testDown1);

  const testDown2 = await measureDownload(1001000, 8);
  logSpeedTestResult("1MB", testDown2);

  const testDown3 = await measureDownload(10001000, 6);
  logSpeedTestResult("10MB", testDown3);

  const testDown4 = await measureDownload(25001000, 4);
  logSpeedTestResult("25MB", testDown4);

  const testDown5 = await measureDownload(100001000, 1);
  logSpeedTestResult("100MB", testDown5);

  const downloadTests = [...testDown1, ...testDown2, ...testDown3, ...testDown4, ...testDown5];
  logDownloadSpeed(downloadTests);

  const testUp1 = await measureUpload(11000, 10);
  const testUp2 = await measureUpload(101000, 10);
  const testUp3 = await measureUpload(1001000, 8);
  const uploadTests = [...testUp1, ...testUp2, ...testUp3];
  logUploadSpeed(uploadTests)

  // Conditional output based on --json option
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  }
}

module.exports = {
  get,
  fetchServerLocationData,
  fetchCfCdnCgiTrace,
  request,
  download,
  upload,
  measureSpeed,
  measureLatency,
  measureDownload,
  measureUpload,
  logInfo,
  logLatency,
  logSpeedTestResult,
  logDownloadSpeed,
  logUploadSpeed,
  parseArgs,
  speedTest
};
