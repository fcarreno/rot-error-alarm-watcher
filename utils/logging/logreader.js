'use strict';
const readlines = require('n-readlines');

class LogReader {
    constructor(errorLogFilePath) {

        this.currentLineNumber = 0;
        this.fileIsOK = false;
        try{
            this.fileLinesReader = new readlines(errorLogFilePath);
            this.fileIsOK = true;
        }
        catch(err){
            console.log('Error trying to read from log file...', err);
        }

    }

    getLineInfo(lineNumber) {
        this.fileLinesReader.reset();
        this.currentLineNumber = 0;
        let line;

        for(let linesRead=0;linesRead<lineNumber;linesRead++){
            line = this.fileLinesReader.next();
            this.currentLineNumber++;
        }
        return this._parseLine(line, this.currentLineNumber);
    }

    getNextLineInfo(){
        let line = this.fileLinesReader.next();
        this.currentLineNumber++;
        return this._parseLine(line, this.currentLineNumber);
    }

    resetFile(){
        this.fileLinesReader.reset();
    }

    closeFile(){

        if(this.fileLinesReader && !this.fileLinesReader.eofReached)
            this.fileLinesReader.close();
    }

    // Returns parsed JSON info or false (if no line was received)
    _parseLine(line, lineNumber){

        let lineInfo = false;
        if(line && line.byteLength){
            try{
                lineInfo = { lineNumber, ...JSON.parse(line.toString())};
            }
            catch(err){
                console.log('Error parsing log file line...', err);
            }
        }
        return lineInfo;

    }

}

module.exports = LogReader;



