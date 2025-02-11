// googleServices.js
import { google } from 'googleapis';

async function checkGoogleServices() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_ID.length) {
        return;
    }
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    try {
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items;
        if (events && events.length) {
            console.log('Próximos eventos en Google Calendar:');
            events.forEach((event) => {
                const start = event.start.dateTime || event.start.date;
                console.log(`${start} - ${event.summary}`);
            });
        } else {
            console.log('No se encontraron eventos próximos en Google Calendar.');
        }
    } catch (error) {
        console.error('Error al obtener eventos de Google Calendar:', error);
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 5,
        });
        const messages = res.data.messages;
        if (messages && messages.length) {
            console.log('Emails no leídos en Gmail:');
            for (const message of messages) {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                });
                console.log(`Email: ${msg.data.snippet}`);
            }
        } else {
            console.log('No hay nuevos emails en Gmail.');
        }
    } catch (error) {
        console.error('Error al obtener emails de Gmail:', error);
    }
}

export { checkGoogleServices };
