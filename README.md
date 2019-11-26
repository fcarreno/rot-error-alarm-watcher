# rot-error-alarm-watcher

### File watcher process to monitor an error log file, and send (transport not implemented) notifications when a given error threshold -within one minute- is exceeded (e.g.: more than 10 errors in the same minute)

### Process accepts several parameters for custom execution such as error threshold, error log file path and poll interval.

### It also documents latest execution status in a log file (`watcher.json`), to keep track of processed information and use in subsequent intervals.

### Works in conjunction with SIMPLE EXPRESS TEST API server under:
https://github.com/fcarreno/rot-error-alarm-server

*** Expects errors logged in specific JSON format --> [bunyan err](https://github.com/trentm/node-bunyan#recommendedbest-practice-fields)

*** More details and assumptions and overall process in [watcher.js](watcher.js)

### SETUP & RUN
1. Clone the repo
2. `npm install` (install dependencies)
3. `node watcher.js` (start watcher process)

NOTE: can also run the process passing environment variables to customize execution rules.
See available variables on top of [watcher.js](watcher.js)
