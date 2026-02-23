const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const DB_FILE = './database.json';

// Veritabanı dosyası yoksa boş oluştur
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], messages: [] }));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- KAYIT OL ---
app.post('/api/auth/register', async (req, res) => {
    const db = readDB();
    const { name, email, password } = req.body;
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: "Email zaten var" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now();
    db.users.push({ id: userId, name, email, password: hashedPassword });
    writeDB(db);
    res.json({ user: { id: userId, name, email } });
});

// --- GİRİŞ YAP ---
app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);

    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user.id }, 'gizli-anahtar');
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } else {
        res.status(400).json({ error: "Hatalı giriş" });
    }
});

// --- ÖNCEKİ MESAJLARI ÖNE SÜRECEKTİR ---
app.get('/api/messages', (req, res) => {
    const db = readDB();
    res.json(db.messages);
});

// --- CHAT (SOCKET) ---
const connectedUsers = new Map();

io.on('connection', (socket) => {
    // Kullanıcı katıldığında
    socket.on('user:join', (user) => {
        connectedUsers.set(socket.id, user);
        io.emit('users:update', Array.from(connectedUsers.values()));
    });

    // Mesaj gönderme
    socket.on('message:send', (data) => {
        const db = readDB();
        const newMessage = { ...data, timestamp: new Date() };
        db.messages.push(newMessage);
        writeDB(db);
        io.emit('message:receive', newMessage);
    });

    // Yazıyor göstergesi
    socket.on('typing:start', (user) => {
        socket.broadcast.emit('user:typing', user);
    });

    socket.on('typing:stop', () => {
        socket.broadcast.emit('user:stop-typing');
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        connectedUsers.delete(socket.id);
        io.emit('users:update', Array.from(connectedUsers.values()));
    });
});

// --- PORT 5001 ---
const PORT = 5001;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde!`);
    console.log(`📂 Veriler 'database.json' dosyasına yazılıyor.`);
});