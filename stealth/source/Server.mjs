
import net from 'net';

import { console, Emitter, isFunction, isString } from '../extern/base.mjs';
import { ENVIRONMENT                            } from './ENVIRONMENT.mjs';
import { isStealth                              } from './Stealth.mjs';
import { Request                                } from './Request.mjs';
import { IP                                     } from './parser/IP.mjs';
import { URL                                    } from './parser/URL.mjs';
import { DNS                                    } from './protocol/DNS.mjs';
import { HTTP                                   } from './protocol/HTTP.mjs';
import { SOCKS                                  } from './protocol/SOCKS.mjs';
import { WS                                     } from './protocol/WS.mjs';
import { REDIRECT                               } from './other/REDIRECT.mjs';
import { ROUTER                                 } from './other/ROUTER.mjs';
import { Beacon                                 } from './server/Beacon.mjs';
import { Blocker                                } from './server/Blocker.mjs';
import { Cache                                  } from './server/Cache.mjs';
import { Host                                   } from './server/Host.mjs';
import { Mode                                   } from './server/Mode.mjs';
import { Peer                                   } from './server/Peer.mjs';
import { Redirect                               } from './server/Redirect.mjs';
import { Session                                } from './server/Session.mjs';
import { Settings                               } from './server/Settings.mjs';
import { Stash                                  } from './server/Stash.mjs';



export const isServer = function(obj) {
	return Object.prototype.toString.call(obj) === '[object Server]';
};

const upgrade_http = function(socket, ref) {

	let connection = HTTP.upgrade(socket, ref);
	if (connection !== null) {

		connection.once('@connect', () => {

			if (this.connections.includes(connection) === false) {
				this.connections.push(connection);
			}

		});

		connection.once('@disconnect', () => {

			let index = this.connections.indexOf(connection);
			if (index !== -1) {
				this.connections.splice(index, 1);
			}

		});


		let url   = (ref.headers['@url'] || '');
		let flags = [];
		let tab   = null;

		if (url.startsWith('https://') || url.startsWith('http://')) {

			flags.push('proxy');

		} else if (url.startsWith('/stealth/')) {

			if (url.startsWith('/stealth/:')) {

				let tmp = url.substr(9).split('/').shift();
				if (tmp.startsWith(':') && tmp.endsWith(':')) {

					tmp = tmp.substr(1, tmp.length - 2);

					if (tmp.includes(',')) {
						tab   = tmp.split(',').shift();
						flags = tmp.split(',').slice(1);
						url   = url.substr(9).split('/').slice(1).join('/');
					} else {

						let num = parseInt(tmp, 10);
						if (Number.isNaN(num) === false) {
							tab = tmp;
							url = url.substr(9).split('/').slice(1).join('/');
						} else {
							flags.push(tmp);
							url = url.substr(9).split('/').slice(1).join('/');
						}

					}

				}

			} else if (url.startsWith('/stealth/')) {
				url = url.substr(9);
			}

		}


		let session = null;
		let request = null;

		if (this.stealth !== null) {

			session = this.stealth.track(null, ref.headers);
			request = this.stealth.open(url);

		} else {

			request = new Request({
				url:    url,
				config: {
					mode: {
						text:  true,
						image: true,
						audio: true,
						video: true,
						other: true
					}
				}
			}, this);

		}


		if (request !== null) {

			request.on('error', (err) => {

				let type = err.type || null;
				if (type !== null) {

					ROUTER.error({
						headers: ref.headers   || {},
						url:     url           || null,
						err:     err           || null,
						flags:   request.flags || {}
					}, (response) => {
						HTTP.send(connection, response);
					});

				} else {

					ROUTER.error({
						err: err
					}, (response) => {
						HTTP.send(connection, response);
					});

				}

				request.stop();

			});

			request.on('redirect', (response) => {

				let url = response.headers['location'] || '';

				if (request.flags.webview === true) {

					let path = '/stealth/' + url;
					if (tab !== null) {
						path = '/stealth/:' + tab + ',webview:/' + url;
					}

					REDIRECT.send({
						code: 301,
						path: path
					}, (response) => {
						HTTP.send(connection, response);
					});

				} else {

					let path = '/stealth/' + url;
					if (tab !== null) {
						path = '/stealth/:' + tab + ':/' + url;
					}

					REDIRECT.send({
						code: 301,
						path: path
					}, (response) => {
						HTTP.send(connection, response);
					});

				}

				request.stop();

			});

			request.on('response', (response) => {

				// TODO: Replace URLs inside HTML and CSS with "/stealth/tab:" prefix

				if (response !== null && response.payload !== null) {

					// Strip out all unnecessary HTTP headers
					response.headers = {
						'content-length': response.headers['content-length'],
						'content-type':   response.headers['content-type']
					};

					HTTP.send(connection, response);

				} else {

					ROUTER.error({
						err: {
							code: 404
						}
					}, (response) => {
						HTTP.send(connection, response);
					});

				}

				request.stop();

			});

			if (flags.includes('proxy')) {
				request.set('proxy', true);
			}

			if (flags.includes('refresh')) {
				request.set('refresh', true);
			}

			if (flags.includes('webview')) {
				request.set('webview', true);
			}

			if (session !== null) {
				session.track(request, tab);
			}

			request.start();

		} else {

			ROUTER.error({
				err: {
					code: 404
				}
			}, (response) => {
				HTTP.send(connection, response);
			});

		}

	} else {

		socket.end();

	}

};

const upgrade_socks = function(socket, ref) {

	let connection = SOCKS.upgrade(socket, ref);
	if (connection !== null) {

		connection.once('@connect', () => {

			if (this.connections.includes(connection) === false) {
				this.connections.push(connection);
			}

		});

		connection.once('@disconnect', () => {

			let index = this.connections.indexOf(connection);
			if (index !== -1) {
				this.connections.splice(index, 1);
			}

		});

		connection.once('@connect-tunnel', (request, callback) => {

			let domain = null;
			let host   = null;

			let ref = request.payload;
			if (ref.domain !== null) {

				if (ref.subdomain !== null) {
					domain = ref.subdomain + '.' + ref.domain;
				} else {
					domain = ref.domain;
				}

			} else if (ref.host !== null) {
				host = ref.host;
			}


			if (domain !== null) {

				this.services.blocker.read(ref, (response) => {

					if (response.payload === null) {

						DNS.resolve(ref, (response) => {

							if (response.payload !== null) {

								ref.hosts = response.payload.hosts;


								let socket = null;

								try {
									socket = net.connect({
										host: ref.hosts[0].ip,
										port: ref.port
									}, () => {

										let reply = null;
										if (ref.hosts[0].type === 'v4') {
											reply = ref.hosts[0].ip + ':' + ref.port;
										} else if (ref.hosts[0].type === 'v6') {
											reply = '[' + ref.hosts[0].ip + ']:' + ref.port;
										}

										callback('success', URL.parse(reply), socket);

									});
								} catch (err) {
									socket = null;
								}

								if (socket === null) {
									callback('error-connection', null);
								}

							} else {
								callback('error-host', null);
							}

						});

					} else {
						callback('error-blocked', null);
					}

				});

			} else if (host !== null) {

				this.services.blocker.read(ref, (response) => {

					if (response.payload === null) {

						let socket = null;

						try {
							socket = net.connect({
								host: ref.hosts[0].ip,
								port: ref.port
							}, () => {

								let reply = null;
								if (ref.hosts[0].type === 'v4') {
									reply = ref.hosts[0].ip + ':' + ref.port;
								} else if (ref.hosts[0].type === 'v6') {
									reply = '[' + ref.hosts[0].ip + ']:' + ref.port;
								}

								callback('success', URL.parse(reply), socket);

							});
						} catch (err) {
							socket = null;
						}

						if (socket === null) {
							callback('error-connection', null);
						}

					} else {
						callback('error-blocked', null);
					}

				});

			} else {
				callback('error', null);
			}

		});

	} else {

		socket.end();

	}

};

const upgrade_ws = function(socket, ref) {

	let connection = WS.upgrade(socket, ref);
	if (connection !== null) {

		connection.once('@connect', () => {

			if (this.stealth !== null) {
				connection.session = this.stealth.track(null, ref.headers);
			}

			if (this.connections.includes(connection) === false) {
				this.connections.push(connection);
			}

		});

		connection.once('@disconnect', () => {

			let index = this.connections.indexOf(connection);
			if (index !== -1) {
				this.connections.splice(index, 1);
			}

			if (this.stealth !== null) {
				this.stealth.untrack(connection.session);
				connection.session = null;
			}

		});

		connection.on('error', () => {

			if (this.stealth !== null) {
				this.stealth.untrack(connection.session);
				connection.session = null;
			}

		});

		connection.on('timeout', () => {

			if (this.stealth !== null) {
				this.stealth.untrack(connection.session);
				connection.session = null;
			}

		});

		connection.on('request', (request) => {

			let event   = request.headers.event   || null;
			let method  = request.headers.method  || null;
			let service = request.headers.service || null;

			if (service !== null && event !== null) {

				let instance = this.services[service] || null;
				if (instance !== null && instance.has(event) === true) {

					let response = instance.emit(event, [ request.payload, connection.session ]);
					if (response !== null) {
						WS.send(connection, response);
					}

					if (response !== null && response._warn_ === true) {

						let session = connection.session || null;
						if (session !== null) {
							session.warn(service, method, null);
						}

					}

				}

			} else if (service !== null && method !== null) {

				let instance = this.services[service] || null;
				if (instance !== null && isFunction(instance[method]) === true) {

					instance[method](request.payload, (response) => {

						if (response !== null) {
							WS.send(connection, response);
						}

						if (response !== null && response._warn_ === true) {

							let session = connection.session || null;
							if (session !== null) {
								session.warn(service, method, null);
							}

						}

					}, connection.session);

				}

			}

		});

	} else {

		socket.end();

	}

};



const Server = function(settings, stealth) {

	stealth = isStealth(stealth) ? stealth : null;


	this._settings = Object.freeze(Object.assign({
		host: null
	}, settings));


	this.connections = [];
	this.services    = {};
	this.stealth     = stealth;

	this.__state = {
		connected: false,
		server:    null
	};


	if (this.stealth !== null) {

		this.services['beacon']   = new Beacon(this.stealth);
		this.services['blocker']  = new Blocker(this.stealth);
		this.services['cache']    = new Cache(this.stealth);
		this.services['host']     = new Host(this.stealth);
		this.services['mode']     = new Mode(this.stealth);
		this.services['peer']     = new Peer(this.stealth);
		this.services['redirect'] = new Redirect(this.stealth);
		this.services['session']  = new Session(this.stealth);
		this.services['settings'] = new Settings(this.stealth);
		this.services['stash']    = new Stash(this.stealth);

	}


	Emitter.call(this);

};


Server.isServer = isServer;


Server.prototype = Object.assign({}, Emitter.prototype, {

	[Symbol.toStringTag]: 'Server',

	connect: function() {

		if (this.__state.connected === false) {

			this.__state.server = new net.Server({
				allowHalfOpen:  true,
				pauseOnConnect: true
			});

			this.__state.server.on('connection', (socket) => {

				socket.once('data', (data) => {

					if (data[0] === 0x05) {

						SOCKS.receive(null, data, (request) => {

							if (this.stealth !== null) {
								request.headers['@debug'] = this.stealth._settings.debug;
							}

							upgrade_socks.call(this, socket, request);

						});

					} else if (data.indexOf('\r\n') !== -1) {

						HTTP.receive(null, data, (request) => {

							if (this.stealth !== null) {
								request.headers['@debug'] = this.stealth._settings.debug;
							}

							request.headers['@local']  = socket.localAddress  || null;
							request.headers['@remote'] = socket.remoteAddress || null;


							let url  = (request.headers['@url'] || '');
							let tmp1 = (request.headers['connection'] || '').toLowerCase();
							let tmp2 = (request.headers['upgrade'] || '').toLowerCase();

							if (tmp1.includes('upgrade') && tmp2.includes('websocket')) {

								upgrade_ws.call(this, socket, request);

							} else if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/stealth')) {

								upgrade_http.call(this, socket, request);

							} else {

								ROUTER.send(request, (response) => {

									let connection = HTTP.upgrade(socket);
									if (connection !== null) {
										HTTP.send(connection, response);
									} else {
										socket.end();
									}

								});

							}

						});

					} else {

						socket.end();

					}

				});

				socket.on('error',   () => socket.end());
				socket.on('close',   () => {});
				socket.on('timeout', () => socket.end());

				socket.resume();

			});

			this.__state.server.on('error', (err) => {

				if (err.code === 'EADDRINUSE') {
					console.error('Server: Another Server is already running!');
				}

				this.disconnect();

			});

			this.__state.server.on('close', () => {

				console.warn('Server: Service stopped.');

				this.disconnect();

			});


			let host = isString(this._settings.host) ? this._settings.host : 'localhost';
			if (host !== 'localhost') {

				console.info('');
				console.info('Server: Service started on http+socks+ws://' + host + ':65432.');
				console.info('Server: > http://' + host + ':65432.');
				console.info('');

				this.__state.connected = true;
				this.emit('connect');

				this.__state.server.listen(65432, host);

			} else {

				console.info('');
				console.info('Server: Service started on http+socks+ws://localhost:65432.');

				if (ENVIRONMENT.ips.length > 0) {

					ENVIRONMENT.ips.forEach((ip) => {

						let hostname = null;

						if (ip.type === 'v4') {
							hostname = IP.render(ip);
						} else if (ip.type === 'v6') {
							hostname = '[' + IP.render(ip) + ']';
						}

						if (hostname !== null) {
							console.info('Server: > http://' + hostname + ':65432.');
						}

					});

				}

				console.info('');

				this.__state.connected = true;
				this.emit('connect');

				this.__state.server.listen(65432, null);

			}


			return true;

		}


		return false;

	},

	disconnect: function() {

		if (this.connections.length > 0) {

			for (let c = 0, cl = this.connections.length; c < cl; c++) {

				let connection = this.connections[c] || null;
				if (connection !== null) {
					connection.disconnect();
				}

				this.connections.splice(c, 1);
				cl--;
				c--;

			}

		}

		if (this.__state.connected === true) {

			this.__state.connected = false;

			if (this.__state.server !== null) {
				this.__state.server.close();
			}

			this.emit('disconnect');

			return true;

		}


		return false;

	}

});


export { Server };


