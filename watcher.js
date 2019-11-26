const watcherExecutionFilePath = process.env.WATCHER_EXECUTION_FILE_PATH || './watcher.json';
const path = require('path');
const os = require('os');
const fs = require('fs');
const serverErrorLogFilePath = process.env.SERVER_ERROR_LOG_FILE_PATH || path.resolve(os.tmpdir(), 'APIServerError.log');
const errorThreshold = process.env.SERVER_ERROR_THRESHOLD || 10;
const pollErrorFileInterval = process.env.SERVER_ERROR_LOG_POLL_INTERVAL || 60000;
const logReaderUtil = require('./utils/logging/logreader');
let logReader;

/* ASSUMPTIONS:
 -- Assumes time range that logic checks to determine if error threshold has been exceeded is NOT configurable
    (just checks for log error entries that took place within the same minute)
 -- Assumes error log file includes one error (a JSON object) per line.
 -- To simplify errors timestamp comparisons, assumes error log is recycled/rotated per day.
    (not considering comparison of day/month, just hour and minute...)
 -- Assumes wather.json file also gets rotated/recycled per day.
 -- Possible OPTIMIZATION: depending on logging volume during a day, it might be best to start from the bottom of the file...?
    (probably involves different logic though, but there might be room for improvement...)
*/
/*watcher.json sample (stores information on last -previous- execution interval).
{
  lastIntervalExecutionTime: 'YYYY-MM-DD:HH:MM:SS...',
  lastProcessedLineInfo: {
      lineNumber: N,
      accumulatedErrors: N,
      time: 'YYYY-MM-DD:HH:MM:SS...',
      + error specific info....
    }
}
 NOTE: accumulatedErrors is stored by the process in case the current interval processing finishes (e.g.: gets to the end of the file),
 and the next one finds out more lines added associated to the same time range (minute).
*/


// Poll the error log file...(default interval 60 secs)
// (to prevent sending more than one alert/email within one minute)
setInterval(watcherMain, pollErrorFileInterval);
function watcherMain() {
    console.log('===> WATCHER INTERVAL CHECK PROCESS STARTED AT', Date().toString());
    logReader = new logReaderUtil(serverErrorLogFilePath);
    if (logReader.fileIsOK){
        let watcherIntervalResult = runWatcherIntervalCheck();
        processWatcherIntervalResult(watcherIntervalResult);
        saveWatcherIntervalResult(watcherIntervalResult, watcherExecutionFilePath);

        // Cleanup for next interval run...
        logReader.closeFile();
        logReader = null;
    }
    else{
        console.log('======> UNABLE TO RUN INTERVAL CHECK PROCESS...ISSUE WHEN OPENING LOG FILE...');
    }
}


// Loops through the error log file and returns a result object including:
// -- Info on the last line processed
// -- The amount of errors found for the time range associated to the last line processed
function runWatcherIntervalCheck(){

    // Start processing from last line in previous interval - if stored in the execution file...
    // Otherwise default to first line...
    let lastExecutionInfo = getLastExecutionInfo();
    let lastProcessedLineInfo =  lastExecutionInfo ? lastExecutionInfo.lastProcessedLineInfo : {lineNumber: 1, accumulatedErrors: 1};
    let sameTimeRangeAccumulatedErrors = lastProcessedLineInfo.accumulatedErrors;

    // Get last processed and next line to start comparisons of new log entries....
    let currentLineInfo = logReader.getLineInfo(lastProcessedLineInfo.lineNumber);

    // If previous interval check resulted in errors exceeding the threshold, then skip to next time range
    // (prevent sending more than one email for the same time range -minute- requirement)....
    let nextLineInfo;
    if(sameTimeRangeAccumulatedErrors > errorThreshold)
        nextLineInfo = skipToNextTimeRange(currentLineInfo);
    else
        nextLineInfo = logReader.getNextLineInfo();


    // NOTE: it is possible that no new lines have been added between watcher interval executions, or the file has only a single line (nothing to compare against)
    // Or the only ones for the current interval belong to a previous time range (already exceeded)
    // and the attempt to get a next time range ends up at EOF...so we check that here, before proceeding...
    if(nextLineInfo){

        let errorThresholdExceeded = false;
        // Loop while we have new lines to process and compare their time range (minutes) to check if error threshold is exceeded...
        while(nextLineInfo && !errorThresholdExceeded){

            if (linesInSameTimeRange(currentLineInfo, nextLineInfo))
                sameTimeRangeAccumulatedErrors++;
            else
                sameTimeRangeAccumulatedErrors = 1; // If time range changes, we start accumulating back from 1...

            // Continue processing file only if error threshold was not exceeded.
            if(sameTimeRangeAccumulatedErrors > errorThreshold){
                errorThresholdExceeded = true;
            }
            else
            {
                currentLineInfo = nextLineInfo;
                nextLineInfo = logReader.getNextLineInfo();
            }
        }
        // If nextLineInfo is truthy, it means we didn't get to the end of the file.
        // but rather the processing was stopped due to the error threshold being met with the last line that was read (so we'll consider it the last line processed).
        // Otherwise the last line processed is the previous/'current' one...(EOF was reached)
        lastProcessedLineInfo = nextLineInfo || currentLineInfo;
        lastProcessedLineInfo.accumulatedErrors = sameTimeRangeAccumulatedErrors;
        return { lastIntervalExecutionTime: new Date().toISOString(), lastProcessedLineInfo }; // TODO: test with no lines here...

    }
    else{
        return false;
    }

}


// Function to skip to the first line associated to the next time range (minute), if available.
// This is used in case a previous execution found the error threshold exceeded, so -when resuming in the next interval-
// that same time range is not considered (prevent sending multiple notifications for the same time range -minute-.
function skipToNextTimeRange(currentLineInfo){

    let nextLineInfo = logReader.getNextLineInfo();
    while(nextLineInfo && linesInSameTimeRange(currentLineInfo, nextLineInfo)){
        nextLineInfo = logReader.getNextLineInfo();
    }
    return nextLineInfo;
}

// TODO: need to close file via logreader so intervals can resume?
// Function to check whether the error threshold has exceeded, and sends notification.
function processWatcherIntervalResult(watcherIntervalResult){

    console.log('===> WATCHER INTERVAL CHECK PROCESS FINISHED AT', Date().toString());
    if(watcherIntervalResult){
        let lastProcessedLineInfo = watcherIntervalResult.lastProcessedLineInfo;
        if(lastProcessedLineInfo.accumulatedErrors > errorThreshold){ // Means we found a match...(error threshold has exceeded)
            console.log(`======> ERROR THRESHOLD WAS EXCEEDED AT: ${lastProcessedLineInfo.time} - LINE NUMBER: ${lastProcessedLineInfo.lineNumber}`);
            console.log('======> PLEASE CHECK LOG FILE WITH ENTRIES DURING THAT TIME...');
            console.log(`======> EMAIL SENT!`); // call logic to send email here...
        }
        else{
            console.log('======> NO ISSUES FOUND FOR THIS WATCHER INTERVAL');
        }
    }
    else{
        console.log('======> NO ISSUES FOUND FOR THIS WATCHER INTERVAL');
    }

}


// Function to update watcher.json file with last execution info
function saveWatcherIntervalResult(watcherIntervalResult, filePath){

    if(watcherIntervalResult && filePath)
        fs.writeFileSync(watcherExecutionFilePath,JSON.stringify(watcherIntervalResult),{encoding:'utf8',flag:'w'})
}


function getLastExecutionInfo(){

    let watcherExecutionInfo = false;
    if (fs.existsSync(watcherExecutionFilePath)) {
        try{
            let watcherExecutionFileContent = fs.readFileSync(watcherExecutionFilePath);
            watcherExecutionInfo = JSON.parse(watcherExecutionFileContent);
        }
        catch(err){
            console.log('Error parsing watcher execution file...', err);
        }
    }
    return watcherExecutionInfo;
}

function linesInSameTimeRange(firstLine, secondLine){

    let firstLineTime = new Date(firstLine.time);
    let secondLineTime = new Date(secondLine.time);
    return  (firstLineTime.getHours() == secondLineTime.getHours()) && (firstLineTime.getMinutes() == secondLineTime.getMinutes());

}



