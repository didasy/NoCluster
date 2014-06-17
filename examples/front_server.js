var cluster = require('cluster');
var numCPUs = require('os').cpu().length;
var configs = require('./config.js');

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
	var cookieParser = require('cookie-parser');
	var session = require('express-sesion');

	var MongoStore = require('connect-mongo')(session);

	var morgan = require('morgan');

	var fs = require('fs');
	var Busboy = require('busboy');
	// for file upload, just save to a mounted path, probably from a shared storage / NAS
	// we do not need to stream it to the back server except for file resize (there is a workaround with saving the file and send the info on finish)
	// or we could use Binary.js for that rather than http file upload like this (on another front-server)

	var axon = require('axon');
	var sock = axon.socket('req'); // one req socket. many rep socket on many back_servers. Automatic round-robin load balancing

	app.set('env', 'production');
	app.use(cookieParser());
	// app.use(express.static(__dirname + '/public')); serve static files from nginx
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
			auto_reconnect : true
		})
	}));

	app.get('/', function (req, res, next) {
		sock.send('render page', 'index', function (err, data) {
			if (err) {
				console.error(err);
				return res.redirect('/error'); // redirect to nginx rendered error page
			}
			res.send(data);
		});
	});

	app.post('/upload', function (req, res, next) {
		var fileName;
		var busboy = new Busboy({ headers : req.headers, fileSize : configs.limit.fileSize, files : configs.limit.files });
		busboy.on('file', function (fieldName, file, fileName, encoding, mimetype) {
			fileName = fileName;
			// we are not checking if file is already exists here, should be though
			file.pipe(fs.createWriteStream(configs.path.sharedStorage + '/' + fileName));
		});
		busboy.on('limit', function () {
			fs.unlink(configs.path.sharedStorage + '/' + fileName, function (err) {
				if (err) {
					console.error(err);
					return res.json({ err : 'File system error' });
				}
				res.json({ err : 'File size exceeded limit' });
			});
		})
		busboy.on('files', function () {
			res.json({ err : 'You can only upload' + configs.limit.files + ' files' });
		});
		busboy.on('finish', function () {
			res.json({ err : false });
		});
		req.pipe(busboy);
	});

	app.get('/search/user/:username', function (req, res, next) {
		if (!req.params.username) {
			return res.send('m8, pls');
		}
		sock.send('search user', req.params.username, function (err, data) {
			if (err) {
				console.error('Error : ' + err);
				return res.json({ err : 'Database or server error' });
			}
			res.json(data);
		});
	});

	app.post('/user/login', function (req, res, next) {
		var msg = {},
			busboy = new Busboy({ headers : req.headers });
		busboy.on('field', function (fieldName, val) {
			msg[fieldName] = val;
		});
		busboy.on('finish', function () {
			if (!msg.username) {
				return res.json({ err : 'Fill your username' });
			}
			if (!msg.password) {
				return res.json({ err : 'Fill your password' });
			}
			sock.send('user post login', msg, function (err, data) {
				if (err) {
					console.error('Error : ' + err);
					return res.json({ err : 'Database or server error' });
				}
				if (!data.err) {
					req.session.token = data.token;
				}
				res.json(data.err);
			});
		});
		req.pipe(busboy);
	});

	app.listen(configs.app.port);
	sock.bind(configs.axon.port);
}