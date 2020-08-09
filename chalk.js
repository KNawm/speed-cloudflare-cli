exports.magenta = (...args) => `\u001b[35m${args.join(' ')}\u001b[0m`;
exports.bold = (...args) => `\u001b[1m${args.join(' ')}\u001b[0m`;
exports.yellow = (...args) => `\u001b[33m${args.join(' ')}\u001b[0m`;
exports.green = (...args) => `\u001b[32m${args.join(' ')}\u001b[0m`;
exports.blue = (...args) => `\u001b[34m${args.join(' ')}\u001b[0m`;
