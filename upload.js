/**
 * Created by huzhongchun on 16/8/3.
 */

var glob = require("glob-plus");
var co = require('co');
var OSS = require('ali-oss');
var fs = require('fs');
var path = require('path');
var getConfig = require('./config.js');
var log4js = require('log4js');

//命令行传参 .../upload.js --t 'normal'  仅normal有效否则走配置文件的设置
var processType = process.argv[3];

log4js.configure({
    appenders:[{
        type: 'console',
        layout: {
            pattern: '[%r] [%p][%c] - %m%n'
        }
    }]
});
var log = log4js.getLogger();


var _rootPath = '', _bucketName = '', _recordFile = '', _configJsonFile = '', _relativePath = '';

/**
 * 文件上传的方式:
 * 默认 -- 全部对应上传
 * normalToAssets -- 本地非压缩文件上传到oss的压缩文件_assets下
 * assetsToAssets -- 本地压缩文件_assets下的文件上传到oss的压缩文件_assets下
 */

var _uploadType = processType && processType === 'normal' ? 'normalToAssets' : '';


var client = null;

//格式化log打印
var _consoleLog = getConfig.consoleLog;
var _uploadBlock =  false;



/**
 * 查看Bucket列表
 */
function checkBucketList() {
    co(function*() {
        var result = yield client.listBuckets();
        console.log(result);
    }).catch(function (err) {
        console.log(err);
    });
}


/**
 * 查看文件列表
 */
function checkFilesList(bucketName) {
    co(function*() {
        client.useBucket(bucketName);
        var result = yield client.list({
            'max-keys': 5
        });
        var objects = result.objects;
        _consoleLog('OSS文件列表',objects);
    }).catch(function (err) {
        console.log(err);
    });
}


/**
 * 下载一个文件
 * @param objectKey 实际就是这个文件的相对路劲
 */
function downloadSingleFile(objectKey) {
    co(function* () {
        var result = yield client.get(objectKey, objectKey);
        if(result.res.status == 200){
            console.log('---'+objectKey+'--- 下载成功');
        }else{
            console.log('==='+objectKey+'=== 下载失败!');
            console.log(result);
        }
    }).catch(function (err) {
        console.log(err);
    });
}

/**
 * 上传单个文件,不能上传文件夹.
 * @param bucketName
 * @param localPath
 * @param ossPath
 * @param callback
 */
function uploadSingleFile(bucketName,localPath,ossPath,callback) {
    var _callback = callback;
    co(function* () {
        client.useBucket(bucketName);
        var result = yield client.put(ossPath,localPath);
        if(result.res.status == 200){
            log.trace('---- '+ossPath+' ---- 上传成功');
        }else{
            log.error('==== '+ossPath+' ====上传失败!');
            log.error(result);
        }
        if(_callback)
            _callback();
    }).catch(function (err) {
        log.error('==== '+ossPath+' ====上传失败!');
        log.error(err);
        //这里也执行callback,以保证单个文件的上传失败,不会阻断上传队列的后续执行;
        if(_callback)
            _callback();
    });
}

/**
 * 删除一个文件.
 * @param objectKey 实际就是这个文件在oss里的路劲
 *
 * 状态码是2xx的都是成功
 */
function deleteSingleFile(objectKey,callback) {
    co(function* () {
        var result = yield client.delete(objectKey);
        if(result.res.status < 299 && result.res.status >= 200){
            log.trace('---- '+objectKey+' ---- 删除成功');
        }else{
            console.log('\n');
            log.error('==== '+objectKey+' ==== 删除失败!');
            log.error(result);
            console.log('\n');
        }
        if(callback)
            callback(result);
    }).catch(function (err) {
        log.error(err);
    });
}
/**
 * 使用同步读取文件的api,保证在上传时已经读出记录
 * 读出记录文件的数据,处理成json或者array
 * 第一行默认是注释,数据从第二行开始,用"\n"分割
 * @param recordFilePath
 * @param mode
 */
function readRecordFile(recordFilePath,mode) {
    let _mode = mode ? mode :'utf8';
    let data = fs.readFileSync(recordFilePath,_mode);
    let replaceData = data.replace(/\n+/g,'\n');
    return replaceData.split('\n');
}


/**
 * 检查文件是否存在
 * @param filePath
 */
function checkFileExists(filePath,callback) {
    var _filePath = filePath;
    fs.exists(filePath, function(exists){
        callback(exists,_filePath);
    });
}

/**
 * 上传完成之后,清除记录文件里的数据
 * @param file
 */
function cleanRecordFile(file) {
    fs.writeFile(file,'/** 此文件为文件变化监测记录,请勿删除 **/','utf8',function(err){
        if(err) log.error(err);
        _consoleLog('提示','记录文件数据清除成功~');
    });
}


/**
 *
 * 根据读取的文件记录查找相关的文件,主要是处理fis3 压缩之后的文件.
 * @param n
 * @param callback
 */
function findRecordAssetsFile(n,callback) {
    let matchString = '', string = transAbsolutePathToRelativePath(_readRecordFileArray[n],_rootPath);
    if(!string){
        let index = n+1;
        if(index < _readRecordFileArray.length)
            findRecordAssetsFile(index,callback);
        else{
            if(_uploadType === 'assetsToAssets'){
                _allRecordFileArray = _assetsRecordFileArray;
            }else if(_uploadType === 'normalToAssets'){
                _allRecordFileArray = _readRecordFileArray;
            }else{
                _allRecordFileArray = _readRecordFileArray.concat(_assetsRecordFileArray);
            }

            _consoleLog('要操作的所有的相关的文件',_allRecordFileArray);
            if(callback)
                callback();
        }
    }else {
        //如果是有后缀的,则直接匹配文件名
        if (string.match(/\.\w+$/g)) {
            matchString = '_assets/' + string + '**';
        } else {
            //没有后缀的则直接匹配文件夹下的所有文件
            _readRecordFileArray.splice(n, 1);
            n--;
            if (string !== '')
                matchString = '**/' + string + '/**';
            else
                matchString = '';
        }
        let plus = glob.plus(_relativePath + matchString, {ignore: 'node_modules/**'})
        plus.on('file', ({name, stats, data}) => {
            let reg = new RegExp(_relativePath);
            let absoluteNamePath = name.replace(reg, _rootPath);
            _assetsRecordFileArray.push(absoluteNamePath);
        });
        plus.on('end', () => {
            let index = n + 1;
            if (index < _readRecordFileArray.length)
                findRecordAssetsFile(index, callback);
            else {

                if (_uploadType === 'assetsToAssets') {
                    _allRecordFileArray = _assetsRecordFileArray;
                } else if (_uploadType === 'normalToAssets') {
                    _allRecordFileArray = _readRecordFileArray;
                } else {
                    _allRecordFileArray = _readRecordFileArray.concat(_assetsRecordFileArray);
                }

                _consoleLog('要操作的所有的相关的文件', _allRecordFileArray);
                if (callback)
                    callback();
            }
        })
    }
}



/**
 * 队列依次上传文件
 *
 * 每上传10个,休息1秒
 * @param n
 */
function uploadFilesQueue(n) {
    //过滤掉注释
    if(n < _allRecordFileArray.length){
        var  item = _allRecordFileArray[n];
        n++;
        if(n % 20 == 0){
            console.log('\n');
            log.trace('---- 文件上传成功 '+n+' 个  ----');
            console.log('\n');
            setTimeout(function () {
                if(!item.match(/^\/\*\*.*(\*\*\/)?$/g)){
                    checkFileExists(item,function(exists,file) {
                        let reg = new RegExp(_rootPath);
                        let ossPath = '';
                        /** 文件上传的方式 默认压缩文件到压缩文件 **/
                        if(_uploadType == 'assetsToAssets')
                            ossPath = file.replace(reg,'');
                        else if(_uploadType == 'normalToAssets')
                            ossPath = file.replace(reg,'_assets/');
                        else
                            ossPath = file.replace(reg,'');

                        if(exists)
                            uploadSingleFile(_bucketName,file,ossPath,function(){
                                uploadFilesQueue(n)
                            });
                        else if(ossPath) {
                            deleteSingleFile(ossPath, function () {
                                uploadFilesQueue(n);
                            });
                        }else{
                            uploadFilesQueue(n);
                        }
                    });
                }else{
                    uploadFilesQueue(n);
                }
            },1000);
        }else{
            if(!item.match(/^\/\*\*.*(\*\*\/)?$/g)){
                checkFileExists(item,function(exists,file) {
                    let reg = new RegExp(_rootPath);
                    let ossPath = '';
                    /** 文件上传的方式 默认压缩文件到压缩文件 **/
                    if(_uploadType == 'assetsToAssets')
                        ossPath = file.replace(reg,'');
                    else if(_uploadType == 'normalToAssets')
                        ossPath = file.replace(reg,'_assets/');
                    else
                        ossPath = file.replace(reg,'');

                    if(exists)
                        uploadSingleFile(_bucketName,file,ossPath,function(){
                            uploadFilesQueue(n)
                        });
                    else if(ossPath) {
                        deleteSingleFile(ossPath, function () {
                            uploadFilesQueue(n);
                        });
                    }else{
                        uploadFilesQueue(n);
                    }
                });
            }else{
                uploadFilesQueue(n);
            }
        }

    }else{
        _consoleLog('提示','文件处理成功 '+n+' 个');
        if(n > 0){
            cleanRecordFile(_recordFile);
        }
    }
}


/**
 * 找到所有文件之后,开始上传
 */

/**
 * 读取记录文件,上传修改文件
 *
 * readRecordFile 的问题是所有改变了"修改时间"的文件都会被记录,而不是真正的内容变化
 * 而fis3 release之后的所有的文件的"修改时间"都更新了
 *
 * @hanck: 只把记录里的文件作为基础,再把压缩后的同名文件匹配出来,然后再上传到OSS
 *
 */
var _readRecordFileArray = [],_assetsRecordFileArray = [], _allRecordFileArray = [];


getConfig.findConfigJsonFile(function (config) {
    //_consoleLog('配置参数',config);
    _rootPath = config.rootPath;
    _configJsonFile = _rootPath + config.configFileName;
    _recordFilePath = _rootPath + config.recordFileName;

    _uploadType =  _uploadType ? _uploadType : (config.uploadType ?  config.uploadType : '');

    if(_uploadType === 'normalToAssets'){
        console.log('\n------上传模式：非压缩文件------ \n');
    }else{
        console.log('\n------上传模式：_asset压缩文件------\n');
    }
    client = new OSS({
        region: config.oss.region,
        accessKeyId: config.oss.accessKeyId,
        accessKeySecret: config.oss.accessKeySecret,
        bucket: config.oss.bucket
    });
    _bucketName = config.oss.bucket;
    _relativePath = config.relativePath;
    _rootPath = config.rootPath;
    _recordFile = _rootPath + config.recordFileName;

    _readRecordFileArray = readRecordFile(_recordFile,'utf8');

    findRecordAssetsFile(0,function () {
        uploadFilesQueue(0);
    });
});


function transAbsolutePathToRelativePath(path,rootPath) {
    var reg = new RegExp(rootPath);
    return path.replace(reg,'');
}





