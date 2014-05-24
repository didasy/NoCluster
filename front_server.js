var cluster = require('cluster');
var numCPUs = require('os').cpu().length;
var configs = require('./configs.js');

if (cluster.isMaster) {
  	// Fork workers.
  	for (var i = 0; i < numCPUs; i++) {
    	cluster.fork();
  	}

  	cluster.on('exit', function(worker, code, signal) {
    	console.log('worker ' + worker.process.pid + ' died');
  	});
} else {
 	// Workers can share any TCP connection
  	// In this case its a HTTP server

	var express = require('express');
	var app = express();
	var cookieParser = require('cookie-parser')
	var session = require('express-sesion');

	var MongoStore = require('connect-mongo')(session);

	var morgan = require('morgan');

	var Busboy = require('busboy');

	var axon = require('axon');
	var sock1 = axon.socket('req');
	var sock2 = axon.socket('req');

	app.set('env', 'production');
	app.use(cookieParser());
	app.use(express.static(__dirname + '/public'));
	app.use(morgan());
	app.use('/user', session({ // Only put session in path with /user prefix
		name : 'worksinmagic.sid',
		rolling : 'true',
		cookie : {
			path : '/', httpOnly : true, secure : false, maxAge : 60 * 60 * 24 * 7
		},
		secret : 'whateveryoursecretis',
		store : new MongoStore({
			db : 'sharded_worksinmagic_db',
			collection : 'user_session',
			host : 'query0.worksinmagic.com',
			port : 27017,
			auto_reconnect : true,
		})
	}));

	app.get('/', function (req, res, next) {
		res.send('Hello!');
	});

	app.get('/search/user/:username', function (req, res, next) {
		if (!req.params.username) {
			return res.send('m8, pls');
		}
		sock1.send('search user', req.params.username, function (data) {
			res.json(data);
		});
	});

	app.listen(8000);
	sock1.bind(configs.axon.port1);
	sock2.bind(configs.axon.port2);
}
