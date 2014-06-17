var fs = require('fs'),
	util = require('util'),
	configs = require('./config.js'),
	BS = require('binaryjs').BinaryServer;

var bs = BS({ port : configs.binaryjs.port });

bs.on('connection', function (client) {
	client.on('stream', function (stream, meta) {
		// we are not checking if file is already exists here, should be though
		var file = fs.createWriteStream(configs.path.sharedStorage + '/' + meta.name);
		stream.pipe(file);

		// stream progress back
		stream.on('data', function (data) {
			stream.write({ rx : data.length / meta.size });
		});
		stream.on('error', function (err) {
			// remove the partly written file
			fs.unlink(configs.path.sharedStorage + '/' + meta.name, function (err) {
				if (err) {
					console.error(err);
				}
			});
		});
		stream.on('close', function () {
			// check if file writing already done
			fs.stat(configs.path.sharedStorage + '/' + meta.name, function (err, stat) {
				var size = util.inspect(stat).size;
				if (size !== meta.size) {
					return fs.unlink(configs.path.sharedStorage + '/' + meta.name, function (err) {
						if (err) {
							console.error(err);
						}
						stream.write({ msg : 'Failed uploading file' });
					});
				}
				stream.write({ msg : 'Finished uploading file' });
			});
			// if not, delete it
		});
	});
});