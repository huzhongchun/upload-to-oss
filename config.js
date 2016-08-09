/**
 * Created by huzhongchun on 16/8/8.
 */

var glob = require('glob-plus');
var fs = require('fs');
var _path = require('path');

var _processRunPath = process.cwd() + '/';  //此程序执行的路径
var _configJsonFile = 'upOssConfig.json',_config = null;
/**
 * 查找配置文件
 * @param callback
 * @deep 向上查找文件夹的层级数
 */
var maxDeep = 3, startDeep = 0;
function findConfigJsonFile(callback) {
    let deepString = '', configPath = '';
    for(let i = 0;i < startDeep;i++){
        deepString += '../';
    }
    let plus = glob.plus(deepString+_configJsonFile, { ignore: 'node_modules/**' })
    plus.on('file', ({ name, stats, data }) => {
        configPath = name;
    });
    plus.on('end', () => {
        if(configPath){
            readConfigFile(configPath,deepString,callback);
        }else{
            startDeep++;
            if(startDeep <= maxDeep)
                findConfigJsonFile(callback);
            else
                consoleLog('警告','没有找到配置文件,请创建~');
        }
    });
}


/**
 * 获取配置文件的json数据
 * @param path
 */
function readConfigFile(path,deepString,callback) {
    if(path){
        var result = fs.readFileSync(path,'utf8');
        try {
            _config = JSON.parse(result);
            _config.relativePath = deepString;
            _config.rootPath = _path.normalize(_processRunPath + deepString);
        }catch(e){
            consoleLog('警告','配置文件读取错误');
        }
        if(callback && _config)
            callback(_config);
    }
}


/**
 * log格式化打印
 * @param title
 * @param conent
 */
function consoleLog(title,content) {
    var content = content ? content : '暂无';
    console.log('=================================>');
    console.log('---- '+title+' ----')
    console.log(content);
    console.log('<=================================');
    console.log('\n');
}


module.exports = {
    findConfigJsonFile : findConfigJsonFile,
    readConfigFile: readConfigFile,
    consoleLog: consoleLog
};