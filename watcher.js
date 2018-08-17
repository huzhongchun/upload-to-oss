/**
 * Created by huzhongchun on 16/8/4.
 * 文件改动监测程序
 */

var chokidar = require('chokidar');
var getConfig = require('./config.js');
var log4js = require('log4js');
var fs = require('fs');



var _rootPath = '/';
var _relativePath = '';
var _recordsArray = [], _changedRecordsArray = [];
var _intervalLoop = null; //时间监测;
var _ignoreFilesNameArray = [];
var _recordFilePath = '';
var _configJsonFile = '';
//格式化log打印
var _consoleLog = getConfig.consoleLog;
var _autoSave = 20;

log4js.configure({
    appenders:[{
        type: 'console',
        layout: {
            pattern: '[%r] [%p][%c] - %m%n'
        }
    }]
});
var log = log4js.getLogger();


// One-liner for current directory, ignores .dotfiles
var watcher,
    _changedRecordsArray =[];


//执行目录
var _processRunPath = process.cwd()+'/';


//只监测文件改动，不处理文件夹的变化
function ready () {
    watcher.on('change',(path)=>{
        _changedRecordsArray.push(_processRunPath+path);
        updateWriteRecordFile();
    });
    watcher.on('add',(path)=>{
        _changedRecordsArray.push(_processRunPath+path);
        updateWriteRecordFile();
    });
    watcher.on('unlink',(path)=>{
        _changedRecordsArray.push(_processRunPath+path);
        updateWriteRecordFile();
    });
}

var _updateWriteRecordFile = null;
function updateWriteRecordFile() {
    _updateWriteRecordFile && clearTimeout(_updateWriteRecordFile);
    _updateWriteRecordFile = setTimeout(()=>{
        updateRecordFile(_changedRecordsArray);
    },100)
}


getConfig.findConfigJsonFile(function (config) {
    _relativePath = config.relativePath;
    _rootPath = config.rootPath;
    _configJsonFile = _rootPath + config.configFileName;
    _recordFilePath = _rootPath + config.recordFileName;
    _ignoreFilesNameArray = config.ignores;


    checkFileExists(_recordFilePath);
    watcher = chokidar.watch('.', {ignored: [/(^|[\/\\])\../].concat(_ignoreFilesNameArray)});
    watcher.on('ready',()=>{
        console.log('ready');
        ready();
    });

});




/**
 * 获取运行参数
 * 如果没有传入,则默认当前文件夹下
 */
_watchPath = process.argv[3] ? process.argv[3] : './';


/**
 * 重复检测,避免重复记录
 * @param string
 * @returns {boolean}
 */
function repeatCheck(string,data) {
    var result = false;
    for(var  i= 0;i < data.length;i++){
        if(data[i] == string){
            result = true;
            break;
        }
    }
    // 如果是在忽略文件夹下,新增的,上面的无法匹配出来,所以再匹配一遍忽略的字段
    // 可能的问题是: 忽略掉不是在忽略文件夹下的与忽略字段同名的文件
    if(!result) {
        for (let i = 0; i < _ignoreFilesNameArray.length; i++) {
            let reg = new RegExp(_ignoreFilesNameArray[i]);
            if (string.match(reg)) {
                result = true;
                break;
            }
        }
    }
    return result;
}


/**
 * 更新记录
 * @param recordsArray
 */
function updateRecordFile(recordsArray) {
    var _recordsArray = recordsArray;
    readRecordFile(_recordFilePath,'utf8',function (data) {
        //_consoleLog('更新记录前读取的数据:',data);
        var diffArray = [];
        for(var i = 0;i < _recordsArray.length;i++){
            for(var j = 0;j <data.length;j++ ){
                if(_recordsArray[i] && _recordsArray[i] == data[j]){
                    _recordsArray.splice(i,1);
                }
            }
        }
        diffArray = _recordsArray;
        diffArray && diffArray.length > 0 && _consoleLog('匹配到的新的记录:',diffArray);
        //把不同的记录写入文件
        if(diffArray.length >0) {
            writeRecordFile('\n'+diffArray.join('\n') , _recordFilePath, '', function () {
                //写入成功后,清空内存中记录的数组数据
                _changedRecordsArray = [];
            });
        }
    });
}


/**
 * 修改记录写入文件,如果没有文件会自动创建
 * @param record
 * @param recordFilePath
 * @param mode
 * @param callback
 */
function writeRecordFile(record,recordFilePath,mode,callback) {
    var _mode = mode ? mode :'utf8';
    fs.appendFile(recordFilePath, record,'utf8', function(err){
        if (err) {
            console.log('==== 记录写入文件失败 ====');
            log.error(err);
        }
        log.trace('---- 记录写入文件成功 ----');
        if(callback){
            callback();
        }
    });
}


/**
 * 读出记录文件的数据,处理成json或者array
 * 第一行默认是注释,数据从第二行开始,用"\n"分割
 * 如果记录文件没有,则创建文件,写入注释
 * @param recordFilePath
 * @param mode
 */
function readRecordFile(recordFilePath,mode,callback) {
    checkFileExists(recordFilePath,'/** 此文件为文件变化监测记录,请勿删除 **/','utf8');
    var _mode = mode ? mode :'utf8';
    fs.readFile(recordFilePath,_mode, function(err, data){
        if (err) log.error(err);
        var recordsArray = data.split('\n');
        _recordsArray = recordsArray;
        if(callback)
            callback(recordsArray);
    });
}


/**
 * 方法类型: 同步 ( 阻塞程序执行 )
 * 检查文件是否存在如果不存在则新建一个.
 * 使用同步的writeFileSync方法,如果文件不存在,改方法则会自动创建文件.
 * @param filePath
 */
function checkFileExists(filePath) {
    var exists = fs.existsSync(filePath);
    if(!exists){
        fs.writeFileSync(filePath, '/** 此文件为文件变化监测记录,请勿删除 **/','utf8');
        _consoleLog('提示','记录文件创建成功!');
    }
}





