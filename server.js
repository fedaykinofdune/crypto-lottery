var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs');

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
 io.set('log level', 1);                    // reduce logging

// enable all transports (optional if you want flashsocket support, please note that some hosting
// providers do not allow you to create servers that listen on a port different than 80 or their
// default port)
io.set('transports', [
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
]);

var nodemailer = require("nodemailer");
var transport = nodemailer.createTransport("sendmail", {path: '/usr/sbin/sendmail'});

app.listen(10770);

function validateEmail(email) { 
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
} 

function handler (req, res) {
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }

    res.writeHead(200);
    res.end(data);
  });
}

io.sockets.on('connection', function (socket) {

  socket.on('message', function (data) {

    if(JSON.stringify(data).length > 255) { // cheater
      socket.disconnect();
      console.error('Socket ' + socket.id + ', sent too much data');
      return;
    }

    var rooms = io.sockets.manager.roomClients[socket.id];
    for(var room in rooms) {
      if(room) break;
    }
    if(!room) return; // cheater
    room = room.substr(1);
    console.log("Socket " + socket.id + " sending message: " + JSON.stringify(data));
    data.source = socket.id;
    socket.broadcast.to(room).emit('message', data);
  });

  socket.on('disconnect', function() {
    var rooms = io.sockets.manager.roomClients[socket.id];
    for(var room in rooms) {
      if(room) break;
    }
    if(!room) return; // cheater
    room = room.substr(1);
    console.log('Socket ' + socket.id + ' leaving room ' + room);
    io.sockets.in(room).emit('leave', socket.id);
  });

  socket.on('invite', function(email) {
    if(!validateEmail(email)) { // legit mistake
      socket.emit('invalid-email');
      return;
    }
    var rooms = io.sockets.manager.roomClients[socket.id];
    for(var room in rooms) {
      if(room) break;
    }
    if(!room) { // cheater
      socket.disconnect();
      return;
    }
    room = room.substr(1);
    var url = "https://mrogalski.eu/cl/#" + room;
    transport.sendMail({
      from: "Crypto Lottery <marek@mrogalski.eu>",
      to: email,
      subject: "Someone wants to securely draw lots with you",
      text: "In order to join, visit " + url + ".",
      html: "In order to join, visit <a href='" + url + "'>"+url+"</a>."
    });
    socket.emit('sent');
  });

  socket.on('join', function (room) {
    if(!(/^[0-9a-zA-Z+_]{3,64}$/.test('' + room))) { // cheater
      socket.disconnect();
      console.error('Socket ' + socket.id + ', tried bad url');
      return;
    }
    io.sockets.in(room).emit('join', socket.id);
    var others = io.sockets.manager.rooms['/' + room] || [];
    socket.emit('hello', { you: socket.id, others: others });
    socket.join(room);
    console.log('Socket ' + socket.id + ', joined room "' + room + '"');
  });
});
