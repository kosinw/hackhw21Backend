require('dotenv').config();
const express = require("express");
const http = require("http");
const app = express();
const cors = require("cors");
const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
//app.use(cors());
const server = http.createServer(app);
const socket = require("socket.io");
const ss = require("socket.io-stream")
const io = socket(server, {
    cors: {
        origin: '*',
    }
});

const port = 8000;
const users = {};
const songqueue = {};

const socketToRoom = {};

function sendMessage(sender,message,id,roomID) {
    const data = JSON.stringify({
        sender: sender, //name goes here
        message: message
    });
    users[roomID].forEach(element => {
        if (element != id) {
            io.to(element).emit("receiving message", data);
        }
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
            songqueue[roomID] = [];
        }
        socketToRoom[socket.id] = roomID;
        const usersInThisRoom = users[roomID].filter(id => id !== socket.id);

        socket.emit("all users", usersInThisRoom);
    });

    socket.on("")

    socket.on("sending signal", payload => {
        io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning signal", payload => {
        io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
    });

    socket.on("sending message", message => {
        sendMessage("Big Chungus",message,socket.id,socketToRoom[socket.id]);
    });

    socket.on("getLink", search => {
        const roomID = socketToRoom[socket.id];
        var opts = { query: search };
        yts(opts, function (err, r) {
            if (err) throw err;
            else {
                sendMessage("Music Queue",r.videos[0].title,-1,roomID);
                songqueue[roomID].push(r.videos[0].url);
                const payload = JSON.stringify({
                    url: r.videos[0].url,
                    time: (1000*(Math.round((new Date()).getTime() / 1000)+ 4))//add 8 seconds
                });
                users[roomID].forEach(element => {
                    io.to(element).emit("link", payload);
                });
            }
        })
    });

    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        let room = users[roomID];
        if (room) {
            room = room.filter(id => id !== socket.id);
            users[roomID] = room;
        }
        socket.broadcast.emit("user left", socket.id);
    });

});

server.listen(process.env.PORT || port, () => console.log('server is running on port ' + port));


