# NoCluster
----------
A Node.js backend cluster web server with HAProxy front-end

Dependencies :

* [HAProxy](http://haproxy.1wt.eu)
* [Axon](https://github.com/visionmedia/axon)
* [Express](http://www.expressjs.com)
* [Busboy](https://github.com/mscdex/busboy)
* [Swig](https://paularmstrong.github.io/swig/)
* [Mandrill-API](https://www.npmjs.org/package/mandrill-api)
* [Mongoskin](https://github.com/kissjs/node-mongoskin)
* [MongoDB](http://mongodb.org)
* [connect-mongo](https://github.com/kcbanner/connect-mongo)

### Installation

`apt-get install haproxy`

Enable HAProxy to be started by your init script

`nano /etc/default/haproxy`

Change this line

`ENABLED=1`

Install the Node.js dependencies

`npm install express axon busboy swig mandrill-api mongoskin connect-mongo`

Install mongodb

Follow [this](http://docs.mongodb.org/manual/installation) tutorial



### HAProxy Configurations
```
global
    log 127.0.0.1 local0 notice
    maxconn 8000 #2000 x 4 core
    user haproxy
    group haproxy
    
defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    retries 3
    option redispatch
    timeout connect  5000
    timeout client  10000
    timeout server  10000
    
listen nocluster *:80
    mode    http
    stats   enable
    stats uri /haproxy?stats
    stats realm Strictly\ Private
    stats auth username:YourPassword
    option httpclose
    option forwardfor
    balance roundrobin
    cookie JSESSIONID prefix indirect nocache
    server SERV1 192.168.0.3:8000 check cookie SERV1
    server SERV2 192.168.0.4:8000 check cookie SERV2
    
# and the list goes on, note that these servers are the frontends
# the application logic lies on the backend behind axon
```

And then save it as `/etc/haproxy/haproxy.cfg`

### MongoDB (Optional)

##### Configurations if you want to build replica set

Set up your DNS first in `/etc/hosts`, don't forget to change the last word of first line
reflecting your current host

```
# adjust this accordingly
127.0.0.1   localhost mongo0

192.168.0.5 mongo0.worksinmagic.com
192.168.0.6 mongo1.worksinmagic.com
# and the list goes on
```

Issue this command and modify accordingly on each machine

`hostname mongo0.worksinmagic.com`

and then edit the `/etc/hostname`to reflect this
`mongo0.worksinmagic.com`

Now the DNS setting has been completed.

Stop all server from running

`service mongod stop`

Now we create the config file

```
# Remember to create the directory first
dbpath=/mongodb-database 
port=27017
logpath=/mongodb-database/mongodb.log
logappend=true
#auth=true
diaglog=1
nohttpinterface=true
nssize=64
# in master/slave replicated mongo databases, specify here whether
# this is a slave or master
#slave = true
#source = master.worksinmagic.com
# Slave only: specify a single database to replicate
#only = master.worksinmagic.com
# or
#master = true
#source = slave0.worksinmagic.com

# in replica set configuration, specify the name of the replica set
replSet=rs0
fork=true

```

Save and close the file

On one of your member (or master.worksinmagic.com), do

`mongo`

On the prompt, enter

`rs.initiate()`

This will initiate the replication set and add the server you are currently connected to as the first member of the set. 

Check by typing

`rs.conf()`

it should return something like this

```
{
    "_id" : "rs0"
    "version" : 1,
    "members" : [
        {
            "_id" : 0,
            "host" "mongo0.worksinmagic.com:27017"
        }
    ]
}
```

Now, you can add the additional nodes to the replication set by referencing the hostname you gave them in the `/etc/hosts` file:

````
rs.add("mongo1.worksinmagic.com")
```

And then you can restart the server `service mongod start`

##### Configurations if you want to use sharded cluster

You need a minimum of 6 machines as :

* ##### Config server :
Each production sharding implementation must contain exactly three configuration servers. This is to ensure redundancy and high availability. Config servers are used to store the metadata that links requested data with the shard that contains it. It organizes the data so that information can be retrieved reliably and consistently.

* ##### Query routers :
The query routers are the machines that your application actually connects to. These machines are responsible for communicating to the config servers to figure out where the requested data is stored. It then accesses and returns the data from the appropriate shard(s). Each query router runs the "mongos" command. The most common practice is to run mongos instances on the same systems as your application servers, but you can maintain mongos instances on the shards or on other dedicated resources.

* ##### Shard servers :
Shards are responsible for the actual data storage operations. In production environments, a single shard is usually composed of a replica set instead of a single machine. This is to ensure that data will still be accessible in the event that a primary shard server goes offline. Implementing replicating sets is outside of the scope of this tutorial, so we will configure our shards to be single machines instead of replica sets. You can easily modify this if you would like to configure replica sets for your own configuration.

With :

* 3 Config servers

* 1 Query router minimum

* 2 Shard servers minimum

In reality, some of these functions can overlap (for instance, you can run a query router on the same machine you use as a config server)


Use these settings and set it like you set the DNS of replica sets

```
config0.worksinmagic.com
config1.worksinmagic.com
config2.worksinmagic.com

query0.worksinmagic.com

mongo0.worksinmagic.com
mongo1.worksinmagic.com
```

Log in to config0 and create a directory `/mongodb-database`, and stop mongodb `service mongod stop`

And then run `mongod --configsvr --dbpath /mongodb-database --port 27019`

You can add that on upstart or init.d if you want, also remove the default upstart and init.d. Do that for each config server.

Now log in to query0 and stop mongodb `service mongod stop`, do not forget to turn it off in upstart or init.d because `mongod` will conflict with the router.

Ok, now run this command (do not press enter after `--configdb`, its a space):

```
mongos --configdb config0.worksinmagic.com:27019,config1.worksinmagic.com:27019,config2.worksinmagic.com:27019
```

Add that command to upstart if you want. Do this for every query server if you have more than one.

Then log in to your one of shard cluster and run `mongo --host query0.worksinmagic.com --port 27017`, do this for every query server you have.

And add your shards there

```
# if single instances
sh.addShard("mongo0.worksinmagic.com:27017")
sh.addShard("mongo1.worksinmagic.com:27017")

# if replica
sh.addShard("rs0/0:27017")
sh.addShard("rs0/1:27017")
```

Now back to query0 again, we will enable sharding. Connect to the query0 server `mongo --host query0.worksinmagic.com --port 27017`

Then enable sharding on database level
```
use sharded_db
sh.enableSharding("sharded_worksinmagic_db")
```

Then we shard on collection level. Be sure to choose `shard key` that will be evenly distributed or you can use hashed shard key based on existing field. Now we will do this on a new collection:
```
use sharded_worksinmagic_db
db.users.ensureIndex({ _id : "hashed" })
sh.shardCollection("sharded_worksinmagic_db.users", { "_id" : "hashed" })
```

To get information about specific shards you can type `sh.status()`

Which will return something like this:
```
--- Sharding Status --- 
  sharding version: {
    "_id" : 1,
    "version" : 3,
    "minCompatibleVersion" : 3,
    "currentVersion" : 4,
    "clusterId" : ObjectId("529cae0691365bef9308cd75")
}
  shards:
    {  "_id" : "shard0000",  "host" : "192.168.0.5:27017" }
    {  "_id" : "shard0001",  "host" : "192.168.0.6:27017" }
. . .
```

And then you have to make sure you connect to the query server to access a shard cluster.

Or really, if you don't expect high throughput or larger than RAM dataset, using a single mongod server is enough.
