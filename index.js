const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: '*' } // Adjust the origin URL as needed
});

// Use a Map to store room information
const rooms = [];
// Array to store waiting users
const waitingUsers = [];
app.get('/', (req, res) => {
    console.log('hello-world');
    res.send('hello world')
});

io.on('connection', (socket) => {
    // Function to generate random room IDs 
    const generateRandomRoomID = () => {
        return Math.random().toString(36).substring(7);
    };

    const religionNames = (val) => {
        if (val == 'Islam') {
            return 'Muslim';
        } else if (val == 'Christianity') {
            return 'Christian';
        } else if (val == 'Judaism') {
            return 'Jews';
        } else if (val == 'Atheists') {
            return 'Atheism';
        } else {
            return '';
        }
    }

    // Function to join rooms by checking meeting type, interest, and religion
    const joinRooms = ({ user, meeting_type, interest }) => {
        // Find all rooms with the same meeting type, interest, and religion as the user
        const matchingRooms = rooms.filter(room =>
            room.meeting_type === meeting_type &&
            room.interest === interest &&
            room.religion === user.religion &&
            room.creatorId != user.id &&
            room.participants.length === 1
        );

        if (matchingRooms.length === 0) {
            // Create a new room if no matching rooms are available
            const newRoomID = generateRandomRoomID();
            const newRoom = {
                meeting_status: 'waiting',
                meeting_type: meeting_type,
                roomID: newRoomID,
                creatorId: user.id,
                creatorUsername: user?.username,
                interest: interest,
                religion: user?.religion,
                participants: [{ userId: user?.id, username: user?.username, religionName: religionNames(user?.religion), religion: user?.religion, socket: socket.id, ip_address: user.ip_address }]
            };
            rooms.push(newRoom);

            io.to(newRoom.participants[0].socket).emit('responseJoinRoom', newRoom);

        } else {
            // Join the first matching room
            let randomRoom = Math.floor(Math.random() * matchingRooms.length)
            const room = matchingRooms[randomRoom];
            room.participants.push({ userId: user?.id, username: user.username, religionName: religionNames(user?.religion), religion: user.religion, socket: socket.id, ip_address: user.ip_address });
            room.meeting_status = 'Joined'

            // Remove the room from the waiting list if it's full
            if (room.participants.length === 2) {
                waitingUsers.splice(waitingUsers.indexOf(room.roomID), 1);
            }

            io.to(room.participants[0].socket).emit('responseJoinRoom', room);
            io.to(room.participants[1].socket).emit('responseJoinRoom', room);

        }
    };

    // Handle user joining the chat
    socket.on('joinRoom', ({ user, meeting_type, interest }) => {
        joinRooms({ user, meeting_type, interest });

    });

    // Handle user disconnecting
    socket.on('disconnect', () => {

        for (const room of rooms) {
            const removedUserIndex = room.participants.findIndex(participant => participant.socket === socket.id);

            if (removedUserIndex !== -1) {
                const removedUser = room.participants.splice(removedUserIndex, 1)[0]; // Remove the user and get the removed object
                const remainUser = room.participants[0]; // Assuming there's only one remaining user

                // Emit 'leavePartner' event to the remaining user
                if (remainUser) {
                    io.to(remainUser.socket).emit('leavePartner', removedUser);
                }


                const roomIndex = rooms.indexOf(room);
                if (roomIndex !== -1) {
                    rooms.splice(roomIndex, 1);
                }

            }
        }

    });

    // Handle user sending a chat message
    socket.on('sendChatToServer', ({ message, roomID, sender }) => {

        // Validate the message
        if (message === '' || message.length > 255) {
            // Send an error message to the client
            socket.emit('sendChatError', 'Your message is invalid.');
            return;
        }
        // Find the room that the message is for

        const room = rooms.find((item) => item.roomID == roomID);

        if (room.participants.length == 2) {
            // Emit the message to the other users in the room
            room.participants.forEach((participant) => {
                io.to(participant.socket).emit('sendChatToClient', {
                    content: message,
                    room: room,
                    senderID: sender, // Use the socket ID as the sender ID
                    senderDetails: socket.handshake.query // Get the user details from the handshake query
                });
            });
        } else {
            socket.emit('sendChatError', 'Wait to join partner');
            return
        }
    });

    // Handle user skipping to a new partner
    socket.on('skipPartner', (roomID) => {
        let room = rooms.find((element) => element.roomID == roomID);

        if (room) {
            io.to(room?.participants[0]?.socket).emit('changePartner');
            io.to(room?.participants[1]?.socket).emit('changePartner');

            const roomIndex = rooms.indexOf(room);
            if (roomIndex !== -1) {
                rooms.splice(roomIndex, 1);
            }
        }
    });

    socket.on('bannedUser', ({ roomID, oponentIpAddress }) => {

        let room = rooms.find((item) => item.roomID == roomID);

        if (room) {
            let participant = room?.participants?.find((item) => item.ip_address == oponentIpAddress);

            io.to(participant.socket).emit('accountBanned');
        }


    })


});

server.listen(8000, () => {
    console.log('Server is running port :8000');
});