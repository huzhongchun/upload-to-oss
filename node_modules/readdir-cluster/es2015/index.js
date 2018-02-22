'use strict';

// Import
var pathUtil = require('path');

// Export
module.exports = function (directory, iterator, next) {
	// Prepare
	var cpus = require('os').cpus().length;
	var workers = [];
	var callbacks = {
		stat: {},
		readdir: {}
	};
	var _cursor = 0;
	function nextworker() {
		if (++_cursor === cpus) {
			_cursor = 0;
		}
		return workers[_cursor];
	}

	// Workers
	// function handleError (err) {
	// 	// console.log('MASTER', 'error from', process.pid, err)
	// }
	function handleMessage(message) {
		// console.log('master', 'message from', process.pid, message)
		callbacks[message.action][message.path](message.error, message.data);
	}
	function openWorkers() {
		var cluster = require('cluster');
		cluster.setupMaster({
			exec: pathUtil.join(__dirname, 'worker.js')
		});
		for (var i = 0; i < cpus; i++) {
			var worker = cluster.fork();
			workers.push(worker);
			// worker.on('error', handleError)
			worker.on('message', handleMessage);
		}
	}
	function closeWorkers() {
		workers.forEach(function (worker) {
			return worker.disconnect();
		});
	}

	// Actions
	function stat(file) {
		return new Promise(function (resolve, reject) {
			callbacks.stat[file] = function (err, data) {
				if (err) return reject(err);
				return resolve(data);
			};
			nextworker().send({ action: 'stat', path: file });
		});
	}
	function readdir(directory) {
		return new Promise(function (resolve, reject) {
			callbacks.readdir[directory] = function (err, files) {
				if (err) return reject(err);
				Promise.all(files.map(function (file) {
					var path = pathUtil.join(directory, file);
					return stat(path).then(function (stat) {
						if (iterator(path, file, stat) !== false && stat.directory) {
							return readdir(path);
						}
					});
				})).then(resolve).catch(reject);
			};
			nextworker().send({ action: 'readdir', path: directory });
		});
	}

	// Start
	openWorkers();
	readdir(directory).then(function () {
		// console.log('MASTER passed')
		closeWorkers();
		next();
	}).catch(function (err) {
		// console.log('MASTER failed', err)
		closeWorkers();
		next(err);
	});
};