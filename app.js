/**
 * Created by huzhongchun on 16/8/3.
 */

var glob = require("glob-plus");
var co = require('co');
var OSS = require('ali-oss');
var fs = require('fs');
var path = require('path');
var getConfig = require('./config.js');

var _rootPath = '', _bucketName = '', _recordFile = '', _configJsonFile = '', _relativePath = '';
var client = null;

//格式化log打印
var _consoleLog = getConfig.consoleLog;




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
            console.log('---- '+ossPath+' ---- 上传成功');
        }else{
            console.log('==== '+ossPath+' ====上传失败!');
            console.log(result);
        }
        if(_callback)
            _callback();
    }).catch(function (err) {
        console.log(err);
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
            console.log('---- '+objectKey+' ---- 删除成功');
        }else{
            console.log('\n');
            console.log('==== '+objectKey+' ==== 删除失败!');
            console.log(result);
            console.log('\n');
        }
        if(callback)
            callback(result);
    }).catch(function (err) {
        console.log(err);
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
    var _mode = mode ? mode :'utf8';
    var data = fs.readFileSync(recordFilePath,_mode);
    var recordsArray = data.split('\n');
    return recordsArray;
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
        if(err) console.log(err);
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
    var matchString = '', string = transAbsolutePathToRelativePath(_readRecordFileArray[n],_rootPath);
    //如果是有后缀的,则直接匹配文件名
    if(string.match(/\.\w+$/g)){
        matchString = '_assets/'+string+'**';
    }else{
        //没有后缀的则直接匹配文件夹下的所有文件
        _readRecordFileArray.splice(n,1);
        n--;
        if(string != '')
            matchString = '**/'+string+'/**';
        else
            matchString = '';
    }
    let plus = glob.plus(_relativePath + matchString, { ignore: 'node_modules/**' })
    plus.on('file', ({ name, stats, data }) => {
        let reg = new RegExp(_relativePath);
        let absoluteNamePath = name.replace(reg,_rootPath);
        _assetsRecordFileArray.push(absoluteNamePath);
    });
    plus.on('end', () => {
        let index = n+1;
        if(index < _readRecordFileArray.length)
            findRecordAssetsFile(index,callback);
        else{
            _allRecordFileArray = _readRecordFileArray.concat(_assetsRecordFileArray);
            _consoleLog('要操作的所有的相关的文件',_allRecordFileArray);
            if(callback)
                callback();
        }
    })
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
            console.log('---- 文件上传成功 '+n+' 个  ----');
            console.log('\n');
            setTimeout(function () {
                if(!item.match(/^\/\*\*.*(\*\*\/)?$/g)){
                    checkFileExists(item,function(exists,file) {
                        let reg = new RegExp(_rootPath);
                        let ossPath = file.replace(reg,'');
                        if(exists)
                            uploadSingleFile(_bucketName,file,ossPath,function(){
                                uploadFilesQueue(n)
                            });
                        else
                            deleteSingleFile(ossPath,function () {
                                uploadFilesQueue(n);
                            });
                    });
                }else{
                    uploadFilesQueue(n);
                }
            },1000);
        }else{
            if(!item.match(/^\/\*\*.*(\*\*\/)?$/g)){
                checkFileExists(item,function(exists,file) {
                    let reg = new RegExp(_rootPath);
                    let ossPath = file.replace(reg,'');
                    if(exists)
                        uploadSingleFile(_bucketName,file,ossPath,function(){
                            uploadFilesQueue(n)
                        });
                    else
                        deleteSingleFile(ossPath,function () {
                            uploadFilesQueue(n);
                        });
                });
            }else{
                uploadFilesQueue(n);
            }
        }

    }else{
        _consoleLog('提示','文件处理成功 '+n+' 个');
        cleanRecordFile(_recordFile);
        _filesArray = [];
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





