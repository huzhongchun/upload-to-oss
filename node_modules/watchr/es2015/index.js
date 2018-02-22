/* @flow */
/* eslint no-use-before-define:0 */
'use strict';

// Imports

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var pathUtil = require('path');
var scandir = require('scandirectory');
var fsUtil = require('safefs');
var ignorefs = require('ignorefs');
var extendr = require('extendr');
var eachr = require('eachr');

var _require = require('taskgroup'),
    TaskGroup = _require.TaskGroup;

var _require2 = require('events'),
    EventEmitter = _require2.EventEmitter;

/* ::
import type {Stats, FSWatcher} from 'fs'
type StateEnum = "pending" | "active" | "deleted" | "closed"
type MethodEnum = "watch" | "watchFile"
type ErrorCallback = (error: ?Error) => void
type StatCallback = (error: ?Error, stat?: Stats) => void
type WatchChildOpts = {
	fullPath: string,
	relativePath: string,
	stat?: Stats
}
type WatchSelfOpts = {
	errors?: Array<Error>,
	preferredMethods?: Array<MethodEnum>
}
type ListenerOpts = {
	method: MethodEnum,
	args: Array<any>
}
type ResetOpts = {
	reset?: boolean
}
type IgnoreOpts = {
	ignorePaths?: boolean,
	ignoreHiddenFiles?: boolean,
	ignoreCommonPatterns?: boolean,
	ignoreCustomPatterns?: RegExp
}
type WatcherOpts = IgnoreOpts & {
	stat?: Stats,
	interval?: number,
	persistent?: boolean,
	catchupDelay?: number,
	preferredMethods?: Array<MethodEnum>,
	followLinks?: boolean
}
type WatcherConfig = {
	stat: ?Stats,
	interval: number,
	persistent: boolean,
	catchupDelay: number,
	preferredMethods: Array<MethodEnum>,
	followLinks: boolean,
	ignorePaths: false | Array<string>,
	ignoreHiddenFiles: boolean,
	ignoreCommonPatterns: boolean,
	ignoreCustomPatterns: ?RegExp
}
*/

// Helper for error logging


function errorToString(error /* :Error */) {
	return error.stack.toString() || error.message || error.toString();
}

/**
Alias for creating a new {@link Stalker} with some basic configuration
@access public
@param {string} path - the path to watch
@param {function} changeListener - the change listener for {@link Watcher}
@param {function} next - the completion callback for {@link Watcher#watch}
@returns {Stalker}
*/
function open(path /* :string */, changeListener /* :function */, next /* :function */) {
	var stalker = new Stalker(path);
	stalker.on('change', changeListener);
	stalker.watch({}, next);
	return stalker;
}

/**
Alias for creating a new {@link Stalker}
@access public
@returns {Stalker}
*/
function create() /* :Array<any> */{
	for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
		args[_key] = arguments[_key];
	}

	return new (Function.prototype.bind.apply(Stalker, [null].concat(args)))();
}

/**
Stalker
A watcher of the watchers.
Events that are listened to on the stalker will also be listened to on the attached watcher.
When the watcher is closed, the stalker's listeners will be removed.
When all stalkers for a watcher are removed, the watcher will close.
@protected
@property {Object} watchers - static collection of all the watchers mapped by path
@property {Watcher} watcher - the associated watcher for this stalker
*/

var Stalker = function (_EventEmitter) {
	_inherits(Stalker, _EventEmitter);

	/* :: static watchers: {[key:string]: Watcher}; */
	/* :: watcher: Watcher; */

	/**
 @param {string} path - the path to watch
 */
	function Stalker(path /* :string */) {
		_classCallCheck(this, Stalker);

		// Ensure global watchers singleton
		var _this = _possibleConstructorReturn(this, (Stalker.__proto__ || Object.getPrototypeOf(Stalker)).call(this));

		if (Stalker.watchers == null) Stalker.watchers = {};

		// Add our watcher to the singleton
		if (Stalker.watchers[path] == null) Stalker.watchers[path] = new Watcher(path);
		_this.watcher = Stalker.watchers[path];

		// Add our stalker to the watcher
		if (_this.watcher.stalkers == null) _this.watcher.stalkers = [];
		_this.watcher.stalkers.push(_this);

		// If the watcher closes, remove our stalker and the watcher from the singleton
		_this.watcher.once('close', function () {
			_this.remove();
			delete Stalker.watchers[path];
		});

		// Add the listener proxies
		_this.on('newListener', function (eventName, listener) {
			return _this.watcher.on(eventName, listener);
		});
		_this.on('removeListener', function (eventName, listener) {
			return _this.watcher.removeListener(eventName, listener);
		});
		return _this;
	}

	/**
 Cleanly shutdown the stalker
 @private
 @returns {this}
 */


	_createClass(Stalker, [{
		key: 'remove',
		value: function remove() {
			var _this2 = this;

			// Remove our stalker from the watcher
			var index = this.watcher.stalkers.indexOf(this);
			if (index !== -1) {
				this.watcher.stalkers = this.watcher.stalkers.slice(0, index).concat(this.watcher.stalkers.slice(index + 1));
			}

			// Kill our stalker
			process.nextTick(function () {
				_this2.removeAllListeners();
			});

			// Chain
			return this;
		}

		/**
  Close the stalker, and if it is the last stalker for the path, close the watcher too
  @access public
  @param {string} [reason] - optional reason to provide for closure
  @returns {this}
  */

	}, {
		key: 'close',
		value: function close(reason /* :?string */) {
			// Remove our stalker
			this.remove();

			// If it was the last stalker for the watcher, or if the path is deleted
			// Then close the watcher
			if (reason === 'deleted' || this.watcher.stalkers.length === 0) {
				this.watcher.close(reason || 'all stalkers are now gone');
			}

			// Chain
			return this;
		}

		/**
  Alias for {@link Watcher#setConfig}
  @access public
  @returns {this}
  */

	}, {
		key: 'setConfig',
		value: function setConfig() /* :Array<any> */{
			var _watcher;

			(_watcher = this.watcher).setConfig.apply(_watcher, arguments);
			return this;
		}

		/**
  Alias for {@link Watcher#watch}
  @access public
  @returns {this}
  */

	}, {
		key: 'watch',
		value: function watch() /* :Array<any> */{
			var _watcher2;

			(_watcher2 = this.watcher).watch.apply(_watcher2, arguments);
			return this;
		}
	}]);

	return Stalker;
}(EventEmitter);

/**
Watcher
Watches a path and if its a directory, its children too, and emits change events for updates, deletions, and creations

Available events:

- `log(logLevel, ...args)` - emitted for debugging, child events are bubbled up
- `close(reason)` - the watcher has been closed, perhaps for a reason
- `change('update', fullPath, currentStat, previousStat)` - an update event has occured on the `fullPath`
- `change('delete', fullPath, currentStat)` - an delete event has occured on the `fullPath`
- `change('create', fullPath, null, previousStat)` - a create event has occured on the `fullPath`

@protected
@property {Array<Stalker>} stalkers - the associated stalkers for this watcher
@property {string} path - the path to be watched
@property {Stats} stat - the stat object for the path
@property {FSWatcher} fswatcher - if the `watch` method was used, this is the FSWatcher instance for it
@property {Object} children - a (relativePath => stalker) mapping of children
@property {string} state - the current state of this watcher
@property {TaskGroup} listenerTaskGroup - the TaskGroup instance for queuing listen events
@property {TimeoutID} listenerTimeout - the timeout result for queuing listen events
@property {Object} config - the configuration options
*/


var Watcher = function (_EventEmitter2) {
	_inherits(Watcher, _EventEmitter2);

	/* :: stalkers: Array<Stalker>; */

	/* :: path: string; */
	/* :: stat: null | Stats; */
	/* :: fswatcher: null | FSWatcher; */
	/* :: children: {[path:string]: Stalker}; */
	/* :: state: StateEnum; */
	/* :: listenerTaskGroup: null | TaskGroup; */
	/* :: listenerTimeout: null | TimeoutID; */
	/* :: config: WatcherConfig; */

	/**
 @param {string} path - the path to watch
 */
	function Watcher(path /* :string */) {
		_classCallCheck(this, Watcher);

		// Initialise properties
		var _this3 = _possibleConstructorReturn(this, (Watcher.__proto__ || Object.getPrototypeOf(Watcher)).call(this));
		// Construct the EventEmitter


		_this3.path = path;
		_this3.stat = null;
		_this3.fswatcher = null;
		_this3.children = {};
		_this3.state = 'pending';
		_this3.listenerTaskGroup = null;
		_this3.listenerTimeout = null;

		// Initialize our configurable properties
		_this3.config = {
			stat: null,
			interval: 5007,
			persistent: true,
			catchupDelay: 2000,
			preferredMethods: ['watch', 'watchFile'],
			followLinks: true,
			ignorePaths: false,
			ignoreHiddenFiles: false,
			ignoreCommonPatterns: true,
			ignoreCustomPatterns: null
		};
		return _this3;
	}

	/**
 Configure out Watcher
 @param {Object} opts - the configuration to use
 @param {Stats} [opts.stat] - A stat object for the path if we already have one, otherwise it will be fetched for us
 @param {number} [opts.interval=5007] - If the `watchFile` method was used, this is the interval to use for change detection if polling is needed
 @param {boolean} [opts.persistent=true] - If the `watchFile` method was used, this is whether or not watching should keep the node process alive while active
 @param {number} [opts.catchupDelay=2000] - This is the delay to wait after a change event to be able to detect swap file changes accurately (without a delay, swap files trigger a delete and creation event, with a delay they trigger a single update event)
 @param {Array<string>} [opts.preferredMethods=['watch', 'watchFile']] - The order of watch methods to attempt, if the first fails, move onto the second
 @param {boolean} [opts.followLinks=true] - If true, will use `fs.stat` instead of `fs.lstat`
 @param {Array<string>} [opts.ignorePaths=false] - Array of paths that should be ignored
 @param {boolean} [opts.ignoreHiddenFiles=false] - Whether to ignore files and directories that begin with a `.`
 @param {boolean} [opts.ignoreCommonPatterns=false] - Whether to ignore common undesirable paths (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
 @param {RegExp} [opts.ignoreCustomPatterns] - A regular expression that if matched again the path will ignore the path
 @returns {this}
 */


	_createClass(Watcher, [{
		key: 'setConfig',
		value: function setConfig(opts /* :WatcherOpts */) {
			// Apply
			extendr.extend(this.config, opts);

			// Stat
			if (this.config.stat) {
				this.stat = this.config.stat;
				delete this.config.stat;
			}

			// Chain
			return this;
		}

		/**
  Emit a log event with the given arguments
  @param {Array<*>} args
  @returns {this}
  */

	}, {
		key: 'log',
		value: function log() /* :Array<any> */{
			for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
				args[_key2] = arguments[_key2];
			}

			// Emit the log event
			this.emit.apply(this, ['log'].concat(args));

			// Chain
			return this;
		}

		/**
  Fetch the ignored configuration options into their own object
  @private
  @returns {Object}
  */

	}, {
		key: 'getIgnoredOptions',
		value: function getIgnoredOptions() {
			// Return the ignore options
			return {
				ignorePaths: this.config.ignorePaths,
				ignoreHiddenFiles: this.config.ignoreHiddenFiles,
				ignoreCommonPatterns: this.config.ignoreCommonPatterns,
				ignoreCustomPatterns: this.config.ignoreCustomPatterns
			};
		}

		/**
  Check whether or not a path should be ignored or not based on our current configuration options
  @private
  @param {String} path - the path (likely of a child)
  @returns {boolean}
  */

	}, {
		key: 'isIgnoredPath',
		value: function isIgnoredPath(path /* :string */) {
			// Ignore?
			var ignore = ignorefs.isIgnoredPath(path, this.getIgnoredOptions());

			// Return
			return ignore;
		}

		/**
  Get the stat for the path of the watcher
  If the stat already exists and `opts.reset` is `false`, then just use the current stat, otherwise fetch a new stat and apply it to the watcher
  @param {Object} opts
  @param {boolean} [opts.reset=false]
  @param  {function} next - completion callback with signature `error:?Error, stat?:Stats`
  @returns {this}
  */

	}, {
		key: 'getStat',
		value: function getStat(opts /* :ResetOpts */, next /* :StatCallback */) {
			var _this4 = this;

			// Figure out what stat method we want to use
			var method = this.config.followLinks ? 'stat' : 'lstat';

			// Fetch
			if (this.stat && opts.reset !== true) {
				next(null, this.stat);
			} else {
				fsUtil[method](this.path, function (err, stat) {
					if (err) return next(err);
					_this4.stat = stat;
					return next(null, stat);
				});
			}

			// Chain
			return this;
		}

		/**
  Watch and WatchFile Listener
  The listener attached to the `watch` and `watchFile` watching methods.
  	Things to note:
  - `watchFile` method:
  	- Arguments:
  		- currentStat - the updated stat of the changed file
  			- Exists even for deleted/renamed files
  		- previousStat - the last old stat of the changed file
  			- Is accurate, however we already have this
  	- For renamed files, it will will fire on the directory and the file
  - `watch` method:
  	- Arguments:
  		- eventName - either 'rename' or 'change'
  			- THIS VALUE IS ALWAYS UNRELIABLE AND CANNOT BE TRUSTED
  		- filename - child path of the file that was triggered
  			- This value can also be unrealiable at times
  - both methods:
  	- For deleted and changed files, it will fire on the file
  	- For new files, it will fire on the directory
  	Output arguments for your emitted event will be:
  - for updated files the arguments will be: `'update', fullPath, currentStat, previousStat`
  - for created files the arguments will be: `'create', fullPath, currentStat, null`
  - for deleted files the arguments will be: `'delete', fullPath, null, previousStat`
  	In the future we will add:
  - for renamed files: 'rename', fullPath, currentStat, previousStat, newFullPath
  - rename is possible as the stat.ino is the same for the delete and create
  	@private
  @param {Object} opts
  @param {string} [opts.method] - the watch method that was used
  @param {Array<*>} [opts.args] - the arguments from the watching method
  @param {function} [next] - the optional completion callback with the signature `(error:?Error)`
  @returns {this}
  */

	}, {
		key: 'listener',
		value: function listener(opts /* :ListenerOpts */, next /* ::?:ErrorCallback */) {
			var _this5 = this;

			// Prepare
			var config = this.config;
			var method = opts.method;
			if (!next) {
				next = function next(err) {
					if (err) {
						_this5.emit('error', err);
					}
				};
			}

			// Prepare properties
			var currentStat = null;
			var previousStat = null;

			// Log
			this.log('debug', 'watch via ' + method + ' method fired on: ' + this.path);

			// Delay the execution of the listener tasks, to once the change events have stopped firing
			if (this.listenerTimeout != null) {
				clearTimeout(this.listenerTimeout);
			}
			this.listenerTimeout = setTimeout(function () {
				var tasks = _this5.listenerTaskGroup;
				if (tasks) {
					_this5.listenerTaskGroup = null;
					_this5.listenerTimeout = null;
					tasks.run();
				} else {
					_this5.emit('error', new Error('unexpected state'));
				}
			}, config.catchupDelay || 0);

			// We are a subsequent listener, in which case, just listen to the first listener tasks
			if (this.listenerTaskGroup != null) {
				this.listenerTaskGroup.done(next);
				return this;
			}

			// Start the detection process
			var tasks = this.listenerTaskGroup = new TaskGroup('listener tasks for ' + this.path, { domain: false }).done(next);
			tasks.addTask('check if the file still exists', function (complete) {
				// Log
				_this5.log('debug', 'watch evaluating on: ' + _this5.path + ' [state: ' + _this5.state + ']');

				// Check if this is still needed
				if (_this5.state !== 'active') {
					_this5.log('debug', 'watch discarded on: ' + _this5.path);
					tasks.clearRemaining();
					return complete();
				}

				// Check if the file still exists
				fsUtil.exists(_this5.path, function (exists) {
					// Apply local global property
					previousStat = _this5.stat;

					// If the file still exists, then update the stat
					if (exists === false) {
						// Log
						_this5.log('debug', 'watch emit delete: ' + _this5.path);

						// Apply
						_this5.stat = null;
						_this5.close('deleted');
						_this5.emit('change', 'delete', _this5.path, null, previousStat);

						// Clear the remaining tasks, as they are no longer needed
						tasks.clearRemaining();
						return complete();
					}

					// Update the stat of the fil
					_this5.getStat({ reset: true }, function (err, stat) {
						// Check
						if (err) return complete(err);

						// Update
						currentStat = stat;

						// Complete
						return complete();
					});
				});
			});

			tasks.addTask('check if the file has changed', function (complete) {
				// Ensure stats exist
				if (!currentStat || !previousStat) {
					return complete(new Error('unexpected state'));
				}

				// Check if there is a different file at the same location
				// If so, we will need to rewatch the location and the children
				if (currentStat.ino.toString() !== previousStat.ino.toString()) {
					_this5.log('debug', 'watch found replaced: ' + _this5.path, currentStat, previousStat);
					// note this will close the entire tree of listeners and reinstate them
					// however, as this is probably for a file, it is probably not that bad
					return _this5.watch({ reset: true }, complete);
				}

				// Check if the file or directory has been modified
				if (currentStat.mtime.toString() !== previousStat.mtime.toString()) {
					_this5.log('debug', 'watch found modification: ' + _this5.path, previousStat, currentStat);
					return complete();
				}

				// Otherwise it is the same, and nothing is needed to be done
				else {
						tasks.clearRemaining();
						return complete();
					}
			});

			tasks.addGroup('check what has changed', function (addGroup, addTask, done) {
				// Ensure stats exist
				if (!currentStat || !previousStat) {
					return done(new Error('unexpected state'));
				}

				// Set this sub group to execute in parallel
				_this5.setConfig({ concurrency: 0 });

				// So let's check if we are a directory
				if (currentStat.isDirectory() === false) {
					// If we are a file, lets simply emit the change event
					_this5.log('debug', 'watch emit update: ' + _this5.path);
					_this5.emit('change', 'update', _this5.path, currentStat, previousStat);
					return done();
				}

				// We are a direcotry
				// Chances are something actually happened to a child (rename or delete)
				// and if we are the same, then we should scan our children to look for renames and deletes
				fsUtil.readdir(_this5.path, function (err, newFileRelativePaths) {
					// Error?
					if (err) return done(err);

					// Log
					_this5.log('debug', 'watch read dir: ' + _this5.path, newFileRelativePaths);

					// Find deleted files
					eachr(_this5.children, function (child, childFileRelativePath) {
						// Skip if the file still exists
						if (newFileRelativePaths.indexOf(childFileRelativePath) !== -1) return;

						// Fetch full path
						var childFileFullPath = pathUtil.join(_this5.path, childFileRelativePath);

						// Skip if ignored file
						if (_this5.isIgnoredPath(childFileFullPath)) {
							_this5.log('debug', 'watch ignored delete: ' + childFileFullPath + ' via: ' + _this5.path);
							return;
						}

						// Emit the event and note the change
						_this5.log('debug', 'watch emit delete: ' + childFileFullPath + ' via: ' + _this5.path);
						var childPreviousStat = child.watcher.stat;
						child.close('deleted');
						_this5.emit('change', 'delete', childFileFullPath, null, childPreviousStat);
					});

					// Find new files
					eachr(newFileRelativePaths, function (childFileRelativePath) {
						// Skip if we are already watching this file
						if (_this5.children[childFileRelativePath] != null) return;

						// Fetch full path
						var childFileFullPath = pathUtil.join(_this5.path, childFileRelativePath);

						// Skip if ignored file
						if (_this5.isIgnoredPath(childFileFullPath)) {
							_this5.log('debug', 'watch ignored create: ' + childFileFullPath + ' via: ' + _this5.path);
							return;
						}

						// Emit the event and note the change
						addTask('watch the new child', function (complete) {
							_this5.log('debug', 'watch determined create: ' + childFileFullPath + ' via: ' + _this5.path);
							if (_this5.children[childFileRelativePath] != null) {
								return complete(); // this should never occur
							}
							var child = _this5.watchChild({
								fullPath: childFileFullPath,
								relativePath: childFileRelativePath
							}, function (err) {
								if (err) return complete(err);
								_this5.emit('change', 'create', childFileFullPath, child.watcher.stat, null);
								return complete();
							});
						});
					});

					// Read the directory, finished adding tasks to the group
					return done();
				});
			});

			// Tasks are executed via the timeout thing earlier

			// Chain
			return this;
		}

		/**
  Close the watching abilities of this watcher and its children if it has any
  And mark the state as deleted or closed, dependning on the reason
  @param {string} [reason='unknown']
  @returns {this}
  */

	}, {
		key: 'close',
		value: function close() {
			var reason /* :string */ = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'unknown';

			// Nothing to do? Already closed?
			if (this.state !== 'active') return this;

			// Close
			this.log('debug', 'close: ' + this.path);

			// Close our children
			eachr(this.children, function (child) {
				child.close(reason);
			});

			// Close watch listener
			if (this.fswatcher != null) {
				this.fswatcher.close();
				this.fswatcher = null;
			} else {
				fsUtil.unwatchFile(this.path);
			}

			// Updated state
			if (reason === 'deleted') {
				this.state = 'deleted';
			} else {
				this.state = 'closed';
			}

			// Emit our close event
			this.log('debug', 'watch closed because ' + reason + ' on ' + this.path);
			this.emit('close', reason);

			// Chain
			return this;
		}

		/**
  Create the child watcher/stalker for a given sub path of this watcher with inherited configuration
  Once created, attach it to `this.children` and bubble `log` and `change` events
  If the child closes, then delete it from `this.children`
  @private
  @param {Object} opts
  @param {string} opts.fullPath
  @param {string} opts.relativePath
  @param {Stats} [opts.stat]
  @param {function} next - completion callback with signature `error:?Error`
  @returns {this}
  */

	}, {
		key: 'watchChild',
		value: function watchChild(opts /* :WatchChildOpts */, next /* :ErrorCallback */) /* :Stalker */{
			// Prepare
			var watchr = this;

			// Create the child
			var child = create(opts.fullPath);

			// Apply the child
			this.children[opts.relativePath] = child;

			// Add the extra listaeners
			child.once('close', function () {
				return delete watchr.children[opts.relativePath];
			});
			child.on('log', function () {
				for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
					args[_key3] = arguments[_key3];
				}

				return watchr.emit.apply(watchr, ['log'].concat(args));
			});
			child.on('change', function () {
				for (var _len4 = arguments.length, args = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
					args[_key4] = arguments[_key4];
				}

				return watchr.emit.apply(watchr, ['change'].concat(args));
			});

			// Add the extra configuration
			child.setConfig({
				// Custom
				stat: opts.stat,

				// Inherit
				interval: this.config.interval,
				persistent: this.config.persistent,
				catchupDelay: this.config.catchupDelay,
				preferredMethods: this.config.preferredMethods,
				ignorePaths: this.config.ignorePaths,
				ignoreHiddenFiles: this.config.ignoreHiddenFiles,
				ignoreCommonPatterns: this.config.ignoreCommonPatterns,
				ignoreCustomPatterns: this.config.ignoreCustomPatterns,
				followLinks: this.config.followLinks
			});

			// Start the watching
			child.watch(next);

			// Return the child
			return child;
		}

		/**
  Read the directory at our given path and watch each child
  @private
  @param {Object} opts - not currently used
  @param {function} next - completion callback with signature `error:?Error`
  @returns {this}
  */

	}, {
		key: 'watchChildren',
		value: function watchChildren(opts /* :Object */, _next /* :ErrorCallback */) {
			// Prepare
			var watchr = this;

			// Check stat
			if (this.stat == null) {
				_next(new Error('unexpected state'));
				return this;
			}

			// Cycle through the directory if necessary
			var path = this.path;
			if (this.stat.isDirectory()) {
				scandir({
					// Path
					path: path,

					// Options
					ignorePaths: this.config.ignorePaths,
					ignoreHiddenFiles: this.config.ignoreHiddenFiles,
					ignoreCommonPatterns: this.config.ignoreCommonPatterns,
					ignoreCustomPatterns: this.config.ignoreCustomPatterns,
					recurse: false,

					// Next
					next: function next(err, list) {
						if (err) return _next(err);
						var tasks = new TaskGroup('scandir tasks for ' + path, { domain: false, concurrency: 0 }).done(_next);
						Object.keys(list).forEach(function (relativePath) {
							tasks.addTask(function (complete) {
								var fullPath = pathUtil.join(path, relativePath);
								// Check we are still relevant
								if (watchr.state !== 'active') return complete();
								// Watch this child
								watchr.watchChild({ fullPath: fullPath, relativePath: relativePath }, complete);
							});
						});
						tasks.run();
					}
				});
			} else {
				_next();
			}

			// Chain
			return this;
		}

		/**
  Setup the watching using the specified method
  @private
  @param {string} method
  @param {function} next - completion callback with signature `error:?Error`
  @returns {void}
  */

	}, {
		key: 'watchMethod',
		value: function watchMethod(method /* :MethodEnum */, next /* :ErrorCallback */) /* :void */{
			var _this6 = this;

			if (method === 'watch') {
				// Check
				if (fsUtil.watch == null) {
					var err = new Error('watch method is not supported on this environment, fs.watch does not exist');
					next(err);
					return;
				}

				// Watch
				try {
					this.fswatcher = fsUtil.watch(this.path, function () {
						for (var _len5 = arguments.length, args = Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
							args[_key5] = arguments[_key5];
						}

						return _this6.listener({ method: method, args: args });
					});
					// must pass the listener here instead of doing fswatcher.on('change', opts.listener)
					// as the latter is not supported on node 0.6 (only 0.8+)
				} catch (err) {
					next(err);
					return;
				}

				// Success
				next();
				return;
			} else if (method === 'watchFile') {
				// Check
				if (fsUtil.watchFile == null) {
					var _err = new Error('watchFile method is not supported on this environment, fs.watchFile does not exist');
					next(_err);
					return;
				}

				// Watch
				try {
					fsUtil.watchFile(this.path, {
						persistent: this.config.persistent,
						interval: this.config.interval
					}, function () {
						for (var _len6 = arguments.length, args = Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
							args[_key6] = arguments[_key6];
						}

						return _this6.listener({ method: method, args: args });
					});
				} catch (err) {
					next(err);
					return;
				}

				// Success
				next();
				return;
			} else {
				var _err2 = new Error('unknown watch method');
				next(_err2);
				return;
			}
		}

		/**
  Setup watching for our path, in the order of the preferred methods
  @private
  @param {Object} opts
  @param {Array<Error>} [opts.errors] - the current errors that we have received attempting the preferred methods
  @param {Array<string>} [opts.preferredMethods] - fallback to the configuration if not specified
  @param {function} next - completion callback with signature `error:?Error`
  @returns {this}
  */

	}, {
		key: 'watchSelf',
		value: function watchSelf(opts /* :WatchSelfOpts */, next /* :ErrorCallback */) {
			var _this7 = this;

			// Prepare
			var _opts$errors = opts.errors,
			    errors = _opts$errors === undefined ? [] : _opts$errors;
			var _opts$preferredMethod = opts.preferredMethods,
			    preferredMethods = _opts$preferredMethod === undefined ? this.config.preferredMethods : _opts$preferredMethod;

			opts.errors = errors;
			opts.preferredMethods = preferredMethods;

			// Attempt the watch methods
			if (preferredMethods.length) {
				var method = preferredMethods[0];
				this.watchMethod(method, function (err) {
					if (err) {
						// try again with the next preferred method
						preferredMethods = preferredMethods.slice(1);
						errors.push(err);
						_this7.watchSelf({ errors: errors, preferredMethods: preferredMethods }, next);
						return;
					}

					// Apply
					_this7.state = 'active';

					// Forward
					next();
				});
			} else {
				var _errors = opts.errors.map(function (error) {
					return error.stack || error.message || error;
				}).join('\n');
				var err = new Error('no watch methods left to try, failures are:\n' + _errors);
				next(err);
			}

			// Chain
			return this;
		}

		/**
  Setup watching for our path, and our children
  If we are already watching and `opts.reset` is not `true` then all done
  Otherwise, close the current watchers for us and the children via {@link Watcher#close} and setup new ones
  @public
  @param {Object} [opts]
  @param {boolean} [opts.reset=false] - should we always close existing watchers and setup new watchers
  @param {function} next - completion callback with signature `error:?Error`
  @param {Array<*>} args - ignore this argument, it is used just to handle the optional `opts` argument
  @returns {this}
  */

	}, {
		key: 'watch',
		value: function watch() /* :Array<any> */{
			var _this8 = this;

			// Handle overloaded signature
			var opts = void 0 /* :ResetOpts */,
			    next = void 0; /* :ErrorCallback */
			if (arguments.length === 1) {
				opts = {};
				next = arguments.length <= 0 ? undefined : arguments[0];
			} else if (arguments.length === 2) {
				opts = arguments.length <= 0 ? undefined : arguments[0];
				next = arguments.length <= 1 ? undefined : arguments[1];
			} else {
				throw new Error('unknown arguments');
			}

			// Check
			if (this.state === 'active' && opts.reset !== true) {
				next();
				return this;
			}

			// Close our all watch listeners
			this.close();

			// Log
			this.log('debug', 'watch init: ' + this.path);

			// Fetch the stat then try again
			this.getStat({}, function (err) {
				if (err) return next(err);

				// Watch ourself
				_this8.watchSelf({}, function (err) {
					if (err) return next(err);

					// Watch the children
					_this8.watchChildren({}, function (err) {
						if (err) {
							_this8.close('child failure');
							_this8.log('debug', 'watch failed on [' + _this8.path + '] with ' + errorToString(err));
						} else {
							_this8.log('debug', 'watch success on [' + _this8.path + ']');
						}
						return next(err);
					});
				});
			});

			// Chain
			return this;
		}
	}]);

	return Watcher;
}(EventEmitter);

// Now let's provide node.js with our public API
// In other words, what the application that calls us has access to


module.exports = { open: open, create: create, Stalker: Stalker, Watcher: Watcher };