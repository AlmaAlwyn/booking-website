const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));  // your HTML files here

// Email setup (replace with your real email/password)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'almaxavierf@gmail.com',
        pass: 'dfxt bmjz ddbk dxza'
    }
});

// Route to handle booking
app.post('/book', async (req, res) => {
    const { name, email, message } = req.body;

    const newBooking = {
        name,
        email,
        message,
        timestamp: new Date().toISOString()
    };

    // Save booking to file
    const filePath = path.join(__dirname, 'bookings.json');
    let bookings = [];

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        bookings = JSON.parse(fileContent);
    }

    bookings.push(newBooking);
    fs.writeFileSync(filePath, JSON.stringify(bookings, null, 2));

    // Send confirmation email
    try {
        await transporter.sendMail({
            from: 'your_email@gmail.com',
            to: email,
            subject: 'Appointment Confirmation',
            text: `Hi ${name},\n\nYour appointment has been received!\n\nMessage: ${message}\n\nRegards,\nTeam`
        });

        // Send success response after email is sent
        res.json({ message: 'Appointment booked and confirmation email sent!' });
    } catch (err) {
        console.error('Email sending failed:', err);
        // Still respond, but warn about email
        res.status(500).json({ message: 'Booking saved, but email failed to send.' });
    }
});

// Admin route to get all bookings
app.get('/bookings', (req, res) => {
    const filePath = path.join(__dirname, 'bookings.json');
    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        res.json(JSON.parse(fileContent));
    } else {
        res.json([]);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
