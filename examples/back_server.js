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
  	var crypto = require('crypto');
	var fs = require('fs');

	var axon = require('axon');
	var sock = axon.socket('rep');

	var swig = require('swig');
	swig.setDefaults({ cache : true });

	var mongoskin = require('mongoskin');
	var db = mongoskin.db('mongodb://query0.worksinmagic.com:27017/sharded_worksinmagic_db', { native_parser : true });
	db.bind('users');
	db.bind('articles');

	var mandrill = require('mandrill-api/mandrill');
	var mandrill_client = new mandrill.Mandrill('YOUR_API_KEY');

	sock.on('message', function (type, msg, reply) {
		switch (type) {
			case 'render page' :
				swig.renderFile(configs.views[msg], {}, function (err, output) {
					if (err) {
						return reply(err, null);
					}
					reply(null, output);
				});
			break;
			case 'search user' : // omitting credential properties
				var regx = new RegExp('('+msg+')+', 'gi');
				db.users.findOne({ username : regx }, { fields : { hashedPassword : -1 } }, function (err, user) {
					if (err) {
						return reply(err, null);
					}
					reply(null, { found : true, user : user });
				});
			break;
			case 'user post login' : 
				var hashedPassword = crypto.createHash('whirlpool').update(configs.salt).update(msg.password).digest('hex');
				db.users.findOne({ username : msg.username, hashedPassword : hashedPassword }, function (err, user) {
					if (err) {
						return reply(err, null);
					}
					if (!user) {
						return reply(null, { err : 'Invalid username or password' });
					}
					var token = uuid.v4();
					db.users.update({ username : msg.username }, { $set : { token : token } }, function (err) {
						if (err) {
							return reply(err, null);
						}
						reply(null, { err : false, token : token });
					});
				});
			break;
		}
	});

	sock.connect(configs.axon.port);
}