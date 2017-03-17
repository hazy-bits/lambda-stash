var _ = require('lodash');

function extractJson(message) {
  var jsonStart = message.indexOf('{');
  if (jsonStart < 0) return null;
  var jsonString = message.substring(jsonStart);

  var obj;
  try {
    obj = JSON.parse(jsonString);
  } catch(e) {
    obj = null;
  }  
  return obj;
}

function toNumericIfPossible(n) {
    return !isNaN(parseFloat(n)) && isFinite(n) ? 1 * n : n;
}

exports.process = function(config) {
  console.log('formatCloudwatchLogs');
  if (!config.data ||
      !config.data.hasOwnProperty('logEvents') ||
      _.isNil(config.data.logEvents.length)) {
    return Promise.reject('Received unexpected AWS Cloudwatch Logs format:' +
      JSON.stringify(config.data));
  }

  var items = [];
  var num = config.data.logEvents.length;
  var i;
  var item;
  var parts;
  for (i = 0; i < num; i++) {
    item = config.data.logEvents[i];

    parts = item.message.match(/^(\w+)/);
    if (parts && parts[1] === 'START') {
      item.logType = 'start';
      parts = item.message.match(/^START RequestId: ([a-z0-9-]+) Version: (\S+)/); // eslint-disable-line max-len
      if (parts && parts.length === 3) {
        item.requestId = parts[1];
        item.lambdaVersion = parts[2];
      }
    } else if (parts && parts[1] === 'REPORT') {
      item.logType = 'report';
      parts = item.message.match(/^REPORT RequestId: ([a-z0-9-]+)\tDuration: ([0-9.]+) ms\tBilled Duration: ([0-9.]+) ms \tMemory Size: ([0-9.]+) MB\tMax Memory Used: ([0-9.]+)/); // eslint-disable-line max-len
      if (parts && parts.length === 6) {
        item.requestId = parts[1];
        item.duration = toNumericIfPossible(parts[2]);
        item.durationBilled = toNumericIfPossible(parts[3]);
        item.memConfigured = toNumericIfPossible(parts[4]);
        item.memUsed = toNumericIfPossible(parts[5]);
      }
    } else if (parts && parts[1] === 'END') {
      item.logType = 'end';
      parts = item.message.match(/^END RequestId: ([a-z0-9-]+)/);
      if (parts && parts[1]) {
        item.requestId = parts[1];
      }
    } else {
      item.logType = 'message';
      parts = item.message.match(/^(.*)\t(.*)\t((.|\n)*)/m);
      if (parts && parts.length === 5) {
        item.requestId = parts[2];
        item.message = parts[3];

        jsonValue = extractJson(item.message);
        if (jsonValue !== null) {
          item['$message'] = jsonValue;
        }
      }
    }

    if (config.dateField && config.dateField !== 'timestamp') {
      item[config.dateField] = new Date(item.timestamp).toISOString();
    }
    items.push(item);
  }
  config.data = items;
  return Promise.resolve(config);
};
