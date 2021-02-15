require('dotenv').config();
const express = require("express");
const http = require("http");
const app = express();
const cors = require("cors");
const yts = require('yt-search');
const fs = require('fs');
//app.use(cors());
const server = http.createServer(app);
const socket = require("socket.io");
const ss = require("socket.io-stream")
const io = socket(server, {
    cors: {
        origin: process.env.HOST || "https://cfe.house/",
    }
});

class AuthInfo {
    constructor(userID, socketID, displayName, photoURL) {
        this.userID = userID;
        this.socketID = socketID;
        this.displayName = displayName;
        this.photoURL = photoURL;
    }
}

const port = 8000;
const users = {};
const auth = {};
const songqueue = {};

const socketToRoom = {};

function sendMessage(sender, message, id, roomID) {
    const data = JSON.stringify({
        sender: sender, //name goes here
        message: message
    });
    console.log(users);

    if (!users[roomID]) {
        users[roomID] = [id];
    }

    users[roomID].forEach(element => {
        console.log(data);
        io.to(element).emit("receiving message", data);
    });
}

io.on('connection', socket => {

    socket.on("join room", roomID => {
        if (users[roomID]) {
            const length = users[roomID].length;
            if (length === 10) {
                socket.emit("room full");
                return;
            }
            users[roomID].push(socket.id);
        } else {
            users[roomID] = [socket.id];
        }
        socketToRoom[socket.id] = roomID;
        const usersInThisRoom = users[roomID].filter(id => id !== socket.id);

        socket.emit("all users", usersInThisRoom);
    });

    socket.on("auth/user/join", payload => {
        const { roomID, userID, displayName, photoURL } = JSON.parse(payload);

        if (!!auth[roomID]) {
            const length = auth[roomID].length;
            if (length === 10) {
                socket.emit("room full");
                return;
            }
            auth[roomID].push(new AuthInfo(userID, socket.id, displayName, photoURL))
        } else {
            auth[roomID] = [new AuthInfo(userID, socket.id, displayName, photoURL)];
        }

        const usersInThisRoom = auth[roomID]
            .filter(info => info.socketID !== socket.id)
            .map(JSON.stringify);

        socket.emit("auth/user/currentUsers", usersInThisRoom);

        auth[roomID].filter(info => info.socketID !== socket.id).forEach(info => {
            const notMe = auth[roomID]
                .filter(info2 => info.socketID !== info2.socketID)
                .map(JSON.stringify);

            io.to(info.socketID).emit("auth/user/currentUsers", notMe);
        })
    })

    socket.on("sending signal", payload => {
        io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning signal", payload => {
        io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
    });

    socket.on("sending message", message => {
        const roomID = socketToRoom[socket.id];

        if (!!auth[roomID]) {
            const sender = JSON.stringify(auth[roomID].filter(a => a.socketID === socket.id)[0]);
            sendMessage(sender, message, socket.id, roomID);
        } else {
            sendMessage("Big Chungus", message, socket.id, roomID);
        }
        sendMessage("Big Chungus", message, socket.id, socketToRoom[socket.id]);
    });

    socket.on("noteLoop", noteData => {
        const roomID = socketToRoom[socket.id];
        users[roomID].forEach(element => {
            if (element != socket.id) {
                io.to(element).emit("noteLoop", noteData);
            }
        });
    });

    socket.on("noteReset", payload => {
        const roomID = socketToRoom[socket.id];
        users[roomID].forEach(element => {
            if (element != socket.id) {
                io.to(element).emit("noteReset", "");
            }
        });
    });

    socket.on("getLink", search => {
        const roomID = socketToRoom[socket.id];
        const data = JSON.parse(search);
        var opts = { query: data.search };
        yts(opts, function (err, r) {
            if (err) throw err;
            else {
                sendMessage("Music Queue", r.videos[0].title, -1, roomID);
                const payload = JSON.stringify({
                    url: r.videos[0].url,
                    time: (1000 * (Math.round((new Date()).getTime() / 1000) + 4))//add seconds
                });
                users[roomID].forEach(element => {
                    io.to(element).emit(data.type, payload);
                });
            }
        })
    });

    socket.on("skip", payload => {
        const roomID = socketToRoom[socket.id];
        users[roomID].forEach(element => {
            io.to(element).emit("skip", (1000 * (Math.round((new Date()).getTime() / 1000) + 2)));
        });
    });

    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        {
            let room = users[roomID];
            if (!!room) {
                room = room.filter(id => id !== socket.id);
                users[roomID] = room;
            }
        }
        {
            let room = auth[roomID];
            if (!!room) {
                room = room.filter(info => info.socketID !== socket.id);
                auth[roomID] = room;
            }

            if (!!room) {
                room.forEach(info => {
                    const notMe = room
                        .filter(info2 => info.socketID !== info2.socketID)
                        .map(JSON.stringify);

                    io.to(info.socketID).emit("auth/user/currentUsers", notMe);
                })
            }
        }
        socket.broadcast.emit("user left", socket.id);
    });

});

server.listen(process.env.PORT || port, () => console.log('server is running on port ' + port));


