/**
* Created by huzhongchun on 16/8/4.
* 文件改动监测程序
*/

var fs = require('fs');
var glob = require("glob-plus");
var watch = require('node-watch');
var getConfig = require('./config.js');

var _rootPath = '/';
var _relativePath = '';
var _recordsArray = [], _changedRecordsArray = [];
var _intervalLoop = null; //时间监测;
var _ignoreFilesNameArray = [];
var _ignoreFilesPathArray = [];
var _recordFilePath = '';
var _configJsonFile = '';
//格式化log打印
var _consoleLog = getConfig.consoleLog;
var _autoSave = 20;

/**
 * 获取运行参数
 * 如果没有传入,则默认当前文件夹下
 */
_watchPath = process.argv[1] ? process.argv[1] : './';


/**
 * 启动监测程序,把监测到改变了的文件路劲写入记录文件
 *
 * _changedRecordsArray记录更改的文件,当记录的数量>=10个的时候,写入记录文件,以减少写入操作
 * _intervalLoop 辅助监测写入文件,如果更改记录没有达到100次, 辅助监测程序会在20秒之后把记录存入记录文件
 */
function startWatchProgram() {
    watch(_rootPath, function (filename) {
        _consoleLog('变化的文件',filename);
        updateIntervalLoop();
        if (!repeatCheck(filename,_changedRecordsArray) && !ignoreCheck(filename,_ignoreFilesPathArray)) {
            _changedRecordsArray.push(filename);
        }
        if (_changedRecordsArray.length >= 100) {
            updateRecordFile(_changedRecordsArray);
        }
    });
}


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
 * 监测是否是忽略的文件
 * 使用 == 绝对匹配
 * @param string
 * @returns {*}
 */
function ignoreCheck(string,data) {
    var result = false;
    for(var  i= 0;i < data.length;i++){
        if(data[i] == string){
            result = true;
            break;
        }
    }
    return result;
}


/**
 * 更新辅助监测程序
 */
function updateIntervalLoop() {
    clearInterval(_intervalLoop);
    _intervalLoop = setTimeout(function () {
        if(_changedRecordsArray.length > 0){
            _consoleLog('提示','辅助监测程序执行!');
            updateRecordFile(_changedRecordsArray);
        }
    },_autoSave * 1000);
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
        _consoleLog('匹配到的新的记录:',diffArray);
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
            console.log(err);
        }
        console.log('---- '+new Date()+' ---- \n ---- 记录写入文件成功 ----');
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
        if (err) console.log(err);
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


/**
 * 获取忽略的文件
 * @param callback
 */
function getIgnoreFiles(callback) {
    findIgnoreFiles(0,function () {
        if(callback)
            callback();
    });
}


/**
 * 递归获取忽略的文件的路径
 * @param n
 * @param callback
 *
 * 不使用 path.extname的原因是,记录文件的名字是".record",path.extname匹配不出扩展名
 */
function findIgnoreFiles(n,callback) {
    var matchString = '', string = _ignoreFilesNameArray[n];
    //如果有扩展名
    if(string.match(/\.\w+$/g)){
        matchString = '**/'+string+'**';
    }else{
        //没有的则直接匹配文件夹下的所有文件
        matchString = string+'/**';
    }
    let plus = glob.plus(_relativePath + matchString)
    plus.on('file', ({ name, stats, data }) => {
        let namePath = _rootPath+name;
        _ignoreFilesPathArray.push(namePath);
    });
    plus.on('end', () => {
        let index = n+1;
        if(index < _ignoreFilesNameArray.length)
            findIgnoreFiles(index,callback);
        else{
            //_consoleLog('忽略的文件',_ignoreFilesPathArray);
            if(callback)
                callback();
        }
    })
}




/**
 * 启动程序,保证所有忽略文件都已经找到之后,再启动监测程序;
 */


getConfig.findConfigJsonFile(function (config) {
    _relativePath = config.relativePath;
    _rootPath = config.rootPath;
    _configJsonFile = _rootPath + config.configFileName;
    _recordFilePath = _rootPath + config.recordFileName;
    _ignoreFilesNameArray = config.ignores;
    _autoSave = parseInt(config.autoSave);
    getIgnoreFiles(startWatchProgram);

});





