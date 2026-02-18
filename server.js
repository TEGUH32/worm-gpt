// =====================================================
// TEGUH AI - COMPLETE CHAT SYSTEM
// =====================================================
// BY: DARK KILLER
// VERSION: 1.0 (FULL FEATURES)
// =====================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =====================================================
// ANABOT API CONFIG
// =====================================================
const ANABOT_API_URL = 'https://anabot.my.id/api/ai/deepseek';
const API_KEY = 'freeApikey';

// =====================================================
// DATABASE SEDERHANA (pakai file JSON)
// =====================================================
const DB_FILE = path.join(__dirname, 'database.json');

// Inisialisasi database
let database = {
    users: {},
    sessions: {}
};

// Load database jika ada
if (fs.existsSync(DB_FILE)) {
    try {
        database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log('[INFO] Database loaded');
    } catch (e) {
        console.log('[INFO] Creating new database');
    }
}

// Save database
function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2));
}

// =====================================================
// GENERATE USER ID
// =====================================================
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

// =====================================================
// GENERATE SESSION ID
// =====================================================
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// =====================================================
// CALL ANABOT API
// =====================================================
async function callAnabot(prompt) {
    const url = `${ANABOT_API_URL}?prompt=${encodeURIComponent(prompt)}&search_enabled=false&thinking_enabled=false&imageUrl=&apikey=${encodeURIComponent(API_KEY)}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Extract response dari berbagai format
        let result = '';
        if (data?.result?.message) {
            result = data.result.message;
        } else if (data?.response) {
            result = data.response;
        } else if (typeof data === 'string') {
            result = data;
        } else {
            result = JSON.stringify(data);
        }
        
        return {
            success: true,
            response: result
        };
        
    } catch (error) {
        console.log('[ERROR] API call failed:', error.message);
        return {
            success: false,
            response: 'Maaf, terjadi kesalahan. Coba lagi nanti.'
        };
    }
}

// =====================================================
// ROUTES
// =====================================================

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// USER API
// =====================================================

// Register/Login user
app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }
    
    // Cari user berdasarkan username
    let userId = null;
    for (const [id, user] of Object.entries(database.users)) {
        if (user.username === username) {
            userId = id;
            break;
        }
    }
    
    // Jika tidak ada, buat user baru
    if (!userId) {
        userId = generateUserId();
        database.users[userId] = {
            username: username,
            created: new Date().toISOString(),
            sessions: []
        };
        saveDatabase();
    }
    
    res.json({
        success: true,
        userId: userId,
        username: database.users[userId].username
    });
});

// Get user data
app.get('/api/user/:userId', (req, res) => {
    const { userId } = req.params;
    
    if (!database.users[userId]) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const user = database.users[userId];
    const sessions = user.sessions.map(sessionId => database.sessions[sessionId]).filter(Boolean);
    
    res.json({
        success: true,
        user: {
            username: user.username,
            created: user.created
        },
        sessions: sessions.map(s => ({
            id: s.id,
            name: s.name,
            created: s.created,
            updated: s.updated,
            messageCount: s.messages.length
        }))
    });
});

// =====================================================
// SESSION API
// =====================================================

// Create new session
app.post('/api/session/create', (req, res) => {
    const { userId, sessionName = 'New Chat' } = req.body;
    
    if (!userId || !database.users[userId]) {
        return res.status(400).json({ success: false, error: 'Invalid user' });
    }
    
    const sessionId = generateSessionId();
    const now = new Date().toISOString();
    
    database.sessions[sessionId] = {
        id: sessionId,
        userId: userId,
        name: sessionName,
        created: now,
        updated: now,
        messages: []
    };
    
    database.users[userId].sessions.push(sessionId);
    saveDatabase();
    
    res.json({
        success: true,
        session: database.sessions[sessionId]
    });
});

// Get session messages
app.get('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!database.sessions[sessionId]) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
        success: true,
        session: database.sessions[sessionId]
    });
});

// Update session name
app.post('/api/session/:sessionId/rename', (req, res) => {
    const { sessionId } = req.params;
    const { name } = req.body;
    
    if (!database.sessions[sessionId]) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    database.sessions[sessionId].name = name;
    saveDatabase();
    
    res.json({ success: true });
});

// Delete session
app.delete('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!database.sessions[sessionId]) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const userId = database.sessions[sessionId].userId;
    
    // Remove from user's sessions
    database.users[userId].sessions = database.users[userId].sessions.filter(id => id !== sessionId);
    
    // Delete session
    delete database.sessions[sessionId];
    
    saveDatabase();
    
    res.json({ success: true });
});

// =====================================================
// CHAT API
// =====================================================

// Send message
app.post('/api/chat/send', async (req, res) => {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !database.sessions[sessionId]) {
        return res.status(400).json({ success: false, error: 'Invalid session' });
    }
    
    if (!message) {
        return res.status(400).json({ success: false, error: 'Message required' });
    }
    
    const session = database.sessions[sessionId];
    const now = new Date().toISOString();
    
    // Add user message
    session.messages.push({
        role: 'user',
        content: message,
        timestamp: now
    });
    
    // Call API
    const systemPrompt = `Kamu adalah Teguh AI, asisten AI yang ramah dan membantu. 
Kamu bisa membantu dengan berbagai tugas: coding, belajar, menjawab pertanyaan, dan lainnya.
Jawab dengan bahasa Indonesia yang sopan dan informatif.`;

    const apiPrompt = `${systemPrompt}\n\nPertanyaan user: ${message}\n\nJawab dengan lengkap dan jelas:`;
    
    const apiResult = await callAnabot(apiPrompt);
    
    // Add AI response
    session.messages.push({
        role: 'assistant',
        content: apiResult.response,
        timestamp: new Date().toISOString()
    });
    
    session.updated = now;
    
    // Update session name if first message
    if (session.messages.length === 2 && session.name === 'New Chat') {
        // Use first few words as session name
        session.name = message.substring(0, 30) + (message.length > 30 ? '...' : '');
    }
    
    saveDatabase();
    
    res.json({
        success: true,
        message: apiResult.response,
        session: {
            id: session.id,
            name: session.name,
            updated: session.updated
        }
    });
});

// Get chat history
app.get('/api/chat/history/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!database.sessions[sessionId]) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
        success: true,
        messages: database.sessions[sessionId].messages
    });
});

// Clear chat
app.post('/api/chat/clear/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!database.sessions[sessionId]) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    database.sessions[sessionId].messages = [];
    database.sessions[sessionId].updated = new Date().toISOString();
    saveDatabase();
    
    res.json({ success: true });
});

// =====================================================
// STATS API
// =====================================================
app.get('/api/stats', (req, res) => {
    res.json({
        users: Object.keys(database.users).length,
        sessions: Object.keys(database.sessions).length,
        messages: Object.values(database.sessions).reduce((acc, s) => acc + s.messages.length, 0)
    });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
    console.log(`\n🤖 TEGUH AI running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${DB_FILE}`);
    console.log(`👥 Users: ${Object.keys(database.users).length}`);
    console.log(`💬 Sessions: ${Object.keys(database.sessions).length}`);
    console.log(`\n✨ Fitur Lengkap:`);
    console.log(`   - Login System`);
    console.log(`   - Multiple Sessions`);
    console.log(`   - Chat History`);
    console.log(`   - Session Management`);
    console.log(`   - Persistent Storage`);
});
