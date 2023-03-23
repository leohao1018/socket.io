const express = require('express');
const app = express();
const server = require('http').createServer(app);

//const io = require('socket.io')(server);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: ['*', 'http://localhost:82'],
    credentials: true,
  },
});

const { instrument } = require('@socket.io/admin-ui');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const port = process.env.PORT || process.argv.slice(2)[0] || 3000;
const serverName = process.env.NAME || 'Unknown';

const redisIp = process.env.REDIS_IP || '10.251.8.49';
const redisPort = process.env.REDIS_PORT || '8003';
const redisPass = process.env.REDIS_PASS || '123456';

const redisUrl = `redis://:${redisPass}@${redisIp}:${redisPort}`;
console.log(redisUrl)
const pubClient = createClient({url: redisUrl});
//const pubClient = createClient({ host: redisIp, port: redisPort, password: redisPass});
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  //io.listen(port);
});

server.listen(port, () => {
  console.log('Server listening at port %d', port);
  console.log('Hello, I\'m %s, how can I help?', serverName);
});

// Routing
app.use(express.static(__dirname + '/public'));

// admin ui
instrument(io, {
  auth: false,
});

// Chatroom

let numUsers = 0;

io.on('connection', socket => {
  socket.emit('my-name-is', serverName);

  let addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('new message', data => {
    // we tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', username => {
    if (addedUser) return;

    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});
