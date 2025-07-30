const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files (index.html, admin.html)

// MongoDB connection
mongoose.connect('mongodb+srv://<username>:<password>@cluster0.mongodb.net/abundance-being?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Schemas
const bookingSchema = new mongoose.Schema({
    name: String,
    email: String,
    time: Date,
    status: { type: String, default: 'Pending' },
    whatsappMessageId: String
});
const Booking = mongoose.model('Booking', bookingSchema);

const testimonialSchema = new mongoose.Schema({
    text: String,
    author: String,
    rating: Number
});
const Testimonial = mongoose.model('Testimonial', testimonialSchema);

const contentSchema = new mongoose.Schema({
    aboutContent1: String,
    aboutContent2: String,
    faqContent: String
});
const Content = mongoose.model('Content', contentSchema);

const adminSchema = new mongoose.Schema({
    username: String,
    password: String
});
const Admin = mongoose.model('Admin', adminSchema);

const whatsappMessageSchema = new mongoose.Schema({
    from: String,
    text: String,
    timestamp: Date,
    bookingId: String
});
const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

// Multer for media uploads
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// WhatsApp Business API configuration (Interakt example)
const WHATSAPP_API_URL = 'https://api.interakt.ai/v1/messages';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || 'your-interakt-api-key';
const WHATSAPP_PHONE_NUMBER = '+1234567890'; // Your WhatsApp Business number

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware for JWT authentication
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Admin login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !await bcrypt.compare(password, admin.password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Create booking and send WhatsApp notification
app.post('/api/bookings', async (req, res) => {
    const { name, email, time, status } = req.body;
    try {
        const booking = new Booking({ name, email, time, status });
        await booking.save();

        // Send WhatsApp notification
        const message = {
            to: WHATSAPP_PHONE_NUMBER,
            template: {
                name: 'booking_notification',
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: name },
                            { type: 'text', text: email },
                            { type: 'text', text: new Date(time).toLocaleString() }
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(WHATSAPP_API_URL, message, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_API_KEY}` }
        });
        booking.whatsappMessageId = response.data.id;
        await booking.save();

        res.status(201).json(booking);
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Error creating booking' });
    }
});

// Get bookings
app.get('/api/bookings', authenticate, async (req, res) => {
    const bookings = await Booking.find();
    res.json(bookings);
});

// Update booking
app.put('/api/bookings/:id', authenticate, async (req, res) => {
    const { status } = req.body;
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        booking.status = status;
        await booking.save();

        // Send WhatsApp confirmation/rejection
        const templateName = status === 'Accepted' ? 'booking_confirmed' : 'booking_rejected';
        await axios.post(WHATSAPP_API_URL, {
            to: booking.email.includes('@') ? WHATSAPP_PHONE_NUMBER : booking.email, // Adjust if client provides WhatsApp number
            template: {
                name: templateName,
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: booking.name },
                            { type: 'text', text: new Date(booking.time).toLocaleString() }
                        ]
                    }
                ]
            }
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_API_KEY}` }
        });

        res.json(booking);
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ message: 'Error updating booking' });
    }
});

// WhatsApp webhook for incoming messages
app.post('/api/whatsapp/webhook', async (req, res) => {
    const { from, text, messageId } = req.body; // Adjust based on Interakt's webhook format
    try {
        const message = new WhatsAppMessage({ from, text, timestamp: new Date() });
        if (text.toLowerCase() === 'accept' || text.toLowerCase() === 'reject') {
            const booking = await Booking.findOne({ whatsappMessageId: messageId });
            if (booking) {
                booking.status = text.toLowerCase() === 'accept' ? 'Accepted' : 'Cancelled';
                message.bookingId = booking._id;
                await booking.save();

                // Send confirmation to client
                const templateName = text.toLowerCase() === 'accept' ? 'booking_confirmed' : 'booking_rejected';
                await axios.post(WHATSAPP_API_URL, {
                    to: booking.email.includes('@') ? WHATSAPP_PHONE_NUMBER : booking.email,
                    template: {
                        name: templateName,
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: booking.name },
                                    { type: 'text', text: new Date(booking.time).toLocaleString() }
                                ]
                            }
                        ]
                    }
                }, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_API_KEY}` }
                });
            }
        }
        await message.save();
        res.status(200).send('Webhook received');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

// Get WhatsApp messages
app.get('/api/whatsapp/messages', authenticate, async (req, res) => {
    const messages = await WhatsAppMessage.find();
    res.json(messages);
});

// Manage testimonials
app.get('/api/testimonials', async (req, res) => {
    const testimonials = await Testimonial.find();
    res.json(testimonials);
});

app.post('/api/testimonials', authenticate, async (req, res) => {
    const { text, author, rating } = req.body;
    const testimonial = new Testimonial({ text, author, rating });
    await testimonial.save();
    res.status(201).json(testimonial);
});

app.delete('/api/testimonials/:id', authenticate, async (req, res) => {
    await Testimonial.findByIdAndDelete(req.params.id);
    res.status(204).send();
});

// Manage content
app.get('/api/content', async (req, res) => {
    let content = await Content.findOne();
    if (!content) {
        content = new Content({
            aboutContent1: 'Default about content 1',
            aboutContent2: 'Default about content 2',
            faqContent: 'Default FAQ content'
        });
        await content.save();
    }
    res.json(content);
});

app.put('/api/content', authenticate, async (req, res) => {
    const { aboutContent1, aboutContent2, faqContent } = req.body;
    let content = await Content.findOne();
    if (!content) {
        content = new Content();
    }
    content.aboutContent1 = aboutContent1;
    content.aboutContent2 = aboutContent2;
    content.faqContent = faqContent;
    await content.save();
    res.json(content);
});

// Media upload
app.post('/api/media', authenticate, upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ filename: `/uploads/${req.file.filename}` });
});

// Initialize admin (run once)
async function initializeAdmin() {
    const admin = await Admin.findOne({ username: 'admin' });
    if (!admin) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await new Admin({ username: 'admin', password: hashedPassword }).save();
    }
}
initializeAdmin();

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
