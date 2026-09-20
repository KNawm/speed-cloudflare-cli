const https = require('https');
const { performance } = require('perf_hooks');
const stats = require('../stats');

// Mock https module
jest.mock('https');

// Mock performance module
jest.mock('perf_hooks', () => ({
  performance: {
    now: jest.fn()
  }
}));

describe('Speed Test CLI', () => {
  let originalConsoleLog;
  let consoleOutput = [];

  beforeEach(() => {
    jest.clearAllMocks();
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });

    // Setup performance.now mock to return incrementing values
    let counter = 100;
    performance.now.mockImplementation(() => counter += 10);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('Network Functions', () => {
    test('get function should make HTTPS requests', async () => {
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('test data')), 5);
          } else if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
        })
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 10);
        return mockRequest;
      });

      const { get } = require('../lib');

      const result = await get('speed.cloudflare.com', '/test');

      expect(https.request).toHaveBeenCalledWith({
        hostname: 'speed.cloudflare.com',
        path: '/test',
        method: 'GET'
      }, expect.any(Function));

      expect(mockRequest.end).toHaveBeenCalled();
      expect(result).toBe('test data');
    });

    test('fetchServerLocationData should parse location data', async () => {
      const locationData = JSON.stringify([
        { iata: 'IAD', city: 'Ashburn' },
        { iata: 'LAX', city: 'Los Angeles' }
      ]);

      const mockRequest = {
        on: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(locationData)), 5);
          } else if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
        })
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 10);
        return mockRequest;
      });

      const { fetchServerLocationData } = require('../lib');
      const result = await fetchServerLocationData();

      expect(result).toEqual({
        IAD: 'Ashburn',
        LAX: 'Los Angeles'
      });
    });

    test('fetchCfCdnCgiTrace should parse trace data', async () => {
      const traceData = 'ip=192.168.1.1\nloc=US\ncolo=IAD\nts=1234567890.123\n';

      const mockRequest = {
        on: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(traceData)), 5);
          } else if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
        })
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 10);
        return mockRequest;
      });

      const { fetchCfCdnCgiTrace } = require('../lib');
      const result = await fetchCfCdnCgiTrace();

      expect(result).toEqual({
        ip: '192.168.1.1',
        loc: 'US',
        colo: 'IAD',
        ts: '1234567890.123'
      });
    });
  });

  describe('Measurement Functions', () => {
    test('measureSpeed should calculate correct speed', () => {
      const { measureSpeed } = require('../lib');

      const bytes = 1000000; // 1MB
      const duration = 1000; // 1 second
      const expectedSpeed = (bytes * 8) / (duration / 1000) / 1e6; // Should be 8 Mbps

      const result = measureSpeed(bytes, duration);
      expect(result).toBe(expectedSpeed);
    });

    test('measureLatency should return statistics array', async () => {
      // Mock network calls
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'socket') {
            const mockSocket = {
              once: jest.fn((socketEvent, socketCallback) => {
                if (socketEvent === 'lookup') setTimeout(() => socketCallback(), 1);
                if (socketEvent === 'connect') setTimeout(() => socketCallback(), 2);
                if (socketEvent === 'secureConnect') setTimeout(() => socketCallback(), 3);
              })
            };
            setTimeout(() => callback(mockSocket), 1);
          }
        }),
        write: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        once: jest.fn((event, callback) => {
          if (event === 'readable') setTimeout(() => callback(), 5);
        }),
        on: jest.fn((event, callback) => {
          if (event === 'end') setTimeout(() => callback(), 10);
        }),
        headers: {
          'server-timing': 'cfRequestDuration;dur=50.0'
        }
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 5);
        return mockRequest;
      });

      https.Agent.mockImplementation(() => ({}));

      const { measureLatency } = require('../lib');

      const result = await measureLatency();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(5);
      result.forEach(measurement => {
        expect(typeof measurement).toBe('number');
      });
    }, 10000);

    test('measureDownload should return measurement array', async () => {
      // Mock network calls similar to measureLatency
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'socket') {
            const mockSocket = {
              once: jest.fn((socketEvent, socketCallback) => {
                if (socketEvent === 'lookup') setTimeout(() => socketCallback(), 1);
                if (socketEvent === 'connect') setTimeout(() => socketCallback(), 2);
                if (socketEvent === 'secureConnect') setTimeout(() => socketCallback(), 3);
              })
            };
            setTimeout(() => callback(mockSocket), 1);
          }
        }),
        write: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        once: jest.fn((event, callback) => {
          if (event === 'readable') setTimeout(() => callback(), 5);
        }),
        on: jest.fn((event, callback) => {
          if (event === 'end') setTimeout(() => callback(), 10);
        }),
        headers: {
          'server-timing': 'cfRequestDuration;dur=50.0'
        }
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 5);
        return mockRequest;
      });

      https.Agent.mockImplementation(() => ({}));

      const { measureDownload } = require('../lib');

      const result = await measureDownload(1000, 2);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      result.forEach(measurement => {
        expect(typeof measurement).toBe('number');
      });
    }, 10000);

    test('measureUpload should return measurement array', async () => {
      // Mock network calls similar to measureLatency
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'socket') {
            const mockSocket = {
              once: jest.fn((socketEvent, socketCallback) => {
                if (socketEvent === 'lookup') setTimeout(() => socketCallback(), 1);
                if (socketEvent === 'connect') setTimeout(() => socketCallback(), 2);
                if (socketEvent === 'secureConnect') setTimeout(() => socketCallback(), 3);
              })
            };
            setTimeout(() => callback(mockSocket), 1);
          }
        }),
        write: jest.fn(),
        end: jest.fn()
      };

      const mockResponse = {
        once: jest.fn((event, callback) => {
          if (event === 'readable') setTimeout(() => callback(), 5);
        }),
        on: jest.fn((event, callback) => {
          if (event === 'end') setTimeout(() => callback(), 10);
        }),
        headers: {
          'server-timing': 'cfRequestDuration;dur=50.0'
        }
      };

      https.request.mockImplementation((options, callback) => {
        setTimeout(() => callback(mockResponse), 5);
        return mockRequest;
      });

      https.Agent.mockImplementation(() => ({}));

      const { measureUpload } = require('../lib');

      const result = await measureUpload(1000, 2);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      result.forEach(measurement => {
        expect(typeof measurement).toBe('number');
      });
    }, 10000);
  });

  describe('Logging Functions', () => {
    test('logInfo should format output correctly', () => {
      const { logInfo } = require('../lib');

      logInfo('Test', 'Value');

      expect(console.log).toHaveBeenCalled();
      const output = consoleOutput[0];
      expect(output).toContain('Test:');
      expect(output).toContain('Value');
    });

    test('logLatency should display latency and jitter', () => {
      const { logLatency } = require('../lib');

      const latencyData = {
        median: '25.50',
        jitter: '5.25'
      };

      logLatency(latencyData);

      expect(console.log).toHaveBeenCalledTimes(2);
      expect(consoleOutput[0]).toContain('Latency:');
      expect(consoleOutput[0]).toContain('25.50 ms');
      expect(consoleOutput[1]).toContain('Jitter:');
      expect(consoleOutput[1]).toContain('5.25 ms');
    });

    test('logSpeedTestResult should format speed results', () => {
      const { logSpeedTestResult } = require('../lib');

      logSpeedTestResult('1MB', [100.5, 102.3, 99.8]);

      expect(console.log).toHaveBeenCalled();
      const output = consoleOutput[0];
      expect(output).toContain('1MB');
      expect(output).toContain('speed:');
      expect(output).toContain('Mbps');
    });
  });

  describe('Argument Parsing', () => {
    test('parseArgs should parse --json flag', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js', '--json'];

      const { parseArgs } = require('../lib');
      const result = parseArgs();

      expect(result.json).toBe(true);

      process.argv = originalArgv;
    });

    test('parseArgs should handle no arguments', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js'];

      const { parseArgs } = require('../lib');
      const result = parseArgs();

      expect(Object.keys(result)).toHaveLength(0);

      process.argv = originalArgv;
    });
  });
});
