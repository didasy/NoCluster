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
  	var crypto = require('crypto');
	var fs = require('fs');

	var axon = require('axon');
	var sock = axon.socket('rep');

	var Swig = require('swig');
	swig.setDefaults({ cache : true });

	var mongoskin = require('mongoskin');
	var db = mongoskin.db('mongodb://query0.worksinmagic.com:27017/sharded_worksinmagic_db', { native_parser : true });
	db.bind('users');
	db.bind('articles');

	var mandrill = require('mandrill-api/mandrill');
	var mandrill_client = new mandrill.Mandrill('YOUR_API_KEY');

	sock.on('message', function (type, msg, reply) {
		switch (type) {
			case 'search user' : // omitting credential properties
				var regx = new RegExp('('+msg+')+', 'gi');
				db.users.findOne({ username : /()+/gi }, { fields : { hashedPassword : -1, salt : -1 } }, function (err, user) {
					if (err) {
						return reply(new Error('Cannot access database'), null);
					}
					reply(null, { found : true, user : user });
				});
			break;
		}
	});

	sock.connect(configs.axon.port1);
}